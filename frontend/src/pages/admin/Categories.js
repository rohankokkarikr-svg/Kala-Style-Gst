import React, { useEffect, useState, useRef } from 'react';
import { 
  HiPlus, 
  HiPencil, 
  HiTrash, 
  HiFolder, 
  HiRefresh, 
  HiX,
  HiPhotograph,
  HiVideoCamera,
  HiFilm,
  HiUpload
} from 'react-icons/hi';
import { adminAPI, productAPI } from '../../services/api';
import { useSettings } from '../../context/SettingsContext';
import toast from 'react-hot-toast';

export default function Categories() {
  const { settings, updateSettings } = useSettings();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // Category Edit / Add Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    image_url: '',
    banner_image: '',
    video_url: '',
    subcategories: '',
    is_active: true
  });
  const [saving, setSaving] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingBannerImage, setUploadingBannerImage] = useState(false);

  // Default Storefront (All Categories) Hero Banner Modal State
  const [allBannerModalOpen, setAllBannerModalOpen] = useState(false);
  const [allBannerData, setAllBannerData] = useState({
    videoUrl: '',
    imageUrl: '',
    title: '',
    subtitle: ''
  });
  const [savingAllBanner, setSavingAllBanner] = useState(false);
  const [uploadingAllVideo, setUploadingAllVideo] = useState(false);
  const [uploadingAllImage, setUploadingAllImage] = useState(false);

  const catVideoInputRef = useRef(null);
  const catImageInputRef = useRef(null);
  const catBannerImageInputRef = useRef(null);
  const allVideoInputRef = useRef(null);
  const allImageInputRef = useRef(null);

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const { data } = await adminAPI.getCategories();
      setCategories(data || []);
    } catch {
      toast.error('Failed to load categories');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  // Sync All Banner Data with SettingsContext
  useEffect(() => {
    if (settings?.categoryBanners?.all) {
      setAllBannerData({
        videoUrl: settings.categoryBanners.all.videoUrl || '',
        imageUrl: settings.categoryBanners.all.imageUrl || '/images/explore_handicrafts_banner.jpg',
        title: settings.categoryBanners.all.title || 'Explore Indian Handicrafts',
        subtitle: settings.categoryBanners.all.subtitle || 'Browse handloom textiles, home décor, brass jewelry, pottery, and folk art handcrafted with generations of heritage.'
      });
    }
  }, [settings?.categoryBanners?.all]);

  const handleOpenModal = (cat = null) => {
    if (cat) {
      const catSlug = cat.slug || cat.name?.toLowerCase().replace(/\s+/g, '-');
      const bannerSetting = settings?.categoryBanners?.[catSlug] || {};

      setEditingCategory(cat);
      setFormData({
        name: cat.name || '',
        slug: cat.slug || '',
        description: cat.description || '',
        image_url: cat.image_url || '',
        banner_image: cat.banner_image || bannerSetting.imageUrl || cat.image_url || '',
        video_url: cat.video_url || bannerSetting.videoUrl || '',
        subcategories: Array.isArray(cat.subcategories) ? cat.subcategories.join(', ') : '',
        is_active: cat.is_active !== false
      });
    } else {
      setEditingCategory(null);
      setFormData({
        name: '',
        slug: '',
        description: '',
        image_url: '',
        banner_image: '',
        video_url: '',
        subcategories: '',
        is_active: true
      });
    }
    setModalOpen(true);
  };

  // Video Upload Handler
  const handleFileUpload = async (e, type, target) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (type === 'video') {
      if (!file.type.startsWith('video/') && !file.name.match(/\.(mp4|webm|mov|m4v|mkv)$/i)) {
        toast.error('Please select a valid video file (MP4, WebM, MOV, M4V)');
        return;
      }
      if (file.size > 100 * 1024 * 1024) {
        toast.error('Video file size exceeds 100MB limit. Please compress or choose a smaller file.');
        return;
      }
    }

    const toastId = toast.loading(type === 'video' ? 'Uploading video to Cloudinary CDN...' : 'Uploading image...');
    
    if (target === 'category_video') setUploadingVideo(true);
    else if (target === 'category_image') setUploadingImage(true);
    else if (target === 'category_banner_image') setUploadingBannerImage(true);
    else if (target === 'all_video') setUploadingAllVideo(true);
    else if (target === 'all_image') setUploadingAllImage(true);

    try {
      const fd = new FormData();
      fd.append(type === 'video' ? 'video' : 'image', file, file.name);

      const { data } = await productAPI.uploadDirect(fd);
      const uploadedUrl = data?.imageUrl || data?.url || data?.secure_url;

      if (!uploadedUrl) {
        throw new Error('No media URL returned from server.');
      }

      if (target === 'category_video') {
        setFormData(prev => ({ ...prev, video_url: uploadedUrl }));
      } else if (target === 'category_image') {
        setFormData(prev => ({ ...prev, image_url: uploadedUrl }));
      } else if (target === 'category_banner_image') {
        setFormData(prev => ({ ...prev, banner_image: uploadedUrl }));
      } else if (target === 'all_video') {
        setAllBannerData(prev => ({ ...prev, videoUrl: uploadedUrl }));
      } else if (target === 'all_image') {
        setAllBannerData(prev => ({ ...prev, imageUrl: uploadedUrl }));
      }

      toast.success(`${type === 'video' ? 'Video' : 'Image'} uploaded successfully! ☁️✨`, { id: toastId });
    } catch (err) {
      console.error('Media upload error:', err);
      toast.error(err.response?.data?.error || err.message || 'Upload failed', { id: toastId });
    } finally {
      if (target === 'category_video') setUploadingVideo(false);
      else if (target === 'category_image') setUploadingImage(false);
      else if (target === 'category_banner_image') setUploadingBannerImage(false);
      else if (target === 'all_video') setUploadingAllVideo(false);
      else if (target === 'all_image') setUploadingAllImage(false);
      e.target.value = '';
    }
  };

  // Save Category
  const handleSaveCategory = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Category name is required');
      return;
    }
    setSaving(true);
    try {
      const finalSlug = formData.slug.trim() || formData.name.toLowerCase().replace(/\s+/g, '-');
      const payload = {
        name: formData.name.trim(),
        slug: finalSlug,
        description: formData.description.trim(),
        image_url: formData.image_url.trim(),
        banner_image: formData.banner_image.trim() || formData.image_url.trim(),
        video_url: formData.video_url.trim(),
        subcategories: formData.subcategories,
        is_active: formData.is_active
      };

      if (editingCategory) {
        await adminAPI.updateCategory(editingCategory.id, payload);
        toast.success('Category and banner video updated!');
      } else {
        await adminAPI.createCategory(payload);
        toast.success('Category created!');
      }

      // Sync to SettingsContext categoryBanners store for resilient storefront access
      if (updateSettings && settings?.categoryBanners) {
        const updatedBanners = {
          ...settings.categoryBanners,
          [finalSlug]: {
            videoUrl: payload.video_url,
            imageUrl: payload.banner_image,
            title: payload.name,
            subtitle: payload.description
          }
        };
        await updateSettings({ categoryBanners: updatedBanners });
      }

      setModalOpen(false);
      fetchCategories();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save category');
    } finally {
      setSaving(false);
    }
  };

  // Save Default Storefront "All Categories" Hero Banner
  const handleSaveAllBanner = async (e) => {
    e.preventDefault();
    setSavingAllBanner(true);
    try {
      const updatedBanners = {
        ...(settings?.categoryBanners || {}),
        all: {
          videoUrl: allBannerData.videoUrl.trim(),
          imageUrl: allBannerData.imageUrl.trim(),
          title: allBannerData.title.trim() || 'Explore Indian Handicrafts',
          subtitle: allBannerData.subtitle.trim()
        }
      };
      await updateSettings({ categoryBanners: updatedBanners });
      toast.success('Default Storefront Banner Video updated successfully! 🎬✨');
      setAllBannerModalOpen(false);
    } catch (err) {
      console.error('Failed to update storefront banner:', err);
      toast.error('Failed to update banner video');
    } finally {
      setSavingAllBanner(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"? Existing products in this category may be affected.`)) return;
    try {
      await adminAPI.deleteCategory(id);
      toast.success('Category deleted');
      setCategories(prev => prev.filter(c => c.id !== id));
    } catch {
      toast.error('Failed to delete category');
    }
  };

  const defaultAllBanner = settings?.categoryBanners?.all || {
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-hands-of-an-artisan-weaving-colorful-threads-42859-large.mp4',
    imageUrl: '/images/explore_handicrafts_banner.jpg',
    title: 'Explore Indian Handicrafts',
    subtitle: 'Browse handloom textiles, home décor, brass jewelry, pottery, and folk art handcrafted with generations of heritage.'
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-white flex items-center gap-2">
            <HiFolder className="text-gold-400 w-6 h-6" /> Category & Craft Taxonomy
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Manage Indian Handicraft categories, subcategories, cover images, and hero banner background videos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchCategories}
            className="btn-secondary text-xs py-2 px-3 flex items-center gap-1.5"
          >
            <HiRefresh className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => handleOpenModal()}
            className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5"
          >
            <HiPlus className="w-4 h-4" /> Add Category
          </button>
        </div>
      </div>

      {/* 🌟 Default Storefront Banner (Explore Indian Handicrafts) Video Controller Card */}
      <div className="card overflow-hidden border border-gold-500/30 bg-gradient-to-br from-dark-900 via-dark-850 to-dark-900 shadow-xl">
        <div className="p-5 border-b border-dark-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-gold-500/20 text-gold-400 border border-gold-500/40">
              <HiFilm className="w-5 h-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-serif font-bold text-white text-base">
                  Main Storefront Hero Banner Video
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-gold-500/20 border border-gold-500/40 text-gold-300 text-[10px] font-bold uppercase tracking-wider">
                  All Categories
                </span>
              </div>
              <p className="text-gray-400 text-xs mt-0.5">
                Displayed at the top of the Products page when "All Categories" is active. Supports high-definition background video.
              </p>
            </div>
          </div>
          <button
            onClick={() => setAllBannerModalOpen(true)}
            className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5 self-start sm:self-auto shadow-md"
          >
            <HiPencil className="w-3.5 h-3.5" /> Edit Banner Video & Content
          </button>
        </div>

        <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          {/* Live Video Preview Box */}
          <div className="relative rounded-2xl overflow-hidden bg-dark-950 aspect-video border border-dark-600 shadow-inner flex items-center justify-center group">
            {defaultAllBanner.videoUrl ? (
              <video
                key={defaultAllBanner.videoUrl}
                src={defaultAllBanner.videoUrl}
                poster={defaultAllBanner.imageUrl}
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-full object-cover"
              />
            ) : (
              <img
                src={defaultAllBanner.imageUrl || '/images/explore_handicrafts_banner.jpg'}
                alt="Banner preview"
                className="w-full h-full object-cover"
              />
            )}
            <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-dark-950/80 backdrop-blur-md border border-dark-600 text-[10px] font-semibold text-white">
              {defaultAllBanner.videoUrl ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span>Live Video Banner</span>
                </>
              ) : (
                <>
                  <HiPhotograph className="w-3 h-3 text-gold-400" />
                  <span>Static Image</span>
                </>
              )}
            </div>
          </div>

          {/* Current Banner Details */}
          <div className="md:col-span-2 space-y-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-gold-400">Headline</span>
              <h3 className="text-lg font-serif font-bold text-white">{defaultAllBanner.title || 'Explore Indian Handicrafts'}</h3>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Subtitle</span>
              <p className="text-gray-300 text-xs leading-relaxed">{defaultAllBanner.subtitle}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
              <div className="px-3 py-1.5 rounded-lg bg-dark-800 border border-dark-700 text-gray-300 flex items-center gap-1.5">
                <HiFilm className="w-3.5 h-3.5 text-gold-400" />
                <span className="truncate max-w-[220px]" title={defaultAllBanner.videoUrl || 'No video uploaded'}>
                  {defaultAllBanner.videoUrl ? 'Cloudinary Video Connected' : 'No video attached'}
                </span>
              </div>
              <div className="px-3 py-1.5 rounded-lg bg-dark-800 border border-dark-700 text-gray-300 flex items-center gap-1.5">
                <HiPhotograph className="w-3.5 h-3.5 text-gold-400" />
                <span>Fallback Poster Image Active</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Categories Grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-serif font-bold text-white flex items-center gap-2">
            Specific Craft Categories ({categories.length})
          </h2>
          <span className="text-xs text-gray-400">
            Each category can feature its own custom background video
          </span>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="card h-64 shimmer" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {categories.map((c) => {
              const catSlug = c.slug || c.name?.toLowerCase().replace(/\s+/g, '-');
              const bannerSetting = settings?.categoryBanners?.[catSlug] || {};
              const hasVideo = Boolean(c.video_url || bannerSetting.videoUrl);
              const activeVid = c.video_url || bannerSetting.videoUrl;

              return (
                <div key={c.id} className="card overflow-hidden flex flex-col justify-between group border border-dark-600 hover:border-gold-500/50 transition-all duration-300 shadow-md">
                  <div>
                    <div className="h-40 relative overflow-hidden bg-dark-700">
                      {hasVideo ? (
                        <video
                          src={activeVid}
                          poster={c.banner_image || bannerSetting.imageUrl || c.image_url}
                          autoPlay
                          loop
                          muted
                          playsInline
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : (
                        <img
                          src={c.image_url || 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=600&auto=format&fit=crop'}
                          alt={c.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=600&auto=format&fit=crop';
                          }}
                        />
                      )}
                      
                      <div className="absolute inset-0 bg-gradient-to-t from-dark-900 via-dark-900/40 to-transparent" />
                      
                      {/* Video Badge */}
                      {hasVideo && (
                        <span className="absolute top-3 left-3 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-600/90 text-white shadow-md backdrop-blur-sm">
                          <HiFilm className="w-3 h-3 animate-pulse" /> Video Banner
                        </span>
                      )}

                      {/* Active Status Badge */}
                      <span className={`absolute top-3 right-3 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        c.is_active !== false ? 'bg-green-500/80 text-white' : 'bg-red-500/80 text-white'
                      }`}>
                        {c.is_active !== false ? 'Active' : 'Inactive'}
                      </span>

                      <div className="absolute bottom-3 left-4 right-4">
                        <h3 className="font-serif font-bold text-white text-base truncate">{c.name}</h3>
                        <p className="text-gray-400 text-xs line-clamp-1">{c.description}</p>
                      </div>
                    </div>

                    <div className="p-4 space-y-3">
                      <div>
                        <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1.5">Subcategories</p>
                        <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                          {(Array.isArray(c.subcategories) ? c.subcategories : []).map((sub, idx) => (
                            <span key={idx} className="text-[11px] px-2 py-0.5 rounded bg-dark-700 text-gray-300 border border-dark-600">
                              {sub}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 border-t border-dark-600/70 flex items-center justify-between bg-dark-850">
                    <span className="text-[11px] text-gray-400">Slug: <code className="text-gold-400 font-mono">{c.slug}</code></span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleOpenModal(c)}
                        className="px-2.5 py-1.5 text-xs text-gold-400 hover:text-white rounded bg-dark-750 hover:bg-gold-500/20 border border-gold-500/30 transition-colors flex items-center gap-1"
                        title="Edit Category & Banner Video"
                      >
                        <HiPencil className="w-3.5 h-3.5" />
                        <span>Edit & Video</span>
                      </button>
                      <button
                        onClick={() => handleDelete(c.id, c.name)}
                        className="p-1.5 text-red-400 hover:text-red-300 rounded bg-red-500/10 hover:bg-red-500/20 transition-colors"
                        title="Delete Category"
                      >
                        <HiTrash className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 🎬 MODAL 1: Default Storefront Hero Banner Video (All Categories) */}
      {allBannerModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <form onSubmit={handleSaveAllBanner} className="card max-w-xl w-full p-6 space-y-5 border border-gold-500/40 shadow-2xl">
            <div className="flex justify-between items-center border-b border-dark-600 pb-3">
              <div className="flex items-center gap-2">
                <HiFilm className="w-5 h-5 text-gold-400" />
                <h3 className="font-serif font-bold text-white text-lg">
                  Edit Storefront Banner Video (All Categories)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setAllBannerModalOpen(false)}
                className="text-gray-400 hover:text-white"
              >
                <HiX className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Video Player Preview in Modal */}
              {allBannerData.videoUrl && (
                <div className="space-y-1.5">
                  <span className="text-gray-300 font-semibold block">Live Video Preview</span>
                  <div className="relative rounded-xl overflow-hidden aspect-video bg-black border border-gold-500/30 shadow-inner">
                    <video
                      key={allBannerData.videoUrl}
                      src={allBannerData.videoUrl}
                      poster={allBannerData.imageUrl}
                      controls
                      autoPlay
                      loop
                      muted
                      playsInline
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              )}

              {/* Upload Video Section */}
              <div>
                <label className="block text-gray-300 font-semibold mb-1">
                  Banner Background Video (MP4 / WebM)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={allBannerData.videoUrl}
                    onChange={e => setAllBannerData({ ...allBannerData, videoUrl: e.target.value })}
                    placeholder="https://res.cloudinary.com/... or upload below"
                    className="flex-1 bg-dark-700 border border-dark-500 rounded-lg p-2.5 text-white focus:outline-none focus:border-gold-500"
                  />
                  <input
                    type="file"
                    ref={allVideoInputRef}
                    accept="video/mp4,video/webm,video/ogg,video/quicktime"
                    className="hidden"
                    onChange={(e) => handleFileUpload(e, 'video', 'all_video')}
                  />
                  <button
                    type="button"
                    disabled={uploadingAllVideo}
                    onClick={() => allVideoInputRef.current?.click()}
                    className="btn-secondary text-xs px-3 flex items-center gap-1.5 whitespace-nowrap border-gold-500/40 text-gold-400 hover:text-gold-300"
                  >
                    <HiUpload className="w-4 h-4" />
                    {uploadingAllVideo ? 'Uploading...' : 'Upload Video'}
                  </button>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  Upload an HD artisan video (up to 100MB). Will play automatically in background on the Products page.
                </p>
              </div>

              {/* Poster / Fallback Image */}
              <div>
                <label className="block text-gray-300 font-semibold mb-1">
                  Fallback Poster Image
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={allBannerData.imageUrl}
                    onChange={e => setAllBannerData({ ...allBannerData, imageUrl: e.target.value })}
                    placeholder="/images/explore_handicrafts_banner.jpg"
                    className="flex-1 bg-dark-700 border border-dark-500 rounded-lg p-2.5 text-white focus:outline-none focus:border-gold-500"
                  />
                  <input
                    type="file"
                    ref={allImageInputRef}
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFileUpload(e, 'image', 'all_image')}
                  />
                  <button
                    type="button"
                    disabled={uploadingAllImage}
                    onClick={() => allImageInputRef.current?.click()}
                    className="btn-secondary text-xs px-3 flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <HiUpload className="w-4 h-4" />
                    {uploadingAllImage ? 'Uploading...' : 'Upload Image'}
                  </button>
                </div>
              </div>

              {/* Title & Subtitle */}
              <div>
                <label className="block text-gray-300 font-semibold mb-1">Headline</label>
                <input
                  type="text"
                  value={allBannerData.title}
                  onChange={e => setAllBannerData({ ...allBannerData, title: e.target.value })}
                  placeholder="Explore Indian Handicrafts"
                  className="w-full bg-dark-700 border border-dark-500 rounded-lg p-2.5 text-white focus:outline-none focus:border-gold-500"
                />
              </div>

              <div>
                <label className="block text-gray-300 font-semibold mb-1">Subtitle</label>
                <textarea
                  rows={3}
                  value={allBannerData.subtitle}
                  onChange={e => setAllBannerData({ ...allBannerData, subtitle: e.target.value })}
                  placeholder="Browse handloom textiles, home décor, brass jewelry..."
                  className="w-full bg-dark-700 border border-dark-500 rounded-lg p-2.5 text-white focus:outline-none focus:border-gold-500 resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-dark-600">
              <button
                type="button"
                onClick={() => setAllBannerModalOpen(false)}
                className="btn-secondary text-xs py-2 px-3"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingAllBanner || uploadingAllVideo || uploadingAllImage}
                className="btn-primary text-xs py-2 px-5 flex items-center gap-1.5"
              >
                {savingAllBanner ? 'Saving Video...' : 'Save Banner Video'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 🛠️ MODAL 2: Add / Edit Specific Category Modal (with Video & Image Upload) */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <form onSubmit={handleSaveCategory} className="card max-w-lg w-full p-6 space-y-4 border border-dark-500 shadow-2xl my-8">
            <div className="flex justify-between items-center border-b border-dark-600 pb-3">
              <div className="flex items-center gap-2">
                <HiFolder className="w-5 h-5 text-gold-400" />
                <h3 className="font-serif font-bold text-white text-base">
                  {editingCategory ? `Edit Category: ${editingCategory.name}` : 'Add New Category'}
                </h3>
              </div>
              <button type="button" onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-white">
                <HiX className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs max-h-[70vh] overflow-y-auto pr-1">
              <div>
                <label className="block text-gray-300 font-semibold mb-1">Category Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Dokra Metal Craft"
                  className="w-full bg-dark-700 border border-dark-500 rounded-lg p-2.5 text-white focus:outline-none focus:border-gold-500"
                  required
                />
              </div>

              <div>
                <label className="block text-gray-300 font-semibold mb-1">URL Slug</label>
                <input
                  type="text"
                  value={formData.slug}
                  onChange={e => setFormData({ ...formData, slug: e.target.value })}
                  placeholder="e.g. dokra-metal-craft"
                  className="w-full bg-dark-700 border border-dark-500 rounded-lg p-2.5 text-white focus:outline-none focus:border-gold-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-gray-300 font-semibold mb-1">Description</label>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of the crafts in this category..."
                  className="w-full bg-dark-700 border border-dark-500 rounded-lg p-2.5 text-white focus:outline-none focus:border-gold-500 resize-none"
                />
              </div>

              {/* 🎥 Category Video Upload & URL */}
              <div className="p-3 rounded-xl bg-dark-800 border border-gold-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-gold-400 font-bold flex items-center gap-1.5">
                    <HiVideoCamera className="w-4 h-4" /> Category Hero Banner Video (MP4 / WebM)
                  </label>
                  {formData.video_url && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-300 font-semibold">
                      Connected
                    </span>
                  )}
                </div>

                {formData.video_url && (
                  <div className="relative rounded-lg overflow-hidden aspect-video bg-black border border-dark-600 mb-2">
                    <video
                      key={formData.video_url}
                      src={formData.video_url}
                      controls
                      autoPlay
                      loop
                      muted
                      playsInline
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.video_url}
                    onChange={e => setFormData({ ...formData, video_url: e.target.value })}
                    placeholder="https://res.cloudinary.com/... or upload"
                    className="flex-1 bg-dark-700 border border-dark-500 rounded-lg p-2 text-white focus:outline-none focus:border-gold-500"
                  />
                  <input
                    type="file"
                    ref={catVideoInputRef}
                    accept="video/mp4,video/webm,video/ogg,video/quicktime"
                    className="hidden"
                    onChange={(e) => handleFileUpload(e, 'video', 'category_video')}
                  />
                  <button
                    type="button"
                    disabled={uploadingVideo}
                    onClick={() => catVideoInputRef.current?.click()}
                    className="btn-secondary text-xs px-2.5 py-1.5 flex items-center gap-1 border-gold-500/40 text-gold-400 whitespace-nowrap"
                  >
                    <HiUpload className="w-3.5 h-3.5" />
                    {uploadingVideo ? 'Uploading...' : 'Upload Video'}
                  </button>
                </div>
                <p className="text-[10px] text-gray-400">
                  Plays in the hero banner when customers browse this category on the storefront.
                </p>
              </div>

              {/* Category Card Image */}
              <div>
                <label className="block text-gray-300 font-semibold mb-1">Category Thumbnail Image</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.image_url}
                    onChange={e => setFormData({ ...formData, image_url: e.target.value })}
                    placeholder="https://images.unsplash.com/..."
                    className="flex-1 bg-dark-700 border border-dark-500 rounded-lg p-2 text-white focus:outline-none focus:border-gold-500"
                  />
                  <input
                    type="file"
                    ref={catImageInputRef}
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFileUpload(e, 'image', 'category_image')}
                  />
                  <button
                    type="button"
                    disabled={uploadingImage}
                    onClick={() => catImageInputRef.current?.click()}
                    className="btn-secondary text-xs px-2.5 py-1.5 flex items-center gap-1 whitespace-nowrap"
                  >
                    <HiUpload className="w-3.5 h-3.5" />
                    {uploadingImage ? '...' : 'Upload'}
                  </button>
                </div>
              </div>

              {/* Category Banner Background Image */}
              <div>
                <label className="block text-gray-300 font-semibold mb-1">
                  Banner Poster / Fallback Image (optional)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.banner_image}
                    onChange={e => setFormData({ ...formData, banner_image: e.target.value })}
                    placeholder="Same as thumbnail if left empty"
                    className="flex-1 bg-dark-700 border border-dark-500 rounded-lg p-2 text-white focus:outline-none focus:border-gold-500"
                  />
                  <input
                    type="file"
                    ref={catBannerImageInputRef}
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFileUpload(e, 'image', 'category_banner_image')}
                  />
                  <button
                    type="button"
                    disabled={uploadingBannerImage}
                    onClick={() => catBannerImageInputRef.current?.click()}
                    className="btn-secondary text-xs px-2.5 py-1.5 flex items-center gap-1 whitespace-nowrap"
                  >
                    <HiUpload className="w-3.5 h-3.5" />
                    {uploadingBannerImage ? '...' : 'Upload'}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-gray-300 font-semibold mb-1">Subcategories (comma-separated)</label>
                <input
                  type="text"
                  value={formData.subcategories}
                  onChange={e => setFormData({ ...formData, subcategories: e.target.value })}
                  placeholder="e.g. Figurines, Diyas, Tribal Jewelry, Wall Bells"
                  className="w-full bg-dark-700 border border-dark-500 rounded-lg p-2.5 text-white focus:outline-none focus:border-gold-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="cat-active"
                  checked={formData.is_active}
                  onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                  className="text-gold-500 rounded bg-dark-700 border-dark-500 focus:ring-0"
                />
                <label htmlFor="cat-active" className="text-gray-300 cursor-pointer">
                  Category is Active and visible in storefront
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-dark-600">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="btn-secondary text-xs py-2 px-3"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || uploadingVideo || uploadingImage || uploadingBannerImage}
                className="btn-primary text-xs py-2 px-4"
              >
                {saving ? 'Saving...' : editingCategory ? 'Update Category' : 'Create Category'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
