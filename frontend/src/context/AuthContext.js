import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { authAPI } from '../services/api';
import { supabase } from '../lib/supabase';
import { normalizeRole, getRoleHome, OTP_LENGTH, isValidOtp } from '../utils/authHelper';
import toast from 'react-hot-toast';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('sh_user');
      const token = localStorage.getItem('sh_token');
      if (stored && token) {
        const parsed = JSON.parse(stored);
        if (parsed.role) parsed.role = normalizeRole(parsed.role);
        return parsed;
      }
    } catch (e) {}
    return null;
  });
  const [initializing, setInitializing] = useState(true);
  const [loading, setLoading] = useState(() => {
    try {
      if (typeof window !== 'undefined') {
        const hasOAuth = Boolean(
          sessionStorage.getItem('oauth_in_flight') === 'true' ||
          (window.location.hash && (window.location.hash.includes('access_token=') || window.location.hash.includes('error='))) ||
          (window.location.search && (window.location.search.includes('code=') || window.location.search.includes('error=')))
        );
        if (hasOAuth) return true;
        const token = localStorage.getItem('sh_token');
        const stored = localStorage.getItem('sh_user');
        // Only wait in loading if token exists but cached user profile is missing
        return Boolean(token && !stored);
      }
    } catch (_) {}
    return false;
  });
  const [oauthProcessing, setOauthProcessing] = useState(false);
  const [oauthError, setOauthError] = useState(null);
  const syncPromiseRef = useRef(null);
  const isSigningUpRef = useRef(false);

  const cancelSignup = useCallback(() => {
    isSigningUpRef.current = false;
  }, []);

  const syncSupabaseSessionSingleFlight = useCallback(async (session) => {
    if (!session?.access_token) return null;
    if (syncPromiseRef.current) return syncPromiseRef.current;

    syncPromiseRef.current = (async () => {
      try {
        setOauthError(null);
        // Step 2 & 13: Recover auth_intent from sessionStorage or localStorage (default: 'user')
        const storedIntent = sessionStorage.getItem('auth_intent') || localStorage.getItem('auth_intent');
        const authIntent = storedIntent === 'artisan' ? 'artisan' : 'user';

        // Recover auth_flow from sessionStorage or localStorage (support fallback flags)
        const storedFlow = sessionStorage.getItem('auth_flow') || localStorage.getItem('auth_flow');
        const isSignupFlag = storedFlow === 'signup' ||
                             sessionStorage.getItem('auth_is_signup') === 'true' ||
                             localStorage.getItem('auth_is_signup') === 'true' ||
                             (typeof window !== 'undefined' && window.location.pathname.startsWith('/signup'));
        const authFlow = isSignupFlag ? 'signup' : 'login';

        // Section 6: Verified Supabase session identity must win
        const { data } = await authAPI.supabaseSession({
          accessToken: session.access_token,
          email: session.user?.email,
          supabase_uid: session.user?.id,
          auth_intent: authIntent,
          auth_flow: authFlow,
          is_signup: isSignupFlag
        });
        if (data?.user && data?.token) {
          const normalized = { ...data.user, role: normalizeRole(data.user.role) };
          setUser(normalized);
          localStorage.setItem('sh_token', data.token);
          localStorage.setItem('sh_user', JSON.stringify(normalized));

          if (data.portal_notice) {
            sessionStorage.setItem('portal_notice', data.portal_notice);
          }

          sessionStorage.removeItem('auth_flow');
          localStorage.removeItem('auth_flow');
          sessionStorage.removeItem('auth_is_signup');
          localStorage.removeItem('auth_is_signup');
          return normalized;
        }
      } catch (e) {
        const isNotFound = e.response?.status === 404 || e.response?.data?.notFound;
        const errMsg = e.response?.data?.error || e.message || 'Authentication synchronization failed. Please try again.';
        console.error('[syncSupabaseSessionSingleFlight] Sync error:', errMsg);

        if (isNotFound) {
          // Strict: When user has not registered, immediately sign out of Supabase to prevent unlinked session
          try {
            await supabase.auth.signOut();
          } catch (_) {}
          localStorage.removeItem('sh_token');
          localStorage.removeItem('sh_user');
          sessionStorage.removeItem('oauth_in_flight');
          sessionStorage.removeItem('auth_flow');
          localStorage.removeItem('auth_flow');
          sessionStorage.removeItem('auth_is_signup');
          localStorage.removeItem('auth_is_signup');
          setUser(null);
        }

        setOauthError(errMsg);
        toast.error(errMsg, { duration: 6000 });
      } finally {
        syncPromiseRef.current = null;
        setOauthProcessing(false);
      }
      return null;
    })();

    return syncPromiseRef.current;
  }, []);

  // Backward compatible alias
  const syncOtpSessionSingleFlight = syncSupabaseSessionSingleFlight;

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem('sh_token');
    if (token) {
      try {
        const { data } = await authAPI.me();
        if (data) {
          const normalized = { ...data, role: normalizeRole(data.role) };
          setUser(normalized);
          localStorage.setItem('sh_user', JSON.stringify(normalized));
          return normalized;
        }
      } catch (err) {
        if (err.response?.status === 401 || err.response?.status === 403) {
          localStorage.removeItem('sh_token');
          localStorage.removeItem('sh_user');
          setUser(null);
          if (err.response?.status === 403) {
            toast.error(err.response?.data?.error || 'Your account has been deactivated or suspended.');
          }
        }
      }
      return null;
    }

    // If no backend token exists, check if active Supabase session is present in storage
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        return await syncSupabaseSessionSingleFlight(session);
      }
    } catch (e) {
      console.warn('[refreshUser] Supabase getSession error:', e?.message || e);
    }
    return null;
  }, [syncSupabaseSessionSingleFlight]);

  // Auto-sync session on mount with database
  useEffect(() => {
    refreshUser().finally(() => {
      setLoading(false);
      setInitializing(false);
    });
  }, [refreshUser]);

  // Multi-tab session synchronization
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'sh_token' && !e.newValue) {
        // Logged out in another tab
        setUser(null);
      } else if (e.key === 'sh_user' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          parsed.role = normalizeRole(parsed.role);
          setUser(parsed);
        } catch {}
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Single global Supabase auth state listener (handles OTP confirmations and Google OAuth sign-in)
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        localStorage.removeItem('sh_token');
        localStorage.removeItem('sh_user');
        sessionStorage.removeItem('auth_return_url');
        sessionStorage.removeItem('oauth_in_flight');
        sessionStorage.removeItem('auth_intent');
        sessionStorage.removeItem('auth_flow');
        localStorage.removeItem('auth_flow');
        sessionStorage.removeItem('auth_is_signup');
        localStorage.removeItem('auth_is_signup');
        sessionStorage.removeItem('portal_notice');
        setUser(null);
        setOauthProcessing(false);
        setOauthError(null);
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
        // If a signup flow is actively underway, do not trigger background session sync
        // because signup() will atomically create the full user/artisan profile with role and credentials
        if (isSigningUpRef.current) {
          return;
        }

        // If currently on password reset page, do not hijack or wipe recovery session with normal session sync
        if (typeof window !== 'undefined' && window.location.pathname.startsWith('/reset-password')) {
          return;
        }

        if (!session?.access_token) {
          return;
        }

        const currentToken = localStorage.getItem('sh_token');
        const storedUserRaw = localStorage.getItem('sh_user');
        let storedSbUid = null;
        try {
          if (storedUserRaw) storedSbUid = JSON.parse(storedUserRaw)?.supabase_uid;
        } catch (_) {}

        const isOAuthInFlight = typeof window !== 'undefined' && (
          sessionStorage.getItem('oauth_in_flight') === 'true' ||
          Boolean(window.location.hash && (window.location.hash.includes('access_token=') || window.location.hash.includes('error='))) ||
          Boolean(window.location.search && (window.location.search.includes('code=') || window.location.search.includes('error=')))
        );

        // Section 6: Verified Supabase session identity must win when OAuth is active or no backend session exists
        // Sync session if:
        // 1. No backend token exists yet, OR
        // 2. Google OAuth returned callback parameters in URL or marked in-flight
        if (!currentToken || isOAuthInFlight) {
          setOauthProcessing(true);
          try {
            const syncedUser = await syncSupabaseSessionSingleFlight(session);
            sessionStorage.removeItem('oauth_in_flight');

            // Section 20: Clean URL after session evaluation
            if (typeof window !== 'undefined') {
              if (window.location.hash || window.location.search) {
                window.history.replaceState(null, '', window.location.pathname);
              }
            }
          } catch (err) {
            console.error('[onAuthStateChange] Session sync failed:', err);
          } finally {
            setOauthProcessing(false);
          }
        }
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, [syncSupabaseSessionSingleFlight]);

  // Real-time listener: immediately sync artisan verification across all devices
  useEffect(() => {
    const handleArtisanSync = (e) => {
      const payload = e.detail?.payload;
      if (payload?.verification_status) {
        setUser(prev => {
          if (!prev) return prev;
          const updatedProfile = {
            ...(prev.artisan_profile || {}),
            verification_status: payload.verification_status
          };
          const updatedUser = { ...prev, artisan_profile: updatedProfile };
          try {
            localStorage.setItem('sh_user', JSON.stringify(updatedUser));
          } catch {}
          return updatedUser;
        });
        refreshUser();
      }
    };
    window.addEventListener('kala:sync:artisans_updated', handleArtisanSync);
    return () => window.removeEventListener('kala:sync:artisans_updated', handleArtisanSync);
  }, [refreshUser]);

  // ─── Supabase Email OTP: Send OTP ─────────────────────────────
  const sendOtp = async (email, isSignup = false) => {
    const cleanEmail = (email || '').trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      throw new Error('Please enter a valid email address.');
    }

    // 1. Try via backend proxy FIRST (bypasses browser ad-blockers, tracking shields & client network blocks)
    try {
      const res = await authAPI.sendOtp(cleanEmail, isSignup);
      if (res.data?.success) {
        return { success: true };
      }
    } catch (backendErr) {
      console.warn('Backend sendOtp fallback triggered:', backendErr?.response?.data || backendErr.message);
      if (backendErr.response?.data?.notFound) {
        const notFoundErr = new Error(backendErr.response.data.error || 'No account found with this email. Please sign up first.');
        notFoundErr.notFound = true;
        throw notFoundErr;
      }
      if (backendErr.response?.data?.error) {
        throw new Error(backendErr.response.data.error);
      }
    }

    // 2. Direct browser Supabase client fallback
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          shouldCreateUser: isSignup === true,
        },
      });

      if (error) {
        console.error('Supabase signInWithOtp error:', error);
        const msg = (error.message || '').toLowerCase();
        if (error.status === 429 || msg.includes('rate') || msg.includes('limit') || msg.includes('over_email_send_rate_limit')) {
          throw new Error('Too many OTP requests. Please wait before requesting another code.');
        } else if (msg.includes('network') || msg.includes('fetch') || msg.includes('failed to fetch')) {
          throw new Error('Unable to connect to auth service. Please check your connection or disable ad-blocker.');
        } else if (msg.includes('error sending confirmation email') || msg.includes('confirmation email') || error.status === 500) {
          throw new Error('Unable to send login OTP email. Please verify your email address and try again.');
        } else {
          throw new Error(error.message || 'Something went wrong. Please try again.');
        }
      }

      return { success: true };
    } catch (err) {
      throw new Error(err.message || 'Something went wrong. Please try again.');
    }
  };

  // ─── Supabase Email OTP: Verify OTP ───────────────────────────
  const verifyOtp = async (email, otpToken, syncSession = true, isSignup = false) => {
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanToken = (otpToken || '').trim();

    // Canonical 8-digit OTP validation
    if (!cleanEmail || !isValidOtp(cleanToken)) {
      throw new Error(`Please enter the ${OTP_LENGTH}-digit OTP verification code sent to your email.`);
    }

    let data = null;

    // 1. Try via backend proxy FIRST
    try {
      const res = await authAPI.verifyOtp({ email: cleanEmail, token: cleanToken });
      if (res.data?.success && res.data?.data) {
        data = res.data.data;
      }
    } catch (backendErr) {
      console.warn('Backend verifyOtp fallback triggered:', backendErr?.response?.data || backendErr.message);
      if (backendErr.response?.data?.error) {
        throw new Error(backendErr.response.data.error);
      }
    }

    // 2. Direct browser Supabase client fallback if backend didn't return data
    if (!data) {
      try {
        const res = await supabase.auth.verifyOtp({
          email: cleanEmail,
          token: cleanToken,
          type: 'email',
        });

        if (res.error) {
          const msg = (res.error.message || '').toLowerCase();
          if (msg.includes('expired')) {
            throw new Error('This OTP has expired. Please request a new OTP.');
          } else if (msg.includes('invalid') || msg.includes('token') || msg.includes('incorrect') || msg.includes('wrong')) {
            throw new Error('The OTP is incorrect. Please try again.');
          } else if (res.error.status === 429 || msg.includes('too many') || msg.includes('attempts')) {
            throw new Error('Too many attempts. Please wait and try again later.');
          } else if (msg.includes('network') || msg.includes('fetch') || msg.includes('connection')) {
            throw new Error('Unable to connect. Please check your internet connection and try again.');
          } else {
            throw new Error(res.error.message || 'Something went wrong. Please try again.');
          }
        }
        data = res.data;
      } catch (err) {
        throw new Error(err.message || 'Something went wrong. Please try again.');
      }
    }

    // If called without session sync (e.g. order confirmation or signup flow)
    if (!syncSession) {
      if (isSignup) {
        isSigningUpRef.current = true;
      }
      return { success: true, data };
    }

    try {
      const session = data?.session;
      const sbUser = data?.user;

      // Sync verified Supabase user into database profile & obtain app token
      const syncRes = await authAPI.otpSession({
        accessToken: session?.access_token,
        email: cleanEmail,
        supabase_uid: sbUser?.id,
        auth_flow: isSignup ? 'signup' : 'login',
      });

      const normalizedUser = {
        ...syncRes.data.user,
        role: (syncRes.data.user?.role || 'user').trim().toLowerCase(),
      };

      localStorage.setItem('sh_token', syncRes.data.token);
      localStorage.setItem('sh_user', JSON.stringify(normalizedUser));
      setUser(normalizedUser);

      toast.success(`Welcome to KalaStyle AI, ${normalizedUser.name || 'Friend'}! ✨`);
      return normalizedUser;
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message || 'Something went wrong. Please try again.';
      throw new Error(errMsg);
    }
  };

  // ─── Existing Password Login ─────────────────────────────────
  // ─── Existing Password Login (supports Phone or Email) ───────
  const login = async (identifierOrPhone, password) => {
    try {
      const cleanIdentifier = (identifierOrPhone || '').trim();
      const { data } = await authAPI.login({
        identifier: cleanIdentifier,
        phone: cleanIdentifier,
        email: cleanIdentifier,
        password
      });

      // Clear any stale Supabase session if it belongs to a different identity
      try {
        const { data: sbData } = await supabase.auth.getSession();
        if (sbData?.session?.user?.id && sbData.session.user.id !== data.user?.supabase_uid) {
          await supabase.auth.signOut();
        }
      } catch (_) {}

      const normalizedRole = normalizeRole(data.user?.role);
      const normalizedUser = {
        ...data.user,
        role: normalizedRole,
      };
      localStorage.setItem('sh_token', data.token);
      localStorage.setItem('sh_user', JSON.stringify(normalizedUser));
      setUser(normalizedUser);
      toast.success(`Welcome back, ${normalizedUser.name || 'User'}! 👑`);
      return normalizedUser;
    } catch (err) {
      const errorData = err.response?.data;
      const errMsg = errorData?.error || err.message || 'Failed to log in';
      const loginErr = new Error(errMsg);
      if (errorData?.notFound) {
        loginErr.notFound = true;
      }
      throw loginErr;
    }
  };

  // ─── Signup ──────────────────────────────────────────────────
  const signup = async (name, phone, password, role = 'user', store_name, artisan_type, email, supabase_uid = null) => {
    isSigningUpRef.current = true;
    try {
      const normalizedTargetRole = normalizeRole(role) === 'artisan' ? 'artisan' : 'user';
      const { data } = await authAPI.signup({
        name,
        phone,
        password,
        role: normalizedTargetRole,
        store_name,
        artisan_type,
        email,
        supabase_uid
      });
      const normalizedRole = normalizeRole(data.user?.role);
      const normalizedUser = {
        ...data.user,
        role: normalizedRole,
      };
      localStorage.setItem('sh_token', data.token);
      localStorage.setItem('sh_user', JSON.stringify(normalizedUser));
      setUser(normalizedUser);
      toast.success('Account created! Welcome to KalaStyle AI ✨');
      return normalizedUser;
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message || 'Failed to create account';
      throw new Error(errMsg);
    } finally {
      isSigningUpRef.current = false;
    }
  };

  // ─── Google OAuth via Supabase ───────────────────────────────
  const signInWithGoogle = async (returnUrlOrOptions, maybeOptions) => {
    try {
      if (!supabase?.auth) {
        throw new Error('Supabase client is not available. Please verify your connection.');
      }

      // Section 2: Parse flexible returnUrl and explicit authIntent & authFlow
      let targetReturnUrl = null;
      let targetAuthIntent = 'user';

      // Detect flow: check if currently on signup page, or if storage was set to signup
      const isSignupPage = (typeof window !== 'undefined' && window.location.pathname.startsWith('/signup')) ||
                           (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('auth_flow') === 'signup') ||
                           (typeof localStorage !== 'undefined' && localStorage.getItem('auth_flow') === 'signup') ||
                           (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('auth_is_signup') === 'true') ||
                           (typeof localStorage !== 'undefined' && localStorage.getItem('auth_is_signup') === 'true');

      let targetAuthFlow = isSignupPage ? 'signup' : 'login';

      if (typeof returnUrlOrOptions === 'string') {
        targetReturnUrl = returnUrlOrOptions;
        if (maybeOptions && typeof maybeOptions === 'object') {
          if (maybeOptions.authIntent) targetAuthIntent = maybeOptions.authIntent;
          else if (maybeOptions.auth_intent) targetAuthIntent = maybeOptions.auth_intent;
          if (maybeOptions.flow) targetAuthFlow = maybeOptions.flow;
          else if (maybeOptions.authFlow || maybeOptions.auth_flow) targetAuthFlow = maybeOptions.authFlow || maybeOptions.auth_flow;
        }
      } else if (returnUrlOrOptions && typeof returnUrlOrOptions === 'object') {
        targetReturnUrl = returnUrlOrOptions.returnUrl || returnUrlOrOptions.redirectTo || null;
        targetAuthIntent = returnUrlOrOptions.authIntent || returnUrlOrOptions.auth_intent || 'user';
        if (returnUrlOrOptions.flow) targetAuthFlow = returnUrlOrOptions.flow;
        else if (returnUrlOrOptions.authFlow || returnUrlOrOptions.auth_flow) targetAuthFlow = returnUrlOrOptions.authFlow || returnUrlOrOptions.auth_flow;
      }

      // Normalize auth_intent & auth_flow
      targetAuthIntent = String(targetAuthIntent).toLowerCase().trim() === 'artisan' ? 'artisan' : 'user';
      targetAuthFlow = String(targetAuthFlow).toLowerCase().trim() === 'signup' ? 'signup' : 'login';

      // Fallback intent inference: if returnUrl points to artisan route, ensure intent is artisan
      if (targetAuthIntent !== 'artisan' && targetReturnUrl && targetReturnUrl.startsWith('/artisan')) {
        targetAuthIntent = 'artisan';
      }

      // Section 3: Store explicit login portal intent in sessionStorage so it survives the OAuth redirect loop
      sessionStorage.setItem('auth_intent', targetAuthIntent);
      sessionStorage.setItem('auth_flow', targetAuthFlow);
      localStorage.setItem('auth_flow', targetAuthFlow);
      if (targetAuthFlow === 'signup') {
        sessionStorage.setItem('auth_is_signup', 'true');
        localStorage.setItem('auth_is_signup', 'true');
      } else {
        sessionStorage.removeItem('auth_is_signup');
        localStorage.removeItem('auth_is_signup');
      }

      // Preserve returnUrl in sessionStorage for clean role/destination navigation upon OAuth return
      if (targetReturnUrl && typeof targetReturnUrl === 'string') {
        sessionStorage.setItem('auth_return_url', targetReturnUrl);
      }

      // Requirement 8 & Section 19: Clear stale application credentials while strictly preserving auth_intent
      sessionStorage.setItem('oauth_in_flight', 'true');
      localStorage.removeItem('sh_token');
      localStorage.removeItem('sh_user');
      setUser(null);
      setOauthError(null);
      setOauthProcessing(true);

      const redirectUrl = typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined;

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) {
        sessionStorage.removeItem('oauth_in_flight');
        sessionStorage.removeItem('auth_intent');
        sessionStorage.removeItem('auth_flow');
        localStorage.removeItem('auth_flow');
        sessionStorage.removeItem('auth_is_signup');
        localStorage.removeItem('auth_is_signup');
        setOauthProcessing(false);
        console.error('Supabase signInWithOAuth error:', error);
        const msg = (error.message || '').toLowerCase();
        if (msg.includes('provider is not enabled')) {
          throw new Error('Google sign-in is not enabled in Supabase Dashboard. Please enable the Google provider in Authentication → Providers.');
        } else if (msg.includes('network') || msg.includes('fetch')) {
          throw new Error('Unable to connect to Google authentication. Please check your internet connection.');
        }
        throw new Error(error.message || 'Failed to initialize Google Sign-In');
      }

      return data;
    } catch (err) {
      sessionStorage.removeItem('oauth_in_flight');
      sessionStorage.removeItem('auth_intent');
      sessionStorage.removeItem('auth_flow');
      localStorage.removeItem('auth_flow');
      sessionStorage.removeItem('auth_is_signup');
      localStorage.removeItem('auth_is_signup');
      setOauthProcessing(false);
      throw new Error(err.message || 'Something went wrong while initiating Google Sign-In.');
    }
  };

  // ─── Forgot Password ─────────────────────────────────────────
  const forgotPassword = async (email) => {
    const cleanEmail = (email || '').trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      throw new Error('Please enter a valid email address.');
    }

    const redirectUrl = typeof window !== 'undefined'
      ? `${window.location.origin}/reset-password`
      : 'http://localhost:3000/reset-password';

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: redirectUrl,
      });
      if (error) {
        console.warn('[forgotPassword] Supabase client notice, falling back to backend:', error.message);
        await authAPI.forgotPassword(cleanEmail);
      }
    } catch (_) {
      await authAPI.forgotPassword(cleanEmail);
    }
    return { success: true };
  };

  // ─── Reset Password ──────────────────────────────────────────
  const resetPassword = async (newPassword, explicitToken = null) => {
    if (!newPassword || newPassword.length < 6) {
      throw new Error('Password must be at least 6 characters long.');
    }

    if (!/[a-zA-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
      throw new Error('Password must contain at least one letter (a-z / A-Z) and at least one number (0-9).');
    }

    // 1. Resolve token from explicitToken or active session
    let token = explicitToken;
    if (!token) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        token = session?.access_token;
      } catch (_) {}
    }

    // 2. Update via Supabase client if session is active
    let sbSuccess = false;
    try {
      const { data, error: sbUpdateErr } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (!sbUpdateErr && data?.user) {
        sbSuccess = true;
      } else if (sbUpdateErr) {
        let msg = sbUpdateErr.message || '';
        if (msg.includes('abcdefghijklmnopqrstuvwxyz') || msg.toLowerCase().includes('password should contain at least one character of each')) {
          throw new Error('Password must contain at least one letter (a-z / A-Z) and at least one number (0-9).');
        }
      }
    } catch (sbErr) {
      if (sbErr.message && sbErr.message.includes('Password must contain')) {
        throw sbErr;
      }
      console.warn('[resetPassword] Supabase client updateUser notice:', sbErr.message);
    }

    // 3. Update via Backend Admin API with accessToken
    let backendSuccess = false;
    if (token) {
      try {
        const res = await authAPI.resetPassword({
          newPassword,
          accessToken: token,
        });
        if (res.data?.success) {
          backendSuccess = true;
        }
      } catch (backendErr) {
        console.warn('[resetPassword] Backend reset notice:', backendErr.response?.data || backendErr.message);
        const backendErrMsg = backendErr.response?.data?.error;
        if (backendErrMsg && !sbSuccess) {
          throw new Error(backendErrMsg);
        }
      }
    }

    if (!sbSuccess && !backendSuccess) {
      throw new Error('Password reset session has expired or is invalid. Please request a new reset link.');
    }

    try {
      await supabase.auth.signOut();
    } catch (_) {}
    localStorage.removeItem('sh_token');
    localStorage.removeItem('sh_user');
    setUser(null);

    return { success: true };
  };

  // ─── Logout ──────────────────────────────────────────────────
  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {}
    localStorage.removeItem('sh_token');
    localStorage.removeItem('sh_user');
    sessionStorage.removeItem('auth_return_url');
    sessionStorage.removeItem('oauth_in_flight');
    sessionStorage.removeItem('auth_intent');
    sessionStorage.removeItem('portal_notice');
    setUser(null);
    setOauthProcessing(false);
    setOauthError(null);
    toast.success('Signed out successfully');
  };

  const currentUser = user;
  const currentRole = normalizeRole(currentUser?.role);
  const isAdmin = currentRole === 'admin';
  const isArtisan = currentRole === 'artisan';
  const isAuthenticated = !!currentUser;

  return (
    <AuthContext.Provider value={{
      user: currentUser,
      loading,
      initializing,
      oauthProcessing,
      oauthError,
      login,
      signup,
      signInWithGoogle,
      cancelSignup,
      logout,
      sendOtp,
      verifyOtp,
      forgotPassword,
      resetPassword,
      isAdmin,
      isArtisan,
      isAuthenticated,
      refreshUser,
      setUser,
      normalizeRole,
      getRoleHome
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};

