import React, { useState, useEffect } from 'react';
import { 
  HiTag, 
  HiSave, 
  HiTrash, 
  HiPencil, 
  HiCheckCircle, 
  HiXCircle, 
  HiUsers, 
  HiSearch, 
  HiCheck, 
  HiX, 
  HiSparkles
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import { useSettings, DEFAULT_DISCOUNT_BANNER } from '../../context/SettingsContext';
import { adminAPI } from '../../services/api';

export default function DiscountBanner() {
  const { settings, updateSettings } = useSettings();
  const [banner, setBanner] = useState(DEFAULT_DISCOUNT_BANNER);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [manualEmailInput, setManualEmailInput] = useState('');

  // Sync settings when loaded
  useEffect(() => {
    if (settings?.discountBanner) {
      const b = settings.discountBanner;
      const isAct = b.isActive !== undefined ? Boolean(b.isActive) : (b.is_active !== undefined ? Boolean(b.is_active) : true);
      setBanner({
        ...DEFAULT_DISCOUNT_BANNER,
        ...b,
        isActive: isAct,
        is_active: isAct,
        targetAudience: b.targetAudience || b.target_audience || 'all',
        selectedUserEmails: Array.isArray(b.selectedUserEmails) 
          ? b.selectedUserEmails 
          : (Array.isArray(b.selected_user_emails) ? b.selected_user_emails : [])
      });
    }
  }, [settings?.discountBanner]);

  // Load customer accounts for targeted promotion selection
  useEffect(() => {
    adminAPI.getCustomers()
      .then(({ data }) => {
        if (Array.isArray(data)) setCustomers(data);
      })
      .catch(() => {});
  }, []);

  const isBannerActive = banner.isActive !== undefined ? Boolean(banner.isActive) : Boolean(banner.is_active);

  // Fast single-click toggle for Active / Inactive
  const handleToggleActive = async () => {
    const nextStatus = !isBannerActive;
    const updatedBanner = {
      ...banner,
      isActive: nextStatus,
      is_active: nextStatus
    };
    setBanner(updatedBanner);
    setLoading(true);
    try {
      await updateSettings({ discountBanner: updatedBanner });
      toast.success(
        nextStatus 
          ? 'Discount banner activated and visible on live website! 🟢' 
          : 'Discount banner deactivated and hidden from shoppers! 🔴'
      );
    } catch (err) {
      console.error('Failed to toggle banner status:', err);
      toast.error('Failed to update banner status');
      // Revert on error
      setBanner(banner);
    } finally {
      setLoading(false);
    }
  };

  const saveBanner = async () => {
    if (!banner.code?.trim()) {
      toast.error('Discount Code is required');
      return;
    }
    setLoading(true);
    try {
      const codeUpper = banner.code.trim().toUpperCase();
      const pct = Number(banner.discountPercentage) || 30;
      const isAct = banner.isActive !== undefined ? Boolean(banner.isActive) : Boolean(banner.is_active);

      const payload = {
        ...banner,
        code: codeUpper,
        discountPercentage: pct,
        discount: `${pct}%`,
        isActive: isAct,
        is_active: isAct,
        targetAudience: banner.targetAudience || 'all',
        selectedUserEmails: Array.isArray(banner.selectedUserEmails) ? banner.selectedUserEmails : []
      };

      await updateSettings({ discountBanner: payload });
      setBanner(payload);
      toast.success('Discount banner & promo code updated and synced across all devices! ✨');
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to save discount banner:', err);
      toast.error('Failed to save discount banner to server.');
    } finally {
      setLoading(false);
    }
  };

  const deleteBanner = async () => {
    if (window.confirm('Are you sure you want to deactivate and disable the discount banner on all devices?')) {
      const disabledBanner = { ...banner, isActive: false, is_active: false };
      setLoading(true);
      try {
        await updateSettings({ discountBanner: disabledBanner });
        setBanner(disabledBanner);
        toast.success('Discount banner deactivated across all devices');
      } catch (err) {
        toast.error('Failed to disable discount banner on server');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleChange = (field, value) => {
    setBanner((prev) => ({ ...prev, [field]: value }));
  };

  // Auto update description helper when discount percentage is changed
  const handleAutoUpdateDescription = (pct) => {
    handleChange('discountPercentage', pct);
    handleChange('description', `Use this code and get upto ${pct}% off on handmade products`);
  };

  // Toggle user email in selectedUserEmails array
  const toggleUserEmail = (email) => {
    if (!email) return;
    const lower = email.toLowerCase().trim();
    const current = Array.isArray(banner.selectedUserEmails) ? [...banner.selectedUserEmails] : [];
    const idx = current.findIndex(e => e.toLowerCase() === lower);
    if (idx > -1) {
      current.splice(idx, 1);
    } else {
      current.push(lower);
    }
    handleChange('selectedUserEmails', current);
  };

  // Add manual email to selected list
  const handleAddManualEmail = (e) => {
    e.preventDefault();
    const trimmed = manualEmailInput.trim().toLowerCase();
    if (!trimmed) return;
    const emailsToAdd = trimmed.split(/[\s,]+/).filter(Boolean);
    const current = Array.isArray(banner.selectedUserEmails) ? [...banner.selectedUserEmails] : [];
    
    emailsToAdd.forEach(em => {
      if (!current.includes(em)) current.push(em);
    });

    handleChange('selectedUserEmails', current);
    setManualEmailInput('');
    toast.success(`Added ${emailsToAdd.length} user email(s)`);
  };

  const filteredCustomers = customers.filter(c => {
    if (!customerSearch) return true;
    const s = customerSearch.toLowerCase();
    return (c.name || '').toLowerCase().includes(s) || (c.email || '').toLowerCase().includes(s);
  });

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-white flex items-center gap-2">
            <HiTag className="w-6 h-6 text-gold-400" /> Discount Banner & Promotion Engine
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Configure storefront promotional banner, promo codes, discount percentages, and user targeting.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="btn-primary inline-flex items-center gap-2 text-xs py-2.5 px-4 shadow-md"
            >
              <HiPencil className="w-4 h-4" />
              Edit Promotion
            </button>
          )}
          {isBannerActive && (
            <button
              onClick={deleteBanner}
              className="btn-secondary text-xs py-2.5 px-3 text-red-400 hover:text-red-300 inline-flex items-center gap-1.5"
            >
              <HiTrash className="w-4 h-4" />
              Deactivate
            </button>
          )}
        </div>
      </div>

      {/* 🔴 / 🟢 Instant Active / Deactive Status Control Card */}
      <div className={`card p-5 border transition-all duration-300 ${
        isBannerActive 
          ? 'bg-gradient-to-r from-dark-900 via-dark-850 to-dark-900 border-green-500/40 shadow-lg shadow-green-950/20' 
          : 'bg-gradient-to-r from-dark-900 via-dark-850 to-dark-900 border-red-500/40 shadow-lg shadow-red-950/20'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className={`p-3 rounded-2xl ${
              isBannerActive ? 'bg-green-500/10 text-green-400 border border-green-500/30' : 'bg-red-500/10 text-red-400 border border-red-500/30'
            }`}>
              {isBannerActive ? <HiCheckCircle className="w-6 h-6 animate-pulse" /> : <HiXCircle className="w-6 h-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-serif font-bold text-white">
                  Discount Banner Status: {isBannerActive ? 'Active on Storefront' : 'Deactivated'}
                </h3>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  isBannerActive ? 'bg-green-500/20 text-green-300 border border-green-500/40' : 'bg-red-500/20 text-red-300 border border-red-500/40'
                }`}>
                  {isBannerActive ? '● LIVE TO SHOPPERS' : '○ HIDDEN / DISABLED'}
                </span>
              </div>
              <p className="text-gray-400 text-xs mt-1">
                {isBannerActive 
                  ? `Banner is actively visible on the homepage and code "${banner.code || 'KALA30'}" is valid for checkout.`
                  : 'Banner is completely hidden from visitors and promotional code cannot be redeemed.'}
              </p>
            </div>
          </div>

          <button
            onClick={handleToggleActive}
            disabled={loading}
            className={`btn px-5 py-2.5 text-xs font-bold rounded-xl transition-all shadow-md self-start sm:self-auto flex items-center gap-2 ${
              isBannerActive 
                ? 'bg-red-600 hover:bg-red-700 text-white' 
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            {isBannerActive ? 'Deactivate Banner' : 'Activate Banner'}
          </button>
        </div>
      </div>

      {/* 🌟 Live Storefront Preview */}
      <div className="card p-6 border border-dark-600 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-serif font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <HiSparkles className="w-4 h-4 text-gold-400" /> Live Storefront Preview (How Shoppers See It)
          </h2>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-400">Target Audience:</span>
            <span className="px-2 py-0.5 rounded bg-dark-700 border border-dark-600 text-gold-400 font-semibold uppercase text-[10px]">
              {banner.targetAudience === 'all' && '👥 All Visitors'}
              {banner.targetAudience === 'logged_in' && '🔐 Logged-in Users Only'}
              {banner.targetAudience === 'new_users' && '🌟 New Customers Only'}
              {banner.targetAudience === 'specific' && `🎯 Selected Users (${(banner.selectedUserEmails || []).length})`}
            </span>
          </div>
        </div>

        {isBannerActive ? (
          <div className="bg-gradient-to-r from-dark-800 via-dark-700 to-dark-800 border-y border-dark-600 rounded-2xl overflow-hidden shadow-xl p-4 sm:p-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <div className="bg-gold-500/10 p-2.5 rounded-xl border border-gold-500/20">
                  <HiTag className="w-6 h-6 text-gold-400" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-gold-400 font-semibold text-sm uppercase tracking-wide">
                      {banner.title || 'Artisan Launch Sale'}
                    </p>
                    {banner.code && (
                      <div className="flex items-center gap-1.5 bg-gold-500/20 border border-gold-500/40 px-2.5 py-0.5 rounded-full">
                        <span className="text-gold-300 text-xs font-mono font-bold uppercase tracking-widest">
                          CODE: {banner.code}
                        </span>
                      </div>
                    )}
                    <span className="px-2 py-0.5 rounded-full bg-green-500/20 border border-green-500/30 text-green-300 text-[10px] font-bold">
                      {banner.discountPercentage || 30}% OFF
                    </span>
                  </div>
                  <p className="text-white text-base sm:text-xl font-serif font-bold mt-1">
                    {banner.description || `Use this code and get upto ${banner.discountPercentage || 30}% off on handmade products`}
                  </p>
                </div>
              </div>
              <div className="shrink-0 btn-primary inline-flex items-center gap-2 text-xs sm:text-sm px-6 py-2.5 shadow-md">
                {banner.buttonText || 'Grab the Deal'} →
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-dark-900 border border-dark-700 rounded-2xl p-8 text-center space-y-2">
            <HiXCircle className="w-8 h-8 text-gray-500 mx-auto" />
            <p className="text-gray-300 text-sm font-semibold">Promotion is currently deactivated</p>
            <p className="text-gray-500 text-xs max-w-md mx-auto">
              The discount banner will not be rendered on the website homepage and customers will not be able to redeem this code until activated.
            </p>
          </div>
        )}
      </div>

      {/* 🛠️ Edit Promotion Form */}
      {isEditing && (
        <div className="card p-6 border border-gold-500/40 shadow-2xl space-y-6">
          <div className="flex justify-between items-center border-b border-dark-600 pb-3">
            <h2 className="text-lg font-serif font-bold text-white flex items-center gap-2">
              <HiPencil className="w-5 h-5 text-gold-400" /> Edit Promotion Details & Target Audience
            </h2>
            <button
              onClick={() => setIsEditing(false)}
              className="text-gray-400 hover:text-white"
            >
              <HiX className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
            {/* Title */}
            <div>
              <label className="block text-gray-300 font-semibold mb-1">
                Banner Headline / Badge Title *
              </label>
              <input
                type="text"
                value={banner.title}
                onChange={(e) => handleChange('title', e.target.value)}
                className="w-full bg-dark-700 border border-dark-500 rounded-lg p-2.5 text-white focus:outline-none focus:border-gold-500"
                placeholder="e.g. Festive Artisan Sale"
                required
              />
            </div>

            {/* Code */}
            <div>
              <label className="block text-gray-300 font-semibold mb-1">
                Promotional Coupon Code * (Automatically Uppercased)
              </label>
              <input
                type="text"
                value={banner.code}
                onChange={(e) => handleChange('code', e.target.value.toUpperCase())}
                className="w-full bg-dark-700 border border-dark-500 rounded-lg p-2.5 text-white focus:outline-none focus:border-gold-500 font-mono font-bold tracking-wider"
                placeholder="e.g. KALA30 or FESTIVE25"
                required
              />
              <p className="text-[10px] text-gold-400 mt-1">
                This exact code is recognized by the Checkout coupon engine.
              </p>
            </div>

            {/* Discount Percentage */}
            <div>
              <label className="block text-gray-300 font-semibold mb-1">
                Discount Percentage (%) *
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="1"
                  max="90"
                  value={banner.discountPercentage || ''}
                  onChange={(e) => handleAutoUpdateDescription(parseInt(e.target.value) || 0)}
                  className="w-full bg-dark-700 border border-dark-500 rounded-lg p-2.5 text-white focus:outline-none focus:border-gold-500 font-bold"
                  placeholder="30"
                  required
                />
                <div className="flex gap-1">
                  {[10, 20, 25, 30, 40, 50].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => handleAutoUpdateDescription(num)}
                      className={`px-2.5 py-1 rounded text-[11px] font-bold border transition-colors ${
                        banner.discountPercentage === num
                          ? 'bg-gold-500 text-dark-900 border-gold-400'
                          : 'bg-dark-750 text-gray-300 border-dark-600 hover:border-gold-500'
                      }`}
                    >
                      {num}%
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-gray-300 font-semibold mb-1">
                Banner Description Text
              </label>
              <input
                type="text"
                value={banner.description}
                onChange={(e) => handleChange('description', e.target.value)}
                className="w-full bg-dark-700 border border-dark-500 rounded-lg p-2.5 text-white focus:outline-none focus:border-gold-500"
                placeholder="e.g. Use this code and get upto 30% off on handmade products"
              />
            </div>

            {/* Button Text */}
            <div>
              <label className="block text-gray-300 font-semibold mb-1">
                Button Call-to-Action Text
              </label>
              <input
                type="text"
                value={banner.buttonText}
                onChange={(e) => handleChange('buttonText', e.target.value)}
                className="w-full bg-dark-700 border border-dark-500 rounded-lg p-2.5 text-white focus:outline-none focus:border-gold-500"
                placeholder="Grab the Deal"
              />
            </div>

            {/* Button Link */}
            <div>
              <label className="block text-gray-300 font-semibold mb-1">
                Button Destination Link
              </label>
              <input
                type="text"
                value={banner.buttonLink}
                onChange={(e) => handleChange('buttonLink', e.target.value)}
                className="w-full bg-dark-700 border border-dark-500 rounded-lg p-2.5 text-white focus:outline-none focus:border-gold-500"
                placeholder="/products"
              />
            </div>
          </div>

          {/* 🎯 Target Audience Selection */}
          <div className="p-4 rounded-xl bg-dark-850 border border-dark-600 space-y-4 text-xs">
            <div>
              <label className="text-gray-200 font-bold block mb-1 text-sm flex items-center gap-1.5">
                <HiUsers className="w-4 h-4 text-gold-400" /> Target Audience (Display to Selected Users)
              </label>
              <p className="text-gray-400 text-xs">
                Control which shoppers can see this promotional banner and redeem the discount code.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { id: 'all', title: '👥 All Visitors', desc: 'Visible to everyone browsing the store' },
                { id: 'logged_in', title: '🔐 Logged-In Only', desc: 'Visible only when signed into an account' },
                { id: 'new_users', title: '🌟 First-Time Buyers', desc: 'Targeted to new buyers with 0 past orders' },
                { id: 'specific', title: '🎯 Selected Users', desc: 'Target specific customer email accounts' },
              ].map(aud => (
                <div
                  key={aud.id}
                  onClick={() => handleChange('targetAudience', aud.id)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    (banner.targetAudience || 'all') === aud.id
                      ? 'bg-gold-500/15 border-gold-500 text-white shadow-md'
                      : 'bg-dark-800 border-dark-600 text-gray-300 hover:border-gray-500'
                  }`}
                >
                  <p className="font-bold text-xs">{aud.title}</p>
                  <p className="text-[10px] text-gray-400 mt-1 leading-normal">{aud.desc}</p>
                </div>
              ))}
            </div>

            {/* If "Specific Selected Users" is chosen */}
            {banner.targetAudience === 'specific' && (
              <div className="space-y-3 pt-2 border-t border-dark-700">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="font-bold text-gold-400 text-xs">
                    Select Customer Accounts ({(banner.selectedUserEmails || []).length} selected)
                  </span>
                  <div className="relative w-full sm:w-64">
                    <HiSearch className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
                    <input
                      type="text"
                      value={customerSearch}
                      onChange={e => setCustomerSearch(e.target.value)}
                      placeholder="Search customers..."
                      className="w-full bg-dark-750 border border-dark-600 rounded-lg pl-8 pr-2.5 py-1 text-xs text-white"
                    />
                  </div>
                </div>

                {/* Add Manual Email Input */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={manualEmailInput}
                    onChange={e => setManualEmailInput(e.target.value)}
                    placeholder="Enter email address (or comma separated: user1@gmail.com, user2@gmail.com)"
                    className="flex-1 bg-dark-750 border border-dark-600 rounded-lg p-2 text-xs text-white"
                  />
                  <button
                    type="button"
                    onClick={handleAddManualEmail}
                    className="btn-secondary text-xs px-3 whitespace-nowrap"
                  >
                    + Add Email
                  </button>
                </div>

                {/* Selected Emails Badges */}
                {Array.isArray(banner.selectedUserEmails) && banner.selectedUserEmails.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 p-2 rounded-lg bg-dark-900 border border-dark-700 max-h-24 overflow-y-auto">
                    {banner.selectedUserEmails.map((email, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gold-500/20 text-gold-300 border border-gold-500/30 text-[10px]"
                      >
                        {email}
                        <button
                          type="button"
                          onClick={() => toggleUserEmail(email)}
                          className="hover:text-red-400 text-gray-400"
                        >
                          <HiX className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Customers Selection List */}
                <div className="border border-dark-700 rounded-xl overflow-hidden max-h-48 overflow-y-auto divide-y divide-dark-700 bg-dark-900">
                  {filteredCustomers.length === 0 ? (
                    <p className="p-3 text-center text-gray-500 text-xs">No registered customer found</p>
                  ) : (
                    filteredCustomers.map(c => {
                      const isSelected = (banner.selectedUserEmails || []).some(
                        e => e.toLowerCase() === (c.email || '').toLowerCase()
                      );
                      return (
                        <div
                          key={c.id}
                          onClick={() => toggleUserEmail(c.email)}
                          className={`p-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                            isSelected ? 'bg-gold-500/10' : 'hover:bg-dark-800'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                              isSelected ? 'bg-gold-500 border-gold-500 text-dark-900' : 'border-dark-500'
                            }`}>
                              {isSelected && <HiCheck className="w-3 h-3 font-bold" />}
                            </div>
                            <div>
                              <p className="text-white text-xs font-medium">{c.name || 'Anonymous'}</p>
                              <p className="text-gray-400 text-[10px]">{c.email}</p>
                            </div>
                          </div>
                          <span className="text-[10px] text-gray-500">
                            {c.orderCount ? `${c.orderCount} orders` : 'New User'}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Active Checkbox in Form */}
          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="banner-is-active"
              checked={isBannerActive}
              onChange={(e) => {
                handleChange('isActive', e.target.checked);
                handleChange('is_active', e.target.checked);
              }}
              className="text-gold-500 rounded bg-dark-700 border-dark-500 focus:ring-0 w-4 h-4"
            />
            <label htmlFor="banner-is-active" className="text-sm font-semibold text-gray-200 cursor-pointer">
              Active Promotion (Display on website and allow code redemption at Checkout)
            </label>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t border-dark-600">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="btn-secondary text-xs px-4 py-2"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveBanner}
              disabled={loading}
              className="btn-primary text-xs px-6 py-2.5 flex items-center gap-1.5 shadow-md"
            >
              <HiSave className="w-4 h-4" />
              {loading ? 'Saving...' : 'Save & Sync Promotion'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
