import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { artisanAPI, productAPI } from '../../services/api';
import { HiTrash, HiSparkles, HiRefresh, HiCheckCircle, HiExclamationCircle, HiEyeOff, HiPhotograph } from 'react-icons/hi';
import toast from 'react-hot-toast';
import ProductImageManager from '../../components/ProductImageManager';

export default function ArtisanProducts() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [managerProduct, setManagerProduct] = useState(null);

  const fetchStats = () => {
    setLoading(true);
    artisanAPI.getMyStats().then(({ data }) => {
      setProducts(data.products || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchStats();
  }, []);

  // Real-time listener: instantly reflect Admin approval / changes
  useEffect(() => {
    const handleSync = (e) => {
      const payload = e.detail?.payload;
      fetchStats();
      if (payload?.action === 'approve') {
        toast.success('🎉 Product approved by Admin and is now live!');
      } else if (payload?.action === 'reject') {
        toast.error('⚠️ Product review updated by Admin');
      }
    };
    window.addEventListener('kala:sync:products_updated', handleSync);
    return () => window.removeEventListener('kala:sync:products_updated', handleSync);
  }, []);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this product permanently?')) return;
    try {
      await productAPI.delete(id);
      setProducts(p => p.filter(x => x.id !== id));
      toast.success('Product deleted successfully');
    } catch { toast.error('Failed to delete product'); }
  };

  const getStatusBadge = (p) => {
    if (p.is_hidden) {
      return (
        <span className="bg-gray-800/90 text-gray-300 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-md flex items-center gap-1 border border-gray-600">
          <HiEyeOff className="w-3 h-3" /> Hidden by Admin
        </span>
      );
    }
    if (p.status === 'rejected') {
      return (
        <span className="bg-red-600/95 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-md flex items-center gap-1">
          <HiExclamationCircle className="w-3 h-3" /> Rejected
        </span>
      );
    }
    if (p.status === 'approved' || p.status === 'active') {
      return (
        <span className="bg-green-600/95 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-md flex items-center gap-1">
          <HiCheckCircle className="w-3 h-3" /> Approved & Live
        </span>
      );
    }
    return (
      <span className="bg-yellow-500/95 text-dark-900 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-md flex items-center gap-1">
        ⏳ Under Admin Review
      </span>
    );
  };

  const filteredProducts = products.filter(p => {
    if (activeTab === 'approved') return (p.status === 'approved' || p.status === 'active') && !p.is_hidden;
    if (activeTab === 'pending') return (!p.status || p.status === 'pending' || p.status === 'draft') && !p.is_hidden;
    if (activeTab === 'rejected') return p.status === 'rejected';
    if (activeTab === 'hidden') return p.is_hidden;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-white">My Products & Admin Review</h1>
          <p className="text-gray-400 text-sm mt-1">
            {products.length} product{products.length !== 1 ? 's' : ''} in your artisan catalog
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchStats} className="btn-secondary flex items-center gap-1.5 text-xs py-2 px-3">
            <HiRefresh className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <Link to="/artisan/ai-studio" className="btn-primary flex items-center gap-2 text-xs py-2 px-3">
            <HiSparkles className="w-4 h-4" /> Add with AI
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto border-b border-dark-700 pb-2">
        {[
          { id: 'all', label: `All (${products.length})` },
          { id: 'approved', label: `Live & Approved (${products.filter(p => (p.status === 'approved' || p.status === 'active') && !p.is_hidden).length})` },
          { id: 'pending', label: `Under Review (${products.filter(p => (!p.status || p.status === 'pending' || p.status === 'draft') && !p.is_hidden).length})` },
          { id: 'rejected', label: `Rejected (${products.filter(p => p.status === 'rejected').length})` },
          { id: 'hidden', label: `Hidden (${products.filter(p => p.is_hidden).length})` },
        ].map(tab => (

          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`text-xs px-3 py-1.5 rounded-lg whitespace-nowrap transition-all ${
              activeTab === tab.id
                ? 'bg-gold-500/20 text-gold-400 font-semibold border border-gold-500/40'
                : 'text-gray-400 hover:text-white border border-transparent'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <div key={i} className="card h-64 shimmer rounded-xl" />)}
        </div>
      ) : filteredProducts.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProducts.map(p => (
            <div key={p.id} className="card overflow-hidden group flex flex-col border border-dark-600/80 hover:border-gold-500/40 transition-colors">
              <div className="aspect-video bg-dark-700 relative overflow-hidden">
                {p.image_url ? (
                  <img
                    src={p.image_url}
                    alt={p.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=600&auto=format&fit=crop';
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-dark-800 text-gray-400">
                    <span className="text-3xl mb-1">🎨</span>
                    <span className="text-[10px] text-gray-500 font-medium">Authentic Craft</span>
                  </div>
                )}
                
                {/* Badges on Image */}
                <div className="absolute top-2 left-2 flex flex-col gap-1">
                  {getStatusBadge(p)}
                  {p.ai_generated && (
                    <span className="bg-gold-500/90 text-dark-950 text-[9px] font-bold px-1.5 py-0.5 rounded shadow">
                      🤖 AI Generated
                    </span>
                  )}
                </div>

                <div className="absolute top-2 right-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shadow-md ${
                    p.is_in_stock ? 'bg-green-600/90 text-white' : 'bg-red-600/90 text-white'
                  }`}>
                    {p.is_in_stock ? 'In Stock' : 'Out of Stock'}
                  </span>
                </div>
              </div>

              <div className="p-4 flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-white text-sm line-clamp-1">{p.name}</h3>
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <p className="text-gold-400 font-bold text-sm">₹{Number(p.price || 0).toLocaleString('en-IN')}</p>
                    <p className="text-gray-400 text-xs">Stock: {p.stock_quantity ?? 0}</p>
                  </div>
                  <p className="text-gray-500 text-[11px] mt-1 truncate">{p.category || 'Handicrafts'}</p>

                  {/* Rejection Notice Banner */}
                  {p.status === 'rejected' && (
                    <div className="mt-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-xs">
                      <p className="text-red-400 font-semibold flex items-center gap-1 text-[11px]">
                        <HiExclamationCircle className="w-3.5 h-3.5 shrink-0" /> Admin Feedback:
                      </p>
                      <p className="text-gray-300 text-[11px] mt-0.5 leading-relaxed">
                        {p.rejection_reason || 'Product does not meet quality requirements. Please update image or description.'}
                      </p>
                    </div>
                  )}

                  {/* Hidden Notice Banner */}
                  {p.is_hidden && (
                    <div className="mt-3 p-2 rounded-lg bg-gray-700/40 border border-gray-600/40 text-xs text-gray-300 flex items-center gap-1.5 text-[11px]">
                      <HiEyeOff className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      Hidden from customer catalog by platform admin.
                    </div>
                  )}
                </div>

                <div className="flex gap-2 mt-4 pt-3 border-t border-dark-700">
                  <Link
                    to={`/products/${p.id}`}
                    className="btn-ghost text-xs px-3 py-1.5 border border-dark-500 rounded-lg flex-1 text-center hover:text-gold-400 hover:border-gold-500/40"
                  >
                    View in Store
                  </Link>
                  <button
                    onClick={() => setManagerProduct(p)}
                    className="btn-ghost text-xs px-2.5 py-1.5 border border-gold-500/30 rounded-lg text-gold-400 hover:bg-gold-500/10 flex items-center gap-1"
                    title="Manage images"
                  >
                    <HiPhotograph className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(p.id)}
                    className="btn-ghost text-xs px-2.5 py-1.5 border border-red-500/30 rounded-lg text-red-400 hover:bg-red-500/10"
                    title="Delete product"
                  >
                    <HiTrash className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card p-12 text-center">
          <div className="text-5xl mb-4">📦</div>
          <h3 className="text-lg font-semibold text-white mb-2">No products in this view</h3>
          <p className="text-gray-400 text-sm mb-4">
            {activeTab !== 'all' ? `You have no products under "${activeTab}".` : 'Create your first product using our AI Product Studio'}
          </p>
          <Link to="/artisan/ai-studio" className="btn-primary inline-flex items-center gap-2">
            <HiSparkles className="w-4 h-4" /> Create with AI
          </Link>
        </div>
      )}

      {/* Product Image Manager Modal */}
      {managerProduct && (
        <ProductImageManager
          product={managerProduct}
          onClose={() => setManagerProduct(null)}
          onSaved={(newImages) => {
            setProducts(prev => prev.map(p =>
              p.id === managerProduct.id
                ? { ...p, image_url: newImages[0], images: newImages }
                : p
            ));
          }}
        />
      )}
    </div>
  );
}
