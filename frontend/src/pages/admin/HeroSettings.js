import React, { useState, useEffect, useRef } from 'react';
import { 
  HiSave, 
  HiPlus, 
  HiTrash, 
  HiPencil, 
  HiArrowUp, 
  HiArrowDown, 
  HiGlobeAlt, 
  HiPhotograph, 
  HiUpload, 
  HiRefresh, 
  HiDuplicate, 
  HiCheckCircle
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import { useSettings, DEFAULT_HERO_SLIDES } from '../../context/SettingsContext';
import { productAPI, settingsAPI } from '../../services/api';

export default function HeroSettings() {
  const { settings, updateSettings, refreshSettings } = useSettings();
  const [slides, setSlides] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingSlide, setEditingSlide] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (Array.isArray(settings?.heroSlides) && settings.heroSlides.length > 0) {
      setSlides(settings.heroSlides);
    } else {
      setSlides(DEFAULT_HERO_SLIDES);
    }
  }, [settings?.heroSlides]);

  // Client-side image compression: ensures quick uploads under any network conditions
  const compressImage = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let { width, height } = img;

          // Max banner width: 1920px (standard high-def hero resolution)
          const MAX_WIDTH = 1920;
          const MAX_HEIGHT = 1080;

          if (width > MAX_WIDTH || height > MAX_HEIGHT) {
            if (width / height > MAX_WIDTH / MAX_HEIGHT) {
              height = Math.round((height * MAX_WIDTH) / width);
              width = MAX_WIDTH;
            } else {
              width = Math.round((width * MAX_HEIGHT) / height);
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              resolve(blob || file);
            },
            'image/jpeg',
            0.88
          );
        };
        img.onerror = () => resolve(file);
        img.src = event.target.result;
      };
      reader.onerror = () => resolve(file);
      reader.readAsDataURL(file);
    });
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please choose a valid image file (JPG, PNG, WebP).');
      return;
    }

    setUploadingImage(true);
    const toastId = toast.loading('Uploading slide banner to high-speed CDN...');

    try {
      const compressedBlob = await compressImage(file);
      const fd = new FormData();
      fd.append('image', compressedBlob, file.name ? file.name.replace(/\.[^/.]+$/, '.jpg') : 'hero_slide.jpg');

      const { data } = await productAPI.uploadDirect(fd);

      if (data?.imageUrl) {
        setEditingSlide((prev) => ({
          ...prev,
          image: data.imageUrl,
        }));
        toast.success('Slide image uploaded successfully! ☁️✨', { id: toastId });
      } else {
        throw new Error('No image URL returned from server.');
      }
    } catch (err) {
      console.error('Failed to upload slide image:', err);
      toast.error(err.response?.data?.error || err.message || 'Failed to upload image. Please try again.', { id: toastId });
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const saveToServer = async (updatedSlides) => {
    setLoading(true);
    try {
      await updateSettings({ heroSlides: updatedSlides });
      setSlides(updatedSlides);
      toast.success('Hero slides updated & synced to all devices!');
    } catch (err) {
      console.error('Failed to save hero slides:', err);
      toast.error('Failed to sync hero slides to server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (slides.length <= 1) {
      toast.error('You must keep at least one hero slide.');
      return;
    }
    if (window.confirm('Are you sure you want to delete this slide from all devices?')) {
      const remaining = slides.filter((s) => s.id !== id);
      await saveToServer(remaining);
    }
  };

  const handleDuplicate = async (slide) => {
    const cloned = {
      ...slide,
      id: Date.now(),
      headline: `${slide.headline} (Copy)`,
    };
    const updated = [...slides, cloned];
    await saveToServer(updated);
    toast.success('Slide duplicated successfully!');
  };

  const handleMove = async (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= slides.length) return;
    const reordered = [...slides];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(newIndex, 0, moved);
    await saveToServer(reordered);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingSlide.headline?.trim() || !editingSlide.image?.trim()) {
      toast.error('Headline and Banner Image are required.');
      return;
    }

    let updatedList;
    if (editingSlide.isNew) {
      const newSlide = {
        ...editingSlide,
        id: Date.now(),
      };
      delete newSlide.isNew;
      updatedList = [...slides, newSlide];
    } else {
      updatedList = slides.map((s) => (s.id === editingSlide.id ? editingSlide : s));
    }

    await saveToServer(updatedList);
    setEditingSlide(null);
  };

  const openNewSlide = () => {
    setShowUrlInput(false);
    setEditingSlide({
      isNew: true,
      image: '',
      badgeText: '✦ Featured Collection',
      badgeType: 'new',
      headline: '',
      subtitle: '',
      buttonText: 'Explore Now',
      buttonLink: '/products',
      align: 'left',
    });
  };

  const handleRefreshCloud = async () => {
    const t = toast.loading('Syncing latest slides from cloud...');
    try {
      await refreshSettings(true);
      toast.success('Synced latest slides from cloud!', { id: t });
    } catch {
      toast.error('Failed to sync from cloud', { id: t });
    }
  };

  return (
    <div className="max-w-6xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 bg-dark-800 p-6 rounded-2xl border border-dark-600 shadow-card">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-serif font-bold text-white">Homepage Hero Slides & Banners</h1>
            <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 px-2.5 py-0.5 rounded-full border border-emerald-500/30 animate-pulse">
              <HiGlobeAlt className="w-3.5 h-3.5" /> Live Cloud Sync Active
            </span>
          </div>
          <p className="text-gray-400 text-sm">
            Upload custom banner images and customize headlines. All changes instantly reflect on mobile phones, tablets, and computers.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefreshCloud}
            title="Refresh slides from cloud storage"
            className="btn-outline py-2.5 px-4 flex items-center gap-2 text-sm text-gray-300 hover:text-white"
          >
            <HiRefresh className="w-4 h-4" /> Refresh Cloud
          </button>
          <button
            onClick={openNewSlide}
            className="btn-primary py-2.5 px-5 flex items-center gap-2 text-sm whitespace-nowrap shadow-gold-sm"
          >
            <HiPlus className="w-5 h-5" /> Add New Slide
          </button>
        </div>
      </div>

      {/* Grid of Slides */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {slides.map((slide, idx) => (
          <div
            key={slide.id || idx}
            className="bg-dark-800 border border-dark-600 rounded-2xl overflow-hidden relative group hover:border-gold-500/50 transition-all shadow-card flex flex-col justify-between"
          >
            {/* Image Preview */}
            <div className="h-52 bg-dark-700 relative overflow-hidden">
              {slide.image ? (
                <img
                  src={slide.image}
                  alt={slide.headline}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  onError={(e) => {
                    e.target.src = 'https://res.cloudinary.com/dcmmxmikz/image/upload/v1789048652/kalastyle-artisan-marketplace/wesedw9fpem0032yfsmk.jpg';
                  }}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 text-sm gap-2">
                  <HiPhotograph className="w-8 h-8 opacity-40" />
                  No Banner Image
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-dark-900 via-dark-900/50 to-transparent" />
              
              {/* Badge & Slide Number */}
              <div className="absolute top-3 left-3 flex items-center gap-2">
                <span className="bg-black/75 backdrop-blur-md text-gold-400 text-xs font-bold px-2.5 py-1 rounded-md border border-white/10 uppercase tracking-wider shadow">
                  Slide {idx + 1}
                </span>
                {slide.badgeText && (
                  <span className="bg-gold-500/25 backdrop-blur-md text-gold-300 text-[11px] font-semibold px-2.5 py-1 rounded-md border border-gold-500/40">
                    {slide.badgeText}
                  </span>
                )}
              </div>

              {/* Action Buttons */}
              <div className="absolute top-3 right-3 flex items-center gap-1.5 opacity-95 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                {idx > 0 && (
                  <button
                    onClick={() => handleMove(idx, -1)}
                    title="Move slide earlier"
                    className="w-8 h-8 flex items-center justify-center bg-dark-750/90 hover:bg-dark-600 text-gray-200 rounded-full backdrop-blur-sm border border-white/10 transition-transform active:scale-95"
                  >
                    <HiArrowUp className="w-4 h-4" />
                  </button>
                )}
                {idx < slides.length - 1 && (
                  <button
                    onClick={() => handleMove(idx, 1)}
                    title="Move slide later"
                    className="w-8 h-8 flex items-center justify-center bg-dark-750/90 hover:bg-dark-600 text-gray-200 rounded-full backdrop-blur-sm border border-white/10 transition-transform active:scale-95"
                  >
                    <HiArrowDown className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => handleDuplicate(slide)}
                  title="Duplicate slide"
                  className="w-8 h-8 flex items-center justify-center bg-purple-600 hover:bg-purple-700 text-white rounded-full shadow-lg transition-transform active:scale-95"
                >
                  <HiDuplicate className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setShowUrlInput(false);
                    setEditingSlide(slide);
                  }}
                  title="Edit slide & upload image"
                  className="w-8 h-8 flex items-center justify-center bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow-lg transition-transform active:scale-95"
                >
                  <HiPencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(slide.id)}
                  title="Delete slide"
                  className="w-8 h-8 flex items-center justify-center bg-red-500 hover:bg-red-600 text-white rounded-full shadow-lg transition-transform active:scale-95"
                >
                  <HiTrash className="w-4 h-4" />
                </button>
              </div>

              {/* Headline & Align */}
              <div className="absolute bottom-3 left-4 right-4">
                <h3 className="text-lg font-serif font-bold text-white line-clamp-1 drop-shadow-md">
                  {slide.headline}
                </h3>
              </div>
            </div>

            {/* Content Details */}
            <div className="p-4 space-y-2.5 bg-dark-800 text-xs text-gray-300">
              <p className="text-gray-400 line-clamp-2 leading-relaxed">
                {slide.subtitle || <span className="italic text-gray-600">No subtitle text</span>}
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-dark-700">
                <span className="text-gold-400 font-medium flex items-center gap-1">
                  CTA: <span className="text-gray-200 font-normal">{slide.buttonText}</span> → <span className="text-gray-400 font-mono text-[11px]">{slide.buttonLink}</span>
                </span>
                <span className="text-gray-500 capitalize bg-dark-700 px-2 py-0.5 rounded text-[11px]">
                  Align: {slide.align || 'left'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Edit / Create Slide Modal */}
      {editingSlide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
          <div className="bg-dark-800 rounded-2xl shadow-2xl border border-dark-600 w-full max-w-2xl my-auto overflow-hidden">
            <div className="p-6 border-b border-dark-600 flex justify-between items-center bg-dark-750">
              <div>
                <h2 className="text-xl font-bold text-white font-serif">
                  {editingSlide.isNew ? '✨ Create New Hero Slide' : '✏️ Edit Hero Slide & Banner'}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Upload an image from your device or paste a URL. Updates sync immediately to all storefront visitors.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingSlide(null)}
                className="text-gray-400 hover:text-white text-lg font-bold p-1 rounded-lg hover:bg-dark-700 transition-colors"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                
                {/* ── Slide Banner Image Uploader ── */}
                <div className="col-span-2 space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400">
                      Slide Banner Photo <span className="text-red-400">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowUrlInput(!showUrlInput)}
                      className="text-[11px] text-gold-400 hover:text-gold-300 underline flex items-center gap-1"
                    >
                      {showUrlInput ? 'Switch to Direct Upload' : 'Or paste custom Image URL'}
                    </button>
                  </div>

                  {/* Hidden file input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageUpload}
                  />

                  {/* Direct File Upload Dropzone */}
                  {!showUrlInput && (
                    <div>
                      {editingSlide.image ? (
                        <div className="relative rounded-xl overflow-hidden border border-gold-500/40 group/preview bg-dark-900">
                          <img
                            src={editingSlide.image}
                            alt="Banner Preview"
                            className="w-full h-44 object-cover object-center"
                            onError={(e) => {
                              e.target.src = 'https://res.cloudinary.com/dcmmxmikz/image/upload/v1789048652/kalastyle-artisan-marketplace/wesedw9fpem0032yfsmk.jpg';
                            }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-end justify-between p-4">
                            <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                              <HiCheckCircle className="w-4 h-4" /> Image Ready
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={uploadingImage}
                                onClick={() => fileInputRef.current?.click()}
                                className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow transition-colors flex items-center gap-1"
                              >
                                <HiUpload className="w-3.5 h-3.5" /> Replace Photo
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingSlide({ ...editingSlide, image: '' })}
                                className="bg-red-600 hover:bg-red-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow transition-colors"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div
                          onClick={() => !uploadingImage && fileInputRef.current?.click()}
                          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                            uploadingImage
                              ? 'border-gold-500/50 bg-gold-500/5'
                              : 'border-dark-500 hover:border-gold-500/60 bg-dark-750/50 hover:bg-dark-750'
                          }`}
                        >
                          {uploadingImage ? (
                            <div className="flex flex-col items-center justify-center gap-2 py-3">
                              <div className="w-8 h-8 border-2 border-gold-500 border-t-transparent rounded-full animate-spin" />
                              <p className="text-sm font-medium text-gold-400">Uploading banner to Cloud CDN...</p>
                              <p className="text-xs text-gray-500">Auto-compressing for ultra-fast mobile loading</p>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center gap-2 py-2">
                              <div className="w-12 h-12 rounded-full bg-gold-500/10 border border-gold-500/30 flex items-center justify-center text-gold-400">
                                <HiPhotograph className="w-6 h-6" />
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-white">
                                  Click here to upload banner image
                                </p>
                                <p className="text-xs text-gray-400 mt-0.5">
                                  Select JPG, PNG, or WebP from your computer or phone
                                </p>
                              </div>
                              <span className="text-[11px] text-gold-400 bg-gold-500/10 px-3 py-1 rounded-full border border-gold-500/20 mt-1">
                                Recommended: 1920×800 or standard 16:9 landscape
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Manual URL Input Fallback */}
                  {showUrlInput && (
                    <div className="space-y-2">
                      <input
                        required
                        type="text"
                        className="input-field text-sm"
                        placeholder="https://images.unsplash.com/... or https://res.cloudinary.com/..."
                        value={editingSlide.image}
                        onChange={(e) => setEditingSlide({ ...editingSlide, image: e.target.value })}
                      />
                      {editingSlide.image && (
                        <div className="h-28 rounded-lg overflow-hidden border border-dark-600 relative">
                          <img
                            src={editingSlide.image}
                            alt="Preview"
                            className="w-full h-full object-cover"
                            onError={(e) => { e.target.style.display = 'none'; }}
                          />
                          <span className="absolute bottom-1 right-2 text-[10px] bg-black/60 text-gray-300 px-1.5 py-0.5 rounded">
                            Preview
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Main Headline */}
                <div className="col-span-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                    Main Headline <span className="text-red-400">*</span>
                  </label>
                  <input
                    required
                    type="text"
                    className="input-field text-sm font-medium"
                    placeholder="e.g. Authentic Indian Handicrafts & Pure Silks"
                    value={editingSlide.headline}
                    onChange={(e) => setEditingSlide({ ...editingSlide, headline: e.target.value })}
                  />
                </div>

                {/* Subtitle */}
                <div className="col-span-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                    Subtitle Description
                  </label>
                  <textarea
                    rows="2"
                    className="input-field text-sm"
                    placeholder="Short narrative highlighting heritage craft, GI tags, or artisans..."
                    value={editingSlide.subtitle}
                    onChange={(e) => setEditingSlide({ ...editingSlide, subtitle: e.target.value })}
                  />
                </div>

                {/* Button Text */}
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                    CTA Button Text
                  </label>
                  <input
                    type="text"
                    className="input-field text-sm"
                    placeholder="e.g. Explore Handlooms"
                    value={editingSlide.buttonText}
                    onChange={(e) => setEditingSlide({ ...editingSlide, buttonText: e.target.value })}
                  />
                </div>

                {/* Button Link */}
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                    Button Link (URL / Route)
                  </label>
                  <input
                    type="text"
                    className="input-field text-sm"
                    placeholder="/products?category=Handloom+%26+Textiles"
                    value={editingSlide.buttonLink}
                    onChange={(e) => setEditingSlide({ ...editingSlide, buttonLink: e.target.value })}
                  />
                </div>

                {/* Alignment */}
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                    Text Alignment
                  </label>
                  <select
                    className="input-field text-sm"
                    value={editingSlide.align || 'left'}
                    onChange={(e) => setEditingSlide({ ...editingSlide, align: e.target.value })}
                  >
                    <option value="left">Left Align (Standard)</option>
                    <option value="center">Center Align (Heroic)</option>
                  </select>
                </div>

                {/* Badge Tag */}
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                    Badge Tag (Optional)
                  </label>
                  <input
                    type="text"
                    className="input-field text-sm"
                    placeholder="e.g. ✦ Heritage Weaves or ★ Festival Sale"
                    value={editingSlide.badgeText || ''}
                    onChange={(e) => setEditingSlide({ ...editingSlide, badgeText: e.target.value })}
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-6 border-t border-dark-600">
                <button
                  type="button"
                  onClick={() => setEditingSlide(null)}
                  className="btn-outline px-5 py-2 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || uploadingImage}
                  className="btn-primary px-6 py-2 flex items-center gap-2 text-sm font-semibold shadow-gold-sm disabled:opacity-50"
                >
                  <HiSave className="w-4 h-4" /> {loading ? 'Saving & Syncing...' : 'Save & Sync Slide'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
