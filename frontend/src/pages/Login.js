import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function Login() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
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

    setLoading(true);
    try {
      const user = await login(valueToSubmit, password);
      const role = (user?.role || '').trim().toLowerCase();
      if (role === 'admin') {
        navigate('/admin', { replace: true });
      } else if (role === 'artisan') {
        navigate('/artisan', { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Failed to log in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 card p-8">
        <div>
          <div className="flex justify-center mb-4">
            <img
              src="/images/kalastyle_logo.png"
              alt="KalaStyle AI"
              className="h-16 w-16 object-cover rounded-full ring-2 ring-gold-500/80 shadow-gold"
            />
          </div>
          <h2 className="text-center text-3xl font-serif font-bold text-white">
            Welcome Back
          </h2>
          <p className="mt-2 text-center text-sm text-gray-400">
            Sign in to your <span className="gold-text font-medium">KalaStyle AI</span> account
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="phone" className="sr-only">Phone Number or Email</label>
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
              <label htmlFor="password" className="sr-only">Password</label>
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
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </div>
        </form>
        
        <div className="text-center text-sm text-gray-400 mt-4">
          Don't have an account?{' '}
          <Link to="/signup" className="text-gold-400 hover:text-gold-300 font-medium">
            Create one
          </Link>
        </div>
      </div>
    </div>
  );
}
