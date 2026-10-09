import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { FcGoogle } from 'react-icons/fc';
import { HiEye, HiEyeOff } from 'react-icons/hi';
import { useAuth } from '../context/AuthContext';
import { normalizeRole, resolveSafeRedirect, OTP_LENGTH, isValidOtp } from '../utils/authHelper';
import toast from 'react-hot-toast';

export default function Login() {
  const {
    user,
    login,
    sendOtp,
    verifyOtp,
    signInWithGoogle,
    logout,
    oauthProcessing,
    oauthError
  } = useAuth();

  const navigate = useNavigate();
  const location = useLocation();

  // Inspect entry points to determine initial portal mode ('customer' | 'artisan' | 'admin')
  const searchParams = new URLSearchParams(location.search);
  const queryFrom = searchParams.get('from');
  const queryPortal = searchParams.get('portal');
  const queryIntent = searchParams.get('intent');
  const rawFrom = location.state?.from;
  const stateFrom = typeof rawFrom === 'string' ? rawFrom : rawFrom?.pathname;

  const getInitialPortal = () => {
    if (queryPortal === 'artisan' || queryIntent === 'artisan' || (queryFrom && queryFrom.startsWith('/artisan')) || (stateFrom && stateFrom.startsWith('/artisan'))) {
      return 'artisan';
    }
    return 'customer';
  };

  const [portalMode, setPortalMode] = useState(getInitialPortal);

  // Auth Method inside active portal: 'password' | 'otp'
  const [authMethod, setAuthMethod] = useState('password');

  // Password Login state
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginNotFound, setLoginNotFound] = useState(false);

  // Google OAuth flow state
  const [googleLoading, setGoogleLoading] = useState(false);

  // Email OTP state
  const [otpStep, setOtpStep] = useState('email'); // 'email' | 'otp'
  const [otpEmail, setOtpEmail] = useState('');
  const [otp, setOtp] = useState(Array(OTP_LENGTH).fill(''));
  const [countdown, setCountdown] = useState(0);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [otpNotFound, setOtpNotFound] = useState(false);

  const otpInputsRef = useRef([]);

  // Check if OAuth callback is actively in-flight or in URL
  const hasOAuthParams = typeof window !== 'undefined' && (
    sessionStorage.getItem('oauth_in_flight') === 'true' ||
    Boolean(window.location.hash && (window.location.hash.includes('access_token=') || window.location.hash.includes('error='))) ||
    Boolean(window.location.search && (window.location.search.includes('code=') || window.location.search.includes('error=')))
  );

  // Synchronized state for Google OAuth verification banner
  const isVerifyingGoogle = (hasOAuthParams || oauthProcessing) && !user && !oauthError;

  // Auto-redirect when user session is active
  useEffect(() => {
    if (user) {
      handleRedirectAfterAuth(user);
    }
  }, [user]);

  // Cleanly handle Google OAuth callback errors from URL
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

  // Resend cooldown timer (60s)
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

  // Safe redirect helper after authentication
  const handleRedirectAfterAuth = (authenticatedUser) => {
    const role = normalizeRole(authenticatedUser?.role);
    const storedReturnUrl = sessionStorage.getItem('auth_return_url');
    const authIntent = sessionStorage.getItem('auth_intent');
    const portalNotice = sessionStorage.getItem('portal_notice');

    sessionStorage.removeItem('auth_return_url');
    sessionStorage.removeItem('oauth_in_flight');
    sessionStorage.removeItem('auth_intent');
    sessionStorage.removeItem('portal_notice');

    // If account has admin role in Supabase database, grant admin dashboard access automatically
    if (role === 'admin') {
      toast.success('Authenticated as Administrator 🛡️');
      const adminTarget = storedReturnUrl || stateFrom || queryFrom || '/admin';
      const destination = resolveSafeRedirect('admin', adminTarget);
      navigate(destination, { replace: true });
      return;
    }

    // Portal role boundaries enforcement for customers attempting artisan portal
    if (portalMode === 'artisan' && role === 'user') {
      toast('Your account is registered as a customer. To sell your crafts, please register as an artisan.', {
        icon: '🎨',
        duration: 6000,
      });
      navigate('/', { replace: true });
      return;
    }

    if (portalNotice) {
      toast(portalNotice, { icon: 'ℹ️', duration: 6000 });
    } else if (authIntent === 'artisan' && role === 'user') {
      toast('Your Google account is registered as a customer. Please complete artisan registration to open a store.', {
        icon: 'ℹ️',
        duration: 6000
      });
    }

    const currentSearchParams = new URLSearchParams(location.search);
    const qFrom = currentSearchParams.get('from');
    const rFrom = location.state?.from;
    const sFrom = typeof rFrom === 'string' ? rFrom : rFrom?.pathname;
    const returnUrl = storedReturnUrl || sFrom || qFrom;

    const destination = resolveSafeRedirect(role, returnUrl);
    navigate(destination, { replace: true });
  };

  // ─── 1. Password Login Action ─────────────────────────────────
  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setLoginNotFound(false);

    const cleanIdentifier = identifier.trim();
    if (!cleanIdentifier) {
      setLoginError('Please enter your email or phone number.');
      return;
    }

    if (!password) {
      setLoginError('Please enter your password.');
      return;
    }

    setLoginLoading(true);
    try {
      const loggedInUser = await login(cleanIdentifier, password);

      // Verify portal match for Artisan portal
      if (portalMode === 'artisan' && normalizeRole(loggedInUser?.role) === 'user') {
        toast('Your account is registered as a customer. Sign in via Customer Portal or apply as an Artisan.', {
          icon: 'ℹ️',
          duration: 5000
        });
      }

      handleRedirectAfterAuth(loggedInUser);
    } catch (err) {
      const errMsg = err.message || 'Invalid credentials. Please verify your details.';
      setLoginError(errMsg);
      if (err.notFound || errMsg.toLowerCase().includes('no account found')) {
        setLoginNotFound(true);
      } else {
        setLoginNotFound(false);
      }
      toast.error(errMsg);
    } finally {
      setLoginLoading(false);
    }
  };

  // ─── 2. Google Sign-In Action ─────────────────────────────────
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

  // ─── 3. Email OTP: Send OTP Action ────────────────────────────
  const handleSendOtp = async (e) => {
    if (e) e.preventDefault();
    if (otpLoading) return;
    setOtpError('');
    setOtpNotFound(false);

    const cleanEmail = otpEmail.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      setOtpError('Please enter a valid email address.');
      toast.error('Please enter a valid email address.');
      return;
    }

    setOtpLoading(true);
    try {
      await sendOtp(cleanEmail, false);
      setOtpStep('otp');
      setCountdown(60);
      setOtp(Array(OTP_LENGTH).fill(''));
      toast.success('Login OTP sent successfully to your email! 📩');
    } catch (err) {
      const errMsg = err.message || 'Failed to send OTP';
      setOtpError(errMsg);
      if (err.notFound || errMsg.toLowerCase().includes('no account found')) {
        setOtpNotFound(true);
      } else {
        setOtpNotFound(false);
      }
      toast.error(errMsg);
    } finally {
      setOtpLoading(false);
    }
  };

  // ─── 4. Email OTP: Resend OTP Action ──────────────────────────
  const handleResendOtp = async () => {
    if (countdown > 0 || otpLoading) return;
    setOtpError('');
    setOtpNotFound(false);
    setOtpLoading(true);

    try {
      await sendOtp(otpEmail.trim().toLowerCase(), false);
      setCountdown(60);
      setOtp(Array(OTP_LENGTH).fill(''));
      toast.success('A new OTP code has been sent to your email.');
    } catch (err) {
      setOtpError(err.message);
      toast.error(err.message);
    } finally {
      setOtpLoading(false);
    }
  };

  // ─── 5. Email OTP: Verify OTP Action ──────────────────────────
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
      const verifiedUser = await verifyOtp(otpEmail.trim().toLowerCase(), code);
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

  // OTP Input event handlers
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

  // When verifying OAuth callback in flight
  if (isVerifyingGoogle) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center py-12 px-3 sm:px-6 lg:px-8">
        <div className="max-w-md w-full card p-8 sm:p-10 border border-dark-500 shadow-2xl text-center space-y-4">
          <div className="w-12 h-12 border-4 border-dark-600 border-t-gold-500 rounded-full animate-spin mx-auto mb-2" />
          <h3 className="text-xl font-serif font-bold text-white">Verifying Google Account...</h3>
          <p className="text-sm text-gray-400">
            Securely authenticating with Google and preparing your KalaStyle dashboard...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12 px-3 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-6 card p-5 sm:p-10 border border-dark-500 shadow-2xl">
        {/* Brand Header */}
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <img
              src="/images/kalastyle_logo.png"
              alt="KalaStyle AI"
              className="h-16 w-16 object-cover rounded-full ring-2 ring-gold-500/80 shadow-gold"
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
          </div>

          <h2 className="text-2xl sm:text-3xl font-serif font-bold text-white">
            {portalMode === 'artisan' ? 'Artisan Studio' : 'Welcome Back 👋'}
          </h2>

          <p className="mt-2 text-xs sm:text-sm text-gray-400">
            {portalMode === 'artisan' ? (
              <span>
                Sign in to manage your <span className="gold-text font-medium">handcrafts, AI tools, and orders</span>
              </span>
            ) : (
              <span>
                Discover & order authentic <span className="gold-text font-medium">Indian handicrafts</span>
              </span>
            )}
          </p>
        </div>

        {/* ─── Portal Switcher Tabs (Customer vs Artisan) ─── */}
        <div className="grid grid-cols-2 rounded-xl overflow-hidden border border-dark-600 bg-dark-900/90 p-1 gap-1">
          <button
            type="button"
            id="portal-customer-btn"
            onClick={() => {
              setPortalMode('customer');
              setLoginError('');
              setLoginNotFound(false);
              setOtpError('');
              setOtpNotFound(false);
            }}
            className={`py-2 text-[10px] sm:text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1 ${
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
            onClick={() => {
              setPortalMode('artisan');
              setLoginError('');
              setLoginNotFound(false);
              setOtpError('');
              setOtpNotFound(false);
            }}
            className={`py-2 text-[10px] sm:text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1 ${
              portalMode === 'artisan'
                ? 'bg-gold-500 text-dark-950 shadow-gold font-bold'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            🎨 Artisan Login
          </button>
        </div>

        {/* ─── Password vs OTP Method Switcher ─── */}
        <div className="flex border-b border-dark-600/70 pb-1 text-xs justify-center gap-6">
          <button
            type="button"
            onClick={() => {
              setAuthMethod('password');
              setLoginError('');
              setLoginNotFound(false);
            }}
            className={`pb-1.5 font-medium transition-all border-b-2 cursor-pointer ${
              authMethod === 'password'
                ? 'border-gold-500 text-gold-400 font-semibold'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            🔑 Password Login
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthMethod('otp');
              setOtpError('');
              setOtpNotFound(false);
            }}
            className={`pb-1.5 font-medium transition-all border-b-2 cursor-pointer ${
              authMethod === 'otp'
                ? 'border-gold-500 text-gold-400 font-semibold'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            ✉️ Email OTP Login
          </button>
        </div>

        {/* ─── OPTION A: PASSWORD LOGIN FLOW ─── */}
        {authMethod === 'password' ? (
          <form onSubmit={handlePasswordLogin} className="space-y-4">
            {/* Login Identifier (Email or Phone) */}
            <div>
              <label
                htmlFor="login-identifier"
                className="block text-xs font-medium text-gray-300 mb-1.5 uppercase tracking-wider"
              >
                {portalMode === 'artisan'
                  ? 'Artisan Email or Phone Number'
                  : 'Email or 10-Digit Phone Number'}
              </label>
              <input
                id="login-identifier"
                name="identifier"
                type="text"
                required
                autoFocus
                autoComplete="username"
                className="input-field"
                placeholder={
                  portalMode === 'artisan'
                    ? 'Enter artisan email or phone'
                    : 'name@example.com or 9876543210'
                }
                value={identifier}
                onChange={(e) => {
                  setIdentifier(e.target.value);
                  if (loginError) setLoginError('');
                  if (loginNotFound) setLoginNotFound(false);
                }}
              />
            </div>

            {/* Password with Show/Hide toggle */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="login-password"
                  className="block text-xs font-medium text-gray-300 uppercase tracking-wider"
                >
                  Password
                </label>
                <Link
                  to="/forgot-password"
                  className="text-xs text-gold-400 hover:text-gold-300 hover:underline"
                >
                  Forgot Password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  className="input-field pr-10"
                  placeholder="Enter your account password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (loginError) setLoginError('');
                    if (loginNotFound) setLoginNotFound(false);
                  }}
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

            {/* Remember Me Checkbox */}
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-300">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-dark-500 text-gold-500 focus:ring-gold-500/30 bg-dark-800 h-4 w-4"
                />
                <span>Remember session on this device</span>
              </label>
            </div>

            {loginError && (
              <div className={`p-3.5 rounded-xl text-xs flex flex-col gap-2 ${
                loginNotFound
                  ? 'bg-amber-500/15 border border-amber-500/40 text-amber-200'
                  : 'bg-red-500/10 border border-red-500/30 text-red-400'
              }`}>
                <div className="flex items-start gap-2">
                  <span className="text-base shrink-0">{loginNotFound ? '🔍' : '⚠️'}</span>
                  <span className="leading-relaxed font-medium">{loginError}</span>
                </div>
                {loginNotFound && (
                  <Link
                    to={portalMode === 'artisan' ? '/signup?role=artisan' : '/signup'}
                    className="mt-1 py-2 px-3 bg-gold-500 hover:bg-gold-400 text-dark-950 font-bold rounded-lg text-center transition-all inline-block shadow-gold"
                  >
                    Create Account First →
                  </Link>
                )}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loginLoading || !identifier.trim() || !password}
              className="w-full btn-primary py-3 px-4 rounded-xl font-bold text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loginLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-dark-900 border-t-transparent rounded-full animate-spin" />
                  <span>Signing In...</span>
                </>
              ) : (
                <span>
                  {portalMode === 'artisan'
                    ? 'Sign In to Artisan Studio →'
                    : 'Sign In to KalaStyle →'}
                </span>
              )}
            </button>

            {/* Google Sign In */}
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-dark-500/80" />
              </div>
              <div className="relative flex justify-center text-xs uppercase tracking-wider">
                <span className="bg-dark-800 px-3 text-gray-400 font-medium">Or continue with</span>
              </div>
            </div>

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
                    {portalMode === 'artisan'
                      ? 'Continue with Google (Artisan)'
                      : 'Continue with Google'}
                  </span>
                </>
              )}
            </button>
          </form>
        ) : (
          /* ─── OPTION B: EMAIL OTP FLOW ─── */
          <div>
            {otpStep === 'email' ? (
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div>
                  <label
                    htmlFor="otp-email"
                    className="block text-xs font-medium text-gray-300 mb-1.5 uppercase tracking-wider"
                  >
                    Email Address
                  </label>
                  <input
                    id="otp-email"
                    name="email"
                    type="email"
                    required
                    autoFocus
                    autoComplete="email"
                    className="input-field"
                    placeholder="Enter your email (e.g. name@gmail.com)"
                    value={otpEmail}
                    onChange={(e) => {
                      setOtpEmail(e.target.value);
                      if (otpError) setOtpError('');
                      if (otpNotFound) setOtpNotFound(false);
                    }}
                  />
                  {otpError && (
                    <div className={`mt-2 p-3 rounded-xl text-xs flex flex-col gap-2 ${
                      otpNotFound
                        ? 'bg-amber-500/15 border border-amber-500/40 text-amber-200'
                        : 'bg-red-500/10 border border-red-500/30 text-red-400'
                    }`}>
                      <div className="flex items-start gap-2">
                        <span className="text-base shrink-0">{otpNotFound ? '🔍' : '⚠️'}</span>
                        <span className="leading-relaxed font-medium">{otpError}</span>
                      </div>
                      {otpNotFound && (
                        <Link
                          to={portalMode === 'artisan' ? '/signup?role=artisan' : '/signup'}
                          className="mt-1 py-1.5 px-3 bg-gold-500 hover:bg-gold-400 text-dark-950 font-bold rounded-lg text-center transition-all inline-block shadow-gold"
                        >
                          Create Account First →
                        </Link>
                      )}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={otpLoading || !otpEmail.trim()}
                  className="w-full btn-primary flex items-center justify-center gap-2"
                >
                  {otpLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-dark-900 border-t-transparent rounded-full animate-spin" />
                      <span>Sending Login OTP...</span>
                    </>
                  ) : (
                    <span>Send Login OTP →</span>
                  )}
                </button>

                <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500 pt-1">
                  <span className="text-emerald-400">🔒</span>
                  <span>Instant 8-digit OTP delivered directly to your email</span>
                </div>
              </form>
            ) : (
              <div className="space-y-6">
                <div className="text-center">
                  <label className="block text-xs font-semibold text-gray-300 mb-2 tracking-widest uppercase">
                    Enter the {OTP_LENGTH}-digit Login OTP code
                  </label>
                  <p className="text-xs text-gray-400 mb-4">
                    Sent to <span className="text-gold-400 font-semibold">{maskEmail(otpEmail)}</span>
                  </p>

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
                      <span>Verifying & Logging In...</span>
                    </>
                  ) : (
                    <span>Log In with OTP →</span>
                  )}
                </button>

                {/* Resend Cooldown and Change Email */}
                <div className="flex flex-col items-center gap-2 pt-1 text-sm">
                  <div className="text-gray-400 text-xs">
                    {countdown > 0 ? (
                      <span>
                        Didn't receive code?{' '}
                        <span className="text-gold-400 font-medium">Resend OTP in {countdown}s</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={handleResendOtp}
                        disabled={otpLoading}
                        className="text-gold-400 hover:text-gold-300 font-medium hover:underline cursor-pointer"
                      >
                        Didn't receive code? Resend OTP
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setOtpStep('email');
                      setOtp(Array(OTP_LENGTH).fill(''));
                      setCountdown(0);
                      setOtpError('');
                    }}
                    className="text-xs text-gray-500 hover:text-gray-300 hover:underline cursor-pointer"
                  >
                    ← Use a different email
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── Footer Navigation Links ─── */}
        <div className="text-center text-xs sm:text-sm text-gray-400 pt-3 border-t border-dark-600/50">
          {portalMode === 'artisan' ? (
            <div>
              Want to showcase your handcrafted products?{' '}
              <Link to="/signup?role=artisan" className="text-gold-400 hover:text-gold-300 font-medium">
                Register as an Artisan
              </Link>
            </div>
          ) : (
            <div>
              Don't have a KalaStyle account?{' '}
              <Link to="/signup" className="text-gold-400 hover:text-gold-300 font-medium">
                Create Customer Account
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
