import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { FcGoogle } from 'react-icons/fc';
import { HiEye, HiEyeOff } from 'react-icons/hi';
import { useAuth } from '../context/AuthContext';
import { OTP_LENGTH, isValidOtp } from '../utils/authHelper';
import GlassyOtpCard from '../components/GlassyOtpCard';
import toast from 'react-hot-toast';

export default function Signup() {
  const [step, setStep] = useState('details'); // 'details' | 'otp'
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const isArtisanInit = searchParams.get('role') === 'artisan' ||
                        searchParams.get('portal') === 'artisan' ||
                        searchParams.get('from')?.startsWith('/artisan');
  const [role, setRole] = useState(() => isArtisanInit ? 'artisan' : 'user');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [storeName, setStoreName] = useState('');
  const [artisanType, setArtisanType] = useState('Weaver');

  // Google OAuth flow state
  const [googleLoading, setGoogleLoading] = useState(false);

  // OTP state (Strict canonical 8-digit OTP)
  const [otp, setOtp] = useState(Array(OTP_LENGTH).fill(''));
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isOtpSuccess, setIsOtpSuccess] = useState(false);
  const [otpError, setOtpError] = useState('');

  const { signup, cancelSignup, sendOtp, verifyOtp, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const otpInputsRef = useRef([]);

  // Auto-focus first input when entering OTP step
  useEffect(() => {
    if (step === 'otp' && otpInputsRef.current[0]) {
      setTimeout(() => {
        otpInputsRef.current[0]?.focus();
      }, 100);
    }
  }, [step]);

  // Clean up signup flag on unmount
  useEffect(() => {
    return () => {
      if (cancelSignup) cancelSignup();
    };
  }, [cancelSignup]);

  // Resend cooldown timer (aligned with Supabase 60s rate limit)
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // Mask email helper for privacy
  const maskEmail = (str) => {
    if (!str || !str.includes('@')) return str;
    const [name, domain] = str.split('@');
    if (name.length <= 2) return `${name[0]}***@${domain}`;
    return `${name[0]}***@${domain}`;
  };

  // ─── Google OAuth Quick Sign-Up ──────────────────────────────
  const handleGoogleSignUp = async () => {
    if (googleLoading) return;
    setGoogleLoading(true);
    try {
      sessionStorage.setItem('auth_flow', 'signup');
      localStorage.setItem('auth_flow', 'signup');
      sessionStorage.setItem('auth_is_signup', 'true');
      localStorage.setItem('auth_is_signup', 'true');
      const authIntent = role === 'artisan' ? 'artisan' : 'user';
      const returnUrl = role === 'artisan' ? '/artisan' : '/';
      await signInWithGoogle(returnUrl, { authIntent });
    } catch (err) {
      toast.error(err.message || 'Unable to sign in with Google. Please try again.');
      setGoogleLoading(false);
    }
  };

  // ─── Direct Registration (Ensures instant database storage) ─
  const handleDirectRegistration = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (loading) return;

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
      toast.error('Password must be at least 6 characters long');
      return;
    }

    if (!/[a-zA-Z]/.test(password)) {
      toast.error('Password must contain at least one letter (a-z or A-Z)');
      return;
    }

    if (!/\d/.test(password)) {
      toast.error('Password must contain at least one number (0-9)');
      return;
    }

    if (role === 'artisan' && !storeName.trim()) {
      toast.error('Please enter your store or workshop name');
      return;
    }

    setLoading(true);
    try {
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
          ? '🎨 Artisan account created! Welcome to KalaStyle Studio!'
          : `✨ Account created! Welcome to KalaStyle AI, ${name}!`
      );

      setTimeout(() => {
        navigate(role === 'artisan' ? '/artisan' : '/');
      }, 1000);
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message || 'Failed to create account';
      toast.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  // ─── Step 1: Validate Details & Register / Send Verification OTP ─────────
  const handleInitiateSignup = async (e) => {
    e.preventDefault();
    if (loading) return;
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
      toast.error('Password must be at least 6 characters long');
      return;
    }

    if (!/[a-zA-Z]/.test(password)) {
      toast.error('Password must contain at least one letter (a-z or A-Z)');
      return;
    }

    if (!/\d/.test(password)) {
      toast.error('Password must contain at least one number (0-9)');
      return;
    }

    if (role === 'artisan' && !storeName.trim()) {
      toast.error('Please enter your store or workshop name');
      return;
    }

    setLoading(true);
    try {
      // Send OTP to the provided email address via Supabase Auth / SMTP proxy (isSignup: true)
      await sendOtp(cleanEmail, true);
      setStep('otp');
      setCountdown(60);
      setOtp(Array(OTP_LENGTH).fill(''));
      toast.success('Verification OTP sent to your email! 📩');
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message || 'Failed to send verification OTP';
      toast.error(errMsg);
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
      await sendOtp(email.trim().toLowerCase(), true);
      setCountdown(60);
      setOtp(Array(OTP_LENGTH).fill(''));
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
    if (loading) return;
    const code = (codeToVerify || otp.join('')).trim();
    if (!isValidOtp(code)) {
      setOtpError(`Please enter your ${OTP_LENGTH}-digit OTP verification code.`);
      return;
    }

    setOtpError('');
    setLoading(true);

    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.replace(/\D/g, '');

    try {
      // 1. Verify OTP with Supabase Auth (syncSession = false so signup creates the full profile)
      const verifyRes = await verifyOtp(cleanEmail, code, false, true);
      const sbUid = verifyRes?.data?.user?.id;
      setCountdown(0);

      // 2. Complete registration in database with role, password & linked supabase_uid
      await signup(
        name.trim(),
        cleanPhone,
        password,
        role,
        storeName.trim() || name.trim(),
        artisanType,
        cleanEmail,
        sbUid
      );

      setIsOtpSuccess(true);
      toast.success(
        role === 'artisan'
          ? '🎨 Artisan account verified and created! Welcome to KalaStyle Studio!'
          : `✨ Account verified! Welcome to KalaStyle AI, ${name}!`
      );

      setTimeout(() => {
        navigate(role === 'artisan' ? '/artisan' : '/');
      }, 1600);
    } catch (err) {
      setIsOtpSuccess(false);
      const errMsg = err.response?.data?.error || err.message || 'Verification failed. Please check the code.';
      setOtpError(errMsg);
      toast.error(errMsg);
      // Clear OTP fields on error
      setOtp(Array(OTP_LENGTH).fill(''));
      otpInputsRef.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  // ─── OTP Input UX Handlers (Exact 8-digit UX with auto-verify) ──
  const handleOtpChange = (index, value) => {
    const cleanDigit = value.replace(/\D/g, '');
    if (!cleanDigit && value !== '') return;

    const newOtp = [...otp];
    newOtp[index] = cleanDigit.slice(-1);
    setOtp(newOtp);

    if (cleanDigit && index < OTP_LENGTH - 1) {
      otpInputsRef.current[index + 1]?.focus();
    }

    // Auto-verify when all 8 boxes are filled
    const filledDigits = newOtp.filter(Boolean).join('');
    if (filledDigits.length === OTP_LENGTH && cleanDigit && !loading) {
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
    } else if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      otpInputsRef.current[index + 1]?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').trim();
    const numericChars = pastedData.replace(/\D/g, '').slice(0, OTP_LENGTH);

    if (!numericChars) return;

    const newOtp = Array(OTP_LENGTH).fill('');
    for (let i = 0; i < numericChars.length; i++) {
      newOtp[i] = numericChars[i];
    }
    setOtp(newOtp);

    if (numericChars.length === OTP_LENGTH && !loading) {
      handleCompleteRegistration(numericChars);
    } else {
      const nextEmptyIndex = newOtp.findIndex((digit) => digit === '');
      if (nextEmptyIndex !== -1) {
        otpInputsRef.current[nextEmptyIndex]?.focus();
      } else {
        otpInputsRef.current[OTP_LENGTH - 1]?.focus();
      }
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12 px-3 sm:px-6 lg:px-8">
      <div className={`w-full space-y-6 card border border-dark-500 shadow-2xl transition-all duration-300 ${
        step === 'otp'
          ? 'max-w-lg p-4 sm:p-8'
          : 'max-w-md p-5 sm:p-10'
      }`}>
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
                We sent an {OTP_LENGTH}-digit code to{' '}
                <span className="text-gold-400 font-semibold">{maskEmail(email)}</span>
              </span>
            ) : (
              <span>
                Create your verified <span className="gold-text font-medium">KalaStyle AI</span> account
              </span>
            )}
          </p>
        </div>

        {/* ─── Role Toggle: Customer vs Artisan ──────────────── */}
        {step === 'details' && (
          <div className="space-y-4">
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

            {/* Google OAuth Quick Registration */}
            <button
              type="button"
              onClick={handleGoogleSignUp}
              disabled={googleLoading}
              className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl border border-dark-400 bg-dark-800 hover:bg-dark-700/80 text-white font-medium text-sm transition-all duration-200 shadow-md hover:border-gold-500/50 hover:shadow-gold focus:outline-none focus:ring-2 focus:ring-gold-500/40 disabled:opacity-60 disabled:cursor-not-allowed group cursor-pointer"
            >
              {googleLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-gold-400 font-semibold">Connecting to Google...</span>
                </>
              ) : (
                <>
                  <FcGoogle className="w-5 h-5 text-xl shrink-0 group-hover:scale-105 transition-transform" />
                  <span>
                    {role === 'artisan' ? 'Continue with Google (Artisan)' : 'Continue with Google'}
                  </span>
                </>
              )}
            </button>

            {/* Divider */}
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-dark-500/80" />
              </div>
              <div className="relative flex justify-center text-xs uppercase tracking-wider">
                <span className="bg-dark-800 px-3 text-gray-400 font-medium">Or register with email OTP</span>
              </div>
            </div>
          </div>
        )}

        {/* ─── STEP 1: REGISTRATION DETAILS FORM ──────────────── */}
        {step === 'details' && (
          <form className="space-y-4" onSubmit={handleInitiateSignup}>

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
                <div className="relative">
                  <input
                    id="signup-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    className="input-field pr-10"
                    placeholder="Min 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-white"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <HiEyeOff className="w-5 h-5" /> : <HiEye className="w-5 h-5" />}
                  </button>
                </div>
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
          <>
            <GlassyOtpCard
              otp={otp}
              setOtp={setOtp}
              length={OTP_LENGTH}
              email={maskEmail(email)}
              countdown={countdown}
              isLoading={loading}
              isSuccess={isOtpSuccess}
              error={otpError}
              onVerify={handleCompleteRegistration}
              onResend={handleResendOtp}
              onChangeEmail={() => {
                if (cancelSignup) cancelSignup();
                setStep('details');
                setOtpError('');
                setIsOtpSuccess(false);
              }}
              changeEmailLabel="← Edit Registration Details"
              submitLabel="Verify & Open Account"
              onChange={handleOtpChange}
              onKeyDown={handleOtpKeyDown}
              onPaste={handleOtpPaste}
              otpInputsRef={otpInputsRef}
            />
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={handleDirectRegistration}
                disabled={loading}
                className="text-xs text-gold-400 hover:text-gold-300 underline font-medium cursor-pointer"
              >
                Having trouble receiving the code? Click here to complete registration directly →
              </button>
            </div>
          </>
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
