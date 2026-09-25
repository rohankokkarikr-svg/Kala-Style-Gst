import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { orderAPI, paymentAPI } from '../services/api';
import toast from 'react-hot-toast';
import {
  HiLockClosed,
  HiShieldCheck,
  HiChevronLeft,
  HiCheck,
  HiCreditCard,
  HiLightningBolt,
  HiQrcode,
  HiCash,
  HiExclamationCircle,
  HiX,
  HiDuplicate,
} from 'react-icons/hi';

export default function PaymentGateway() {
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(location.search);
  const orderId = searchParams.get('orderId');

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [razorpayLaunching, setRazorpayLaunching] = useState(false);
  const [gatewayError, setGatewayError] = useState(null);
  const [switchingCOD, setSwitchingCOD] = useState(false);
  const [showUPIModal, setShowUPIModal] = useState(false);
  const [utrNumber, setUtrNumber] = useState('');
  const [submittingUTR, setSubmittingUTR] = useState(false);
  const hasAutoLaunchedRef = useRef(false);

  // Get razorpay data passed from Checkout via navigate state
  const razorpayData = location.state?.razorpay || null;

  // Load Razorpay official script
  const loadRazorpayScript = () =>
    new Promise((resolve) => {
      if (window.Razorpay) return resolve(true);
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });

  // Launch Razorpay Standard Web Checkout (Full UPI, Cards, NetBanking)
  const launchRazorpay = useCallback(
    async (rzpData, orderData) => {
      if (!rzpData?.order_id) {
        toast.error('Payment session not ready. Please click "Pay with Razorpay" below to begin.');
        setRazorpayLaunching(false);
        return;
      }

      setRazorpayLaunching(true);
      const loaded = await loadRazorpayScript();
      if (!loaded) {
        toast.error('Razorpay payment gateway failed to load. Please check your internet connection.');
        setRazorpayLaunching(false);
        return;
      }

      // Always prefer the key_id returned by the backend (set when creating the Razorpay order).
      // The env fallback is only used if navigation state was lost (e.g., page refresh).
      const keyId =
        rzpData?.key_id ||
        process.env.REACT_APP_RAZORPAY_KEY_ID ||
        '';

      if (!keyId) {
        toast.error('Razorpay is not configured. Please contact support.');
        setRazorpayLaunching(false);
        return;
      }

      if (!rzpData?.key_id) {
        console.warn('[PaymentGateway] key_id missing from backend response — falling back to REACT_APP_RAZORPAY_KEY_ID env var.');
      }
      const amountInPaise =
        Number(rzpData.amount) ||
        Math.max(100, Math.round(Number(orderData?.total_amount || orderData?.total_price || 0) * 100));

      // Sanitize phone number (standard 10-digit Indian phone)
      const rawPhone = String(orderData?.phone || '').replace(/\D/g, '');
      const cleanPhone = rawPhone.length >= 10 ? rawPhone.slice(-10) : (rawPhone || undefined);

      // Sanitize customer email (only pass if valid format to avoid Razorpay options validation error)
      const rawEmail = (orderData?.users?.email || '').trim();
      const cleanEmail = rawEmail.includes('@') ? rawEmail : undefined;

      // Customer name
      const customerName = (orderData?.shipping_name || orderData?.users?.name || '').trim() || undefined;

      const options = {
        key: keyId,
        amount: amountInPaise,
        currency: rzpData.currency || 'INR',
        name: 'KalaStyle AI',
        description: `Order #${orderData?.order_number || orderId?.substring(0, 8)}`,
        order_id: rzpData.order_id,
        prefill: {
          name: customerName,
          contact: cleanPhone,
          email: cleanEmail,
        },
        theme: {
          color: '#D4AF37', // KalaStyle luxury gold
        },
        retry: {
          enabled: true,
          max_count: 3,
        },
        modal: {
          ondismiss: () => {
            setRazorpayLaunching(false);
            toast('Payment window closed. You can click the button below anytime to complete your payment.', {
              icon: 'ℹ️',
            });
          },
        },
        handler: async (response) => {
          try {
            const toastId = toast.loading('Verifying secure payment with server...');
            const verifyRes = await paymentAPI.verify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              orderId,
            });
            toast.dismiss(toastId);

            if (verifyRes.data?.success) {
              toast.success('Payment successful! 🎉 Order confirmed.');
              setSubmitted(true);
              setTimeout(() => {
                navigate(`/orders/${orderId}/tracking`);
              }, 1200);
            } else {
              toast.error(verifyRes.data?.error || 'Payment verification failed on server.');
            }
          } catch (err) {
            toast.dismiss();
            toast.error(
              err.response?.data?.error ||
                'Payment verification failed. Please contact support.'
            );
            console.error('Razorpay verification error:', err);
          } finally {
            setRazorpayLaunching(false);
          }
        },
      };

      try {
        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', function (resp) {
          console.warn('[Razorpay] Payment failed event:', resp.error);
          const failDesc = resp.error?.description || resp.error?.reason || 'Payment could not be processed.';
          toast.error(`UPI / Online payment failed: ${failDesc}`);
          setRazorpayLaunching(false);
        });
        rzp.open();
      } catch (err) {
        console.error('Failed to open Razorpay modal:', err);
        toast.error('Could not open payment window. Please click the button below to try again.');
        setRazorpayLaunching(false);
      }
    },
    [orderId, navigate]
  );

  // Auto-launch Razorpay on mount when order is ready (guarded by ref against duplicate launches)
  useEffect(() => {
    if (!order || submitted || hasAutoLaunchedRef.current) return;

    if (
      order.payment_status === 'paid' ||
      order.status === 'confirmed' ||
      order.status === 'processing'
    ) {
      setSubmitted(true);
      return;
    }

    hasAutoLaunchedRef.current = true;

    if (order.razorpay_order_id) {
      launchRazorpay(
        {
          order_id: order.razorpay_order_id,
          key_id: process.env.REACT_APP_RAZORPAY_KEY_ID || '',
          amount: Math.max(100, Math.round(Number(order.total_amount || order.total_price || 0) * 100)),
          currency: 'INR',
        },
        order
      );

    } else if (razorpayData?.order_id) {
      launchRazorpay(razorpayData, order);
    } else if (orderId) {
      // Auto-initialize session if missing on order
      paymentAPI
        .initializeOrder(orderId)
        .then(({ data }) => {
          if (data?.order_id) {
            setOrder((prev) => (prev ? { ...prev, razorpay_order_id: data.order_id } : prev));
            launchRazorpay(data, order);
          }
        })
        .catch((err) => {
          console.warn('Auto initialize Razorpay session notice:', err.message);
          const msg = err.response?.data?.error || err.message;
          setGatewayError(msg);
        });
    }
  }, [order, submitted, razorpayData, launchRazorpay, orderId]);

  // Load Order details on mount
  useEffect(() => {
    if (!orderId) {
      toast.error('Invalid order reference');
      navigate('/cart');
      return;
    }

    const fetchOrder = async () => {
      try {
        const { data } = await orderAPI.getById(orderId);
        setOrder(data);
        if (
          data?.payment_status === 'paid' ||
          data?.status === 'confirmed' ||
          data?.status === 'processing'
        ) {
          setSubmitted(true);
        }
      } catch (err) {
        toast.error('Failed to load transaction details');
        navigate('/cart');
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [orderId, navigate]);

  // Trigger manual Razorpay checkout on button click
  const handleTriggerRazorpay = async () => {
    if (razorpayLaunching) return;

    if (order?.razorpay_order_id) {
      const orderTotal = Number(order?.total_amount || order?.total_price || 0);
      const amountInPaise = Math.max(100, Math.round(orderTotal * 100));
      return launchRazorpay(
        {
          order_id: order.razorpay_order_id,
          key_id: process.env.REACT_APP_RAZORPAY_KEY_ID || '',
          amount: amountInPaise,
          currency: 'INR',
        },
        order
      );

    }

    if (razorpayData?.order_id) {
      return launchRazorpay(razorpayData, order);
    }

    // Automatically initialize or retrieve Razorpay order session on demand
    try {
      setRazorpayLaunching(true);
      const { data: initData } = await paymentAPI.initializeOrder(orderId);
      if (initData?.order_id) {
        setOrder((prev) => (prev ? { ...prev, razorpay_order_id: initData.order_id } : prev));
        return launchRazorpay(initData, order);
      }
      toast.error('Could not initialize Razorpay payment session.');
    } catch (err) {
      const errMsg = err.response?.data?.error || 'Could not initialize payment session.';
      setGatewayError(errMsg);
      toast.error(errMsg);
    } finally {
      setRazorpayLaunching(false);
    }
  };

  // Switch order to Cash on Delivery (COD)
  const handleSwitchToCOD = async () => {
    if (!orderId || switchingCOD) return;
    try {
      setSwitchingCOD(true);
      await orderAPI.switchToCOD(orderId);
      toast.success('Order switched to Cash on Delivery! 📦');
      setOrder((prev) => ({
        ...prev,
        payment_method: 'cod',
        payment_status: 'cod_pending',
        status: 'confirmed',
        order_status: 'confirmed',
      }));
      setSubmitted(true);
    } catch (err) {
      const errMsg = err.response?.data?.error || 'Failed to switch to Cash on Delivery.';
      toast.error(errMsg);
    } finally {
      setSwitchingCOD(false);
    }
  };

  // Submit manual UPI transaction reference (UTR)
  const handleManualUPISubmit = async (e) => {
    if (e) e.preventDefault();
    if (!utrNumber.trim()) {
      toast.error('Please enter the 12-digit UPI UTR / Reference number');
      return;
    }
    try {
      setSubmittingUTR(true);
      await orderAPI.pay(orderId, {
        ref: utrNumber.trim(),
        payment_method: 'upi',
      });
      toast.success('UPI Reference submitted! Verifying transaction...');
      setOrder((prev) => ({
        ...prev,
        payment_method: 'upi',
        payment_status: 'pending_verification',
        status: 'payment_verification_pending',
        order_status: 'payment_verification_pending',
        transaction_id: utrNumber.trim(),
      }));
      setSubmitted(true);
      setShowUPIModal(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to submit payment reference.');
    } finally {
      setSubmittingUTR(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-900 flex flex-col items-center justify-center font-sans">
        <div className="w-12 h-12 border-4 border-dark-600 border-t-gold-500 rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium text-gray-400">Loading secure payment gateway...</p>
      </div>
    );
  }

  const orderTotal = Number(order?.total_amount || order?.total_price || 0);

  return (
    <div className="min-h-screen bg-dark-900 py-10 px-4 flex items-center justify-center font-sans">
      <div className="max-w-md w-full bg-dark-800 rounded-3xl shadow-card overflow-hidden border border-dark-600 relative">
        {/* Gateway Header */}
        <div className="px-6 py-4 bg-dark-900 text-white flex items-center justify-between border-b border-dark-600">
          <button
            onClick={() => navigate('/orders')}
            className="text-gold-400 hover:text-gold-300 flex items-center gap-1 text-xs transition-colors cursor-pointer"
          >
            <HiChevronLeft className="w-4 h-4" /> My Orders
          </button>
          <div className="flex items-center gap-1.5 text-xs text-gray-400 font-bold uppercase tracking-wider">
            <HiLockClosed className="w-4 h-4 text-gold-500" /> Secure Payment Gateway
          </div>
        </div>

        {/* Order Summary Header */}
        <div className="p-5 bg-dark-900/70 border-b border-dark-600 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-gold-400/90 font-mono">
              Order #{order?.order_number || orderId?.substring(0, 8)}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {order?.items?.length || 1} craft product{(order?.items?.length || 1) > 1 ? 's' : ''}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase font-bold text-gray-400">Total Payable</p>
            <p className="text-2xl font-black text-gold-400">₹{orderTotal.toLocaleString()}</p>
          </div>
        </div>

        {/* Main Body */}
        <div className="p-6 space-y-6">
          {submitted ? (
            /* Completed / Paid / COD / UPI Submitted State */
            <div className="py-6 text-center space-y-5 animate-in fade-in zoom-in duration-300">
              <div className="w-16 h-16 bg-green-500/10 border border-green-500/30 rounded-full flex items-center justify-center mx-auto text-green-400">
                <HiCheck className="w-10 h-10" />
              </div>

              <div className="space-y-2">
                <h2 className="text-xl font-bold text-white">
                  {order?.payment_method === 'cod'
                    ? 'Order Confirmed!'
                    : order?.payment_status === 'pending_verification'
                    ? 'UPI Reference Received!'
                    : 'Payment Successful!'}
                </h2>
                <p className="text-xs text-green-400 font-semibold uppercase tracking-wider bg-green-500/10 border border-green-500/20 py-1 px-3 rounded-full inline-block">
                  {order?.payment_method === 'cod'
                    ? '✓ Cash on Delivery Confirmed'
                    : order?.payment_status === 'pending_verification'
                    ? '⏳ Payment Verification in Progress'
                    : '✓ Order Confirmed & Paid'}
                </p>
              </div>

              <div className="bg-dark-900/80 border border-dark-600 p-4 rounded-2xl text-left space-y-2.5 font-mono text-xs">
                <div className="flex justify-between text-gray-400">
                  <span>Order ID:</span>
                  <span className="text-white font-bold">
                    #{order?.order_number || orderId?.substring(0, 8)}
                  </span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>{order?.payment_method === 'cod' ? 'Pay on Delivery:' : 'Total Amount:'}</span>
                  <span className="text-gold-400 font-bold">₹{orderTotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Payment Method:</span>
                  <span className="text-white font-bold uppercase">
                    {order?.payment_method === 'cod'
                      ? 'Cash on Delivery (COD)'
                      : order?.payment_method === 'upi'
                      ? 'Direct UPI Transfer'
                      : 'Razorpay Online'}
                  </span>
                </div>
                {order?.transaction_id && (
                  <div className="flex justify-between text-gray-400">
                    <span>Reference / UTR:</span>
                    <span className="text-gold-400 font-bold">{order.transaction_id}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => navigate(`/orders/${orderId}/tracking`)}
                  className="flex-1 py-3.5 bg-gradient-luxury text-dark-900 font-bold text-xs rounded-xl transition-all shadow-gold cursor-pointer"
                >
                  Track Package 📦
                </button>
                <button
                  onClick={() => navigate('/orders')}
                  className="py-3.5 px-4 bg-dark-700 hover:bg-dark-600 text-white font-bold text-xs rounded-xl transition-all border border-dark-500 cursor-pointer"
                >
                  My Orders
                </button>
              </div>
            </div>
          ) : (
            /* Payment Selection & Fallback Body */
            <div className="space-y-5 text-center">
              {gatewayError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 text-left space-y-2 animate-in fade-in">
                  <div className="flex items-center gap-2 text-red-400 font-bold text-xs">
                    <HiExclamationCircle className="w-5 h-5 shrink-0" />
                    <span>Razorpay Notice</span>
                  </div>
                  <p className="text-xs text-gray-300 leading-relaxed">
                    {gatewayError.toLowerCase().includes('authentication')
                      ? 'Razorpay authentication failed because store API keys need renewal in Razorpay Dashboard. You can switch to Cash on Delivery or Direct UPI below to place your order right now without delay!'
                      : gatewayError}
                  </p>
                </div>
              )}

              <div className="bg-dark-900/60 border border-dark-600 rounded-2xl p-5 space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-gold-500/10 border border-gold-500/30 flex items-center justify-center mx-auto text-gold-400">
                  <HiLockClosed className="w-7 h-7" />
                </div>

                <div>
                  <h3 className="font-bold text-white text-base">Razorpay Secure Checkout</h3>
                  <p className="text-xs text-gray-400 mt-1">
                    Pay securely using UPI (Google Pay, PhonePe, Paytm, BHIM, QR code), Cards, or NetBanking.
                  </p>
                </div>

                {/* Supported Methods Badges */}
                <div className="grid grid-cols-3 gap-2 pt-2 text-[11px] text-gray-300 font-medium">
                  <div className="bg-dark-800 p-2.5 rounded-xl border border-dark-600 flex flex-col items-center justify-center">
                    <HiQrcode className="w-5 h-5 text-gold-400 mb-1" />
                    <span>UPI & QR Apps</span>
                  </div>
                  <div className="bg-dark-800 p-2.5 rounded-xl border border-dark-600 flex flex-col items-center justify-center">
                    <HiCreditCard className="w-5 h-5 text-gold-400 mb-1" />
                    <span>All Cards</span>
                  </div>
                  <div className="bg-dark-800 p-2.5 rounded-xl border border-dark-600 flex flex-col items-center justify-center">
                    <HiLightningBolt className="w-5 h-5 text-gold-400 mb-1" />
                    <span>NetBanking</span>
                  </div>
                </div>
              </div>

              {/* Razorpay Button */}
              <button
                type="button"
                onClick={handleTriggerRazorpay}
                disabled={razorpayLaunching}
                className="w-full py-4 bg-gradient-luxury hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:scale-100 text-dark-900 font-bold text-sm rounded-xl shadow-gold transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {razorpayLaunching ? (
                  <>
                    <div className="w-4 h-4 border-2 border-dark-900 border-t-transparent rounded-full animate-spin" />
                    Opening Razorpay Gateway...
                  </>
                ) : (
                  <>Pay ₹{orderTotal.toLocaleString()} with Razorpay 🔒</>
                )}
              </button>

              {/* Alternative Options Divider */}
              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-dark-600"></div>
                <span className="flex-shrink mx-3 text-[11px] uppercase tracking-wider text-gray-400 font-medium">
                  Or complete order with
                </span>
                <div className="flex-grow border-t border-dark-600"></div>
              </div>

              {/* Switch to COD button */}
              <button
                type="button"
                onClick={handleSwitchToCOD}
                disabled={switchingCOD}
                className="w-full py-3.5 bg-dark-800 hover:bg-dark-700 border border-emerald-500/40 hover:border-emerald-500/70 text-emerald-400 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                {switchingCOD ? (
                  <>
                    <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                    Switching to Cash on Delivery...
                  </>
                ) : (
                  <>
                    <HiCash className="w-5 h-5 text-emerald-400" />
                    Switch to Cash on Delivery (Pay ₹{orderTotal.toLocaleString()} upon arrival)
                  </>
                )}
              </button>

              {/* Direct UPI Button */}
              <button
                type="button"
                onClick={() => setShowUPIModal(true)}
                className="w-full py-3 bg-dark-800 hover:bg-dark-700 border border-dark-600 hover:border-gold-500/40 text-gray-300 font-medium text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <HiQrcode className="w-4 h-4 text-gold-400" />
                Pay via Direct UPI (Google Pay, PhonePe, QR Code)
              </button>
            </div>
          )}

          {/* UPI Direct Modal */}
          {showUPIModal && (
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-dark-800 border border-dark-600 rounded-3xl max-w-sm w-full p-6 space-y-4 relative animate-in fade-in zoom-in duration-200">
                <button
                  onClick={() => setShowUPIModal(false)}
                  className="absolute top-4 right-4 text-gray-400 hover:text-white p-1"
                >
                  <HiX className="w-5 h-5" />
                </button>

                <div className="text-center space-y-1">
                  <div className="w-12 h-12 rounded-2xl bg-gold-500/10 border border-gold-500/30 flex items-center justify-center mx-auto text-gold-400 mb-2">
                    <HiQrcode className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-white text-base">Direct UPI Transfer</h3>
                  <p className="text-xs text-gray-400">
                    Pay ₹{orderTotal.toLocaleString()} directly to store UPI ID
                  </p>
                </div>

                <div className="bg-dark-900 border border-dark-600 p-3 rounded-xl flex items-center justify-between">
                  <span className="font-mono text-xs text-gold-400 select-all">styleheaven@upi</span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText('styleheaven@upi');
                      toast.success('UPI ID copied to clipboard!');
                    }}
                    className="text-xs text-gray-400 hover:text-white flex items-center gap-1 cursor-pointer bg-dark-700 px-2.5 py-1 rounded-lg"
                  >
                    <HiDuplicate className="w-3.5 h-3.5" /> Copy
                  </button>
                </div>

                <a
                  href={`upi://pay?pa=styleheaven@upi&pn=KalaStyle%20AI&am=${orderTotal}&tr=${order?.order_number || orderId}&tn=Order%20Payment&cu=INR`}
                  className="w-full py-3 bg-gradient-luxury text-dark-900 font-bold text-xs rounded-xl flex items-center justify-center gap-2"
                >
                  Open in UPI App (GPay / PhonePe / Paytm) 📱
                </a>

                <form onSubmit={handleManualUPISubmit} className="space-y-3 pt-2 border-t border-dark-600">
                  <p className="text-[11px] text-gray-400 text-left">
                    After making payment, enter the 12-digit UTR / Reference number:
                  </p>
                  <input
                    type="text"
                    placeholder="Enter 12-digit UPI UTR / Ref No."
                    value={utrNumber}
                    onChange={(e) => setUtrNumber(e.target.value)}
                    className="w-full px-3 py-2.5 bg-dark-900 border border-dark-600 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-gold-500 font-mono"
                  />
                  <button
                    type="submit"
                    disabled={submittingUTR || !utrNumber.trim()}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
                  >
                    {submittingUTR ? 'Submitting...' : 'Confirm UPI Payment Proof ✓'}
                  </button>
                </form>
              </div>
            </div>
          )}

          <p className="text-[10px] text-gray-500 text-center flex items-center justify-center gap-1">
            <HiShieldCheck className="w-3.5 h-3.5 text-green-500" /> KalaStyle AI 256-Bit SSL Encrypted Checkout
          </p>
        </div>
      </div>
    </div>
  );
}
