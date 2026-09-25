import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { FcGoogle } from 'react-icons/fc';
import { useAuth } from '../context/AuthContext';
import { normalizeRole, getRoleHome, resolveSafeRedirect, OTP_LENGTH, isValidOtp } from '../utils/authHelper';
import toast from 'react-hot-toast';

export default function Login() {
  // Auth mode: 'password' (default: email/phone + password for returning users) vs 'otp' (passwordless email OTP)
  const [authMode, setAuthMode] = useState('password');

  // Google OAuth flow state
  const [googleLoading, setGoogleLoading] = useState(false);

  // OTP flow state: 'email' (input screen) vs 'otp' (verify screen)
  const [otpStep, setOtpStep] = useState('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState(Array(OTP_LENGTH).fill(''));
  const [countdown, setCountdown] = useState(0);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState('');

  // Password flow state
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [passLoading, setPassLoading] = useState(false);

  const { user, login, sendOtp, verifyOtp, signInWithGoogle, oauthProcessing, oauthError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Inspect entry points: determine whether user arrived at artisan login portal
  const searchParams = new URLSearchParams(location.search);
  const queryFrom = searchParams.get('from');
  const queryPortal = searchParams.get('portal');
  const queryIntent = searchParams.get('intent');
  const rawFrom = location.state?.from;
  const stateFrom = typeof rawFrom === 'string' ? rawFrom : rawFrom?.pathname;

  const isArtisanEntry = Boolean(
    queryPortal === 'artisan' ||
    queryIntent === 'artisan' ||
    (queryFrom && queryFrom.startsWith('/artisan')) ||
    (stateFrom && stateFrom.startsWith('/artisan'))
  );

  const [portalMode, setPortalMode] = useState(() => isArtisanEntry ? 'artisan' : 'customer');

  useEffect(() => {
    if (isArtisanEntry) {
      setPortalMode('artisan');
    }
  }, [isArtisanEntry]);

  const otpInputsRef = useRef([]);

  // Check if OAuth callback is actively in-flight or in URL
  const hasOAuthParams = typeof window !== 'undefined' && (
    sessionStorage.getItem('oauth_in_flight') === 'true' ||
    Boolean(window.location.hash && (window.location.hash.includes('access_token=') || window.location.hash.includes('error='))) ||
    Boolean(window.location.search && (window.location.search.includes('code=') || window.location.search.includes('error=')))
  );

  const isVerifyingGoogle = (hasOAuthParams || oauthProcessing) && !user && !oauthError;

  // Auto-redirect immediately when authenticated
  useEffect(() => {
    if (user) {
      handleRedirectAfterAuth(user);
    }
  }, [user]);

  // Cleanly handle Google OAuth callback cancellation / errors from URL
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const errorDesc = searchParams.get('error_description') || searchParams.get('error') ||
                        hashParams.get('error_description') || hashParams.get('error');
      if (errorDesc) {
        sessionStorage.removeItem('oauth_in_flight');
        if (errorDesc.includes('access_denied') || errorDesc.includes('cancelled') || errorDesc.includes('closed')) {
          toast.error('Google sign-in was cancelled.');
        } else {
          toast.error(decodeURIComponent(errorDesc.replace(/\+/g, ' ')));
        }
        window.history.replaceState(null, '', window.location.pathname);
      }
    }
  }, []);

  // Auto-focus first input when entering OTP step
  useEffect(() => {
    if (otpStep === 'otp' && otpInputsRef.current[0]) {
      setTimeout(() => {
        otpInputsRef.current[0]?.focus();
      }, 100);
    }
  }, [otpStep]);

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

  // Mask email helper (e.g. rohan@gmail.com -> r***@gmail.com)
  const maskEmail = (str) => {
    if (!str || !str.includes('@')) return str;
    const [name, domain] = str.split('@');
    if (name.length <= 2) return `${name[0]}***@${domain}`;
    return `${name[0]}***@${domain}`;
  };

  // Safe redirect helper after login based on role and return URL
  const handleRedirectAfterAuth = (user) => {
    const role = normalizeRole(user?.role);
    const storedReturnUrl = sessionStorage.getItem('auth_return_url');
    const authIntent = sessionStorage.getItem('auth_intent');
    const portalNotice = sessionStorage.getItem('portal_notice');

    // Section 18: After successful authentication and redirect, clean from sessionStorage
    sessionStorage.removeItem('auth_return_url');
    sessionStorage.removeItem('oauth_in_flight');
    sessionStorage.removeItem('auth_intent');
    sessionStorage.removeItem('portal_notice');

    // Section 6 & 15 Case 5: Notice for existing customer logging into artisan portal
    if (portalNotice) {
      toast(portalNotice, { icon: 'ℹ️', duration: 6000 });
    } else if (authIntent === 'artisan' && role === 'user') {
      toast('Your Google account is registered as a customer. Please complete artisan registration to create an artisan account.', { icon: 'ℹ️', duration: 6000 });
    }

    const currentSearchParams = new URLSearchParams(location.search);
    const qFrom = currentSearchParams.get('from');
    const rFrom = location.state?.from;
    const sFrom = typeof rFrom === 'string' ? rFrom : rFrom?.pathname;
    const returnUrl = storedReturnUrl || sFrom || qFrom;

    const destination = resolveSafeRedirect(role, returnUrl);
    navigate(destination, { replace: true });
  };

  // ─── Google Sign-In Action ────────────────────────────────────
  const handleGoogleSignIn = async () => {
    if (googleLoading) return;
    setGoogleLoading(true);
    try {
      const isArtisanPortal = portalMode === 'artisan';
      const authIntent = isArtisanPortal ? 'artisan' : 'user';
      const defaultReturn = isArtisanPortal ? '/artisan' : '/';
      const returnUrl = stateFrom || queryFrom || defaultReturn;
      await signInWithGoogle(returnUrl, { authIntent });
    } catch (err) {
      toast.error(err.message || 'Unable to sign in with Google. Please try again.');
      setGoogleLoading(false);
    }
  };

  // ─── Step 1: Send OTP ─────────────────────────────────────────
  const handleSendOtp = async (e) => {
    if (e) e.preventDefault();
    if (otpLoading) return;
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
      setCountdown(60);
      setOtp(Array(OTP_LENGTH).fill(''));
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
      setCountdown(60);
      setOtp(Array(OTP_LENGTH).fill(''));
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
    if (otpLoading) return;
    const code = (codeToVerify || otp.join('')).trim();
    if (!isValidOtp(code)) {
      setOtpError(`Please enter your ${OTP_LENGTH}-digit OTP verification code.`);
      return;
    }

    setOtpError('');
    setOtpLoading(true);

    try {
      const verifiedUser = await verifyOtp(email.trim().toLowerCase(), code);
      setCountdown(0);
      handleRedirectAfterAuth(verifiedUser);
    } catch (err) {
      setOtpError(err.message);
      toast.error(err.message);
      setOtp(Array(OTP_LENGTH).fill(''));
      otpInputsRef.current[0]?.focus();
    } finally {
      setOtpLoading(false);
    }
  };

  // ─── OTP Input Handlers (Exact 8-digit UX with auto-verify) ───
  const handleOtpChange = (index, value) => {
    const cleanDigit = value.replace(/\D/g, '');
    if (!cleanDigit && value !== '') return;

    const newOtp = [...otp];
    newOtp[index] = cleanDigit.slice(-1);
    setOtp(newOtp);

    if (cleanDigit && index < OTP_LENGTH - 1) {
      otpInputsRef.current[index + 1]?.focus();
    }

    const filledDigits = newOtp.filter(Boolean).join('');
    if (filledDigits.length === OTP_LENGTH && cleanDigit && !otpLoading) {
      handleVerifyOtp(filledDigits);
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

    if (numericChars.length === OTP_LENGTH && !otpLoading) {
      handleVerifyOtp(numericChars);
    } else {
      const nextEmptyIndex = newOtp.findIndex((digit) => digit === '');
      if (nextEmptyIndex !== -1) {
        otpInputsRef.current[nextEmptyIndex]?.focus();
      } else {
        otpInputsRef.current[OTP_LENGTH - 1]?.focus();
      }
    }
  };

  // ─── Change Email Action ─────────────────────────────────────
  const handleChangeEmail = () => {
    setOtpStep('email');
    setOtp(Array(OTP_LENGTH).fill(''));
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
      toast.error(err.response?.data?.message || err.response?.data?.error || err.message || 'Failed to log in');
    } finally {
      setPassLoading(false);
    }
  };

  if (isVerifyingGoogle) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center py-12 px-3 sm:px-6 lg:px-8">
        <div className="max-w-md w-full card p-8 sm:p-10 border border-dark-500 shadow-2xl text-center space-y-4">
          <div className="w-12 h-12 border-4 border-dark-600 border-t-gold-500 rounded-full animate-spin mx-auto mb-2" />
          <h3 className="text-xl font-serif font-bold text-white">Verifying Google Account</h3>
          <p className="text-sm text-gray-400">
            Authenticating your credentials and preparing your workspace...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12 px-3 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-6 card p-5 sm:p-10 border border-dark-500 shadow-2xl">
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
                We sent an {OTP_LENGTH}-digit verification code to{' '}
                <span className="text-gold-400 font-semibold">{maskEmail(email)}</span>
              </span>
            ) : portalMode === 'artisan' ? (
              <span>
                Sign in to your <span className="gold-text font-medium">Artisan Studio</span> portal
              </span>
            ) : (
              <span>
                Sign in to your <span className="gold-text font-medium">KalaStyle AI</span> account
              </span>
            )}
          </p>
        </div>

        {/* ─── Portal Selector Toggle (Customer vs Artisan) ─── */}
        {!(authMode === 'otp' && otpStep === 'otp') && (
          <div className="flex rounded-xl overflow-hidden border border-dark-600 bg-dark-900/90 p-1">
            <button
              type="button"
              id="portal-customer-btn"
              onClick={() => setPortalMode('customer')}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                portalMode === 'customer'
                  ? 'bg-gold-500 text-dark-950 shadow-gold font-bold'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              🛍️ Customer Login
            </button>
            <button
              type="button"
              id="portal-artisan-btn"
              onClick={() => setPortalMode('artisan')}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                portalMode === 'artisan'
                  ? 'bg-gold-500 text-dark-950 shadow-gold font-bold'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              🎨 Artisan Login
            </button>
          </div>
        )}

        {/* ─── Google OAuth Quick Sign In ─────────────────────── */}
        {!(authMode === 'otp' && otpStep === 'otp') && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={handleGoogleSignIn}
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
                    {portalMode === 'artisan' ? 'Continue with Google (Artisan)' : 'Continue with Google'}
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
                <span className="bg-dark-800 px-3 text-gray-400 font-medium">Or continue with</span>
              </div>
            </div>
          </div>
        )}

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
              /* STEP 2: EXACT 8-DIGIT OTP INPUT SCREEN */
              <div className="space-y-6">
                <div className="text-center">
                  <label className="block text-xs font-semibold text-gray-300 mb-3 tracking-widest uppercase">
                    Enter the {OTP_LENGTH}-digit OTP verification code
                  </label>

                  {/* 8 Segmented Numeric Boxes */}
                  <div
                    className="flex justify-center gap-1 sm:gap-1.5"
                    onPaste={handleOtpPaste}
                  >
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
                        onPaste={handleOtpPaste}
                        className="w-7 sm:w-10 h-10 sm:h-12 text-center text-sm sm:text-xl font-bold font-mono bg-dark-800 border border-dark-400 rounded-lg text-gold-400 focus:outline-none focus:border-gold-500 focus:ring-2 focus:ring-gold-500/50 transition-all shrink-0 p-0"
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
                  disabled={otpLoading || otp.filter(Boolean).join('').length !== OTP_LENGTH}
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
