import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function Signup() {
  const [step, setStep] = useState('details'); // 'details' | 'otp'
  const [role, setRole] = useState('user');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [storeName, setStoreName] = useState('');
  const [artisanType, setArtisanType] = useState('Weaver');

  // OTP state (Dual 8-digit default and 6-digit support from Supabase)
  const [otpLength, setOtpLength] = useState(8);
  const [otp, setOtp] = useState(['', '', '', '', '', '', '', '']);
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [otpError, setOtpError] = useState('');

  const { signup, sendOtp, verifyOtp } = useAuth();
  const navigate = useNavigate();
  const otpInputsRef = useRef([]);

  // Switch between 8-digit and 6-digit OTP mode
  const handleSwitchOtpLength = (newLength) => {
    setOtpLength(newLength);
    setOtp(Array(newLength).fill(''));
    setOtpError('');
    setTimeout(() => {
      otpInputsRef.current[0]?.focus();
    }, 50);
  };

  // Auto-focus first input when entering OTP step
  useEffect(() => {
    if (step === 'otp' && otpInputsRef.current[0]) {
      setTimeout(() => {
        otpInputsRef.current[0]?.focus();
      }, 100);
    }
  }, [step, otpLength]);

  // Resend cooldown timer
  useEffect(() => {
    let timer;
    if (countdown > 0) {
      timer = setInterval(() => {
        setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [countdown]);

  // Mask email helper for privacy
  const maskEmail = (str) => {
    if (!str || !str.includes('@')) return str;
    const [name, domain] = str.split('@');
    if (name.length <= 2) return `${name[0]}***@${domain}`;
    return `${name[0]}***@${domain}`;
  };

  // ─── Step 1: Validate Details & Send Verification OTP ─────────
  const handleInitiateSignup = async (e) => {
    e.preventDefault();
    setOtpError('');

    if (!name.trim()) {
      toast.error('Please enter your full name');
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      toast.error('Please enter a valid email address');
      return;
    }

    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      toast.error('Please enter a valid 10-digit phone number');
      return;
    }

    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    if (role === 'artisan' && !storeName.trim()) {
      toast.error('Please enter your store or workshop name');
      return;
    }

    setLoading(true);
    try {
      // Send OTP to the provided email address via Supabase Auth
      await sendOtp(cleanEmail);
      setStep('otp');
      setCountdown(30);
      setOtp(Array(otpLength).fill(''));
      toast.success('Verification OTP sent to your email! 📩');
    } catch (err) {
      toast.error(err.message || 'Failed to send verification OTP');
    } finally {
      setLoading(false);
    }
  };

  // ─── Resend OTP ───────────────────────────────────────────────
  const handleResendOtp = async () => {
    if (countdown > 0 || loading) return;
    setOtpError('');
    setLoading(true);

    try {
      await sendOtp(email.trim().toLowerCase());
      setCountdown(30);
      setOtp(Array(otpLength).fill(''));
      toast.success('A fresh OTP code has been sent to your email.');
    } catch (err) {
      setOtpError(err.message);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ─── Step 2: Verify OTP & Create the User/Artisan Account ──────
  const handleCompleteRegistration = async (codeToVerify) => {
    const code = (codeToVerify || otp.join('')).trim();
    if (code.length !== 6 && code.length !== 8) {
      setOtpError(`Please enter your ${otpLength}-digit OTP verification code.`);
      return;
    }

    setOtpError('');
    setLoading(true);

    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.replace(/\D/g, '');

    try {
      // 1. Verify OTP with Supabase Auth (syncSession = false so signup creates the full profile)
      await verifyOtp(cleanEmail, code, false);

      // 2. Complete registration in database with role & password
      await signup(
        name.trim(),
        cleanPhone,
        password,
        role,
        storeName.trim() || name.trim(),
        artisanType,
        cleanEmail
      );

      toast.success(
        role === 'artisan'
          ? '🎨 Artisan account verified and created! Welcome to KalaStyle Studio!'
          : `✨ Account verified! Welcome to KalaStyle AI, ${name}!`
      );

      navigate(role === 'artisan' ? '/artisan' : '/');
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message || 'Verification failed. Please check the code.';
      setOtpError(errMsg);
      toast.error(errMsg);
      // Clear OTP fields on error
      setOtp(Array(otpLength).fill(''));
      otpInputsRef.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  // ─── OTP Input UX Handlers (Dual 8/6-digit UX with auto-verify) ─
  const handleOtpChange = (index, value) => {
    const cleanDigit = value.replace(/\D/g, '');
    if (!cleanDigit && value !== '') return;

    const newOtp = [...otp];
    newOtp[index] = cleanDigit.slice(-1);
    setOtp(newOtp);

    if (cleanDigit && index < otpLength - 1) {
      otpInputsRef.current[index + 1]?.focus();
    }

    // Auto-verify when all boxes of current length are filled
    const filledDigits = newOtp.filter(Boolean).join('');
    if (filledDigits.length === otpLength && cleanDigit) {
      handleCompleteRegistration(filledDigits);
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      if (!otp[index] && index > 0) {
        otpInputsRef.current[index - 1]?.focus();
      } else {
        const newOtp = [...otp];
        newOtp[index] = '';
        setOtp(newOtp);
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      otpInputsRef.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < otpLength - 1) {
      otpInputsRef.current[index + 1]?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').trim();
    const numericChars = pastedData.replace(/\D/g, '');

    if (!numericChars) return;

    // Detect if pasted data is 6 or 8 digits and adjust mode dynamically
    const targetLength = numericChars.length >= 8 ? 8 : (numericChars.length === 6 ? 6 : otpLength);
    if (targetLength !== otpLength) {
      setOtpLength(targetLength);
    }

    const codeDigits = numericChars.slice(0, targetLength);
    const newOtp = Array(targetLength).fill('');
    for (let i = 0; i < codeDigits.length; i++) {
      newOtp[i] = codeDigits[i];
    }
    setOtp(newOtp);

    if (codeDigits.length === targetLength) {
      handleCompleteRegistration(codeDigits);
    } else {
      const nextEmptyIndex = newOtp.findIndex((digit) => digit === '');
      if (nextEmptyIndex !== -1) {
        otpInputsRef.current[nextEmptyIndex]?.focus();
      } else {
        otpInputsRef.current[targetLength - 1]?.focus();
      }
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-6 card p-8 sm:p-10 border border-dark-500 shadow-2xl">
        {/* Brand Header */}
        <div>
          <div className="flex justify-center mb-4">
            <img
              src="/images/kalastyle_logo.png"
              alt="KalaStyle AI"
              className="h-16 w-16 object-cover rounded-full ring-2 ring-gold-500/80 shadow-gold"
            />
          </div>
          <h2 className="text-center text-3xl font-serif font-bold text-white">
            {step === 'otp' ? 'Verify Your Email' : 'Join KalaStyle AI'}
          </h2>
          <p className="mt-2 text-center text-sm text-gray-400">
            {step === 'otp' ? (
              <span>
                We sent a verification code to{' '}
                <span className="text-gold-400 font-semibold">{maskEmail(email)}</span>
              </span>
            ) : (
              <span>
                Create your verified <span className="gold-text font-medium">KalaStyle AI</span> account
              </span>
            )}
          </p>
        </div>

        {/* ─── STEP 1: REGISTRATION DETAILS FORM ──────────────── */}
        {step === 'details' && (
          <form className="space-y-4" onSubmit={handleInitiateSignup}>
            {/* Role Toggle: Customer vs Artisan */}
            <div className="flex rounded-lg overflow-hidden border border-dark-500 bg-dark-800 p-1">
              <button
                type="button"
                onClick={() => setRole('user')}
                className={`flex-1 py-2 text-xs sm:text-sm font-medium rounded-md transition-all ${
                  role === 'user'
                    ? 'bg-gradient-luxury text-dark-900 font-bold shadow-md'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                🛍️ I'm a Customer
              </button>
              <button
                type="button"
                onClick={() => setRole('artisan')}
                className={`flex-1 py-2 text-xs sm:text-sm font-medium rounded-md transition-all ${
                  role === 'artisan'
                    ? 'bg-gradient-luxury text-dark-900 font-bold shadow-md'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                🎨 I'm an Artisan
              </button>
            </div>

            {role === 'artisan' && (
              <div className="bg-gold-500/10 border border-gold-500/20 rounded-lg p-3 text-xs text-gold-400">
                🌟 <strong>Artisan Benefits:</strong> AI Product Studio, direct craft listing, and access to customers across India!
              </div>
            )}

            <div className="space-y-3.5 pt-1">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Full Name</label>
                <input
                  id="signup-name"
                  name="name"
                  type="text"
                  required
                  className="input-field"
                  placeholder="e.g. Ramesh Kumar"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Email Address (OTP will be sent here)</label>
                <input
                  id="signup-email"
                  name="email"
                  type="email"
                  required
                  className="input-field"
                  placeholder="e.g. ramesh@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Phone Number (10 digits)</label>
                <input
                  id="signup-phone"
                  name="phone"
                  type="tel"
                  maxLength="10"
                  required
                  className="input-field"
                  placeholder="9876543210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Password (for future logins)</label>
                <input
                  id="signup-password"
                  name="password"
                  type="password"
                  required
                  className="input-field"
                  placeholder="Min 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {role === 'artisan' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-300 mb-1">Store / Brand Name</label>
                    <input
                      id="store-name"
                      name="store_name"
                      type="text"
                      required
                      className="input-field"
                      placeholder="e.g. Lakshmi Handlooms"
                      value={storeName}
                      onChange={(e) => setStoreName(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-300 mb-1">Artisan Craft Type</label>
                    <select
                      id="artisan-type"
                      value={artisanType}
                      onChange={(e) => setArtisanType(e.target.value)}
                      className="input-field"
                    >
                      <option value="Weaver">Weaver / Handloom</option>
                      <option value="Tailor">Tailor / Clothing Maker</option>
                      <option value="Jewelry Maker">Jewelry Maker</option>
                      <option value="Embroidery Artist">Embroidery Artist</option>
                      <option value="Bag Maker">Bag Maker</option>
                      <option value="General">General Artisan</option>
                    </select>
                  </div>
                </>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary flex items-center justify-center gap-2 mt-4"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-dark-900 border-t-transparent rounded-full animate-spin" />
                  <span>Sending Verification OTP...</span>
                </>
              ) : (
                <span>Send Verification OTP →</span>
              )}
            </button>
          </form>
        )}

        {/* ─── STEP 2: OTP VERIFICATION STEP ─────────────────── */}
        {step === 'otp' && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs font-semibold text-gray-300 tracking-wider uppercase">
                  Enter {otpLength}-digit code
                </label>
                <div className="inline-flex bg-dark-800 p-0.5 rounded-lg border border-dark-500 text-xs">
                  <button
                    type="button"
                    onClick={() => handleSwitchOtpLength(8)}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                      otpLength === 8
                        ? 'bg-gradient-luxury text-dark-900 shadow-sm font-bold'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    8 Digits
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSwitchOtpLength(6)}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                      otpLength === 6
                        ? 'bg-gradient-luxury text-dark-900 shadow-sm font-bold'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    6 Digits
                  </button>
                </div>
              </div>

              {/* Individual Numeric Boxes */}
              <div
                className={`flex justify-center ${otpLength === 8 ? 'gap-1 sm:gap-1.5' : 'gap-1.5 sm:gap-2'}`}
                onPaste={handleOtpPaste}
              >
                {otp.map((digit, index) => (
                  <input
                    key={`${otpLength}-${index}`}
                    ref={(el) => (otpInputsRef.current[index] = el)}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    value={digit}
                    aria-label={`Digit ${index + 1}`}
                    onChange={(e) => handleOtpChange(index, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(index, e)}
                    className={`${
                      otpLength === 8
                        ? 'w-7 h-11 sm:w-10 sm:h-12 text-center text-base sm:text-xl'
                        : 'w-9 h-12 sm:w-12 sm:h-14 text-center text-lg sm:text-2xl'
                    } font-bold font-mono bg-dark-800 border border-dark-400 rounded-lg text-gold-400 focus:outline-none focus:border-gold-500 focus:ring-2 focus:ring-gold-500/50 transition-all`}
                  />
                ))}
              </div>

              {otpError && (
                <p className="mt-3 text-xs text-red-400 font-medium text-center">
                  ⚠️ {otpError}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => handleCompleteRegistration()}
              disabled={loading || (otp.filter(Boolean).length !== 6 && otp.filter(Boolean).length !== 8)}
              className="w-full btn-primary flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-dark-900 border-t-transparent rounded-full animate-spin" />
                  <span>Verifying & Creating Account...</span>
                </>
              ) : (
                <span>Verify & Open Account</span>
              )}
            </button>

            {/* Resend Cooldown & Edit Info */}
            <div className="flex flex-col items-center gap-2 pt-1 text-sm">
              <div className="text-gray-400 text-xs">
                {countdown > 0 ? (
                  <span>
                    Didn't receive the code?{' '}
                    <span className="text-gold-400 font-medium">Resend OTP in {countdown}s</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={loading}
                    className="text-gold-400 hover:text-gold-300 font-medium hover:underline cursor-pointer"
                  >
                    Didn't receive the code? Resend OTP
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  setStep('details');
                  setOtpError('');
                }}
                className="text-xs text-gray-500 hover:text-gray-300 hover:underline cursor-pointer pt-1"
              >
                ← Edit Registration Details
              </button>
            </div>
          </div>
        )}

        {/* Footer Navigation */}
        <div className="text-center text-sm text-gray-400 pt-2 border-t border-dark-600/50">
          Already have an account?{' '}
          <Link to="/login" className="text-gold-400 hover:text-gold-300 font-medium">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
