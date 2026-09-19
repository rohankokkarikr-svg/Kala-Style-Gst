import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, Pagination } from 'swiper/modules';
import { HiStar, HiCheckCircle, HiOutlineShoppingBag } from 'react-icons/hi';
import { reviewAPI } from '../services/api';
import { getAvatarUrl } from '../utils/avatarUtils';
import 'swiper/css';
import 'swiper/css/pagination';

export default function Testimonials() {
  const [reviews, setReviews] = useState([]);

  useEffect(() => {
    reviewAPI.getApproved()
      .then(res => {
        const data = res.data;
        setReviews(Array.isArray(data) ? data : []);
      })
      .catch(err => {
        console.error('Failed to load reviews', err);
        setReviews([]);
      });
  }, []);

  if (!reviews || reviews.length === 0) {
    return null;
  }

  const displayReviews = reviews;

  return (
    <section className="relative py-24 bg-dark-900 overflow-hidden">
      {/* Background Effects */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-gold-500/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-white/5 rounded-full blur-[100px] pointer-events-none" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
        
        {/* Header Section */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gold-500/10 border border-gold-500/20 mb-6">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gold-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-gold-500"></span>
            </span>
            <span className="text-gold-400 text-xs font-bold uppercase tracking-widest">
              10,000+ Happy Customers
            </span>
          </div>
          
          <h2 className="text-3xl md:text-5xl font-serif font-bold text-white mb-4">
            What Our <span className="text-gold-500">Customers Say</span>
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto text-lg">
            Trusted by thousands of craft lovers. Experience the luxury of authentic Indian artisanal craftsmanship.
          </p>
        </motion.div>

        {/* Testimonials Slider */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          <Swiper
            modules={[Autoplay, Pagination]}
            spaceBetween={30}
            slidesPerView={1}
            breakpoints={{
              640: { slidesPerView: 1 },
              768: { slidesPerView: 2 },
              1024: { slidesPerView: 3 },
            }}
            autoplay={{ delay: 5000, disableOnInteraction: false }}
            pagination={{ clickable: true, dynamicBullets: true }}
            className="pb-16"
          >
            {displayReviews.map((review) => (
              <SwiperSlide key={review.id} className="h-auto">
                <div className="h-full relative group">
                  {/* Card Background (Glassmorphism) */}
                  <div className="h-full bg-dark-800/80 backdrop-blur-md border border-white/5 rounded-2xl p-8 transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_8px_30px_rgba(201,168,76,0.15)] hover:border-gold-500/30 flex flex-col justify-between relative overflow-hidden">
                    
                    {/* Background Quote Icon */}
                    <span className="absolute -top-4 -right-2 text-9xl text-white/5 font-serif select-none pointer-events-none group-hover:text-gold-500/5 transition-colors duration-500">
                      "
                    </span>

                    <div>
                      {/* Rating */}
                      <div className="flex gap-1 mb-6">
                        {[...Array(5)].map((_, i) => (
                          <motion.div 
                            key={i}
                            initial={{ opacity: 0, scale: 0 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.3 + (i * 0.1) }}
                          >
                            <HiStar className="w-5 h-5 text-gold-500" />
                          </motion.div>
                        ))}
                      </div>

                      {/* Review Text */}
                      <p className="text-gray-300 text-lg leading-relaxed mb-8 italic relative z-10">
                        "{review.review_text}"
                      </p>
                    </div>

                    {/* Customer Info */}
                    <div className="mt-auto border-t border-white/10 pt-6 relative z-10">
                      <div className="flex items-center gap-4">
                        <div className="relative w-14 h-14 rounded-full overflow-hidden border-2 border-dark-600 group-hover:border-gold-500 transition-colors duration-300 bg-dark-700">
                          <img 
                            src={review.image_url || getAvatarUrl(review.customer_name)}
                            alt={review.customer_name}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                            onError={(e) => { e.target.src = getAvatarUrl(review.customer_name + '_fallback'); }}
                          />
                        </div>
                        <div>
                          <h4 className="text-white font-bold text-lg">{review.customer_name}</h4>
                          <div className="flex items-center gap-1 text-green-400 text-xs font-medium mt-1">
                            <HiCheckCircle className="w-4 h-4" />
                            Verified Buyer
                          </div>
                        </div>
                      </div>
                      
                      {/* Purchased Product Tag */}
                      <div className="mt-4 flex items-center gap-2 text-xs text-gray-500 bg-dark-900/50 w-max px-3 py-1.5 rounded-full border border-white/5">
                        <HiOutlineShoppingBag className="w-3.5 h-3.5 text-gold-500" />
                        Purchased: <span className="text-gray-400">{review.product_name}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </SwiperSlide>
            ))}
          </Swiper>
        </motion.div>



      </div>
    </section>
  );
}
