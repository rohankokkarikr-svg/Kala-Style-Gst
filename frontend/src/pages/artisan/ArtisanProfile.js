import React, { useEffect, useState, useRef } from 'react';
import { artisanAPI, productAPI, aiAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { HiCamera, HiSparkles, HiEye } from 'react-icons/hi';
import toast from 'react-hot-toast';
import LiveCameraModal from '../../components/LiveCameraModal';

const LANGUAGES = ['English', 'Hindi', 'Kannada', 'Tamil', 'Telugu', 'Marathi', 'Bengali'];
const ARTISAN_TYPES = ['Weaver / Handloom', 'Tailor / Clothing Maker', 'Jewelry Maker', 'Embroidery Artist', 'Bag Maker', 'General Artisan'];

export default function ArtisanProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [generatingBio, setGeneratingBio] = useState(false);
  const fileInputRef = useRef();

  const fetchProfile = () => {
    artisanAPI.getMyProfile().then(({ data }) => {
      if (data) {
        setProfile(data); setForm(data || {}); setLoading(false);
      }
    }).catch(() => setLoading(false));
  };

  const handleGenerateBio = async () => {
    setGeneratingBio(true);
    const toastId = toast.loading('Generating authentic artisan story with AI... ✨');
    try {
      const res = await aiAPI.generateArtisanStory({
        name: form.store_name || user?.name || 'Artisan Studio',
        location: form.location || 'Varanasi',
        craft: form.specialization || form.artisan_type || 'Traditional Indian Handicrafts',
        yearsExperience: form.years_of_experience || '20',
        familyHistory: 'Carrying forward ancestral Indian craft traditions with unwavering dedication to perfection and authentic handmade heritage.'
      });
      if (res.data?.story) {
        set('bio', res.data.story);
        toast.success('Artisan story generated! ✨ Click "Save Profile" to update your live products.', { id: toastId });
      } else {
        throw new Error('No story returned');
      }
    } catch (err) {
      console.warn('AI generator notice, using authentic template:', err);
      const fallbackStory = `Carrying forward ancestral Indian craft traditions in ${form.location || 'Varanasi'} with ${form.years_of_experience || '20'}+ years of dedicated heritage. Every piece is handcrafted with unwavering dedication to perfection, honoring centuries-old techniques and authentic handmade heritage.`;
      set('bio', fallbackStory);
      toast.success('Artisan heritage story generated! ✨ Click "Save Profile" to update your live products.', { id: toastId });
    } finally {
      setGeneratingBio(false);
    }
  };

  const handleQuickFillHeritage = () => {
    set('store_name', form.store_name || user?.name || 'Artisan Studio');
    set('location', form.location || 'Varanasi');
    set('years_of_experience', form.years_of_experience || '20');
    set('bio', 'Carrying forward ancestral Indian craft traditions with unwavering dedication to perfection and authentic handmade heritage.');
    toast.success('Master Craftsman heritage data loaded! ✨ Click "Save Profile" to apply.');
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  // Real-time listener: immediately update profile banner when Admin verifies
  useEffect(() => {
    const handleSync = (e) => {
      const payload = e.detail?.payload;
      if (payload?.verification_status) {
        setProfile(prev => prev ? { ...prev, verification_status: payload.verification_status } : prev);
        fetchProfile();
      }
    };
    window.addEventListener('kala:sync:artisans_updated', handleSync);
    return () => window.removeEventListener('kala:sync:artisans_updated', handleSync);
  }, []);

  // Client-side image compression: ensures quick uploads under any network conditions
  const processImageFile = (file) => {
    return new Promise((resolve) => {
      if (!file || !file.type.startsWith('image/')) {
        return resolve({ blob: file, dataUrl: null });
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 1600;
          let width = img.width;
          let height = img.height;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
          canvas.toBlob((blob) => {
            resolve({ blob: blob || file, dataUrl });
          }, 'image/jpeg', 0.88);
        };
        img.onerror = () => resolve({ blob: file, dataUrl: e.target.result });
        img.src = e.target.result;
      };
      reader.onerror = () => resolve({ blob: file, dataUrl: null });
      reader.readAsDataURL(file);
    });
  };

  const uploadImageSmart = async (file) => {
    const { blob, dataUrl } = await processImageFile(file);
    try {
      const fd = new FormData();
      fd.append('image', blob, file.name ? file.name.replace(/\.[^/.]+$/, ".jpg") : 'upload.jpg');
      const { data } = await productAPI.uploadDirect(fd);
      if (data?.imageUrl) return data.imageUrl;
    } catch (multerErr) {
      console.warn('FormData direct upload failed, trying base64 fallback...', multerErr);
      if (dataUrl) {
        const { data } = await productAPI.uploadDirect({ image: dataUrl });
        if (data?.imageUrl) return data.imageUrl;
      }
      throw multerErr;
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    setUploadingImg(true);
    const toastId = toast.loading('Uploading profile picture to Cloudinary ☁️...');
    try {
      const uploadedUrl = await uploadImageSmart(file);
      if (uploadedUrl) {
        set('profile_image', uploadedUrl);
        const updatedForm = { ...form, profile_image: uploadedUrl };
        await artisanAPI.updateProfile(updatedForm);
        setProfile(p => ({ ...p, profile_image: uploadedUrl }));
        toast.success('Profile photo uploaded and saved directly! ☁️✨', { id: toastId });
      }
    } catch (err) {
      console.error('Profile photo upload error:', err);
      const errMsg = err.response?.data?.error || err.message || 'Failed to upload image to Cloudinary';
      toast.error(errMsg, { id: toastId });
    } finally {
      setUploadingImg(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCameraPhoto = async (file) => {
    if (!file) return;
    setUploadingImg(true);
    const toastId = toast.loading('Uploading camera photo to Cloudinary ☁️...');
    try {
      const uploadedUrl = await uploadImageSmart(file);
      if (uploadedUrl) {
        set('profile_image', uploadedUrl);
        const updatedForm = { ...form, profile_image: uploadedUrl };
        await artisanAPI.updateProfile(updatedForm);
        setProfile(p => ({ ...p, profile_image: uploadedUrl }));
        toast.success('Live camera photo uploaded & saved! 📸✨', { id: toastId });
      }
    } catch (err) {
      console.error('Camera photo upload error:', err);
      const errMsg = err.response?.data?.error || err.message || 'Failed to upload photo';
      toast.error(errMsg, { id: toastId });
    } finally {
      setUploadingImg(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const { data } = await artisanAPI.updateProfile(form);
      setProfile(data); toast.success('Profile updated successfully! 🎉');
    } catch { toast.error('Failed to update profile'); }
    finally { setSaving(false); }
  };

  const field = (key) => form[key] || '';
  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  if (loading) return <div className="card p-12 text-center"><div className="shimmer h-8 w-48 mx-auto rounded" /></div>;

  return (
    <div className="max-w-2xl space-y-6">
      <div><h1 className="text-2xl font-serif font-bold text-white">Artisan Profile</h1><p className="text-gray-400 text-sm mt-1">Update your store information and craft details</p></div>
      {profile?.verification_status && (
        <div className={'border rounded-xl p-4 flex items-center gap-3 ' + (profile.verification_status === 'verified' ? 'border-green-500/30 bg-green-500/10' : profile.verification_status === 'rejected' ? 'border-red-500/30 bg-red-500/10' : 'border-yellow-500/30 bg-yellow-500/10')}>
          <span className="text-2xl">{profile.verification_status === 'verified' ? '✅' : profile.verification_status === 'rejected' ? '❌' : '⏳'}</span>
          <div>
            <p className="font-semibold text-white capitalize">{profile.verification_status} Artisan</p>
            <p className="text-sm text-gray-400">{profile.verification_status === 'verified' ? 'Your store is verified! Customers can see your artisan badge on your products.' : profile.verification_status === 'rejected' ? 'Your verification was rejected. Please contact support.' : 'Your account is pending admin verification.'}</p>
          </div>
        </div>
      )}
      <form onSubmit={handleSave} className="card p-6 space-y-5">
        {/* Profile Image & Cloudinary Storage */}
        <div className="flex items-center gap-5 p-4 rounded-xl bg-dark-700/50 border border-dark-600">
          <div className="relative w-20 h-20 rounded-full overflow-hidden bg-dark-800 border-2 border-gold-500/50 flex-shrink-0">
            {field('profile_image') ? (
              <img src={field('profile_image')} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-3xl">🧑‍🎨</div>
            )}
            {uploadingImg && (
              <div className="absolute inset-0 bg-dark-900/80 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-white">Artisan Profile / Store Photo</h4>
            <p className="text-xs text-gray-400 mb-2">Stored permanently on Cloudinary ☁️</p>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImg}
                className="btn-outline text-xs px-3 py-1.5 flex items-center gap-1.5"
              >
                <HiCamera className="w-4 h-4" /> {uploadingImg ? 'Uploading...' : 'Upload Photo'}
              </button>
              <button
                type="button"
                onClick={() => setShowCamera(true)}
                disabled={uploadingImg}
                className="px-3 py-1.5 bg-gradient-luxury text-dark-950 font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-gold hover:scale-105 active:scale-95 transition-transform cursor-pointer"
              >
                📸 Take Live Photo
              </button>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wider font-medium">Store Name *</label>
          <input className="input-field" value={field('store_name')} onChange={e => set('store_name', e.target.value)} placeholder="e.g. Lakshmi Handlooms / Ramesh Crafts" required />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wider font-medium">Artisan Type</label>
            <select className="input-field" value={field('artisan_type')} onChange={e => set('artisan_type', e.target.value)}>
              {ARTISAN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wider font-medium">Specialization</label>
            <input className="input-field" value={field('specialization')} onChange={e => set('specialization', e.target.value)} placeholder="e.g. Handwoven Banarasi Silk" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wider font-medium">Location</label>
            <input className="input-field" value={field('location')} onChange={e => set('location', e.target.value)} placeholder="e.g. Varanasi, Uttar Pradesh" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wider font-medium">Years of Craft Heritage / Experience</label>
            <input
              type="number"
              min="1"
              max="99"
              className="input-field font-semibold"
              value={field('years_of_experience')}
              onChange={e => set('years_of_experience', e.target.value)}
              placeholder="e.g. 20"
            />
          </div>
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
            <label className="block text-xs text-gray-400 uppercase tracking-wider font-medium">About Your Store / Bio</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleGenerateBio}
                disabled={generatingBio}
                className="px-2.5 py-1 rounded-lg bg-gold-500/10 hover:bg-gold-500/20 text-gold-400 border border-gold-500/30 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
              >
                <HiSparkles className="w-3.5 h-3.5" />
                {generatingBio ? 'Writing with AI...' : '✨ AI Generate Story'}
              </button>
              <button
                type="button"
                onClick={handleQuickFillHeritage}
                className="px-2.5 py-1 rounded-lg bg-dark-700 hover:bg-dark-600 text-gray-300 border border-dark-600 text-xs font-medium transition-all"
                title="Fill with Master Craftsman heritage values"
              >
                🪄 Quick Fill Heritage
              </button>
            </div>
          </div>
          <textarea
            rows={4}
            className="input-field resize-none leading-relaxed"
            value={field('bio')}
            onChange={e => set('bio', e.target.value)}
            placeholder="Tell customers about your craft, your story, and what makes your products special..."
          />
          <p className="text-[11px] text-gray-500 mt-1">This text is displayed directly under "About the Master Craftsman" on all your product detail pages.</p>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wider font-medium">Preferred Language (for AI features)</label>
          <select className="input-field" value={field('preferred_language') || 'English'} onChange={e => set('preferred_language', e.target.value)}>
            {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>

        {/* Live Customer Preview Card matching user screenshot */}
        <div className="p-5 rounded-2xl bg-dark-900/90 border border-gold-500/40 space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-dark-700/80">
            <div className="flex items-center gap-2">
              <HiEye className="w-4 h-4 text-gold-400" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Live Customer View: Product Page Preview
              </h3>
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold tracking-wider uppercase flex items-center gap-1.5 self-start sm:self-auto">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" /> Real-time Live
            </span>
          </div>

          {/* Tab Pill Headers */}
          <div className="flex items-center gap-1.5 bg-dark-950/80 p-1.5 rounded-xl border border-dark-700/70 overflow-x-auto text-[11px]">
            <span className="px-2.5 py-1 text-gray-500 font-medium whitespace-nowrap">Description</span>
            <span className="px-2.5 py-1 text-gray-500 font-medium whitespace-nowrap">Customer Reviews (0)</span>
            <span className="px-2.5 py-1 text-gray-500 font-medium whitespace-nowrap">Craftsmanship & Process</span>
            <span className="px-3 py-1 rounded-lg bg-gold-500 text-dark-950 font-bold shadow whitespace-nowrap">
              About the Artisan
            </span>
            <span className="px-2.5 py-1 text-gray-500 font-medium whitespace-nowrap">Dimensions & Specs</span>
            <span className="px-2.5 py-1 text-gray-500 font-medium whitespace-nowrap">Care Instructions</span>
          </div>

          {/* Gold separator accent bar */}
          <div className="h-1 rounded-full bg-gradient-to-r from-gold-500 via-gold-400 to-gold-600" />

          {/* Master Craftsman Content Container */}
          <div className="pt-2 space-y-3">
            <h4 className="text-base font-serif font-bold text-white">About the Master Craftsman</h4>
            <div className="flex flex-col sm:flex-row items-start gap-4">
              <div className="w-20 h-20 rounded-2xl overflow-hidden ring-2 ring-gold-500/60 shadow-md flex-shrink-0 bg-dark-800">
                <img
                  src={
                    field('profile_image') ||
                    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop'
                  }
                  alt={field('store_name') || user?.name || 'Artisan Store'}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="space-y-1 flex-1 min-w-0">
                <h5 className="text-sm font-bold text-white">{field('store_name') || user?.name || 'Artisan Store'}</h5>
                <p className="text-xs text-gold-400 font-medium">
                  Based in {field('location') || 'Varanasi'}, • {field('years_of_experience') || 20}+ Years of Heritage
                </p>
                <p className="text-xs text-gray-300 leading-relaxed">
                  {(field('bio') || '').split('__UPI_META__:')[0].trim() ||
                    'Carrying forward ancestral Indian craft traditions with unwavering dedication to perfection and authentic handmade heritage.'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving || uploadingImg}
          className="btn-primary w-full py-3 text-sm font-bold shadow-lg shadow-gold-500/20 flex items-center justify-center gap-2"
        >
          {saving ? 'Saving & Syncing in Real-Time...' : '💾 Save Profile & Real-Time Sync'}
        </button>
      </form>

      {/* Live Camera Modal */}
      <LiveCameraModal
        isOpen={showCamera}
        onClose={() => setShowCamera(false)}
        onCapturePhoto={handleCameraPhoto}
      />
    </div>
  );
}

