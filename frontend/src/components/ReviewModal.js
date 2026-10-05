import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HiX, HiStar } from 'react-icons/hi';
import { reviewAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function ReviewModal({ isOpen, onClose, product, productName, onReviewSubmitted }) {
  const { user } = useAuth();
  const targetProductName = product?.name || productName || 'Authentic Handcrafted Product';

  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewerName, setReviewerName] = useState('');
  const [reviewText, setReviewText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user?.name) {
      setReviewerName(user.name);
    }
  }, [user]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const finalName = (reviewerName || user?.name || '').trim();
    if (!finalName) return toast.error('Please enter your name');
    if (!reviewText.trim()) return toast.error('Please write your review message');
    if (reviewText.trim().length < 10) return toast.error('Please write at least 10 characters in your review');

    setSubmitting(true);
    try {
      const newReviewData = {
        product_id: product?.id,
        customer_name: finalName,
        product_name: targetProductName,
        rating,
        review_text: reviewText.trim(),
        image_url: ''
      };
      
      const res = await reviewAPI.submit(newReviewData);
      const savedReview = res?.data?.review || res?.data || {
        ...newReviewData,
        id: 'rev-' + Date.now(),
        created_at: new Date().toISOString(),
        is_approved: false
      };
      
      toast.success('Thank you! Your review has been submitted for moderation.');
      if (onReviewSubmitted && savedReview.is_approved) {
        onReviewSubmitted(savedReview);
      }
      setReviewText('');
      setRating(5);
      onClose();
    } catch (err) {
      console.error('Submit review error:', err);
      toast.error(err.response?.data?.error || 'Failed to submit review. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="bg-dark-800 rounded-2xl border border-dark-600 shadow-2xl w-full max-w-lg overflow-hidden"
        >
          {/* Header */}
          <div className="flex justify-between items-center p-6 border-b border-dark-600 bg-dark-900/60">
            <div>
              <h2 className="text-xl font-serif font-bold text-white">Write a Review</h2>
              <p className="text-xs text-gold-400 mt-1 truncate max-w-sm">{targetProductName}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-dark-700">
              <HiX className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {/* Rating Stars */}
            <div className="flex flex-col items-center py-2">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-2 font-semibold">Your Overall Rating</p>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    onClick={() => setRating(star)}
                    className="focus:outline-none transition-transform hover:scale-110"
                  >
                    <HiStar 
                      className={`w-10 h-10 ${
                        star <= (hoverRating || rating) 
                          ? 'text-gold-500 drop-shadow-[0_0_8px_rgba(201,168,76,0.5)]' 
                          : 'text-dark-600'
                      } transition-colors duration-200`} 
                    />
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs font-semibold text-gold-400 min-h-[16px]">
                {(hoverRating || rating) === 5 && "★★★★★ Outstanding Quality & Craftsmanship"}
                {(hoverRating || rating) === 4 && "★★★★☆ Very Good Product"}
                {(hoverRating || rating) === 3 && "★★★☆☆ Satisfactory"}
                {(hoverRating || rating) === 2 && "★★☆☆☆ Below Expectations"}
                {(hoverRating || rating) === 1 && "★☆☆☆☆ Poor"}
              </p>
            </div>

            {/* Reviewer Name */}
            <div>
              <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                Your Name / Display Name *
              </label>
              <input
                type="text"
                className="w-full bg-dark-900 border border-dark-600 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-gold-500/80"
                placeholder="e.g. Ramesh K. or Ananya Sharma"
                value={reviewerName}
                onChange={(e) => setReviewerName(e.target.value)}
                required
              />
            </div>

            {/* Review Message */}
            <div>
              <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                Your Detailed Review *
              </label>
              <textarea
                rows="4"
                className="w-full bg-dark-900 border border-dark-600 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-gold-500/80 resize-none leading-relaxed"
                placeholder="Describe the craftsmanship, quality of material, packaging, and authentic experience..."
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                required
              />
            </div>

            {/* Footer Buttons */}
            <div className="flex gap-3 pt-2">
              <button 
                type="button" 
                onClick={onClose} 
                className="btn-outline flex-1 py-2.5 text-xs"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                disabled={submitting} 
                className="btn-primary flex-1 py-2.5 text-xs font-semibold disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {submitting ? 'Posting Review...' : 'Submit & Post Review'}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
