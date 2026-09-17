import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '../services/api';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('sh_user');
      const token = localStorage.getItem('sh_token');
      if (stored && token) {
        const parsed = JSON.parse(stored);
        if (parsed.role) parsed.role = parsed.role.trim().toLowerCase();
        return parsed;
      }
    } catch (e) {}
    return null;
  });
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem('sh_token');
    if (!token) {
      // Check if active Supabase session exists
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token && session?.user?.email) {
          const { data } = await authAPI.otpSession({
            accessToken: session.access_token,
            email: session.user.email,
            supabase_uid: session.user.id
          });
          if (data?.user && data?.token) {
            const normalized = { ...data.user, role: (data.user.role || 'user').trim().toLowerCase() };
            setUser(normalized);
            localStorage.setItem('sh_token', data.token);
            localStorage.setItem('sh_user', JSON.stringify(normalized));
            return normalized;
          }
        }
      } catch (e) {}
      return null;
    }

    try {
      const { data } = await authAPI.me();
      if (data) {
        const normalized = { ...data, role: (data.role || 'user').trim().toLowerCase() };
        setUser(normalized);
        localStorage.setItem('sh_user', JSON.stringify(normalized));
        return normalized;
      }
    } catch (err) {
      if (err.response?.status === 401) {
        localStorage.removeItem('sh_token');
        localStorage.removeItem('sh_user');
        setUser(null);
      }
    }
    return null;
  }, []);

  // Auto-sync session on mount with database
  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
  }, [refreshUser]);

  // Single global Supabase auth state listener (no duplicates)
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        localStorage.removeItem('sh_token');
        localStorage.removeItem('sh_user');
        setUser(null);
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        const currentToken = localStorage.getItem('sh_token');
        if (session && !currentToken) {
          try {
            const { data } = await authAPI.otpSession({
              accessToken: session.access_token,
              email: session.user?.email,
              supabase_uid: session.user?.id
            });
            if (data?.user && data?.token) {
              const normalized = { ...data.user, role: (data.user.role || 'user').trim().toLowerCase() };
              localStorage.setItem('sh_token', data.token);
              localStorage.setItem('sh_user', JSON.stringify(normalized));
              setUser(normalized);
            }
          } catch (e) {
            console.warn('Silent OTP session sync error:', e?.message || e);
          }
        }
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

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
  const sendOtp = async (email) => {
    const cleanEmail = (email || '').trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      throw new Error('Please enter a valid email address.');
    }

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          shouldCreateUser: true,
        },
      });

      if (error) {
        console.error('Supabase signInWithOtp error:', error);
        const msg = (error.message || '').toLowerCase();
        if (error.status === 429 || msg.includes('rate') || msg.includes('limit') || msg.includes('over_email_send_rate_limit')) {
          throw new Error('Too many OTP requests. Please wait before requesting another code.');
        } else if (msg.includes('network') || msg.includes('fetch') || msg.includes('failed to fetch')) {
          throw new Error('Unable to connect. Please check your internet connection and try again.');
        } else if (msg.includes('error sending confirmation email') || msg.includes('confirmation email') || error.status === 500) {
          throw new Error('Email delivery failed: Supabase SMTP server error. Please save Brevo SMTP settings in Supabase Dashboard.');
        } else {
          throw new Error(error.message || 'Something went wrong. Please try again.');
        }
      }

      return { success: true };
    } catch (err) {
      // Pass along friendly error message without leaking internal details
      throw new Error(err.message || 'Something went wrong. Please try again.');
    }
  };

  // ─── Supabase Email OTP: Verify OTP ───────────────────────────
  const verifyOtp = async (email, otpToken, syncSession = true) => {
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanToken = (otpToken || '').trim();

    if (!cleanEmail || cleanToken.length < 6 || cleanToken.length > 10) {
      throw new Error('The OTP is incorrect. Please try again.');
    }

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token: cleanToken,
        type: 'email',
      });

      if (error) {
        const msg = (error.message || '').toLowerCase();
        if (msg.includes('expired')) {
          throw new Error('This OTP has expired. Please request a new OTP.');
        } else if (msg.includes('invalid') || msg.includes('token') || msg.includes('incorrect') || msg.includes('wrong')) {
          throw new Error('The OTP is incorrect. Please try again.');
        } else if (error.status === 429 || msg.includes('too many') || msg.includes('attempts')) {
          throw new Error('Too many attempts. Please wait and try again later.');
        } else if (msg.includes('network') || msg.includes('fetch') || msg.includes('connection')) {
          throw new Error('Unable to connect. Please check your internet connection and try again.');
        } else {
          throw new Error('Something went wrong. Please try again.');
        }
      }

      // If called during Signup flow, do not sync session yet; signup() will register full profile
      if (!syncSession) {
        return { success: true, data };
      }

      const session = data?.session;
      const sbUser = data?.user;

      // Sync verified Supabase user into database profile & obtain app token
      const syncRes = await authAPI.otpSession({
        accessToken: session?.access_token,
        email: cleanEmail,
        supabase_uid: sbUser?.id,
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
  const login = async (phone, password) => {
    try {
      const { data } = await authAPI.login({ phone, password });
      const normalizedUser = {
        ...data.user,
        role: (data.user?.role || 'user').trim().toLowerCase(),
      };
      localStorage.setItem('sh_token', data.token);
      localStorage.setItem('sh_user', JSON.stringify(normalizedUser));
      setUser(normalizedUser);
      toast.success(`Welcome back, ${normalizedUser.name}! 👑`);
      return normalizedUser;
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message || 'Failed to log in';
      throw new Error(errMsg);
    }
  };

  // ─── Signup ──────────────────────────────────────────────────
  const signup = async (name, phone, password, role = 'user', store_name, artisan_type, email) => {
    try {
      const { data } = await authAPI.signup({ name, phone, password, role, store_name, artisan_type, email });
      const normalizedUser = {
        ...data.user,
        role: (data.user?.role || 'user').trim().toLowerCase(),
      };
      localStorage.setItem('sh_token', data.token);
      localStorage.setItem('sh_user', JSON.stringify(normalizedUser));
      setUser(normalizedUser);
      toast.success('Account created! Welcome to KalaStyle AI ✨');
      return normalizedUser;
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message || 'Failed to create account';
      throw new Error(errMsg);
    }
  };

  // ─── Logout ──────────────────────────────────────────────────
  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {}
    localStorage.removeItem('sh_token');
    localStorage.removeItem('sh_user');
    setUser(null);
    toast.success('Signed out successfully');
  };

  const getStoredUser = () => {
    try {
      const stored = localStorage.getItem('sh_user');
      const token = localStorage.getItem('sh_token');
      if (stored && token) {
        const parsed = JSON.parse(stored);
        if (parsed.role) parsed.role = parsed.role.trim().toLowerCase();
        return parsed;
      }
    } catch (e) {}
    return null;
  };

  const currentUser = user || getStoredUser();
  const currentRole = (currentUser?.role || '').trim().toLowerCase();
  const isAdmin = currentRole === 'admin';
  const isArtisan = currentRole === 'artisan';
  const isAuthenticated = !!currentUser;

  return (
    <AuthContext.Provider value={{
      user: currentUser,
      loading,
      login,
      signup,
      logout,
      sendOtp,
      verifyOtp,
      isAdmin,
      isArtisan,
      isAuthenticated,
      refreshUser,
      setUser
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

