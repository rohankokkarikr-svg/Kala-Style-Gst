import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function Login() {
  // Auth mode: 'password' (default: email/phone + password for returning users) vs 'otp' (passwordless email OTP)
  const [authMode, setAuthMode] = useState('password');

  // OTP flow state: 'email' (input screen) vs 'otp' (verify 6-digit screen)
  const [otpStep, setOtpStep] = useState('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [countdown, setCountdown] = useState(0);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState('');

  // Password flow state
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [passLoading, setPassLoading] = useState(false);

  const { login, sendOtp, verifyOtp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const otpInputsRef = useRef([]);

  // Auto-focus first input when entering OTP step
  useEffect(() => {
    if (otpStep === 'otp' && otpInputsRef.current[0]) {
      setTimeout(() => {
        otpInputsRef.current[0]?.focus();
      }, 100);
    }
  }, [otpStep]);

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

  // Mask email helper (e.g. rohan@gmail.com -> r***@gmail.com)
  const maskEmail = (str) => {
    if (!str || !str.includes('@')) return str;
    const [name, domain] = str.split('@');
    if (name.length <= 2) return `${name[0]}***@${domain}`;
    return `${name[0]}***@${domain}`;
  };

  // Safe redirect helper after login based on role and return URL
  const handleRedirectAfterAuth = (user) => {
    const role = (user?.role || '').trim().toLowerCase();
    const returnUrl = location.state?.from?.pathname;

    if (returnUrl && returnUrl !== '/login') {
      if (returnUrl.startsWith('/admin') && role !== 'admin') {
        navigate(role === 'artisan' ? '/artisan' : '/', { replace: true });
      } else if (returnUrl.startsWith('/artisan') && role !== 'artisan' && role !== 'admin') {
        navigate('/', { replace: true });
      } else {
        navigate(returnUrl, { replace: true });
      }
    } else if (role === 'admin') {
      navigate('/admin', { replace: true });
    } else if (role === 'artisan') {
      navigate('/artisan', { replace: true });
    } else {
      navigate('/', { replace: true });
    }
  };

  // ─── Step 1: Send OTP ─────────────────────────────────────────
  const handleSendOtp = async (e) => {
    if (e) e.preventDefault();
    setOtpError('');

    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      setOtpError('Please enter a valid email address.');
      toast.error('Please enter a valid email address.');
      return;
    }

    setOtpLoading(true);
    try {
      await sendOtp(cleanEmail);
      setOtpStep('otp');
      setCountdown(30);
      setOtp(['', '', '', '', '', '']);
      toast.success('OTP sent successfully to your email! 📩');
    } catch (err) {
      setOtpError(err.message);
      toast.error(err.message);
    } finally {
      setOtpLoading(false);
    }
  };

  // ─── Step 2: Resend OTP ───────────────────────────────────────
  const handleResendOtp = async () => {
    if (countdown > 0 || otpLoading) return;
    setOtpError('');
    setOtpLoading(true);

    try {
      await sendOtp(email.trim().toLowerCase());
      setCountdown(30);
      setOtp(['', '', '', '', '', '']);
      toast.success('A new OTP has been sent to your email.');
    } catch (err) {
      setOtpError(err.message);
      toast.error(err.message);
    } finally {
      setOtpLoading(false);
    }
  };

  // ─── Step 3: Verify OTP ───────────────────────────────────────
  const handleVerifyOtp = async (codeToVerify) => {
    const code = (codeToVerify || otp.join('')).trim();
    if (code.length !== 6) {
      setOtpError('Please enter the complete 6-digit OTP.');
      return;
    }

    setOtpError('');
    setOtpLoading(true);

    try {
      const verifiedUser = await verifyOtp(email.trim().toLowerCase(), code);
      handleRedirectAfterAuth(verifiedUser);
    } catch (err) {
      setOtpError(err.message);
      toast.error(err.message);
      // Clear OTP fields after invalid verification as required
      setOtp(['', '', '', '', '', '']);
      otpInputsRef.current[0]?.focus();
    } finally {
      setOtpLoading(false);
    }
  };

  // ─── OTP Input Handlers (6-digit UX) ─────────────────────────
  const handleOtpChange = (index, value) => {
    // Only accept numeric input
    const cleanDigit = value.replace(/\D/g, '');
    if (!cleanDigit && value !== '') return;

    const newOtp = [...otp];
    newOtp[index] = cleanDigit.slice(-1);
    setOtp(newOtp);

    // Auto-advance to next box if digit entered
    if (cleanDigit && index < 5) {
      otpInputsRef.current[index + 1]?.focus();
    }

    // If all 6 boxes are filled, auto-verify
    if (newOtp.every((digit) => digit !== '') && cleanDigit) {
      handleVerifyOtp(newOtp.join(''));
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      if (!otp[index] && index > 0) {
        // Move to previous box if current box is empty
        otpInputsRef.current[index - 1]?.focus();
      } else {
        const newOtp = [...otp];
        newOtp[index] = '';
        setOtp(newOtp);
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      otpInputsRef.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      otpInputsRef.current[index + 1]?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').trim();
    const numericChars = pastedData.replace(/\D/g, '').slice(0, 6);

    if (!numericChars) return;

    const newOtp = [...otp];
    for (let i = 0; i < 6; i++) {
      newOtp[i] = numericChars[i] || '';
    }
    setOtp(newOtp);

    // Focus last filled or next empty box
    const nextEmptyIndex = newOtp.findIndex((digit) => digit === '');
    if (nextEmptyIndex !== -1) {
      otpInputsRef.current[nextEmptyIndex]?.focus();
    } else {
      otpInputsRef.current[5]?.focus();
      // If complete 6 digits pasted, trigger verification
      if (numericChars.length === 6) {
        handleVerifyOtp(numericChars);
      }
    }
  };

  // ─── Change Email Action ─────────────────────────────────────
  const handleChangeEmail = () => {
    setOtpStep('email');
    setOtp(['', '', '', '', '', '']);
    setCountdown(0);
    setOtpError('');
    setOtpLoading(false);
  };

  // ─── Password Flow Submit ─────────────────────────────────────
  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    const identifier = phone.trim();
    if (!identifier) {
      toast.error('Please enter your phone number or email');
      return;
    }

    const isEmail = identifier.includes('@');
    let valueToSubmit = identifier;
    if (!isEmail) {
      const cleanPhone = identifier.replace(/\D/g, '');
      if (cleanPhone.length < 10) {
        toast.error('Please enter a valid 10-digit phone number or email');
        return;
      }
      valueToSubmit = cleanPhone.length > 10 ? cleanPhone.slice(-10) : cleanPhone;
    }

    setPassLoading(true);
    try {
      const user = await login(valueToSubmit, password);
      handleRedirectAfterAuth(user);
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Failed to log in');
    } finally {
      setPassLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-6 card p-8 sm:p-10 border border-dark-500 shadow-2xl">
        {/* KalaStyle AI Branding Header */}
        <div>
          <div className="flex justify-center mb-4">
            <img
              src="/images/kalastyle_logo.png"
              alt="KalaStyle AI"
              className="h-16 w-16 object-cover rounded-full ring-2 ring-gold-500/80 shadow-gold"
            />
          </div>
          <h2 className="text-center text-3xl font-serif font-bold text-white">
            {authMode === 'otp' && otpStep === 'otp' ? 'Verify Your Email' : 'Welcome Back 👋'}
          </h2>
          <p className="mt-2 text-center text-sm text-gray-400">
            {authMode === 'otp' && otpStep === 'otp' ? (
              <span>
                We sent a verification code to{' '}
                <span className="text-gold-400 font-semibold">{maskEmail(email)}</span>
              </span>
            ) : (
              <span>
                Sign in to your <span className="gold-text font-medium">KalaStyle AI</span> account
              </span>
            )}
          </p>
        </div>

        {/* Auth Method Selector Toggle */}
        <div className="flex rounded-lg overflow-hidden border border-dark-500 bg-dark-800 p-1">
          <button
            type="button"
            onClick={() => {
              setAuthMode('password');
              setOtpError('');
            }}
            className={`flex-1 py-2 text-xs sm:text-sm font-medium rounded-md transition-all ${
              authMode === 'password'
                ? 'bg-gradient-luxury text-dark-900 font-bold shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            🔑 Password Login
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthMode('otp');
              setOtpError('');
            }}
            className={`flex-1 py-2 text-xs sm:text-sm font-medium rounded-md transition-all ${
              authMode === 'otp'
                ? 'bg-gradient-luxury text-dark-900 font-bold shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            ✉️ Email OTP
          </button>
        </div>

        {/* ─── EMAIL OTP FLOW ──────────────────────────────────── */}
        {authMode === 'otp' && (
          <div>
            {otpStep === 'email' ? (
              /* STEP 1: EMAIL INPUT */
              <form onSubmit={handleSendOtp} className="space-y-5">
                <div>
                  <label htmlFor="email" className="block text-xs font-medium text-gray-300 mb-1.5 uppercase tracking-wider">
                    Email Address
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    autoFocus
                    autoComplete="email"
                    className="input-field"
                    placeholder="Enter your email (e.g. name@gmail.com)"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (otpError) setOtpError('');
                    }}
                  />
                  {otpError && (
                    <p className="mt-2 text-xs text-red-400 flex items-center gap-1">
                      ⚠️ {otpError}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={otpLoading || !email.trim()}
                  className="w-full btn-primary flex items-center justify-center gap-2"
                >
                  {otpLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-dark-900 border-t-transparent rounded-full animate-spin" />
                      <span>Sending OTP...</span>
                    </>
                  ) : (
                    <span>Send OTP</span>
                  )}
                </button>

                <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500 pt-1">
                  <span className="text-emerald-400">🔒</span>
                  <span>Free, passwordless & secure login directly to your inbox</span>
                </div>
              </form>
            ) : (
              /* STEP 2: 6-DIGIT OTP INPUT SCREEN */
              <div className="space-y-6">
                <div className="text-center">
                  <label className="block text-xs font-semibold text-gray-300 mb-3 tracking-widest uppercase">
                    Enter the 6-digit OTP
                  </label>
                  {/* 6 Individual Numeric Boxes */}
                  <div className="flex justify-center gap-2 sm:gap-3" onPaste={handleOtpPaste}>
                    {otp.map((digit, index) => (
                      <input
                        key={index}
                        ref={(el) => (otpInputsRef.current[index] = el)}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={1}
                        value={digit}
                        aria-label={`Digit ${index + 1}`}
                        onChange={(e) => handleOtpChange(index, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(index, e)}
                        className="w-11 h-13 sm:w-12 sm:h-14 text-center text-xl sm:text-2xl font-bold font-mono bg-dark-800 border border-dark-400 rounded-lg text-gold-400 focus:outline-none focus:border-gold-500 focus:ring-2 focus:ring-gold-500/50 transition-all"
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
                  onClick={() => handleVerifyOtp()}
                  disabled={otpLoading || otp.join('').length !== 6}
                  className="w-full btn-primary flex items-center justify-center gap-2"
                >
                  {otpLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-dark-900 border-t-transparent rounded-full animate-spin" />
                      <span>Verifying...</span>
                    </>
                  ) : (
                    <span>Verify OTP</span>
                  )}
                </button>

                {/* Resend Cooldown and Change Email Actions */}
                <div className="flex flex-col items-center gap-2 pt-2 text-sm">
                  <div className="text-gray-400 text-xs">
                    {countdown > 0 ? (
                      <span className="text-gray-400">
                        Didn't receive the code?{' '}
                        <span className="text-gold-400 font-medium">Resend OTP in {countdown}s</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={handleResendOtp}
                        disabled={otpLoading}
                        className="text-gold-400 hover:text-gold-300 font-medium hover:underline cursor-pointer"
                      >
                        Didn't receive the code? Resend OTP
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleChangeEmail}
                    className="text-xs text-gray-500 hover:text-gray-300 hover:underline cursor-pointer pt-1"
                  >
                    ← Change email
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── PASSWORD LOGIN FLOW (FULL BACKWARD COMPATIBILITY) ─ */}
        {authMode === 'password' && (
          <form className="space-y-4" onSubmit={handlePasswordSubmit}>
            <div>
              <label htmlFor="phone" className="block text-xs font-medium text-gray-300 mb-1.5 uppercase tracking-wider">
                Phone Number or Email
              </label>
              <input
                id="phone"
                name="phone"
                type="text"
                required
                className="input-field"
                placeholder="Phone Number or Email"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-xs font-medium text-gray-300 mb-1.5 uppercase tracking-wider">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="input-field"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={passLoading}
              className="w-full btn-primary flex items-center justify-center gap-2 mt-2"
            >
              {passLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-dark-900 border-t-transparent rounded-full animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <span>Sign In</span>
              )}
            </button>
          </form>
        )}

        {/* Footer Navigation */}
        <div className="text-center text-sm text-gray-400 pt-2 border-t border-dark-600/50">
          Don't have an account?{' '}
          <Link to="/signup" className="text-gold-400 hover:text-gold-300 font-medium">
            Create one
          </Link>
        </div>
      </div>
    </div>
  );
}
