import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { HiEye, HiEyeOff } from 'react-icons/hi';
import toast from 'react-hot-toast';

export default function ResetPassword() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [sessionChecking, setSessionChecking] = useState(true);
  const [hasValidSession, setHasValidSession] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const { resetPassword } = useAuth();
  const navigate = useNavigate();

  // Verify recovery session on mount
  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      try {
        // 1. Check if Supabase client already established session from URL tokens
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token && mounted) {
          setHasValidSession(true);
          setSessionChecking(false);
          return;
        }

        // 2. Check if recovery parameters are in URL hash
        if (typeof window !== 'undefined' && window.location.hash) {
          const hash = window.location.hash.substring(1);
          const params = new URLSearchParams(hash);
          const accessToken = params.get('access_token');
          const type = params.get('type');

          if (accessToken && (type === 'recovery' || type === 'invite' || type === 'signup')) {
            if (mounted) {
              setHasValidSession(true);
              setSessionChecking(false);
              return;
            }
          }
        }
      } catch (err) {
        console.warn('[ResetPassword] Session check notice:', err);
      }

      if (mounted) {
        // Wait briefly for Supabase onAuthStateChange in case URL is still being parsed
        setTimeout(async () => {
          if (!mounted) return;
          const { data: { session: retrySession } } = await supabase.auth.getSession();
          if (retrySession?.access_token) {
            setHasValidSession(true);
          } else {
            setHasValidSession(false);
          }
          setSessionChecking(false);
        }, 1200);
      }
    };

    checkSession();

    // Listen to Supabase auth events for PASSWORD_RECOVERY
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') && session && mounted) {
        setHasValidSession(true);
        setSessionChecking(false);
      }
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (!/[a-zA-Z]/.test(newPassword)) {
      setError('Password must contain at least one letter (a-z or A-Z).');
      return;
    }

    if (!/\d/.test(newPassword)) {
      setError('Password must contain at least one number (0-9).');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please verify your entries.');
      return;
    }

    setLoading(true);
    try {
      await resetPassword(newPassword);
      setSuccess(true);
      toast.success('Your password has been reset successfully! 🎉');
      setTimeout(() => {
        navigate('/login', { replace: true });
      }, 2500);
    } catch (err) {
      let errMsg = err.message || 'Failed to update password. Your reset link may have expired.';
      if (errMsg.includes('abcdefghijklmnopqrstuvwxyz') || errMsg.toLowerCase().includes('password should contain at least one character of each')) {
        errMsg = 'Password must contain at least one letter (a-z / A-Z) and at least one number (0-9).';
      }
      setError(errMsg);
      toast.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  // Live password policy checks
  const hasLength = newPassword.length >= 6;
  const hasLetter = /[a-zA-Z]/.test(newPassword);
  const hasNumber = /\d/.test(newPassword);
  const isPolicyMet = hasLength && hasLetter && hasNumber;

  // Password strength indicator helper (strictly requires letters and numbers)
  const getStrengthInfo = (pass) => {
    if (!pass) return { label: '', color: 'bg-dark-600', width: 'w-0' };
    const hasLen = pass.length >= 6;
    const hasLet = /[a-zA-Z]/.test(pass);
    const hasNum = /\d/.test(pass);

    if (!hasLen || !hasLet || !hasNum) {
      return { label: 'Missing letter or number', color: 'bg-amber-500', width: 'w-1/3' };
    }

    const hasSpecial = /[^A-Za-z0-9]/.test(pass);
    const hasUpper = /[A-Z]/.test(pass);
    const hasLower = /[a-z]/.test(pass);
    const score = (pass.length >= 8 ? 1 : 0) + (hasSpecial ? 1 : 0) + (hasUpper && hasLower ? 1 : 0);

    if (score >= 2) return { label: 'Strong', color: 'bg-emerald-500', width: 'w-full' };
    if (score >= 1) return { label: 'Good', color: 'bg-gold-500', width: 'w-3/4' };
    return { label: 'Fair', color: 'bg-emerald-400', width: 'w-1/2' };
  };

  const strength = getStrengthInfo(newPassword);

  if (sessionChecking) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center py-12 px-3 sm:px-6 lg:px-8">
        <div className="max-w-md w-full card p-8 sm:p-10 border border-dark-500 shadow-2xl text-center space-y-4">
          <div className="w-12 h-12 border-4 border-dark-600 border-t-gold-500 rounded-full animate-spin mx-auto mb-2" />
          <h3 className="text-xl font-serif font-bold text-white">Validating Reset Session...</h3>
          <p className="text-sm text-gray-400">
            Verifying your secure password recovery token...
          </p>
        </div>
      </div>
    );
  }

  if (!hasValidSession && !success) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center py-12 px-3 sm:px-6 lg:px-8">
        <div className="max-w-md w-full card p-8 sm:p-10 border border-red-500/30 shadow-2xl text-center space-y-6">
          <div className="w-16 h-16 bg-red-500/20 text-red-400 rounded-full flex items-center justify-center text-3xl mx-auto">
            ⚠️
          </div>
          <div>
            <h2 className="text-2xl font-serif font-bold text-white">Invalid or Expired Link</h2>
            <p className="text-gray-400 text-sm mt-2 leading-relaxed">
              This password recovery link is either invalid, has expired, or has already been used to change your password.
            </p>
          </div>
          <div className="flex flex-col gap-3 pt-2">
            <Link to="/forgot-password" className="btn-primary w-full text-center block">
              Request a New Reset Link →
            </Link>
            <Link to="/login" className="btn-secondary w-full text-center block">
              Return to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12 px-3 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-6 card p-6 sm:p-10 border border-dark-500 shadow-2xl">
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
            Set New Password
          </h2>
          <p className="mt-2 text-sm text-gray-400">
            Choose a strong password to protect your KalaStyle AI account
          </p>
        </div>

        {success ? (
          <div className="space-y-6 text-center">
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-5 space-y-3">
              <div className="text-4xl">✨</div>
              <h3 className="text-emerald-400 font-semibold text-lg">Password Changed!</h3>
              <p className="text-xs text-gray-300 leading-relaxed">
                Your password has been successfully updated. Redirecting you to the sign-in page...
              </p>
            </div>
            <Link to="/login" className="btn-primary w-full block text-center">
              Sign In Now →
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* New Password */}
            <div>
              <label
                htmlFor="new-password"
                className="block text-xs font-medium text-gray-300 mb-1.5 uppercase tracking-wider"
              >
                New Password
              </label>
              <div className="relative">
                <input
                  id="new-password"
                  name="new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  required
                  autoFocus
                  className="input-field pr-10"
                  placeholder="At least 6 characters"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    if (error) setError('');
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-white"
                  aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                >
                  {showNewPassword ? <HiEyeOff className="w-5 h-5" /> : <HiEye className="w-5 h-5" />}
                </button>
              </div>

              {/* Password strength bar */}
              {newPassword && (
                <div className="mt-2">
                  <div className="w-full bg-dark-700 h-1.5 rounded-full overflow-hidden">
                    <div className={`h-full transition-all duration-300 ${strength.color} ${strength.width}`} />
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-gray-400 mt-1">
                    <span>Strength: <span className="font-semibold text-white">{strength.label}</span></span>
                    <span>Min 6 characters</span>
                  </div>

                  {/* Requirements Live Checklist */}
                  <div className="mt-2.5 p-2.5 bg-dark-900/90 rounded-lg border border-dark-600/60 text-[11px] grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                    <div className={`flex items-center gap-1.5 ${hasLength ? 'text-emerald-400 font-medium' : 'text-gray-400'}`}>
                      <span>{hasLength ? '✓' : '○'}</span>
                      <span>Min 6 characters</span>
                    </div>
                    <div className={`flex items-center gap-1.5 ${hasLetter ? 'text-emerald-400 font-medium' : 'text-gray-400'}`}>
                      <span>{hasLetter ? '✓' : '○'}</span>
                      <span>At least 1 letter</span>
                    </div>
                    <div className={`flex items-center gap-1.5 ${hasNumber ? 'text-emerald-400 font-medium' : 'text-gray-400'}`}>
                      <span>{hasNumber ? '✓' : '○'}</span>
                      <span>At least 1 number</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label
                htmlFor="confirm-password"
                className="block text-xs font-medium text-gray-300 mb-1.5 uppercase tracking-wider"
              >
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  id="confirm-password"
                  name="confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  className="input-field pr-10"
                  placeholder="Re-enter your new password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (error) setError('');
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-white"
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <HiEyeOff className="w-5 h-5" /> : <HiEye className="w-5 h-5" />}
                </button>
              </div>
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="mt-1 text-[11px] text-red-400">
                  ⚠️ Passwords do not match
                </p>
              )}
            </div>

            {error && (
              <p className="text-xs text-red-400 flex items-center gap-1">
                ⚠️ {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !newPassword || !confirmPassword || newPassword !== confirmPassword || !isPolicyMet}
              className="w-full btn-primary flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-dark-900 border-t-transparent rounded-full animate-spin" />
                  <span>Updating Password...</span>
                </>
              ) : (
                <span>Update Password & Sign In →</span>
              )}
            </button>

            <div className="text-center pt-3 border-t border-dark-600/50">
              <Link
                to="/login"
                className="text-xs text-gold-400 hover:text-gold-300 font-medium hover:underline inline-flex items-center gap-1"
              >
                ← Back to Login
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
