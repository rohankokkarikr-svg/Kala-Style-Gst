import React, { useEffect, useState } from 'react';
import { 
  HiSearch, 
  HiCheckCircle, 
  HiXCircle, 
  HiEye, 
  HiEyeOff, 
  HiTrash, 
  HiRefresh,
  HiX,
  HiExternalLink,
  HiPencilAlt,
  HiUpload,
  HiTag,
  HiCheck
} from 'react-icons/hi';
import { adminAPI, productAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { Link, useSearchParams } from 'react-router-dom';

const AVAILABLE_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', 'Free Size'];

const COMMON_CATEGORIES = [
  'Handloom & Textiles',
  'Home Décor & Furnishings',
  'Handmade Jewelry & Accessories',
  'Pottery & Terracotta',
  'Wooden Crafts & Carvings',
  'Metal Crafts & Brassware',
  'Folk & Tribal Art',
  'Kurtas & Ethnic Wear',
  'Suits & Blazers',
  'Shirts',
  'T-Shirts',
  'Pants & Trousers',
  'Jackets',
  'Accessories'
];

export default function Products() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchParams, setSearchParams] = useSearchParams();
  const editQueryId = searchParams.get('edit');
  const [artisansList, setArtisansList] = useState([]);
  
  // Rejection modal state
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState('Incorrect product details or category mismatch');
  const [rejecting, setRejecting] = useState(false);

  // View modal state
  const [previewProduct, setPreviewProduct] = useState(null);

  // Edit modal state
  const [editProduct, setEditProduct] = useState(null);
  const [editFormData, setEditFormData] = useState({
    name: '',
    price: '',
    original_price: '',
    category: '',
    subcategory: '',
    stock_quantity: 0,
    is_in_stock: true,
    status: 'approved',
    rejection_reason: '',
    material: '',
    style: '',
    sizes: [],
    image_url: '',
    description: '',
    tags: '',
    is_handmade: true,
    barcode: ''
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const { data } = await adminAPI.getProducts({ 
        search, 
        category: categoryFilter, 
        status: statusFilter 
      });
      setProducts(data || []);
    } catch {
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryFilter, statusFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchProducts();
  };

  const handleApprove = async (id) => {
    try {
      const res = await adminAPI.approveProduct(id);
      toast.success('Product approved and published!');
      const updated = res?.data;
      setProducts(prev => prev.map(p => p.id === id ? {
        ...p,
        ...(updated || {}),
        status: 'approved',
        is_in_stock: true,
        stock_quantity: updated?.stock_quantity ?? (Number(p.stock_quantity) > 0 ? Number(p.stock_quantity) : 10),
        rejection_reason: null
      } : p));
      window.dispatchEvent(new CustomEvent('kala:sync:products_updated', {
        detail: { payload: { action: 'approve', id } }
      }));
    } catch {
      toast.error('Failed to approve product');
    }
  };

  const handleRejectSubmit = async () => {
    if (!rejectReason.trim()) {
      toast.error('Please specify a rejection reason');
      return;
    }
    setRejecting(true);
    try {
      await adminAPI.rejectProduct(rejectModal.id, { reason: rejectReason });
      toast.success('Product rejected with reason noted');
      setProducts(prev => prev.map(p => p.id === rejectModal.id ? { ...p, status: 'rejected', rejection_reason: rejectReason } : p));
      setRejectModal(null);
      setRejectReason('Incorrect product details or category mismatch');
    } catch {
      toast.error('Failed to reject product');
    } finally {
      setRejecting(false);
    }
  };

  const handleHideToggle = async (id, isCurrentlyHidden) => {
    const nextHidden = !isCurrentlyHidden;
    try {
      await adminAPI.hideProduct(id, { is_hidden: nextHidden });
      toast.success(nextHidden ? 'Product hidden from public catalog' : 'Product unhidden');
      setProducts(prev => prev.map(p => p.id === id ? { ...p, is_hidden: nextHidden } : p));
    } catch {
      toast.error('Failed to update visibility');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to permanently delete this product?')) return;
    try {
      await adminAPI.deleteProduct(id);
      toast.success('Product deleted');
      setProducts(prev => prev.filter(p => p.id !== id));
      if (previewProduct?.id === id) setPreviewProduct(null);
      if (editProduct?.id === id) setEditProduct(null);
    } catch {
      toast.error('Failed to delete product');
    }
  };

  useEffect(() => {
    adminAPI.getArtisans().then(({ data }) => {
      if (data && data.length > 0) setArtisansList(data);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (editQueryId && products.length > 0) {
      const target = products.find(p => String(p.id) === String(editQueryId));
      if (target) {
        handleOpenEdit(target);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editQueryId, products]);

  const handleCloseEdit = () => {
    setEditProduct(null);
    if (searchParams.get('edit')) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('edit');
      setSearchParams(nextParams, { replace: true });
    }
  };

  const handleOpenEdit = (p) => {
    setEditProduct(p);
    setEditFormData({
      name: p.name || '',
      price: p.price ?? '',
      original_price: p.original_price ?? '',
      category: p.category || '',
      subcategory: p.subcategory || '',
      stock_quantity: p.stock_quantity ?? 0,
      is_in_stock: p.is_in_stock !== false,
      status: p.status || 'approved',
      rejection_reason: p.rejection_reason || '',
      material: p.material || '',
      style: p.style || '',
      sizes: Array.isArray(p.sizes)
        ? p.sizes
        : (typeof p.sizes === 'string' && p.sizes.trim() ? p.sizes.split(',').map(s => s.trim()).filter(Boolean) : []),
      image_url: p.image_url || '',
      description: p.description || '',
      tags: Array.isArray(p.tags) ? p.tags.join(', ') : (p.tags || ''),
      is_handmade: p.is_handmade !== false,
      barcode: p.barcode || '',
      artisan_id: p.artisan_id || p.artisan_profiles?.id || ''
    });
  };

  const handleToggleSize = (sizeStr) => {
    setEditFormData(prev => {
      const currentSizes = Array.isArray(prev.sizes) ? prev.sizes : [];
      if (currentSizes.includes(sizeStr)) {
        return { ...prev, sizes: currentSizes.filter(s => s !== sizeStr) };
      } else {
        return { ...prev, sizes: [...currentSizes, sizeStr] };
      }
    });
  };

  const handleImageFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image file size must be less than 10MB');
      return;
    }

    const formData = new FormData();
    formData.append('image', file);

    setUploadingImage(true);
    try {
      const { data } = await productAPI.uploadDirect(formData);
      if (data?.imageUrl) {
        setEditFormData(prev => ({ ...prev, image_url: data.imageUrl }));
        toast.success('Image uploaded successfully!');
      }
    } catch (err) {
      console.error('Direct upload failed:', err);
      toast.error(err?.response?.data?.error || 'Direct upload failed. You can also paste an image URL.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSaveEdit = async (e) => {
    e?.preventDefault();
    if (!editFormData.name.trim()) {
      toast.error('Product title is required');
      return;
    }
    if (editFormData.price === '' || isNaN(Number(editFormData.price)) || Number(editFormData.price) < 0) {
      toast.error('Please enter a valid price');
      return;
    }

    setSavingEdit(true);
    try {
      const payload = {
        name: editFormData.name.trim(),
        price: Number(editFormData.price),
        original_price: editFormData.original_price ? Number(editFormData.original_price) : null,
        category: editFormData.category.trim(),
        subcategory: editFormData.subcategory.trim(),
        stock_quantity: Number(editFormData.stock_quantity) || 0,
        is_in_stock: Number(editFormData.stock_quantity) > 0 ? (editFormData.is_in_stock !== false) : false,
        status: editFormData.status,
        rejection_reason: editFormData.status === 'rejected' ? editFormData.rejection_reason : null,
        material: editFormData.material.trim(),
        style: editFormData.style.trim(),
        sizes: editFormData.sizes,
        image_url: editFormData.image_url.trim(),
        description: editFormData.description.trim(),
        tags: typeof editFormData.tags === 'string'
          ? editFormData.tags.split(',').map(t => t.trim()).filter(Boolean)
          : editFormData.tags,
        is_handmade: Boolean(editFormData.is_handmade),
        barcode: editFormData.barcode ? editFormData.barcode.trim() : null,
        artisan_id: editFormData.artisan_id || null
      };

      const { data } = await adminAPI.updateProduct(editProduct.id, payload);
      const chosenArtisan = artisansList.find(a => a.id === payload.artisan_id);
      const updated = data?.product || {
        ...editProduct,
        ...payload,
        artisan_profiles: chosenArtisan || editProduct.artisan_profiles
      };

      setProducts(prev => prev.map(p => p.id === editProduct.id ? { ...p, ...updated } : p));
      if (previewProduct?.id === editProduct.id) {
        setPreviewProduct(prev => ({ ...prev, ...updated }));
      }
      toast.success('Product updated and synced live!');
      handleCloseEdit();
    } catch (err) {
      console.error('Failed to update product:', err);
      toast.error(err?.response?.data?.error || 'Failed to update product');
    } finally {
      setSavingEdit(false);
    }
  };

  const getStatusBadge = (p) => {
    if (p.is_hidden) {
      return <span className="badge bg-gray-500/20 text-gray-400 border border-gray-500/30">⚫ Hidden</span>;
    }
    switch (p.status) {
      case 'approved':
        return <span className="badge bg-green-500/20 text-green-400 border border-green-500/30">🟢 Approved</span>;
      case 'rejected':
        return <span className="badge bg-red-500/20 text-red-400 border border-red-500/30" title={p.rejection_reason || 'Rejected'}>🔴 Rejected</span>;
      default:
        return <span className="badge bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">🟡 Pending</span>;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-white">Product Management & Quality Assurance</h1>
          <p className="text-gray-400 text-sm mt-1">
            Review artisan submissions, edit catalog listings, approve handcrafted products, and monitor compliance.
          </p>
        </div>
        <button
          onClick={fetchProducts}
          className="btn-secondary self-start sm:self-auto flex items-center gap-2 text-xs py-2"
        >
          <HiRefresh className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh List
        </button>
      </div>

      {/* Visual Indicator Banner */}
      <div className="card p-3.5 bg-gradient-to-r from-gold-500/15 via-gold-500/5 to-transparent border border-gold-500/30 flex items-center justify-between text-xs text-gold-400">
        <div className="flex items-center gap-2.5">
          <span className="p-1 rounded bg-gold-500 text-dark-950 font-black text-[10px] tracking-wider uppercase">HOW TO EDIT</span>
          <span className="text-gray-200">
            Click the <strong className="text-gold-400 font-bold bg-gold-500/20 px-1.5 py-0.5 rounded border border-gold-500/30">✏️ Edit Product</strong> button under any product name, or the gold <strong className="text-gold-400 font-bold bg-gold-500/20 px-1.5 py-0.5 rounded border border-gold-500/30">Edit</strong> button on the right to edit prices, stock, images, or descriptions.
          </span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="card p-4 space-y-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full md:w-96">
            <div className="relative flex-1">
              <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search products by title, category, material..."
                className="w-full bg-dark-700 border border-dark-500 rounded-lg pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-gold-500/60"
              />
            </div>
            <button type="submit" className="btn-primary text-xs py-2 px-3">Search</button>
          </form>

          {/* Category & Status Filter Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto">
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="bg-dark-700 border border-dark-600 rounded-lg px-2.5 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-gold-500"
            >
              <option value="all">All Categories</option>
              {COMMON_CATEGORIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            {['all', 'pending', 'approved', 'rejected'].map(st => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`text-xs px-3 py-1.5 rounded-lg capitalize whitespace-nowrap transition-all border ${
                  statusFilter === st
                    ? 'bg-gold-500/20 border-gold-500/50 text-gold-400 font-semibold'
                    : 'border-dark-600 text-gray-400 hover:text-white'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Products Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-14 shimmer rounded-lg" />)}
          </div>
        ) : products.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-dark-800/80 text-gray-400 border-b border-dark-600 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Product Info</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Artisan Store</th>
                  <th className="py-3 px-4">Price & Stock</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right sticky right-0 bg-dark-800 shadow-[-8px_0_12px_-2px_rgba(0,0,0,0.5)] z-10 border-l border-dark-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-600/50">
                {products.map(p => (
                  <tr key={p.id} className="hover:bg-dark-700/30 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={p.image_url || 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=120&auto=format&fit=crop'}
                          alt={p.name}
                          className="w-12 h-12 rounded-lg object-cover ring-1 ring-dark-500 shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => handleOpenEdit(p)}
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=120&auto=format&fit=crop';
                          }}
                        />
                        <div className="overflow-hidden max-w-xs">
                          <p 
                            className="font-semibold text-white truncate flex items-center gap-1.5 cursor-pointer hover:text-gold-400 transition-colors"
                            onClick={() => handleOpenEdit(p)}
                          >
                            {p.name}
                            {p.ai_generated && (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 bg-gold-500/20 text-gold-400 border border-gold-500/30 rounded">
                                AI
                              </span>
                            )}
                          </p>
                          <p className="text-gray-400 text-[10px] truncate">{p.material || 'Authentic Handcraft'}</p>
                          {p.rejection_reason && (
                            <p className="text-red-400 text-[10px] truncate font-medium">⚠️ {p.rejection_reason}</p>
                          )}
                          {/* Direct, unmissable Edit button right here in Product Info column */}
                          <div className="mt-1.5 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(p)}
                              className="px-2.5 py-1 rounded bg-gold-500/20 hover:bg-gold-500/35 border border-gold-500/50 text-gold-400 hover:text-gold-300 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer transition-all shadow-sm"
                            >
                              <HiPencilAlt className="w-3.5 h-3.5" /> Edit Product
                            </button>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-300">
                      <span className="px-2 py-0.5 rounded bg-dark-700 text-gray-300 border border-dark-600">
                        {p.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-300 font-medium">
                      {p.artisan_profiles?.store_name || p.artisan_name || 'KalaStyle Artisan'}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-bold text-gold-400">₹{(p.price || 0).toLocaleString('en-IN')}</p>
                      <p className="text-[10px] text-gray-400">Stock: {p.stock_quantity ?? 0}</p>
                    </td>
                    <td className="py-3 px-4">
                      {getStatusBadge(p)}
                    </td>
                    <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap sticky right-0 bg-dark-900/95 backdrop-blur-md shadow-[-8px_0_12px_-2px_rgba(0,0,0,0.5)] z-10 border-l border-dark-700/60">
                      {/* Prominent High-Contrast Gold Edit Button with Text */}
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(p)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-gold-500 hover:bg-gold-400 text-dark-950 font-black text-xs shadow-md shadow-gold-500/20 transition-all cursor-pointer ring-1 ring-gold-400/60"
                        title="Edit Product Details"
                      >
                        <HiPencilAlt className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>Edit</span>
                      </button>

                      {/* Quick View Action */}
                      <button
                        type="button"
                        onClick={() => setPreviewProduct(p)}
                        className="p-1.5 text-gray-400 hover:text-white rounded bg-dark-700 hover:bg-dark-600"
                        title="Quick View Details"
                      >
                        <HiEye className="w-4 h-4" />
                      </button>

                      {/* View Live Store Page */}
                      <Link
                        to={`/products/${p.id}`}
                        target="_blank"
                        className="p-1.5 text-gray-400 hover:text-gold-400 rounded bg-dark-700 hover:bg-dark-600 inline-block"
                        title="View Live Page"
                      >
                        <HiExternalLink className="w-4 h-4" />
                      </Link>

                      {/* Approve Listing */}
                      {p.status !== 'approved' && (
                        <button
                          onClick={() => handleApprove(p.id)}
                          className="p-1.5 text-green-400 hover:text-green-300 rounded bg-green-500/10 hover:bg-green-500/20"
                          title="Approve Listing"
                        >
                          <HiCheckCircle className="w-4 h-4" />
                        </button>
                      )}

                      {/* Reject Listing */}
                      {p.status !== 'rejected' && (
                        <button
                          onClick={() => setRejectModal(p)}
                          className="p-1.5 text-yellow-400 hover:text-yellow-300 rounded bg-yellow-500/10 hover:bg-yellow-500/20"
                          title="Reject with Reason"
                        >
                          <HiXCircle className="w-4 h-4" />
                        </button>
                      )}

                      {/* Hide/Unhide Listing */}
                      <button
                        onClick={() => handleHideToggle(p.id, p.is_hidden)}
                        className={`p-1.5 rounded transition-colors ${
                          p.is_hidden 
                            ? 'text-gray-300 bg-gray-600/20 hover:bg-gray-600/30' 
                            : 'text-gray-400 hover:text-gray-200 bg-dark-700 hover:bg-dark-600'
                        }`}
                        title={p.is_hidden ? 'Unhide Product' : 'Hide from Public Store'}
                      >
                        {p.is_hidden ? <HiEye className="w-4 h-4" /> : <HiEyeOff className="w-4 h-4" />}
                      </button>

                      {/* Delete Listing */}
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="p-1.5 text-red-400 hover:text-red-300 rounded bg-red-500/10 hover:bg-red-500/20"
                        title="Delete Product"
                      >
                        <HiTrash className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center text-gray-500 text-sm">
            No products found matching your search or filter.
          </div>
        )}
      </div>

      {/* Modal: Edit Product (Comprehensive Admin Editor) */}
      {editProduct && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-5">
          <div className="bg-dark-850 border border-dark-600 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-fadeIn">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-dark-700 bg-dark-800/80">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-gold-500/15 border border-gold-500/30 text-gold-400">
                  <HiPencilAlt className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    Edit Product: <span className="text-gold-400 truncate max-w-md">{editFormData.name || 'Untitled'}</span>
                  </h2>
                  <p className="text-[11px] text-gray-400">
                    Artisan Store: <span className="text-gray-300 font-medium">{editProduct.artisan_profiles?.store_name || editProduct.artisan_name || 'Independent Artisan'}</span>
                    {' '}&bull; ID: <span className="font-mono text-gray-500">{editProduct.id}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={handleCloseEdit}
                className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-dark-700 transition-colors"
              >
                <HiX className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleSaveEdit} className="p-6 overflow-y-auto flex-1 space-y-6 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                {/* Left Column: Imagery, Status & Flags (5 cols) */}
                <div className="md:col-span-5 space-y-5">
                  {/* Image Preview & Upload Card */}
                  <div className="card p-4 space-y-3 border-dark-600 bg-dark-800/60">
                    <label className="font-bold text-gray-300 block text-xs flex items-center justify-between">
                      <span>Product Image</span>
                      {uploadingImage && <span className="text-gold-400 animate-pulse text-[10px]">Uploading...</span>}
                    </label>

                    <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-dark-900 border border-dark-600 group">
                      <img
                        src={editFormData.image_url || 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=600&auto=format&fit=crop'}
                        alt="Product preview"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=600&auto=format&fit=crop';
                        }}
                      />
                      {uploadingImage && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                          <HiRefresh className="w-8 h-8 text-gold-400 animate-spin" />
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <label className="btn-secondary text-[11px] py-1.5 px-3 flex items-center gap-1.5 cursor-pointer flex-1 justify-center">
                          <HiUpload className="w-4 h-4 text-gold-400" />
                          <span>Upload New File</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleImageFileChange}
                            disabled={uploadingImage}
                            className="hidden"
                          />
                        </label>
                      </div>

                      <div>
                        <span className="text-[10px] text-gray-400 block mb-1">Or paste direct image URL:</span>
                        <input
                          type="url"
                          value={editFormData.image_url}
                          onChange={e => setEditFormData({ ...editFormData, image_url: e.target.value })}
                          placeholder="https://images.unsplash.com/..."
                          className="w-full bg-dark-700 border border-dark-500 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-gold-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Moderation Status Card */}
                  <div className="card p-4 space-y-3 border-dark-600 bg-dark-800/60">
                    <label className="font-bold text-gray-300 block text-xs">Catalog Moderation Status</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'approved', label: 'Approved', color: 'border-green-500/50 bg-green-500/15 text-green-400' },
                        { id: 'pending', label: 'Pending', color: 'border-yellow-500/50 bg-yellow-500/15 text-yellow-400' },
                        { id: 'rejected', label: 'Rejected', color: 'border-red-500/50 bg-red-500/15 text-red-400' },
                      ].map(st => (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => setEditFormData({ ...editFormData, status: st.id })}
                          className={`py-2 px-2 text-center rounded-lg font-semibold border transition-all text-xs capitalize ${
                            editFormData.status === st.id
                              ? st.color + ' ring-1 ring-gold-500/40 shadow-sm'
                              : 'border-dark-600 bg-dark-700/50 text-gray-400 hover:text-white'
                          }`}
                        >
                          {st.label}
                        </button>
                      ))}
                    </div>

                    {editFormData.status === 'rejected' && (
                      <div className="space-y-1.5 pt-2 border-t border-dark-700">
                        <label className="text-[11px] text-red-400 font-semibold block">Rejection Feedback:</label>
                        <textarea
                          rows={2}
                          value={editFormData.rejection_reason}
                          onChange={e => setEditFormData({ ...editFormData, rejection_reason: e.target.value })}
                          placeholder="State what needs correction..."
                          className="w-full bg-dark-700 border border-red-500/40 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-red-500 resize-none"
                        />
                      </div>
                    )}
                  </div>

                  {/* Badges / Toggles */}
                  <div className="card p-4 space-y-3 border-dark-600 bg-dark-800/60">
                    <label className="flex items-center justify-between cursor-pointer">
                      <div>
                        <p className="font-semibold text-white text-xs">In Stock</p>
                        <p className="text-[10px] text-gray-400">Available for customer checkout</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={editFormData.is_in_stock}
                        onChange={e => setEditFormData({ ...editFormData, is_in_stock: e.target.checked })}
                        className="w-4 h-4 rounded text-gold-500 focus:ring-0 cursor-pointer"
                      />
                    </label>

                    <label className="flex items-center justify-between cursor-pointer pt-2 border-t border-dark-700">
                      <div>
                        <p className="font-semibold text-white text-xs">Authentic Handicraft</p>
                        <p className="text-[10px] text-gray-400">Mark as verified handmade artisan craft</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={editFormData.is_handmade}
                        onChange={e => setEditFormData({ ...editFormData, is_handmade: e.target.checked })}
                        className="w-4 h-4 rounded text-gold-500 focus:ring-0 cursor-pointer"
                      />
                    </label>
                  </div>
                </div>

                {/* Right Column: Details & Pricing (7 cols) */}
                <div className="md:col-span-7 space-y-4">
                  {/* Linked Artisan Store Assignment */}
                  <div>
                    <label className="font-bold text-gold-400 block mb-1 flex items-center justify-between">
                      <span>Artisan Store Assignment</span>
                      <span className="text-[10px] text-gray-400 font-normal">Controls which artisan owns this product</span>
                    </label>
                    <select
                      value={editFormData.artisan_id || ''}
                      onChange={e => setEditFormData({ ...editFormData, artisan_id: e.target.value })}
                      className="w-full bg-dark-700 border border-dark-500 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-gold-500"
                    >
                      <option value="">-- No artisan assigned --</option>
                      {artisansList.map(a => (
                        <option key={a.id} value={a.id}>
                          {a.store_name} ({a.artisan_type || 'Artisan'}) {a.users?.name ? `— by ${a.users.name}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Title */}
                  <div>
                    <label className="font-bold text-gray-300 block mb-1">Product Title *</label>
                    <input
                      type="text"
                      required
                      value={editFormData.name}
                      onChange={e => setEditFormData({ ...editFormData, name: e.target.value })}
                      placeholder="e.g., Banarasi Royal Silk Sherwani"
                      className="w-full bg-dark-700 border border-dark-500 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-gold-500 font-medium"
                    />
                  </div>

                  {/* Category & Subcategory */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold text-gray-300 block mb-1">Category *</label>
                      <input
                        list="categories-list"
                        required
                        value={editFormData.category}
                        onChange={e => setEditFormData({ ...editFormData, category: e.target.value })}
                        placeholder="Select or enter category..."
                        className="w-full bg-dark-700 border border-dark-500 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-gold-500"
                      />
                      <datalist id="categories-list">
                        {COMMON_CATEGORIES.map(c => <option key={c} value={c} />)}
                      </datalist>
                    </div>

                    <div>
                      <label className="font-bold text-gray-300 block mb-1">Subcategory</label>
                      <input
                        type="text"
                        value={editFormData.subcategory}
                        onChange={e => setEditFormData({ ...editFormData, subcategory: e.target.value })}
                        placeholder="e.g. Sarees, Waistcoats, Kurtas"
                        className="w-full bg-dark-700 border border-dark-500 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-gold-500"
                      />
                    </div>
                  </div>

                  {/* Price & Original Price (MRP) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold text-gray-300 block mb-1">Selling Price (₹) *</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gold-400 font-bold">₹</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          required
                          value={editFormData.price}
                          onChange={e => setEditFormData({ ...editFormData, price: e.target.value })}
                          placeholder="2499"
                          className="w-full bg-dark-700 border border-dark-500 rounded-lg pl-7 pr-3 py-2.5 text-xs text-white focus:outline-none focus:border-gold-500 font-bold"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="font-bold text-gray-300">Original MRP (₹)</label>
                        {Number(editFormData.original_price) > Number(editFormData.price) && (
                          <span className="text-[10px] font-bold text-green-400 bg-green-500/10 px-1.5 py-0.2 rounded border border-green-500/30">
                            {Math.round(((editFormData.original_price - editFormData.price) / editFormData.original_price) * 100)}% OFF
                          </span>
                        )}
                      </div>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">₹</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={editFormData.original_price}
                          onChange={e => setEditFormData({ ...editFormData, original_price: e.target.value })}
                          placeholder="Optional strikethrough MRP"
                          className="w-full bg-dark-700 border border-dark-500 rounded-lg pl-7 pr-3 py-2.5 text-xs text-white focus:outline-none focus:border-gold-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Stock Quantity & Barcode */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold text-gray-300 block mb-1">Stock Units</label>
                      <input
                        type="number"
                        min="0"
                        value={editFormData.stock_quantity}
                        onChange={e => setEditFormData({ ...editFormData, stock_quantity: e.target.value })}
                        className="w-full bg-dark-700 border border-dark-500 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-gold-500"
                      />
                    </div>

                    <div>
                      <label className="font-bold text-gray-300 block mb-1">Barcode / SKU</label>
                      <input
                        type="text"
                        value={editFormData.barcode}
                        onChange={e => setEditFormData({ ...editFormData, barcode: e.target.value })}
                        placeholder="Optional SKU or barcode"
                        className="w-full bg-dark-700 border border-dark-500 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-gold-500 font-mono text-[11px]"
                      />
                    </div>
                  </div>

                  {/* Material & Style */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold text-gray-300 block mb-1">Material / Fabric</label>
                      <input
                        type="text"
                        value={editFormData.material}
                        onChange={e => setEditFormData({ ...editFormData, material: e.target.value })}
                        placeholder="e.g. Mulberry Silk, Pure Linen"
                        className="w-full bg-dark-700 border border-dark-500 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-gold-500"
                      />
                    </div>

                    <div>
                      <label className="font-bold text-gray-300 block mb-1">Style / Craft Pattern</label>
                      <input
                        type="text"
                        value={editFormData.style}
                        onChange={e => setEditFormData({ ...editFormData, style: e.target.value })}
                        placeholder="e.g. Traditional, Hand-embroidered"
                        className="w-full bg-dark-700 border border-dark-500 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-gold-500"
                      />
                    </div>
                  </div>

                  {/* Available Sizes */}
                  <div>
                    <label className="font-bold text-gray-300 block mb-1.5">Available Sizes</label>
                    <div className="flex flex-wrap gap-1.5">
                      {AVAILABLE_SIZES.map(sz => {
                        const isSelected = Array.isArray(editFormData.sizes) && editFormData.sizes.includes(sz);
                        return (
                          <button
                            type="button"
                            key={sz}
                            onClick={() => handleToggleSize(sz)}
                            className={`px-3 py-1 rounded-lg border text-xs font-semibold transition-all ${
                              isSelected
                                ? 'bg-gold-500/20 text-gold-400 border-gold-500/60 shadow-sm'
                                : 'bg-dark-700 border-dark-600 text-gray-400 hover:text-white'
                            }`}
                          >
                            {sz}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="font-bold text-gray-300 block mb-1">Product Description</label>
                    <textarea
                      rows={4}
                      value={editFormData.description}
                      onChange={e => setEditFormData({ ...editFormData, description: e.target.value })}
                      placeholder="Detailed product story, craftsmanship details, care instructions..."
                      className="w-full bg-dark-700 border border-dark-500 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-gold-500 leading-relaxed resize-none"
                    />
                  </div>

                  {/* Tags */}
                  <div>
                    <label className="font-bold text-gray-300 block mb-1">Tags (Comma-separated)</label>
                    <div className="relative">
                      <HiTag className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <input
                        type="text"
                        value={editFormData.tags}
                        onChange={e => setEditFormData({ ...editFormData, tags: e.target.value })}
                        placeholder="handcrafted, wedding, silk, premium"
                        className="w-full bg-dark-700 border border-dark-500 rounded-lg pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-gold-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-between pt-4 border-t border-dark-700">
                <p className="text-[11px] text-gray-500 hidden sm:block">
                  Updates sync across the live storefront and customer app immediately.
                </p>
                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    onClick={handleCloseEdit}
                    className="btn-secondary text-xs py-2 px-4"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingEdit}
                    className="btn-primary text-xs py-2 px-6 flex items-center gap-2"
                  >
                    {savingEdit ? (
                      <>
                        <HiRefresh className="w-4 h-4 animate-spin" />
                        Saving Changes...
                      </>
                    ) : (
                      <>
                        <HiCheck className="w-4 h-4" />
                        Save Changes
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Rejection Reason */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="card max-w-md w-full p-6 space-y-4 border border-dark-500">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-white text-sm">Reject Product: {rejectModal.name}</h3>
              <button onClick={() => setRejectModal(null)} className="text-gray-400 hover:text-white">
                <HiX className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-400">
              Provide a clear reason so the artisan knows what to correct:
            </p>
            <div className="space-y-2">
              {[
                'Incorrect product details or category mismatch',
                'Low resolution or unclear product imagery',
                'Missing craft material information',
                'Pricing or shipping policy discrepancy',
                'Duplicate listing'
              ].map(opt => (
                <label key={opt} className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                  <input
                    type="radio"
                    name="reason"
                    checked={rejectReason === opt}
                    onChange={() => setRejectReason(opt)}
                    className="text-gold-500 focus:ring-0"
                  />
                  <span>{opt}</span>
                </label>
              ))}
              <textarea
                rows={3}
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="Or type custom rejection reason..."
                className="w-full bg-dark-700 border border-dark-500 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-gold-500 mt-2 resize-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setRejectModal(null)} className="btn-secondary text-xs py-2 px-3">
                Cancel
              </button>
              <button
                onClick={handleRejectSubmit}
                disabled={rejecting}
                className="btn-primary bg-red-500 hover:bg-red-600 border-red-500 text-white text-xs py-2 px-4"
              >
                {rejecting ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Quick Preview */}
      {previewProduct && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="card max-w-lg w-full p-6 space-y-4 border border-dark-500 relative max-h-[90vh] overflow-y-auto">
            <button onClick={() => setPreviewProduct(null)} className="absolute top-4 right-4 text-gray-400 hover:text-white">
              <HiX className="w-5 h-5" />
            </button>
            <div className="flex gap-4 items-start">
              <img
                src={previewProduct.image_url || 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=300&auto=format&fit=crop'}
                alt=""
                className="w-24 h-24 rounded-xl object-cover ring-1 ring-gold-500 shrink-0"
              />
              <div className="space-y-1">
                <h3 className="font-bold text-white text-base">{previewProduct.name}</h3>
                <p className="text-gold-400 text-xs font-semibold">{previewProduct.category} • ₹{previewProduct.price}</p>
                <div className="mt-1">{getStatusBadge(previewProduct)}</div>
              </div>
            </div>
            <div className="space-y-2 text-xs border-t border-dark-600 pt-3">
              <p><strong className="text-gray-400">Material:</strong> <span className="text-gray-200">{previewProduct.material || 'Handcrafted'}</span></p>
              <p><strong className="text-gray-400">Artisan:</strong> <span className="text-gray-200">{previewProduct.artisan_profiles?.store_name || 'KalaStyle Artisan'}</span></p>
              <p><strong className="text-gray-400">Description:</strong></p>
              <div className="p-3 bg-dark-750 rounded-lg text-gray-300 leading-relaxed border border-dark-600">
                {previewProduct.description || 'No description provided.'}
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                onClick={() => {
                  const target = previewProduct;
                  setPreviewProduct(null);
                  handleOpenEdit(target);
                }}
                className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5"
              >
                <HiPencilAlt className="w-4 h-4" /> Edit This Product
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
