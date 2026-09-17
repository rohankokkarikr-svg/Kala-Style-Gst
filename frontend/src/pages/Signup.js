import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function Signup() {
  const [role, setRole] = useState('user');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [storeName, setStoreName] = useState('');
  const [artisanType, setArtisanType] = useState('Weaver');
  const [loading, setLoading] = useState(false);
  const { signup } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length !== 10) { toast.error('Please enter a valid 10-digit mobile number'); return; }
    if (password.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    if (role === 'artisan' && !storeName.trim()) { toast.error('Please enter your store name'); return; }
    setLoading(true);
    try {
      await signup(name, cleanPhone, password, role, storeName || name, artisanType);
      navigate(role === 'artisan' ? '/artisan' : '/');
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Failed to create account');
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
          <h2 className="text-center text-3xl font-serif font-bold text-white">Join KalaStyle AI</h2>
          <p className="mt-2 text-center text-sm text-gray-400">
            Create your <span className="gold-text font-medium">KalaStyle AI</span> account
          </p>
        </div>

        {/* Role Toggle */}
        <div className="flex rounded-lg overflow-hidden border border-dark-400">
          <button type="button" onClick={() => setRole('user')}
            className={"flex-1 py-2.5 text-sm font-medium transition-all " + (role === 'user' ? 'bg-gold-500 text-dark-900' : 'bg-dark-700 text-gray-400 hover:text-white')}>
            🛍️ I'm a Customer
          </button>
          <button type="button" onClick={() => setRole('artisan')}
            className={"flex-1 py-2.5 text-sm font-medium transition-all " + (role === 'artisan' ? 'bg-gold-500 text-dark-900' : 'bg-dark-700 text-gray-400 hover:text-white')}>
            🎨 I'm an Artisan
          </button>
        </div>

        {role === 'artisan' && (
          <div className="bg-gold-500/10 border border-gold-500/20 rounded-lg p-3 text-sm text-gold-400">
            🌟 <strong>Artisan Benefits:</strong> Access AI Product Studio, list handmade crafts, and reach customers across India!
          </div>
        )}

        {role === 'user' && (
          <Link
            to="/login"
            className="flex items-center justify-between p-3 rounded-lg bg-gold-500/10 border border-gold-500/30 text-gold-400 text-xs sm:text-sm hover:bg-gold-500/20 transition-all"
          >
            <span className="flex items-center gap-1.5 font-medium">
              ✉️ Prefer 1-Click Free Email OTP login?
            </span>
            <span className="font-bold underline">Continue →</span>
          </Link>
        )}

        <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <input id="signup-name" name="name" type="text" required className="input-field" placeholder="Full Name"
              value={name} onChange={(e) => setName(e.target.value)} />
            <input id="signup-phone" name="phone" type="tel" maxLength="10" required className="input-field"
              placeholder="Phone Number (10 digits)" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} />
            <input id="signup-password" name="password" type="password" required className="input-field"
              placeholder="Password (min 6 characters)" value={password} onChange={(e) => setPassword(e.target.value)} />

            {role === 'artisan' && (
              <>
                <input id="store-name" name="store_name" type="text" required className="input-field"
                  placeholder="Your Store / Shop Name (e.g. Lakshmi Handlooms)"
                  value={storeName} onChange={(e) => setStoreName(e.target.value)} />
                <select id="artisan-type" value={artisanType} onChange={(e) => setArtisanType(e.target.value)} className="input-field">
                  <option value="Weaver">Weaver / Handloom</option>
                  <option value="Tailor">Tailor / Clothing Maker</option>
                  <option value="Jewelry Maker">Jewelry Maker</option>
                  <option value="Embroidery Artist">Embroidery Artist</option>
                  <option value="Bag Maker">Bag Maker</option>
                  <option value="General">General Artisan</option>
                </select>
              </>
            )}
          </div>

          <button type="submit" disabled={loading} className="w-full btn-primary">
            {loading ? 'Creating...' : role === 'artisan' ? '🎨 Create Artisan Account' : 'Create Account'}
          </button>
        </form>

        <div className="text-center text-sm text-gray-400 mt-4">
          Already have an account?{' '}
          <Link to="/login" className="text-gold-400 hover:text-gold-300 font-medium">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
