import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const { forgotPassword } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    try {
      await forgotPassword(cleanEmail);
      setSubmitted(true);
      toast.success('Password recovery instructions sent! 📩');
    } catch (err) {
      const errMsg = err.message || 'Unable to request password reset. Please try again.';
      setError(errMsg);
      toast.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

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
            Reset Your Password
          </h2>
          <p className="mt-2 text-sm text-gray-400">
            {submitted
              ? 'Check your inbox for password recovery instructions'
              : 'Enter your registered email address to receive a secure recovery link'}
          </p>
        </div>

        {submitted ? (
          <div className="space-y-6">
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-center space-y-2">
              <div className="text-3xl">📨</div>
              <h3 className="text-emerald-400 font-semibold text-sm">Recovery Link Dispatched</h3>
              <p className="text-xs text-gray-300 leading-relaxed">
                If an account with <span className="text-gold-400 font-medium">{email}</span> exists,
                we have sent a password reset link to your email.
              </p>
              <p className="text-[11px] text-gray-400">
                Please check your inbox and spam folder. The recovery link will expire shortly for security.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => {
                  setSubmitted(false);
                  setEmail('');
                }}
                className="btn-secondary w-full text-center text-xs"
              >
                ← Request with another email
              </button>

              <Link
                to="/login"
                className="btn-primary w-full text-center block"
              >
                Return to Login
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="forgot-email"
                className="block text-xs font-medium text-gray-300 mb-1.5 uppercase tracking-wider"
              >
                Registered Email Address
              </label>
              <input
                id="forgot-email"
                name="email"
                type="email"
                required
                autoFocus
                autoComplete="email"
                className="input-field"
                placeholder="Enter your registered email (e.g. name@gmail.com)"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError('');
                }}
              />
              {error && (
                <p className="mt-2 text-xs text-red-400 flex items-center gap-1">
                  ⚠️ {error}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full btn-primary flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-dark-900 border-t-transparent rounded-full animate-spin" />
                  <span>Sending Recovery Link...</span>
                </>
              ) : (
                <span>Send Password Reset Link →</span>
              )}
            </button>

            <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500 pt-1">
              <span className="text-emerald-400">🔒</span>
              <span>Encrypted one-time recovery verification via Supabase Auth</span>
            </div>

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
