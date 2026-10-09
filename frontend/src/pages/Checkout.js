import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { orderAPI, couponAPI } from '../services/api';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { OTP_LENGTH, isValidOtp } from '../utils/authHelper';
import {
  HiShieldCheck, HiTruck, HiUser, HiPhone, HiLocationMarker,
  HiCheckCircle, HiArrowRight, HiArrowLeft, HiTag, HiExclamationCircle,
  HiLockClosed, HiReceiptTax, HiCash, HiRefresh, HiMap, HiX, HiExternalLink, HiCreditCard,
  HiMail, HiKey, HiSparkles
} from 'react-icons/hi';

/* ─── Mask email helper (e.g. rohan@gmail.com -> r***@gmail.com) ─── */
const maskEmail = (str) => {
  if (!str || !str.includes('@')) return str;
  const [name, domain] = str.split('@');
  if (name.length <= 2) return `${name[0]}***@${domain}`;
  return `${name[0]}***@${domain}`;
};

/* ─── Field error ─── */
const FieldError = ({ msg }) =>
  msg ? (
    <p className="flex items-center gap-1 text-red-400 text-xs mt-1.5">
      <HiExclamationCircle className="w-3.5 h-3.5 shrink-0" />
      {msg}
    </p>
  ) : null;

/* ─── Step indicator ─── */
const steps = [
  { label: 'Delivery Info',    icon: HiLocationMarker },
  { label: 'Review & Confirm', icon: HiShieldCheck },
];

/* ─── LocationIQ/Nominatim reverse-geocode (lat/lng → address) ─── */
async function reverseGeocode(lat, lng) {
  const locationIqKey = process.env.REACT_APP_LOCATIONIQ_API_KEY;
  
  if (locationIqKey && locationIqKey !== 'your_locationiq_api_key' && locationIqKey.trim() !== '') {
    try {
      const res = await fetch(
        `https://us1.locationiq.com/v1/reverse.php?key=${locationIqKey}&lat=${lat}&lon=${lng}&format=json&addressdetails=1&accept-language=en`
      );
      if (res.ok) {
        return await res.json();
      }
      console.warn('LocationIQ reverse geocode returned non-OK status. Falling back...');
    } catch (liqErr) {
      console.error('LocationIQ reverse geocode API request failed. Falling back...', liqErr);
    }
  }

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&email=support@kalastyle.ai`,
      { headers: { 'Accept-Language': 'en' } }
    );
    if (res.ok) {
      return await res.json();
    }
    console.warn('Nominatim reverse geocode returned non-OK status. Attempting fallback...');
  } catch (err) {
    console.warn('Nominatim reverse geocode fetch failed. Attempting fallback...', err);
  }

  // Fallback to BigDataCloud Free Reverse Geocoding Client
  try {
    const fallbackRes = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`
    );
    if (!fallbackRes.ok) throw new Error('BigDataCloud API returned non-OK status');
    
    const bdcData = await fallbackRes.json();
    
    // Normalize response to Nominatim structure expected by caller
    return {
      display_name: [bdcData.locality, bdcData.city, bdcData.principalSubdivision, bdcData.countryName].filter(Boolean).join(', '),
      address: {
        city: bdcData.city || bdcData.locality || '',
        state: bdcData.principalSubdivision || '',
        postcode: bdcData.postcode || '',
        road: bdcData.locality || '',
      }
    };
  } catch (fallbackErr) {
    console.error('All reverse geocoding API requests failed:', fallbackErr);
    throw new Error('Reverse geocode failed');
  }
}

/* ─── LocationIQ/Nominatim forward-geocode (text → location) ─── */
async function forwardGeocode(query) {
  const locationIqKey = process.env.REACT_APP_LOCATIONIQ_API_KEY;
  
  if (locationIqKey && locationIqKey !== 'your_locationiq_api_key' && locationIqKey.trim() !== '') {
    try {
      const res = await fetch(
        `https://us1.locationiq.com/v1/search.php?key=${locationIqKey}&q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=1&countrycodes=in&accept-language=en`
      );
      if (res.ok) {
        return await res.json();
      }
      console.warn('LocationIQ forward geocode returned non-OK status. Falling back...');
    } catch (liqErr) {
      console.error('LocationIQ forward geocode API request failed. Falling back...', liqErr);
    }
  }

  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=1&countrycodes=in&email=support@kalastyle.ai`,
    { headers: { 'Accept-Language': 'en' } }
  );
  if (!res.ok) throw new Error('Forward geocode failed');
  return res.json();
}

/* ─── Extract fields from Nominatim address object ─── */
function parseNominatimAddress(addr = {}) {
  const city =
    addr.city || addr.town || addr.village || addr.suburb || addr.county || '';
  const state    = addr.state || '';
  const postcode = (addr.postcode || '').replace(/\s/g, '').slice(0, 6);
  const road     = addr.road || addr.neighbourhood || '';
  const quarter  = addr.quarter || addr.suburb || '';
  const street   = [road, quarter].filter(Boolean).join(', ');
  return { city, state, postcode, street };
}

export default function Checkout() {
  const { items, totalPrice, clearCart, removeByProductId } = useCart();
  const { user, sendOtp, verifyOtp } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();

  const [step, setStep]                   = useState(1);
  const [loading, setLoading]             = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cod');

  const [showLoadingPopup, setShowLoadingPopup] = useState(false);
  const [popupText, setPopupText] = useState('Please wait...');
  const [codOrderSuccess, setCodOrderSuccess] = useState(null);

  const [form, setForm] = useState({
    fullName:     user?.name || '',
    email:        user?.email || '',
    phone:        '',
    confirmPhone: '',
    address:      '',
    landmark:     '',
    city:         '',
    state:        '',
    pinCode:      '',
  });

  // Sync user details when logged in
  useEffect(() => {
    if (user) {
      setForm(prev => ({
        ...prev,
        fullName: prev.fullName || user.name || '',
        email:    prev.email || user.email || '',
      }));
    }
  }, [user]);

  // ── Registered Email Order Confirmation OTP States (Both COD & Online) ──
  const [showOtpModal, setShowOtpModal]   = useState(false);
  const [otpValue, setOtpValue]           = useState(Array(OTP_LENGTH).fill('')); // 8-digit OTP matching Login
  const [otpLoading, setOtpLoading]       = useState(false);
  const [otpSending, setOtpSending]       = useState(false);
  const [otpCountdown, setOtpCountdown]   = useState(60);
  const [canResendOtp, setCanResendOtp]   = useState(false);
  const [otpError, setOtpError]           = useState('');
  const [lastOtpEmail, setLastOtpEmail]   = useState('');
  const otpInputsRef                      = useRef([]);

  // OTP Countdown Timer
  useEffect(() => {
    let timer;
    if (showOtpModal && otpCountdown > 0) {
      timer = setInterval(() => {
        setOtpCountdown(prev => {
          if (prev <= 1) {
            setCanResendOtp(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [showOtpModal, otpCountdown]);

  const [errors, setErrors] = useState({});

  // ── Location states ──
  const [gpsLoading, setGpsLoading]           = useState(false);
  const [verifyLoading, setVerifyLoading]     = useState(false);
  const [verifyResult, setVerifyResult]       = useState(null); // { ok, display, lat, lng, mapUrl }
  const [addressVerified, setAddressVerified] = useState(false);
  const [liveLocation, setLiveLocation]       = useState(null); // { lat, lng, mapUrl, accuracy, source }

  // ── Coupon ──
  const [couponCode, setCouponCode]       = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState(0);
  const [discountType, setDiscountType]   = useState('percentage');
  const [couponError, setCouponError]     = useState('');
  const [couponApplying, setCouponApplying] = useState(false);
  const [isCouponApplied, setIsCouponApplied] = useState(false);

  /* ─── Field helper ─── */
  const setField = (key, val) => {
    setForm(f => ({ ...f, [key]: val }));
    if (errors[key]) setErrors(e => ({ ...e, [key]: '' }));
    // If address-related field changes, reset verification
    if (['address', 'city', 'state', 'pinCode'].includes(key)) {
      setAddressVerified(false);
      setVerifyResult(null);
    }
  };

  /* ─── GPS: Use My Location ─── */
  const handleUseMyLocation = useCallback(() => {
    setGpsLoading(true);

    const getPosition = (options) => {
      return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error('Geolocation not supported'));
        } else {
          navigator.geolocation.getCurrentPosition(resolve, reject, options);
        }
      });
    };

    const runGeo = async () => {
      try {
        let pos;
        let coords;
        let isIPFallback = false;

        try {
          // Attempt high accuracy first (useful on mobile devices with actual GPS)
          pos = await getPosition({ enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 });
          coords = pos.coords;
        } catch (err) {
          console.warn('High accuracy geolocation timed out/failed. Falling back to standard accuracy...', err);
          try {
            // Fall back to standard accuracy (fast and extremely reliable on desktop/laptops via IP lookup)
            pos = await getPosition({ enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 });
            coords = pos.coords;
          } catch (stdErr) {
            console.warn('Standard accuracy geolocation also failed. Falling back to IP-based geolocator...', stdErr);
            isIPFallback = true;
          }
        }

        if (isIPFallback) {
          // Fallback to IP-based geolocation (works on all devices without requesting GPS hardware permissions)
          let ipData;
          try {
            const ipRes = await fetch('https://ipapi.co/json/');
            if (!ipRes.ok) throw new Error('ipapi.co failed');
            ipData = await ipRes.json();
          } catch (ipApiErr) {
            console.warn('ipapi.co failed, trying ipinfo.io...', ipApiErr);
            const ipInfoRes = await fetch('https://ipinfo.io/json');
            if (!ipInfoRes.ok) throw new Error('ipinfo.io failed');
            const ipInfoData = await ipInfoRes.json();
            // Map ipinfo.io structure to similar fields
            const [lat, lng] = (ipInfoData.loc || '').split(',');
            ipData = {
              city: ipInfoData.city,
              region: ipInfoData.region,
              postal: ipInfoData.postal,
              country_name: ipInfoData.country,
              latitude: lat ? parseFloat(lat) : null,
              longitude: lng ? parseFloat(lng) : null,
            };
          }

          if (!ipData.city && !ipData.region) {
            throw new Error('IP geolocation returned empty data');
          }

          setForm(f => ({
            ...f,
            address: ipData.city || '',
            city:    ipData.city || '',
            state:   ipData.region || '',
            pinCode: ipData.postal || '',
          }));

          const mapUrl = ipData.latitude ? `https://www.google.com/maps?q=${ipData.latitude},${ipData.longitude}` : null;
          setVerifyResult({
            ok: true,
            display: [ipData.city, ipData.region, ipData.country_name].filter(Boolean).join(', '),
            lat: ipData.latitude || null,
            lng: ipData.longitude || null,
            mapUrl,
          });
          if (ipData.latitude && ipData.longitude) {
            setLiveLocation({
              lat: ipData.latitude,
              lng: ipData.longitude,
              mapUrl,
              source: 'ip'
            });
          }
          setAddressVerified(true);
          setErrors(e => ({ ...e, address: '', city: '', state: '', pinCode: '' }));
          toast.success('Location detected via IP and auto-filled! ✅');
          return;
        }

        // Standard GPS coordinate translation
        const data = await reverseGeocode(coords.latitude, coords.longitude);
        const addr = data.address || {};
        const { city, state, postcode, street } = parseNominatimAddress(addr);

        // Build a readable street address
        const houseNum = addr.house_number || '';
        const fullStreet = [houseNum, street].filter(Boolean).join(' ');

        setForm(f => ({
          ...f,
          address: fullStreet || data.display_name?.split(',').slice(0, 3).join(', ') || '',
          city:    city,
          state:   state,
          pinCode: postcode,
        }));

        const mapUrl = `https://www.google.com/maps?q=${coords.latitude},${coords.longitude}`;
        setVerifyResult({
          ok: true,
          display: data.display_name,
          lat: coords.latitude,
          lng: coords.longitude,
          mapUrl,
        });
        setLiveLocation({
          lat: coords.latitude,
          lng: coords.longitude,
          mapUrl,
          accuracy: coords.accuracy || null,
          source: 'gps'
        });
        setAddressVerified(true);
        setErrors(e => ({ ...e, address: '', city: '', state: '', pinCode: '' }));
        toast.success('Location detected and auto-filled! ✅');
      } catch (err) {
        console.error('Geolocation error:', err);
        const msgs = {
          1: 'Location permission is denied. Please click the site settings/lock icon in your browser URL bar, enable Location permissions, and make sure your device location services are turned on! 📍',
          2: 'Could not detect your position. Please check that your device Location/GPS is turned on and try again.',
          3: 'Location request timed out. Please check that your device Location/GPS is turned on and try again.',
        };
        toast.error(msgs[err.code] || 'Could not read your location details. Please ensure your device Location/GPS is turned on.', { duration: 6000 });
      } finally {
        setGpsLoading(false);
      }
    };

    runGeo();
  }, []);

  // Redirect if cart is empty
  useEffect(() => {
    if (items.length === 0) {
      navigate('/cart');
    }
  }, [items.length, navigate]);

  // Validate cart items on mount to ensure none are deleted / stale
  useEffect(() => {
    if (!items || items.length === 0) return;
    const checkCart = async () => {
      try {
        await orderAPI.calculateTotal({
          items: items.map(i => ({
            product_id: i.product?.id || i.product_id || i.id,
            quantity: Math.max(1, parseInt(i.quantity, 10) || 1),
            size: i.size || 'Standard'
          })).filter(i => Boolean(i.product_id)),
          coupon_code: null
        });
      } catch (err) {
        const errMsg = err.response?.data?.error || err.message || '';
        const match = errMsg.match(/Product not found:\s*([a-zA-Z0-9_-]+)/i);
        if (match) {
          const missingId = match[1];
          if (typeof removeByProductId === 'function') {
            removeByProductId(missingId);
          }
          toast('An unavailable item was automatically removed from your cart.', { icon: 'ℹ️' });
        }
      }
    };
    checkCart();
  }, []);

  if (items.length === 0) return null;

  const deliveryFee = 0;
  const freeAbove = 0;
  const isFreeShipping = true;
  const shipping = 0;
  let discountAmount = 0;

  if (isCouponApplied) {
    if (discountType === 'percentage') {
      discountAmount = (totalPrice * appliedDiscount) / 100;
    } else if (discountType === 'fixed') {
      discountAmount = Math.min(totalPrice, appliedDiscount);
    }
  }
  const finalTotal = Math.max(0, totalPrice + shipping - discountAmount);

  /* ─── Verify Address ─── */
  const handleVerifyAddress = async () => {
    const query = [form.address, form.city, form.state, form.pinCode, 'India']
      .filter(Boolean).join(', ');

    if (query.replace(/,\s*India/gi, '').trim().length < 10) {
      toast.error('Please enter more address details before verifying');
      return;
    }

    setVerifyLoading(true);
    setVerifyResult(null);
    try {
      const results = await forwardGeocode(query);
      if (!results || results.length === 0) {
        setVerifyResult({ ok: false, display: 'Address not found on map. Please check and correct your address.', lat: null, lng: null, mapUrl: null });
        setAddressVerified(false);
        return;
      }
      const place = results[0];
      const addr  = place.address || {};
      const { city, state, postcode } = parseNominatimAddress(addr);

      // Check if key fields roughly match
      const cityMatch  = !form.city  || city.toLowerCase().includes(form.city.toLowerCase())  || form.city.toLowerCase().includes(city.toLowerCase());
      const stateMatch = !form.state || state.toLowerCase().includes(form.state.toLowerCase()) || form.state.toLowerCase().includes(state.toLowerCase());
      const isGood = cityMatch || stateMatch; // at least city or state confirmed

      const mapUrl = `https://www.google.com/maps?q=${place.lat},${place.lon}`;
      setVerifyResult({
        ok: isGood,
        display: place.display_name,
        lat: place.lat,
        lng: place.lon,
        mapUrl,
        detectedCity:    city,
        detectedState:   state,
        detectedPincode: postcode,
      });
      if (place.lat && place.lon) {
        setLiveLocation(prev => prev || {
          lat: parseFloat(place.lat),
          lng: parseFloat(place.lon),
          mapUrl,
          source: 'forward_geocode'
        });
      }
      setAddressVerified(isGood);

      if (isGood) {
        toast.success('Address verified successfully! ✅');
      } else {
        toast.error('Address could not be confirmed. Please review the detected location below.');
      }
    } catch {
      toast.error('Verification failed. Please check your internet and try again.');
      setAddressVerified(false);
    } finally {
      setVerifyLoading(false);
    }
  };

  /* ─── Step 1 validation ─── */
  const validateStep1 = () => {
    const e = {};
    const trimmed = (k) => form[k].trim();

    if (!trimmed('fullName') || trimmed('fullName').length < 3)
      e.fullName = 'Enter your full name (at least 3 characters)';

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmed('email') || !emailRegex.test(trimmed('email')))
      e.email = 'Valid email is required for Shiprocket courier tracking & digital invoice';

    const digits = form.phone.replace(/\D/g, '');
    if (digits.length !== 10) e.phone = 'Phone must be exactly 10 digits';

    const confirmDigits = form.confirmPhone.replace(/\D/g, '');
    if (!form.confirmPhone) e.confirmPhone = 'Please confirm your phone number';
    else if (digits !== confirmDigits) e.confirmPhone = 'Phone numbers do not match';

    if (trimmed('address').length < 10)
      e.address = 'Please enter a complete address (min 10 characters)';
    if (!trimmed('city'))    e.city    = 'City is required';
    if (!trimmed('state'))   e.state   = 'State is required';
    if (!/^\d{6}$/.test(trimmed('pinCode')))
      e.pinCode = 'Enter a valid 6-digit PIN code';

    if (!addressVerified)
      e.address = (e.address ? e.address + ' · ' : '') + 'Please verify your address before proceeding';

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNextStep = () => {
    if (validateStep1()) setStep(2);
    else toast.error('Please fix the highlighted errors before continuing');
  };

  /* ─── Coupon ─── */
  const handleApplyCoupon = async () => {
    setCouponError('');
    const codeUpper = couponCode.trim().toUpperCase();
    if (!codeUpper) { setCouponError('Please enter a coupon code'); return; }

    setCouponApplying(true);
    try {
      const response = await couponAPI.validate(codeUpper);
      const { discount_type, discount_value, message } = response.data;
      setDiscountType(discount_type);
      setAppliedDiscount(discount_value || 0);
      setIsCouponApplied(true);
      toast.success(message || 'Coupon applied! 🎉');
    } catch (err) {
      setCouponError(err.response?.data?.error || 'Invalid or expired coupon code');
      setAppliedDiscount(0);
      setIsCouponApplied(false);
    } finally {
      setCouponApplying(false);
    }
  };

  /* ─── Initiate Order Verification via Registered Email OTP (Both COD & Online) ─── */
  const handleInitiateOrderVerification = async () => {
    if (!validateStep1()) {
      setStep(1);
      toast.error('Please complete all required delivery details before proceeding');
      return;
    }

    const targetEmail = (form.email || user?.email || '').trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!targetEmail || !emailRegex.test(targetEmail)) {
      setStep(1);
      toast.error('A valid registered email address is required to receive order confirmation OTP.');
      return;
    }

    // If an OTP was already dispatched to this exact email within the active 60s window,
    // don't spam Supabase (avoiding 429 rate limits) - simply re-open the modal so the user can enter it
    if (lastOtpEmail === targetEmail && otpCountdown > 0) {
      setShowOtpModal(true);
      toast.info(`Verification code already sent to ${maskEmail(targetEmail)}. Please check your inbox.`);
      return;
    }

    // Pre-validate cart items against server to ensure all products exist and are available
    try {
      await orderAPI.calculateTotal({
        items: items.map(i => ({
          product_id: i.product?.id || i.product_id,
          quantity: i.quantity,
          size: i.size
        })),
        coupon_code: isCouponApplied ? couponCode : null
      });
    } catch (calcErr) {
      const errMsg = calcErr.response?.data?.error || calcErr.message || '';
      const productNotFoundMatch = errMsg.match(/Product not found:\s*([a-zA-Z0-9_-]+)/i);
      if (productNotFoundMatch) {
        const missingId = productNotFoundMatch[1];
        if (typeof removeByProductId === 'function') {
          removeByProductId(missingId);
        }
        toast.error('An item in your cart is no longer available and has been removed. Please review your cart.', {
          duration: 5000,
          id: 'cart-stale-item'
        });
        setStep(1);
        return;
      }
      if (calcErr.response?.status === 400 && errMsg) {
        toast.error(errMsg);
        return;
      }
    }

    setOtpSending(true);
    setOtpError('');
    try {
      // Dispatch 8-digit OTP to user's registered email using Supabase Auth (same as in Login/Signup)
      await sendOtp(targetEmail);
      setLastOtpEmail(targetEmail);
      setOtpValue(Array(OTP_LENGTH).fill(''));
      setOtpCountdown(60);
      setCanResendOtp(false);
      setShowOtpModal(true);
      toast.success(`Verification OTP dispatched to ${maskEmail(targetEmail)}! 📩`);
    } catch (err) {
      const errMsg = err.message || err.response?.data?.error || 'Failed to dispatch verification OTP. Please try again.';
      if (errMsg.toLowerCase().includes('rate') || errMsg.toLowerCase().includes('limit') || errMsg.toLowerCase().includes('too many')) {
        setLastOtpEmail(targetEmail);
        setShowOtpModal(true);
        toast.info(`An OTP was recently sent to ${maskEmail(targetEmail)}. Please check your inbox or wait for the timer to resend.`);
      } else {
        toast.error(errMsg);
      }
    } finally {
      setOtpSending(false);
    }
  };

  /* ─── Resend Registered Email OTP ─── */
  const handleResendOrderOtp = async () => {
    if (!canResendOtp || otpSending) return;
    const targetEmail = (form.email || user?.email || '').trim().toLowerCase();
    setOtpSending(true);
    setOtpError('');
    try {
      await sendOtp(targetEmail);
      setLastOtpEmail(targetEmail);
      setOtpValue(Array(OTP_LENGTH).fill(''));
      setOtpCountdown(60);
      setCanResendOtp(false);
      toast.success(`A fresh OTP code has been sent to ${maskEmail(targetEmail)}.`);
    } catch (err) {
      toast.error(err.message || 'Failed to resend OTP. Please wait and try again.');
    } finally {
      setOtpSending(false);
    }
  };

  /* ─── OTP Digit Handlers (Exact 8-digit UX matching Login) ─── */
  const handleOtpInputChange = (index, value) => {
    const clean = value.replace(/\D/g, '').slice(-1);
    const newOtp = [...otpValue];
    newOtp[index] = clean;
    setOtpValue(newOtp);
    if (otpError) setOtpError('');

    // Auto-focus next input
    if (clean && index < OTP_LENGTH - 1) {
      otpInputsRef.current[index + 1]?.focus();
    }

    // Auto-verify if all 8 digits filled
    const filledDigits = newOtp.filter(Boolean).join('');
    if (filledDigits.length === OTP_LENGTH && clean && !otpLoading) {
      handleVerifyAndConfirmOrder(filledDigits);
    }
  };

  const handleOtpInputKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otpValue[index] && index > 0) {
      otpInputsRef.current[index - 1]?.focus();
      const newOtp = [...otpValue];
      newOtp[index - 1] = '';
      setOtpValue(newOtp);
    }
  };

  const handleOtpInputPaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!pasted) return;
    const digits = pasted.split('');
    const newOtp = Array(OTP_LENGTH).fill('');
    digits.forEach((d, idx) => {
      if (idx < OTP_LENGTH) newOtp[idx] = d;
    });
    setOtpValue(newOtp);
    if (otpError) setOtpError('');
    const lastFilled = Math.min(digits.length, OTP_LENGTH - 1);
    otpInputsRef.current[lastFilled]?.focus();

    if (digits.length === OTP_LENGTH && !otpLoading) {
      handleVerifyAndConfirmOrder(digits.join(''));
    }
  };

  /* ─── Verify OTP & Execute Order Creation ─── */
  const handleVerifyAndConfirmOrder = async (codeToVerify) => {
    if (otpLoading) return;
    const code = (codeToVerify || otpValue.join('')).trim();
    if (!isValidOtp(code)) {
      setOtpError(`Please enter the complete ${OTP_LENGTH}-digit OTP verification code.`);
      return;
    }

    const targetEmail = (form.email || user?.email || '').trim().toLowerCase();
    setOtpLoading(true);
    setOtpError('');

    try {
      let verified = false;
      // 1. Verify with Supabase Email OTP (exact mechanism from Login & Signup pages)
      try {
        const verifyRes = await verifyOtp(targetEmail, code, false, false);
        if (verifyRes?.success) verified = true;
      } catch (authErr) {
        console.warn('Supabase verifyOtp notice:', authErr.message);
        // Fallback to backend verification if OTP was dispatched via backend
        const backendRes = await orderAPI.verifyOtp({ email: targetEmail, phone: form.phone, otp: code });
        if (backendRes.data?.verified || backendRes.data?.success) {
          verified = true;
        } else {
          throw authErr;
        }
      }
    } catch (err) {
      const errMsg = err.response?.data?.error || err.response?.data?.message || err.message || 'Invalid OTP code. Please check your email and try again.';
      setOtpError(errMsg);
      toast.error(errMsg);
      setOtpValue(Array(OTP_LENGTH).fill(''));
      otpInputsRef.current[0]?.focus();
      setOtpLoading(false);
      return;
    }

    setOtpCountdown(0);
    setShowOtpModal(false);
    toast.success('Email OTP verified successfully! 🎉');

    // 2. Execute Order Creation with OTP confirmation
    try {
      await executeOrderCreation(code);
    } catch (orderErr) {
      console.error('Order creation failed:', orderErr);
    } finally {
      setOtpLoading(false);
    }
  };

  /* ─── Execute Order Creation ─── */
  const executeOrderCreation = async (verifiedOtp) => {
    setLoading(true);
    try {
      let activeLat = liveLocation?.lat || (verifyResult?.lat ? parseFloat(verifyResult.lat) : null);
      let activeLng = liveLocation?.lng || (verifyResult?.lng ? parseFloat(verifyResult.lng) : null);
      let activeMapUrl = liveLocation?.mapUrl || (activeLat && activeLng ? `https://www.google.com/maps?q=${activeLat},${activeLng}` : null);

      if (!activeLat && navigator.geolocation) {
        try {
          const quickPos = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 4000,
              maximumAge: 60000
            });
          });
          if (quickPos?.coords) {
            activeLat = quickPos.coords.latitude;
            activeLng = quickPos.coords.longitude;
            activeMapUrl = `https://www.google.com/maps?q=${activeLat},${activeLng}`;
            setLiveLocation({
              lat: activeLat,
              lng: activeLng,
              mapUrl: activeMapUrl,
              accuracy: quickPos.coords.accuracy || null,
              source: 'gps'
            });
          }
        } catch (geoErr) {
          console.warn('Quick GPS capture during checkout skipped/unavailable:', geoErr);
        }
      }

      const addressTokens = [
        form.address.trim(),
        form.landmark.trim() ? `Landmark: ${form.landmark.trim()}` : '',
        form.city.trim(),
        form.state.trim(),
        `PIN: ${form.pinCode.trim()}`,
      ];

      if (activeMapUrl) {
        addressTokens.push(`📍 Live Location: ${activeMapUrl}`);
      }

      const fullAddress = addressTokens.filter(Boolean).join(', ');

      const orderData = {
        total_price: finalTotal,
        subtotal: totalPrice,
        delivery_fee: shipping,
        shipping_fee: shipping,
        discount_amount: discountAmount,
        coupon_code: isCouponApplied ? couponCode : null,
        shipping_address: fullAddress,
        live_location_url: activeMapUrl,
        latitude: activeLat || null,
        longitude: activeLng || null,
        phone: form.phone.replace(/\D/g, ''),
        payment_method: paymentMethod === 'cod' ? 'cod' : 'razorpay',
        payment_status: 'pending',
        shipping_name: form.fullName,
        shipping_email: (form.email || user?.email || '').trim().toLowerCase(),
        email: (form.email || user?.email || '').trim().toLowerCase(),
        shipping_city: form.city,
        shipping_state: form.state,
        shipping_pincode: form.pinCode,
        otp: verifiedOtp || null,
        email_otp_verified: true,
        items: items.map(i => ({
          product_id:    i.product?.id || i.product_id || i.id,
          quantity:      Math.max(1, parseInt(i.quantity, 10) || 1),
          price_at_time: Number(i.product?.price || i.price_at_time || i.price) || 0,
          size:          i.size || 'Standard',
        })).filter(i => Boolean(i.product_id)),
      };

      const res = await orderAPI.create(orderData);
      const createdOrder = res.data;

      setShowOtpModal(false);

      if (paymentMethod === 'cod') {
        toast.success('Order confirmed & placed successfully! 🎉');
        clearCart();
        
        setCodOrderSuccess({
          orderId: createdOrder.id,
          orderNumber: createdOrder.order_number,
          total: finalTotal
        });
      } else {
        clearCart();
        setShowLoadingPopup(true);
        setPopupText("Preparing secure payment gateway...");
        
        setTimeout(() => {
          setPopupText("Opening Razorpay Secure Checkout...");
          setTimeout(() => {
            setShowLoadingPopup(false);
            navigate(`/payment-gateway?orderId=${createdOrder.id}&method=razorpay`, {
              state: { razorpay: createdOrder.razorpay }
            });
          }, 500);
        }, 700);
      }
    } catch (err) {
      const errMsg = err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to place order. Please try again.';

      // Check if product is missing or no longer available in the database
      const productNotFoundMatch = errMsg.match(/Product not found:\s*([a-zA-Z0-9_-]+)/i);
      if (productNotFoundMatch) {
        const missingId = productNotFoundMatch[1];
        if (typeof removeByProductId === 'function') {
          removeByProductId(missingId);
        }
        toast.error('An item in your cart is no longer available and has been removed. Please review your cart.', {
          duration: 5000,
          id: 'cart-stale-item'
        });
        setShowOtpModal(false);
        setStep(1);
        return;
      }

      toast.error(errMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const inputCls = (field) =>
    `input-field transition-all ${errors[field] ? 'border-red-500 focus:border-red-500 focus:ring-red-500/30' : ''}`;

  /* ─── Order Summary ─── */
  const OrderSummary = () => (
    <div className="space-y-4">
      <div className="bg-dark-800 border border-dark-600 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-dark-600 flex items-center gap-2">
          <HiReceiptTax className="w-4 h-4 text-gold-400" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Order Summary</h3>
        </div>
        <div className="divide-y divide-dark-600 max-h-64 overflow-y-auto">
          {items.map((item) => (
            <div key={item.key} className="flex items-center gap-3 px-5 py-3">
              <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0 bg-dark-700 border border-dark-600">
                <img src={item.product.image_url} alt={item.product.name} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-semibold truncate">{item.product.name}</p>
                <p className="text-gray-400 text-xs mt-0.5">
                  Size: <span className="text-gold-400 font-medium">{item.size}</span>
                  {' · '}Qty: <span className="text-gold-400 font-medium">{item.quantity}</span>
                </p>
              </div>
              <p className="text-gold-400 font-bold text-sm shrink-0">
                ₹{(item.product.price * item.quantity).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
        <div className="px-5 py-4 space-y-2.5 border-t border-dark-600 bg-dark-900/30">
          <div className="flex justify-between text-sm text-gray-400">
            <span>Subtotal ({items.reduce((s, i) => s + i.quantity, 0)} items)</span>
            <span>₹{totalPrice.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm text-gray-400">
            <span>Shipping</span>
            <span className="text-emerald-400 font-semibold flex items-center gap-1">
              ✓ FREE (₹0)
            </span>
          </div>
          {appliedDiscount > 0 && discountType !== 'free_shipping' && (
            <div className="flex justify-between text-sm text-gold-400 font-medium">
              <span>Coupon Discount {discountType === 'percentage' ? `(${appliedDiscount}%)` : ''}</span>
              <span>–₹{discountAmount.toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between items-center pt-2.5 border-t border-dark-600">
            <span className="text-white font-bold">Total to Pay</span>
            <span className="text-2xl font-bold text-gold-400">₹{finalTotal.toLocaleString()}</span>
          </div>
        </div>
      </div>
      <div className="bg-dark-800/50 border border-dark-600 rounded-xl p-4 space-y-3">
        {[
          { icon: HiShieldCheck, label: '100% Secure Checkout', sub: 'Your data is encrypted & protected' },
          { icon: HiTruck,       label: '100% Free Express Delivery', sub: '₹0 delivery charge on all products across India' },
          { icon: HiCash,        label: 'Cash on Delivery', sub: 'Pay when your order arrives' },
        ].map(({ icon: Icon, label, sub }) => (
          <div key={label} className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-gold-500/10 border border-gold-500/20 flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4 text-gold-400" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">{label}</p>
              <p className="text-xs text-gray-500">{sub}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-dark-900">
      <div className="h-1 w-full bg-gradient-luxury" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">

        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-1">
            <HiLockClosed className="w-5 h-5 text-gold-400" />
            <span className="text-xs font-bold text-gold-400 uppercase tracking-widest">Secure Checkout</span>
          </div>
          <h1 className="text-4xl font-serif font-bold text-white">Complete Your Order</h1>
          <p className="text-gray-400 mt-1 text-sm">KalaStyle AI · Artisan Marketplace</p>
        </div>

        {/* Step Progress */}
        <div className="mb-10">
          <div className="flex items-center gap-0 max-w-md">
            {steps.map((s, idx) => {
              const num = idx + 1;
              const done = step > num;
              const active = step === num;
              return (
                <React.Fragment key={s.label}>
                  <div className="flex flex-col items-center gap-1.5">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border-2 transition-all duration-300 ${
                      done   ? 'bg-gold-500 border-gold-500 text-dark-900'
                      : active ? 'bg-gold-500/10 border-gold-500 text-gold-400'
                      : 'bg-dark-800 border-dark-500 text-gray-500'
                    }`}>
                      {done ? <HiCheckCircle className="w-5 h-5" /> : num}
                    </div>
                    <span className={`text-xs font-semibold whitespace-nowrap ${
                      active ? 'text-gold-400' : done ? 'text-green-400' : 'text-gray-500'
                    }`}>{s.label}</span>
                  </div>
                  {idx < steps.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-3 mb-5 rounded-full transition-all duration-500 ${
                      step > idx + 1 ? 'bg-gold-500' : 'bg-dark-600'
                    }`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-7">
            <AnimatePresence mode="wait">

              {/* ── STEP 1 ── */}
              {step === 1 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 30 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-6"
                >
                  {/* Personal Info - Shiprocket Delivery Requirements */}
                  <div className="bg-dark-800 border border-dark-600 rounded-2xl p-6 shadow-card">
                    <div className="flex items-center justify-between mb-5 pb-4 border-b border-dark-600 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gold-500/10 border border-gold-500/20 flex items-center justify-center">
                          <HiUser className="w-4 h-4 text-gold-400" />
                        </div>
                        <div>
                          <h2 className="text-base font-bold text-white">Personal Information</h2>
                          <p className="text-xs text-gray-400 mt-0.5">Required for Shiprocket courier label, invoice & live tracking</p>
                        </div>
                      </div>
                      <span className="text-[11px] font-semibold text-gold-400 bg-gold-500/10 border border-gold-500/20 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                        📦 Shiprocket Courier Data
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                          Full Name * <span className="text-gray-500 normal-case font-normal">(First & Last Name)</span>
                        </label>
                        <input type="text" className={inputCls('fullName')} placeholder="e.g. Rohan Kumar"
                          value={form.fullName} onChange={e => setField('fullName', e.target.value)} />
                        <FieldError msg={errors.fullName} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                          Email Address * <span className="text-gray-500 normal-case font-normal">(for tracking & invoice)</span>
                        </label>
                        <div className="relative">
                          <span className="absolute left-3.5 top-3.5 text-gray-500 pointer-events-none">
                            <HiMail className="w-4 h-4" />
                          </span>
                          <input type="email" className={`${inputCls('email')} pl-10`} placeholder="e.g. rohan@example.com"
                            value={form.email} onChange={e => setField('email', e.target.value)} />
                        </div>
                        <FieldError msg={errors.email} />
                      </div>
                    </div>
                  </div>

                  {/* Phone */}
                  <div className="bg-dark-800 border border-dark-600 rounded-2xl p-6 shadow-card">
                    <div className="flex items-center justify-between mb-5 pb-4 border-b border-dark-600 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gold-500/10 border border-gold-500/20 flex items-center justify-center">
                          <HiPhone className="w-4 h-4 text-gold-400" />
                        </div>
                        <div>
                          <h2 className="text-base font-bold text-white">Phone Number</h2>
                          <p className="text-xs text-gray-500 mt-0.5">Used for Order Confirmation OTP & courier delivery call</p>
                        </div>
                      </div>
                      <span className="text-[11px] font-semibold text-green-400 bg-green-500/10 border border-green-500/20 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                        <HiShieldCheck className="w-3.5 h-3.5" /> OTP Verification Ready
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">Mobile Number *</label>
                        <div className="relative">
                          <span className="absolute left-3 top-3 text-sm text-gray-400 font-medium pointer-events-none">+91</span>
                          <input type="tel" maxLength="10" className={`${inputCls('phone')} pl-11`} placeholder="9876543210"
                            value={form.phone} onChange={e => setField('phone', e.target.value.replace(/\D/g, ''))} />
                        </div>
                        <FieldError msg={errors.phone} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                          Confirm Phone * <span className="text-gold-400/70 normal-case font-normal">(re-enter)</span>
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-3 text-sm text-gray-400 font-medium pointer-events-none">+91</span>
                          <input type="tel" maxLength="10" className={`${inputCls('confirmPhone')} pl-11`} placeholder="Re-enter number"
                            value={form.confirmPhone} onChange={e => setField('confirmPhone', e.target.value.replace(/\D/g, ''))} />
                        </div>
                        {!errors.confirmPhone && form.confirmPhone && form.phone.replace(/\D/g,'') === form.confirmPhone.replace(/\D/g,'') && form.confirmPhone.length === 10 && (
                          <p className="flex items-center gap-1 text-green-400 text-xs mt-1.5">
                            <HiCheckCircle className="w-3.5 h-3.5" /> Numbers match ✓
                          </p>
                        )}
                        <FieldError msg={errors.confirmPhone} />
                      </div>
                    </div>
                  </div>

                  {/* ── Delivery Address with Location Detection ── */}
                  <div className="bg-dark-800 border border-dark-600 rounded-2xl p-6 shadow-card">
                    <div className="flex items-center justify-between mb-5 pb-4 border-b border-dark-600 flex-wrap gap-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gold-500/10 border border-gold-500/20 flex items-center justify-center">
                          <HiLocationMarker className="w-4 h-4 text-gold-400" />
                        </div>
                        <div>
                          <h2 className="text-base font-bold text-white">Delivery Address</h2>
                          <p className="text-xs text-gray-500 mt-0.5">Use GPS or type your address, then verify it</p>
                        </div>
                      </div>

                      {/* GPS button */}
                      <button
                        type="button"
                        onClick={handleUseMyLocation}
                        disabled={gpsLoading}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500/10 border border-blue-500/30 hover:border-blue-400 hover:bg-blue-500/20 text-blue-400 text-xs font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {gpsLoading ? (
                          <div className="w-3.5 h-3.5 border-2 border-blue-400/40 border-t-blue-400 rounded-full animate-spin" />
                        ) : (
                          <HiLocationMarker className="w-3.5 h-3.5" />
                        )}
                        {gpsLoading ? 'Detecting...' : '📍 Use My Location'}
                      </button>
                    </div>

                    {/* Live Location Active Pill */}
                    {liveLocation?.mapUrl && (
                      <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="relative flex h-2.5 w-2.5 shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                          </span>
                          <div className="truncate text-xs">
                            <span className="text-emerald-400 font-bold mr-1.5">Live Delivery Pin Attached:</span>
                            <span className="text-gray-300 font-mono">
                              {liveLocation.lat ? `${Number(liveLocation.lat).toFixed(5)}°, ${Number(liveLocation.lng).toFixed(5)}°` : 'Coordinates ready'}
                            </span>
                          </div>
                        </div>
                        <a
                          href={liveLocation.mapUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 shrink-0 bg-emerald-500/15 px-2.5 py-1 rounded-lg border border-emerald-500/30 hover:bg-emerald-500/25 transition-all"
                        >
                          <HiExternalLink className="w-3.5 h-3.5" /> Preview Map
                        </a>
                      </div>
                    )}

                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                          Full Address * <span className="text-gray-500 normal-case font-normal">(House No., Street, Area)</span>
                        </label>
                        <textarea
                          rows={3}
                          className={`${inputCls('address')} resize-none`}
                          placeholder="e.g. Flat 12B, Rose Apartments, MG Road"
                          value={form.address}
                          onChange={e => setField('address', e.target.value)}
                        />
                        <div className="flex justify-between items-center mt-1">
                          <FieldError msg={errors.address} />
                          <span className={`text-xs ml-auto ${form.address.length < 10 ? 'text-gray-600' : 'text-green-400'}`}>
                            {form.address.length} / 10+ chars
                          </span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                          Landmark <span className="text-gray-500 normal-case font-normal">(optional)</span>
                        </label>
                        <input type="text" className="input-field" placeholder="e.g. Near City Mall, Opposite Bus Stand"
                          value={form.landmark} onChange={e => setField('landmark', e.target.value)} />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">City *</label>
                          <input type="text" className={inputCls('city')} placeholder="Bangalore"
                            value={form.city} onChange={e => setField('city', e.target.value)} />
                          <FieldError msg={errors.city} />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">State *</label>
                          <input type="text" className={inputCls('state')} placeholder="Karnataka"
                            value={form.state} onChange={e => setField('state', e.target.value)} />
                          <FieldError msg={errors.state} />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">PIN Code *</label>
                        <input type="text" maxLength="6" className={inputCls('pinCode')} placeholder="560001"
                          value={form.pinCode} onChange={e => setField('pinCode', e.target.value.replace(/\D/g, ''))} />
                        <FieldError msg={errors.pinCode} />
                      </div>

                      {/* ── Verify Address button ── */}
                      <button
                        type="button"
                        onClick={handleVerifyAddress}
                        disabled={verifyLoading || gpsLoading}
                        className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                          addressVerified
                            ? 'border-green-500/50 bg-green-500/10 text-green-400 hover:bg-green-500/15'
                            : 'border-gold-500/40 bg-gold-500/5 text-gold-400 hover:bg-gold-500/10 hover:border-gold-500'
                        }`}
                      >
                        {verifyLoading ? (
                          <div className="w-4 h-4 border-2 border-gold-400/40 border-t-gold-400 rounded-full animate-spin" />
                        ) : addressVerified ? (
                          <HiCheckCircle className="w-4 h-4" />
                        ) : (
                          <HiMap className="w-4 h-4" />
                        )}
                        {verifyLoading ? 'Verifying address on map...' : addressVerified ? 'Address Verified ✅' : 'Verify My Address'}
                      </button>

                      {/* ── Verification Result Card ── */}
                      <AnimatePresence>
                        {verifyResult && (
                          <motion.div
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            className={`rounded-xl border p-4 ${
                              verifyResult.ok
                                ? 'bg-green-500/5 border-green-500/25'
                                : 'bg-red-500/5 border-red-500/25'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2 mb-3">
                              <div className="flex items-center gap-2">
                                {verifyResult.ok ? (
                                  <HiCheckCircle className="w-5 h-5 text-green-400 shrink-0" />
                                ) : (
                                  <HiX className="w-5 h-5 text-red-400 shrink-0" />
                                )}
                                <p className={`text-sm font-bold ${verifyResult.ok ? 'text-green-400' : 'text-red-400'}`}>
                                  {verifyResult.ok ? 'Address Confirmed on Map' : 'Address Not Found'}
                                </p>
                              </div>
                              <button onClick={() => { setVerifyResult(null); setAddressVerified(false); }}
                                className="text-gray-500 hover:text-white shrink-0">
                                <HiX className="w-4 h-4" />
                              </button>
                            </div>

                            {/* Detected address */}
                            <p className="text-xs text-gray-400 leading-relaxed mb-3">
                              <span className="text-gray-300 font-semibold">Detected location:</span>{' '}
                              {verifyResult.display}
                            </p>

                            {/* Detected vs entered comparison */}
                            {verifyResult.ok && (
                              <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                                {[
                                  { label: 'City',    detected: verifyResult.detectedCity,    entered: form.city },
                                  { label: 'State',   detected: verifyResult.detectedState,   entered: form.state },
                                  { label: 'Pincode', detected: verifyResult.detectedPincode, entered: form.pinCode },
                                ].map(({ label, detected, entered }) => {
                                  const match = detected && entered &&
                                    (detected.toLowerCase().includes(entered.toLowerCase()) ||
                                     entered.toLowerCase().includes(detected.toLowerCase()));
                                  return (
                                    <div key={label} className="bg-dark-800/70 rounded-lg p-2">
                                      <p className="text-gray-500 text-[10px] uppercase tracking-wide mb-1">{label}</p>
                                      <p className="text-white font-medium truncate">{detected || '—'}</p>
                                      {detected && entered && (
                                        <p className={`text-[10px] mt-0.5 ${match ? 'text-green-400' : 'text-yellow-400'}`}>
                                          {match ? '✓ Matches' : `You entered: ${entered}`}
                                        </p>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* Free Embedded Map */}
                            {verifyResult.lat && verifyResult.lng && (
                              <div className="mt-4 mb-4 rounded-xl overflow-hidden border border-dark-600 h-48 w-full bg-dark-900 relative">
                                <iframe
                                  title="Delivery Location Map"
                                  width="100%"
                                  height="100%"
                                  frameBorder="0"
                                  scrolling="no"
                                  marginHeight="0"
                                  marginWidth="0"
                                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(verifyResult.lng) - 0.005},${Number(verifyResult.lat) - 0.005},${Number(verifyResult.lng) + 0.005},${Number(verifyResult.lat) + 0.005}&layer=mapnik&marker=${verifyResult.lat},${verifyResult.lng}`}
                                  style={{ border: 0, filter: 'invert(90%) hue-rotate(180deg)' }}
                                />
                              </div>
                            )}

                            {/* Actions */}
                            <div className="flex items-center gap-3 flex-wrap">
                              {verifyResult.lat && verifyResult.lng && (
                                <a
                                  href={`https://www.openstreetmap.org/?mlat=${verifyResult.lat}&mlon=${verifyResult.lng}#map=16/${verifyResult.lat}/${verifyResult.lng}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1.5 text-xs font-semibold text-gold-400 hover:text-gold-300 border border-gold-500/30 hover:border-gold-500 px-3 py-1.5 rounded-lg bg-gold-500/5 transition-all"
                                >
                                  <HiMap className="w-3.5 h-3.5" /> View on OpenStreetMap
                                </a>
                              )}
                              {!verifyResult.ok && (
                                <button
                                  onClick={handleVerifyAddress}
                                  className="flex items-center gap-1.5 text-xs font-semibold text-gold-400 hover:text-gold-300 border border-gold-500/30 px-3 py-1.5 rounded-lg bg-gold-500/5 transition-all"
                                >
                                  <HiRefresh className="w-3.5 h-3.5" /> Try Again
                                </button>
                              )}
                              {!verifyResult.ok && (
                                <button
                                  onClick={() => { setAddressVerified(true); setVerifyResult(r => ({ ...r, ok: true })); toast('Address accepted manually ✓'); }}
                                  className="text-xs text-gray-500 hover:text-white underline transition-colors"
                                >
                                  My address is correct, proceed anyway
                                </button>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* Coupon */}
                  <div className="bg-dark-800 border border-dark-600 rounded-2xl p-6 shadow-card">
                    <div className="flex items-center gap-2 mb-4 pb-4 border-b border-dark-600">
                      <div className="w-8 h-8 rounded-full bg-gold-500/10 border border-gold-500/20 flex items-center justify-center">
                        <HiTag className="w-4 h-4 text-gold-400" />
                      </div>
                      <h2 className="text-base font-bold text-white">Have a Coupon?</h2>
                    </div>
                    <div className="flex gap-3">
                      <input type="text" className="input-field uppercase tracking-widest" placeholder="Enter coupon code (e.g. STYLE20)"
                        value={couponCode} onChange={e => { setCouponCode(e.target.value); setCouponError(''); }}
                        disabled={isCouponApplied} />
                      <button type="button" onClick={handleApplyCoupon}
                        disabled={couponApplying || isCouponApplied}
                        className="btn-outline px-5 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed">
                        {couponApplying ? 'Checking...' : isCouponApplied ? '✓ Applied' : 'Apply'}
                      </button>
                    </div>
                    {couponError && <p className="text-red-400 text-xs mt-2 flex items-center gap-1"><HiExclamationCircle className="w-3.5 h-3.5" />{couponError}</p>}
                    {isCouponApplied && (
                      <p className="text-gold-400 text-sm mt-2 font-medium flex items-center gap-1.5">
                        <HiCheckCircle className="w-4 h-4 text-green-400" />
                        Coupon applied:{' '}
                        {discountType === 'percentage' ? `${appliedDiscount}% OFF`
                          : discountType === 'fixed' ? `₹${appliedDiscount} OFF`
                          : 'FREE DELIVERY'}
                        <button onClick={() => { setAppliedDiscount(0); setIsCouponApplied(false); setCouponCode(''); }}
                          className="text-gray-500 hover:text-red-400 text-xs underline ml-2">Remove</button>
                      </p>
                    )}
                  </div>

                  {/* Next */}
                  <button type="button" onClick={handleNextStep}
                    className="w-full btn-primary text-lg py-4 flex items-center justify-center gap-2">
                    Review My Order <HiArrowRight className="w-5 h-5" />
                  </button>
                </motion.div>
              )}

              {/* ── STEP 2 ── */}
              {step === 2 && (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-6"
                >
                  <div className="bg-gold-500/5 border border-gold-500/30 rounded-2xl p-4 flex items-start gap-3">
                    <HiShieldCheck className="w-5 h-5 text-gold-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-gold-400">Please review your details carefully</p>
                      <p className="text-xs text-gray-400 mt-0.5">Incorrect details may cause failed deliveries. This is your final check before placing the order.</p>
                    </div>
                  </div>

                  {/* Delivery review */}
                  <div className="bg-dark-800 border border-dark-600 rounded-2xl overflow-hidden shadow-card">
                    <div className="flex justify-between items-center px-6 py-4 border-b border-dark-600">
                      <div className="flex items-center gap-2">
                        <HiLocationMarker className="w-4 h-4 text-gold-400" />
                        <h3 className="font-bold text-white text-sm">Delivery Information</h3>
                        {addressVerified && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-full">
                            <HiCheckCircle className="w-3 h-3" /> Verified
                          </span>
                        )}
                      </div>
                      <button type="button" onClick={() => setStep(1)}
                        className="text-xs text-gold-400 hover:text-gold-300 font-semibold border border-gold-500/30 hover:border-gold-500 px-3 py-1 rounded-lg transition-all">
                        ✏️ Edit Details
                      </button>
                    </div>
                    <div className="divide-y divide-dark-600/50">
                      {[
                        { label: 'Full Name',    value: form.fullName },
                        { label: 'Email',        value: form.email, badge: 'Shiprocket Live Tracking' },
                        { label: 'Mobile',       value: `+91 ${form.phone}` },
                        { label: 'Address',      value: form.address },
                        form.landmark && { label: 'Landmark', value: form.landmark },
                        { label: 'City',         value: form.city },
                        { label: 'State',        value: form.state },
                        { label: 'PIN Code',     value: form.pinCode },
                      ].filter(Boolean).map(({ label, value, badge }) => (
                        <div key={label} className="flex items-center gap-4 px-6 py-3">
                          <span className="text-xs text-gray-500 uppercase tracking-wider w-28 shrink-0">{label}</span>
                          <span className="text-sm text-white font-medium flex-1">{value}</span>
                          {badge && (
                            <span className="text-[10px] text-gold-400 bg-gold-500/10 border border-gold-500/20 px-2 py-0.5 rounded-full font-semibold">
                              {badge}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Map link on step 2 */}
                    {verifyResult?.mapUrl && (
                      <div className="px-6 pb-4">
                        <a href={verifyResult.mapUrl} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-xs font-semibold text-blue-400 hover:text-blue-300 border border-blue-500/30 hover:border-blue-400 px-3 py-1.5 rounded-lg bg-blue-500/5 transition-all">
                          <HiMap className="w-3.5 h-3.5" /> View Delivery Location on Map
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Payment method */}
                  <div className="bg-dark-800 border border-dark-600 rounded-2xl p-6 shadow-card">
                    <div className="flex items-center gap-2 mb-6 pb-4 border-b border-dark-600">
                      <HiShieldCheck className="w-5 h-5 text-gold-400" />
                      <h3 className="font-bold text-white text-base">Select Payment Method</h3>
                    </div>

                    <div className="space-y-4">
                      {/* Cash on Delivery option */}
                      <div className={`border rounded-xl transition-all ${
                        paymentMethod === 'cod' ? 'border-gold-500 bg-gold-500/10' : 'border-dark-600'
                      }`}>
                        <button type="button" onClick={() => setPaymentMethod('cod')}
                          className="flex items-center justify-between w-full p-4 text-left">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-dark-900 flex items-center justify-center text-gray-400">
                              <HiCash className="w-5 h-5 text-gold-400" />
                            </div>
                            <div>
                              <p className="font-bold text-sm text-white">Cash on Delivery (COD)</p>
                              <p className="text-gray-400 text-xs mt-0.5">Pay in cash upon doorstep delivery</p>
                            </div>
                          </div>
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            paymentMethod === 'cod' ? 'border-gold-500' : 'border-dark-500'
                          }`}>
                            {paymentMethod === 'cod' && <div className="w-2.5 h-2.5 rounded-full bg-gold-500" />}
                          </div>
                        </button>
                      </div>

                      {/* Razorpay Online / UPI Option */}
                      <div className={`border rounded-xl transition-all ${
                        paymentMethod === 'upi' ? 'border-gold-500 bg-gold-500/10' : 'border-dark-600'
                      }`}>
                        <button type="button" onClick={() => setPaymentMethod('upi')}
                          className="flex items-center justify-between w-full p-4 text-left cursor-pointer">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-dark-900 flex items-center justify-center text-gray-400">
                              <HiCreditCard className="w-5 h-5 text-gold-400" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-bold text-sm text-white">UPI / Online Payment</p>
                                <span className="bg-gold-500/20 text-gold-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-gold-500/30">
                                  Razorpay Secured
                                </span>
                              </div>
                              <p className="text-gray-400 text-xs mt-0.5">Pay via UPI (GPay, PhonePe, Paytm, QR), Cards, or NetBanking</p>
                            </div>
                          </div>
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            paymentMethod === 'upi' ? 'border-gold-500' : 'border-dark-500'
                          }`}>
                            {paymentMethod === 'upi' && <div className="w-2.5 h-2.5 rounded-full bg-gold-500" />}
                          </div>
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 px-4 py-3 bg-gold-500/10 border border-gold-500/30 rounded-xl flex items-start gap-2.5">
                      <HiShieldCheck className="w-5 h-5 text-gold-400 shrink-0 mt-0.5" />
                      <div className="text-xs text-gray-300 leading-relaxed">
                        <span className="font-bold text-gold-300 block mb-0.5">Registered Email OTP Confirmation Required:</span>
                        {paymentMethod === 'cod'
                          ? `For your security, an 8-digit confirmation OTP will be sent to your registered email (${maskEmail(form.email || user?.email)}) to confirm your Cash on Delivery (COD) order of ₹${finalTotal.toLocaleString()}.`
                          : `For your security, an 8-digit confirmation OTP will be sent to your registered email (${maskEmail(form.email || user?.email)}) to confirm your order of ₹${finalTotal.toLocaleString()} before completing online payment.`}
                      </div>
                    </div>
                  </div>

                  {/* Final amount */}
                  <div className="bg-dark-800 border border-gold-500/20 rounded-2xl p-6 shadow-gold shadow-gold/5">
                    <h3 className="font-serif font-bold text-white text-lg mb-4">Final Amount</h3>
                    <div className="space-y-2.5">
                      <div className="flex justify-between text-sm text-gray-400">
                        <span>Subtotal</span><span>₹{totalPrice.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm text-gray-400">
                        <span>Shipping</span>
                        <span className={shipping === 0 ? 'text-green-400' : ''}>{shipping === 0 ? 'FREE' : `₹${shipping}`}</span>
                      </div>
                      {appliedDiscount > 0 && discountType !== 'free_shipping' && (
                        <div className="flex justify-between text-sm text-gold-400 font-medium">
                          <span>Discount</span><span>–₹{discountAmount.toLocaleString()}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center pt-3 border-t border-dark-600 mt-2">
                        <span className="text-white font-bold text-base">Total to Pay</span>
                        <span className="text-3xl font-bold text-gold-400">₹{finalTotal.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-dark-800/50 border border-dark-600 rounded-xl p-4 text-xs text-gray-400 leading-relaxed">
                    <p>By placing this order, you confirm that the delivery details above are correct, and you agree to KalaStyle AI's return & refund policy. Orders with incorrect addresses will not be eligible for re-delivery at no charge.</p>
                  </div>

                  <div className="flex gap-4">
                    <button type="button" onClick={() => setStep(1)} className="btn-outline flex items-center gap-2 px-6 py-4">
                      <HiArrowLeft className="w-4 h-4" /> Go Back
                    </button>
                    <button type="button" onClick={handleInitiateOrderVerification} disabled={loading || otpSending}
                      className="flex-1 btn-primary text-lg py-4 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:scale-100">
                      {otpSending ? (
                        <><div className="w-5 h-5 border-2 border-dark-900/30 border-t-dark-900 rounded-full animate-spin" /> Dispatching OTP...</>
                      ) : (
                        <><HiKey className="w-5 h-5" /> Verify OTP & Confirm Order</>
                      )}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-5 lg:sticky lg:top-24">
            <OrderSummary />
          </div>
        </div>
      </div>

      {/* ── Order Confirmation OTP Modal (COD & Online) ── */}
      <AnimatePresence>
        {showOtpModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 20 }}
              className="bg-dark-800 border border-gold-500/40 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl shadow-black relative overflow-hidden"
            >
              {/* Decorative Top Gold Bar */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-gold-400 to-transparent" />

              {/* Close Button */}
              <button
                type="button"
                onClick={() => setShowOtpModal(false)}
                className="absolute top-5 right-5 text-gray-400 hover:text-white transition-colors"
              >
                <HiX className="w-5 h-5" />
              </button>

              {/* Modal Header */}
              <div className="text-center mb-6">
                <div className="w-16 h-16 rounded-2xl bg-gold-500/10 border border-gold-500/30 flex items-center justify-center mx-auto mb-3.5 shadow-lg shadow-gold-500/10">
                  <HiMail className="w-8 h-8 text-gold-400" />
                </div>
                <span className="text-xs uppercase tracking-widest text-gold-400 font-bold px-3 py-1 rounded-full bg-gold-500/10 border border-gold-500/20">
                  Email Security Verification
                </span>
                <h3 className="text-2xl font-serif font-bold text-white mt-2">
                  Enter {OTP_LENGTH}-Digit OTP
                </h3>
                <p className="text-xs sm:text-sm text-gray-300 mt-2 max-w-sm mx-auto leading-relaxed">
                  We have dispatched an {OTP_LENGTH}-digit confirmation code to your registered email{' '}
                  <strong className="text-gold-400">{maskEmail(form.email || user?.email)}</strong> to confirm your order of{' '}
                  <strong className="text-white">₹{finalTotal.toLocaleString()}</strong> ({paymentMethod === 'cod' ? 'Cash on Delivery' : 'Online Payment'}).
                </p>
              </div>

              {/* 8 Digit Segmented Input Boxes */}
              <div className="flex justify-center items-center gap-1 sm:gap-1.5 mb-4" onPaste={handleOtpInputPaste}>
                {otpValue.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => (otpInputsRef.current[index] = el)}
                    id={`order-otp-box-${index}`}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    value={digit}
                    aria-label={`Digit ${index + 1}`}
                    onChange={(e) => handleOtpInputChange(index, e.target.value)}
                    onKeyDown={(e) => handleOtpInputKeyDown(index, e)}
                    onPaste={handleOtpInputPaste}
                    className="w-8 sm:w-11 h-11 sm:h-13 text-center text-base sm:text-xl font-bold font-mono bg-dark-900 border-2 border-dark-600 focus:border-gold-500 focus:ring-2 focus:ring-gold-500/30 text-gold-400 rounded-xl transition-all shrink-0 p-0"
                  />
                ))}
              </div>

              {otpError && (
                <p className="text-center text-red-400 text-xs mb-3 flex items-center justify-center gap-1">
                  <HiExclamationCircle className="w-4 h-4 shrink-0" />
                  {otpError}
                </p>
              )}

              {/* Resend Timer matching Login page */}
              <div className="text-center text-xs text-gray-400 mb-6">
                {!canResendOtp && otpCountdown > 0 ? (
                  <span>
                    Didn't receive the code?{' '}
                    <span className="text-gold-400 font-mono font-medium">Resend OTP in {otpCountdown}s</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResendOrderOtp}
                    disabled={otpSending}
                    className="text-gold-400 hover:text-gold-300 font-semibold underline flex items-center gap-1 mx-auto cursor-pointer"
                  >
                    <HiRefresh className="w-3.5 h-3.5" /> Didn't receive the code? Resend OTP
                  </button>
                )}
              </div>

              {/* Action Buttons */}
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => handleVerifyAndConfirmOrder()}
                  disabled={otpLoading || otpValue.filter(Boolean).length !== OTP_LENGTH}
                  className="w-full btn-primary py-3.5 text-base font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg cursor-pointer"
                >
                  {otpLoading ? (
                    <><div className="w-5 h-5 border-2 border-dark-900/30 border-t-dark-900 rounded-full animate-spin" /> Verifying & Placing Order...</>
                  ) : (
                    <><HiShieldCheck className="w-5 h-5" /> Verify OTP & Confirm Order</>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowOtpModal(false)}
                  className="w-full py-2.5 text-xs text-gray-400 hover:text-white transition-colors cursor-pointer"
                >
                  Cancel / Edit Delivery Details
                </button>
              </div>

              {/* Shiprocket Delivery Guarantee footer */}
              <div className="mt-5 pt-4 border-t border-dark-700/60 flex items-center justify-center gap-2 text-[11px] text-gray-400 text-center">
                <HiTruck className="w-4 h-4 text-emerald-400" />
                <span>Automated Shiprocket courier dispatch upon OTP confirmation</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading Popup */}
      <AnimatePresence>
        {showLoadingPopup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-dark-800 border border-dark-600 rounded-3xl p-8 max-w-sm w-full mx-4 shadow-gold shadow-gold/10 text-center space-y-6"
            >
              <div className="flex justify-center">
                <div className="relative w-20 h-20">
                  {/* Rotating Outer Ring */}
                  <div className="absolute inset-0 rounded-full border-4 border-dark-900 border-t-gold-500 animate-spin" />
                  {/* Secure Shield Icon */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <HiShieldCheck className="w-10 h-10 text-gold-400 animate-pulse" />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-white">Processing Payment</h3>
                <p className="text-sm text-gray-400 font-medium h-12 flex items-center justify-center">{popupText}</p>
              </div>
              <div className="w-full bg-dark-900 h-1.5 rounded-full overflow-hidden border border-dark-600">
                <motion.div
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 3, ease: "easeInOut" }}
                  className="h-full bg-gradient-luxury"
                />
              </div>
              <p className="text-[10px] text-gray-500">Do not refresh or go back. Transacting securely.</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* COD Order Success Modal with WhatsApp Action */}
      <AnimatePresence>
        {codOrderSuccess && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-dark-800 border border-gold-500/30 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl shadow-gold/10 text-center space-y-6"
            >
              <div className="w-16 h-16 bg-green-500/10 border border-green-500/30 rounded-full flex items-center justify-center mx-auto text-green-400">
                <HiCheckCircle className="w-10 h-10" />
              </div>

              <div className="space-y-2">
                <h2 className="text-2xl font-serif font-bold text-white">Order Placed Successfully!</h2>
                <p className="text-xs text-gold-400 font-semibold uppercase tracking-wider bg-gold-500/10 border border-gold-500/20 py-1 px-3 rounded-full inline-block">
                  Cash on Delivery (COD)
                </p>
                <p className="text-xs text-gray-400 pt-1">
                  Order ID: <span className="text-white font-mono font-bold">#{codOrderSuccess.orderId?.substring(0, 8)}</span> • Total: <span className="text-gold-400 font-bold">₹{codOrderSuccess.total?.toLocaleString()}</span>
                </p>
              </div>

              <div className="bg-dark-900 border border-dark-600 rounded-2xl p-5 text-left space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                  <HiCheckCircle className="w-4 h-4" />
                  <span>Order Confirmed & Sent to Artisans</span>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Your order has been safely placed. You can track preparation, artisan dispatch, and live location in real time.
                </p>
                <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
                  <button
                    onClick={() => {
                      const oId = codOrderSuccess.orderId;
                      setCodOrderSuccess(null);
                      navigate(`/orders/${oId}/tracking`);
                    }}
                    className="flex-1 py-3 px-4 bg-gradient-to-r from-gold-500 to-gold-600 hover:from-gold-400 hover:to-gold-500 text-dark-900 font-bold text-xs rounded-xl shadow-gold transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <HiTruck className="w-4 h-4" /> Track Order
                  </button>
                  <button
                    onClick={() => {
                      setCodOrderSuccess(null);
                      navigate('/orders');
                    }}
                    className="flex-1 py-3 px-4 bg-dark-750 hover:bg-dark-700 text-white font-semibold text-xs rounded-xl border border-dark-600 transition-all cursor-pointer"
                  >
                    View All Orders
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
