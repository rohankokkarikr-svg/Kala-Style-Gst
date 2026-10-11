import React, { useEffect, useState } from 'react';
import { 
  HiStar, 
  HiCheckCircle, 
  HiEyeOff, 
  HiTrash, 
  HiRefresh,
  HiFilter
} from 'react-icons/hi';
import { adminAPI, reviewAPI } from '../../services/api';
import toast from 'react-hot-toast';

export default function Reviews() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ratingFilter, setRatingFilter] = useState('all');

  const fetchReviews = async () => {
    setLoading(true);
    try {
      const res = await adminAPI.getReviews({ rating: ratingFilter });
      let data = res?.data;
      if (!Array.isArray(data) || data.length === 0) {
        // Fallback to /reviews/admin if /admin/reviews returned empty or non-array
        try {
          const fallbackRes = await reviewAPI.getAll({ rating: ratingFilter });
          if (Array.isArray(fallbackRes?.data) && fallbackRes.data.length > 0) {
            data = fallbackRes.data;
          }
        } catch (_) {}
      }
      setReviews(Array.isArray(data) ? data : []);
    } catch {
      try {
        const fallbackRes = await reviewAPI.getAll({ rating: ratingFilter });
        setReviews(Array.isArray(fallbackRes?.data) ? fallbackRes.data : []);
      } catch {
        toast.error('Failed to load reviews');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, [ratingFilter]);

  const handleApproveToggle = async (id, isCurrentlyApproved) => {
    const nextApproved = !isCurrentlyApproved;
    try {
      await adminAPI.approveReview(id, { is_approved: nextApproved });
      toast.success(nextApproved ? 'Review approved & published!' : 'Review hidden');
      setReviews(prev => prev.map(r => r.id === id ? { ...r, is_approved: nextApproved, status: nextApproved ? 'approved' : 'hidden' } : r));
    } catch {
      try {
        await reviewAPI.approve(id, { is_approved: nextApproved });
        toast.success(nextApproved ? 'Review approved & published!' : 'Review hidden');
        setReviews(prev => prev.map(r => r.id === id ? { ...r, is_approved: nextApproved, status: nextApproved ? 'approved' : 'hidden' } : r));
      } catch {
        toast.error('Failed to update review status');
      }
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this review?')) return;
    try {
      await adminAPI.deleteReview(id);
      toast.success('Review deleted');
      setReviews(prev => prev.filter(r => r.id !== id));
    } catch {
      try {
        await reviewAPI.delete(id);
        toast.success('Review deleted');
        setReviews(prev => prev.filter(r => r.id !== id));
      } catch {
        toast.error('Failed to delete review');
      }
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-white flex items-center gap-2">
            <HiStar className="text-gold-400 w-7 h-7" /> Customer Review Moderation
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Maintain authenticity and protect artisans from spam or fraudulent reviews.
          </p>
        </div>
        <button
          onClick={fetchReviews}
          className="btn-secondary self-start sm:self-auto flex items-center gap-2 text-xs py-2"
        >
          <HiRefresh className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh Reviews
        </button>
      </div>

      {/* Filter Bar */}
      <div className="card p-4 flex items-center gap-2 overflow-x-auto">
        <HiFilter className="text-gray-500 w-4 h-4 shrink-0" />
        <span className="text-xs text-gray-400 shrink-0">Filter by Rating:</span>
        {['all', '5', '4', '3', '2', '1'].map(r => (
          <button
            key={r}
            onClick={() => setRatingFilter(r)}
            className={`text-xs px-3 py-1.5 rounded-lg transition-all border flex items-center gap-1 ${
              ratingFilter === r 
                ? 'bg-gold-500/20 border-gold-500/50 text-gold-400 font-semibold' 
                : 'border-dark-600 text-gray-400 hover:text-white'
            }`}
          >
            {r === 'all' ? 'All Ratings' : `${r} ★`}
          </button>
        ))}
      </div>

      {/* Reviews Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-4">
            {[1, 2, 3].map(i => <div key={i} className="h-14 shimmer rounded-lg" />)}
          </div>
        ) : reviews.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-dark-800/80 text-gray-400 border-b border-dark-600 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Customer & Product</th>
                  <th className="py-3 px-4">Rating</th>
                  <th className="py-3 px-4">Review Content</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-600/50">
                {reviews.map(r => {
                  const isApproved = Boolean(r.is_approved) || String(r.status || '').toLowerCase() === 'approved';
                  return (
                    <tr key={r.id} className="hover:bg-dark-700/30 transition-colors">
                      <td className="py-3 px-4">
                        <p className="font-semibold text-white truncate">{r.customer_name || 'Customer'}</p>
                        <p className="text-gold-400 text-[11px] truncate">{r.product_name || 'Handicraft Item'}</p>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center text-gold-400">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <span key={i} className={i < r.rating ? 'text-gold-400' : 'text-gray-600'}>★</span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-4 max-w-sm">
                        <p className="text-gray-300 line-clamp-2 leading-relaxed">{r.review_text}</p>
                      </td>
                      <td className="py-3 px-4">
                        {isApproved ? (
                          <span className="badge bg-green-500/20 text-green-400 border border-green-500/30">Published</span>
                        ) : (
                          <span className="badge bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">Pending Approval</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-gray-400">
                        {r.created_at ? new Date(r.created_at).toLocaleDateString('en-IN') : '-'}
                      </td>
                      <td className="py-3 px-4 text-right space-x-1.5">
                        <button
                          onClick={() => handleApproveToggle(r.id, isApproved)}
                          className={`p-1.5 rounded transition-colors ${
                            isApproved 
                              ? 'text-yellow-400 bg-yellow-500/10 hover:bg-yellow-500/20' 
                              : 'text-green-400 bg-green-500/10 hover:bg-green-500/20'
                          }`}
                          title={isApproved ? 'Hide Review' : 'Approve & Publish'}
                        >
                          {isApproved ? <HiEyeOff className="w-4 h-4" /> : <HiCheckCircle className="w-4 h-4" />}
                        </button>
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="p-1.5 text-red-400 hover:text-red-300 rounded bg-red-500/10 hover:bg-red-500/20"
                        title="Delete Review"
                      >
                        <HiTrash className="w-4 h-4" />
                      </button>
                    </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center text-gray-500 text-sm">
            No customer reviews found.
          </div>
        )}
      </div>
    </div>
  );
}
