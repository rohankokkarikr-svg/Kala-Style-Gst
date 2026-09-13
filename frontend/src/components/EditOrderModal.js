import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  HiX, 
  HiPencilAlt, 
  HiCheck, 
  HiClock, 
  HiShieldCheck, 
  HiLightningBolt, 
  HiLockClosed,
  HiExclamation
} from 'react-icons/hi';
import { orderAPI, paymentAPI } from '../services/api';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

const AVAILABLE_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];

// Razorpay checkout script loader
const loadRazorpayScript = () =>
  new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

export default function EditOrderModal({ isOpen, onClose, order, onOrderUpdated }) {
  const [currentOrder, setCurrentOrder] = useState(order || null);
  const [shippingAddress, setShippingAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cod');
  const [itemSizes, setItemSizes] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [payingUpi, setPayingUpi] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');
  const [isExpired, setIsExpired] = useState(false);
  const [loadingRealtime, setLoadingRealtime] = useState(false);
  const realtimeChannelRef = useRef(null);

  // 1. Fetch fresh real-time order data whenever modal opens
  useEffect(() => {
    if (!isOpen || !order?.id) return;

    setCurrentOrder(order);
    setShippingAddress(order.shipping_address || '');
    setPhone(order.phone || '');
    setPaymentMethod(order.payment_method || 'cod');

    const initialSizes = {};
    (order.items || []).forEach((item) => {
      initialSizes[item.id] = item.size || 'M';
    });
    setItemSizes(initialSizes);

    // Fetch latest fresh record from server
    setLoadingRealtime(true);
    orderAPI
      .getById(order.id)
      .then(({ data }) => {
        if (data) {
          setCurrentOrder(data);
          setShippingAddress(data.shipping_address || '');
          setPhone(data.phone || '');
          setPaymentMethod(data.payment_method || 'cod');

          const freshSizes = {};
          (data.items || []).forEach((item) => {
            freshSizes[item.id] = item.size || 'M';
          });
          setItemSizes(freshSizes);
        }
      })
      .catch((err) => {
        console.warn('Could not fetch fresh order data:', err.message);
      })
      .finally(() => {
        setLoadingRealtime(false);
      });
  }, [isOpen, order]);

  // 2. Real-time Supabase subscription for active order changes
  useEffect(() => {
    if (!isOpen || !order?.id) return;

    const channelName = `edit_order_sync_${order.id}_${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `id=eq.${order.id}` },
        (payload) => {
          if (payload.new) {
            setCurrentOrder((prev) => {
              const merged = { ...prev, ...payload.new };
              if (onOrderUpdated) onOrderUpdated(merged);
              return merged;
            });
          }
        }
      )
      .subscribe();

    realtimeChannelRef.current = channel;

    return () => {
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
      }
    };
  }, [isOpen, order?.id, onOrderUpdated]);

  // 3. Real-time countdown timer for edit window (12 hours)
  useEffect(() => {
    if (!isOpen || !currentOrder?.created_at) return;

    const updateTimer = () => {
      const createdTime = new Date(currentOrder.created_at).getTime();
      const cancelWindowMs = 12 * 60 * 60 * 1000;
      const expireTime = createdTime + cancelWindowMs;
      const remainingMs = expireTime - Date.now();

      if (remainingMs <= 0) {
        setTimeLeft('Edit window expired');
        setIsExpired(true);
        return;
      }

      setIsExpired(false);
      const hours = Math.floor(remainingMs / (1000 * 60 * 60));
      const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((remainingMs % (1000 * 60)) / 1000);

      setTimeLeft(`${hours}h ${minutes}m ${seconds}s left to edit`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [isOpen, currentOrder?.created_at]);

  if (!isOpen || !currentOrder) return null;

  const effectiveStatus = (currentOrder.order_status || currentOrder.status || 'pending').toLowerCase();
  const isEditable = ['pending', 'confirmed'].includes(effectiveStatus) && !isExpired;
  const isAlreadyPaid = currentOrder.payment_status === 'paid';
  const orderTotal = Number(currentOrder.total_amount || currentOrder.total_price || 0);

  const handleSizeChange = (itemId, newSize) => {
    setItemSizes((prev) => ({
      ...prev,
      [itemId]: newSize,
    }));
  };

  // Launch Razorpay UPI checkout directly for this order
  const handleLaunchUpiPayment = async (targetOrderId) => {
    setPayingUpi(true);
    const toastId = toast.loading('Opening secure UPI payment gateway...');

    try {
      const loaded = await loadRazorpayScript();
      if (!loaded) {
        throw new Error('Could not load payment gateway script. Please check your internet connection.');
      }

      // Initialize / retrieve Razorpay payment order session
      const { data: rzpData } = await paymentAPI.initializeOrder(targetOrderId);
      if (!rzpData?.order_id) {
        throw new Error('Could not generate UPI transaction session from server.');
      }

      toast.dismiss(toastId);

      const keyId =
        rzpData.key_id ||
        process.env.REACT_APP_RAZORPAY_KEY_ID ||
        'rzp_live_TamouXgJy9WoAl';

      const rawPhone = String(phone || currentOrder?.phone || '').replace(/\D/g, '');
      const cleanPhone = rawPhone.length >= 10 ? rawPhone.slice(-10) : (rawPhone || undefined);
      const rawEmail = (currentOrder?.users?.email || '').trim();
      const cleanEmail = rawEmail.includes('@') ? rawEmail : undefined;
      const customerName = (currentOrder?.shipping_name || currentOrder?.users?.name || '').trim() || undefined;

      const options = {
        key: keyId,
        amount: Math.max(100, Number(rzpData.amount) || 100),
        currency: rzpData.currency || 'INR',
        name: 'KalaStyle AI',
        description: `Order #${currentOrder.order_number || currentOrder.id?.substring(0, 8)}`,
        order_id: rzpData.order_id,
        prefill: {
          name: customerName,
          contact: cleanPhone,
          email: cleanEmail,
        },
        theme: {
          color: '#D4AF37', // KalaStyle gold
        },
        retry: {
          enabled: true,
          max_count: 3,
        },
        modal: {
          ondismiss: () => {
            setPayingUpi(false);
            toast('UPI payment was closed. You can click "Pay Now via UPI" on your order anytime.', {
              icon: 'ℹ️',
            });
            onClose();
          },
        },
        handler: async (response) => {
          const verifyToast = toast.loading('Verifying UPI payment confirmation...');
          try {
            const verifyRes = await paymentAPI.verify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              orderId: targetOrderId,
            });

            toast.dismiss(verifyToast);

            if (verifyRes.data?.success) {
              toast.success('UPI Payment Successful! Order confirmed. 🎉');
              const updatedPaidOrder = {
                ...currentOrder,
                payment_method: 'upi',
                payment_status: 'paid',
                order_status: 'confirmed',
                status: 'confirmed',
              };
              setCurrentOrder(updatedPaidOrder);
              if (onOrderUpdated) onOrderUpdated(updatedPaidOrder);
              onClose();
            } else {
              toast.error('Payment verification failed on server.');
            }
          } catch (verErr) {
            toast.dismiss(verifyToast);
            toast.error(verErr.response?.data?.error || verErr.message || 'Payment verification failed.');
          } finally {
            setPayingUpi(false);
          }
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', (resp) => {
        console.warn('[Razorpay] Payment failed:', resp.error);
        toast.error(`Payment failed: ${resp.error?.description || 'Transaction unsuccessful'}`);
        setPayingUpi(false);
      });

      rzp.open();
    } catch (err) {
      toast.dismiss(toastId);
      console.error('UPI checkout error:', err);
      toast.error(err.response?.data?.error || err.message || 'Failed to start UPI checkout');
      setPayingUpi(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!isEditable) {
      return toast.error('This order is no longer eligible for editing.');
    }

    if (!shippingAddress.trim()) {
      return toast.error('Please enter a valid shipping address');
    }
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      return toast.error('Phone number must contain exactly 10 digits');
    }

    setSubmitting(true);
    try {
      const payload = {
        shipping_address: shippingAddress.trim(),
        phone: cleanPhone,
        payment_method: paymentMethod,
        item_sizes: itemSizes,
      };

      // 1. Save updated order details
      const { data: updatedOrder } = await orderAPI.updateOrderDetails(currentOrder.id, payload);
      setCurrentOrder(updatedOrder);
      if (onOrderUpdated) {
        onOrderUpdated(updatedOrder);
      }

      // 2. If user selected UPI and order is not yet paid, launch UPI payment directly!
      if ((paymentMethod === 'upi' || paymentMethod === 'razorpay') && !isAlreadyPaid) {
        toast.success('Order details updated! Opening UPI payment...');
        setSubmitting(false);
        await handleLaunchUpiPayment(currentOrder.id);
      } else {
        toast.success('Order details updated successfully! ✨');
        setSubmitting(false);
        onClose();
      }
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to update order details';
      toast.error(msg);
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="bg-dark-800 rounded-3xl border border-dark-600 shadow-2xl w-full max-w-xl overflow-hidden my-6 text-white"
        >
          {/* Header */}
          <div className="flex justify-between items-center p-6 border-b border-dark-600 bg-dark-900/80">
            <div>
              <div className="flex items-center gap-2">
                <HiPencilAlt className="w-5 h-5 text-gold-400" />
                <h2 className="text-xl font-serif font-bold text-white">Edit Order Details</h2>
                <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" /> Real-Time Sync
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1 flex items-center gap-2 flex-wrap">
                <span>Order #{currentOrder.order_number || currentOrder.id?.substring(0, 8)}</span>
                <span>•</span>
                <span className={`font-semibold flex items-center gap-1 ${isExpired ? 'text-red-400' : 'text-gold-400'}`}>
                  <HiClock className="w-3.5 h-3.5" /> {timeLeft || 'Calculating...'}
                </span>
              </p>
            </div>
            <button
              onClick={onClose}
              disabled={submitting || payingUpi}
              className="text-gray-400 hover:text-white p-2 rounded-xl hover:bg-dark-700 transition-colors cursor-pointer"
            >
              <HiX className="w-5 h-5" />
            </button>
          </div>

          {/* Real-time Non-Editable Alert if order is in progress */}
          {!isEditable && (
            <div className="bg-red-500/10 border-b border-red-500/20 px-6 py-3 flex items-center gap-2 text-xs text-red-300">
              <HiExclamation className="w-4 h-4 shrink-0 text-red-400" />
              <span>
                {isExpired
                  ? 'The 12-hour edit/cancellation window for this order has expired.'
                  : `This order is currently marked as "${effectiveStatus}" in real-time and can no longer be edited.`}
              </span>
            </div>
          )}

          {/* Form Body */}
          <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[75vh] overflow-y-auto custom-scrollbar">
            
            {/* 1. Item Size Modifications */}
            {currentOrder.items && currentOrder.items.length > 0 && (
              <div className="space-y-2.5">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-400 block">
                  Product Sizes
                </label>
                <div className="space-y-2.5 bg-dark-900/70 p-3.5 rounded-2xl border border-dark-600">
                  {currentOrder.items.map((item) => {
                    const availableSizes =
                      item.product?.sizes && Array.isArray(item.product.sizes) && item.product.sizes.length > 0
                        ? item.product.sizes
                        : AVAILABLE_SIZES;

                    return (
                      <div key={item.id} className="flex items-center justify-between gap-4 py-2 border-b border-dark-700/60 last:border-b-0">
                        <div className="flex items-center gap-3 min-w-0">
                          {item.product?.image_url && (
                            <img
                              src={item.product.image_url}
                              alt=""
                              className="w-12 h-14 object-cover rounded-lg bg-dark-800 shrink-0"
                            />
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white truncate">
                              {item.product?.name || 'Handicraft Item'}
                            </p>
                            <p className="text-xs text-gray-400">Qty: {item.quantity}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-gray-400 font-medium">Size:</span>
                          <select
                            disabled={!isEditable}
                            value={itemSizes[item.id] || item.size || 'M'}
                            onChange={(e) => handleSizeChange(item.id, e.target.value)}
                            className="bg-dark-800 border border-dark-600 rounded-lg px-3 py-1.5 text-xs text-gold-400 font-bold focus:border-gold-500 outline-none disabled:opacity-60 cursor-pointer"
                          >
                            {availableSizes.map((sz) => (
                              <option key={sz} value={sz}>{sz}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 2. Shipping Address */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-400 block">
                Delivery Address <span className="text-red-400">*</span>
              </label>
              <textarea
                disabled={!isEditable}
                value={shippingAddress}
                onChange={(e) => setShippingAddress(e.target.value)}
                rows={3}
                required
                placeholder="Enter complete shipping address (House No, Street, City, State, Pincode)"
                className="input-field w-full text-sm bg-dark-900 border-dark-600 focus:border-gold-500 rounded-xl disabled:opacity-60"
              />
            </div>

            {/* 3. Phone Number */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-400 block">
                Contact Phone Number <span className="text-red-400">*</span>
              </label>
              <input
                disabled={!isEditable}
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                required
                maxLength={10}
                minLength={10}
                pattern="\d{10}"
                placeholder="10-digit mobile number (e.g. 9876543210)"
                className="input-field w-full text-sm bg-dark-900 border-dark-600 focus:border-gold-500 font-mono tracking-wider rounded-xl disabled:opacity-60"
              />
              <p className="text-[11px] text-gray-500">10-digit mobile number for dispatch updates.</p>
            </div>

            {/* 4. Payment Method Choice (COD vs UPI) */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-400">
                  Payment Method
                </label>
                {isAlreadyPaid && (
                  <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
                    ✓ Already Paid
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* COD Option */}
                <button
                  type="button"
                  disabled={!isEditable || isAlreadyPaid}
                  onClick={() => setPaymentMethod('cod')}
                  className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                    paymentMethod === 'cod'
                      ? 'border-gold-500 bg-gold-500/10 text-white shadow-gold-sm'
                      : 'border-dark-600 bg-dark-900 text-gray-400 hover:border-dark-500'
                  } ${isAlreadyPaid ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <span className="font-bold text-xs">Cash on Delivery</span>
                  <span className="text-[10px] text-gray-500 mt-1">Pay with cash at delivery</span>
                </button>

                {/* UPI Option */}
                <button
                  type="button"
                  disabled={!isEditable}
                  onClick={() => setPaymentMethod('upi')}
                  className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                    paymentMethod === 'upi' || paymentMethod === 'razorpay'
                      ? 'border-emerald-500 bg-emerald-500/15 text-white shadow-emerald-sm'
                      : 'border-dark-600 bg-dark-900 text-gray-400 hover:border-dark-500'
                  }`}
                >
                  <span className="font-bold text-xs text-emerald-400 flex items-center gap-1.5">
                    <HiLightningBolt className="w-3.5 h-3.5" /> UPI / Online
                  </span>
                  <span className="text-[10px] text-gray-400 mt-1">Google Pay, PhonePe, Paytm, QR</span>
                </button>
              </div>

              {/* UPI Instant Notice */}
              {(paymentMethod === 'upi' || paymentMethod === 'razorpay') && !isAlreadyPaid && (
                <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl space-y-1.5 animate-in fade-in zoom-in duration-200">
                  <p className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <HiShieldCheck className="w-4 h-4" /> Instant UPI Payment Activated
                  </p>
                  <p className="text-[11px] text-gray-300 leading-relaxed">
                    Changing to UPI allows you to pay securely online right now via <strong>Google Pay, PhonePe, Paytm, BHIM, or QR Code</strong>. Once completed, your order payment is verified immediately!
                  </p>
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="pt-4 border-t border-dark-600 flex items-center justify-between gap-3">
              <div className="text-left">
                <span className="text-[10px] uppercase font-bold text-gray-400 block">Total Amount</span>
                <span className="text-lg font-bold text-gold-400 font-mono">₹{orderTotal.toLocaleString()}</span>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting || payingUpi}
                  className="btn-secondary px-5 py-2.5 text-xs rounded-xl cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={!isEditable || submitting || payingUpi}
                  className={`px-6 py-2.5 text-xs font-bold rounded-xl flex items-center gap-2 shadow-gold transition-all cursor-pointer ${
                    (paymentMethod === 'upi' || paymentMethod === 'razorpay') && !isAlreadyPaid
                      ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white'
                      : 'btn-primary'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {submitting || payingUpi ? (
                    <>
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      {payingUpi ? 'Launching UPI Checkout...' : 'Saving Changes...'}
                    </>
                  ) : (paymentMethod === 'upi' || paymentMethod === 'razorpay') && !isAlreadyPaid ? (
                    <>
                      <HiLightningBolt className="w-4 h-4" /> Save & Pay ₹{orderTotal.toLocaleString()} via UPI
                    </>
                  ) : (
                    <>
                      <HiCheck className="w-4 h-4" /> Save Order Changes
                    </>
                  )}
                </button>
              </div>
            </div>

          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
