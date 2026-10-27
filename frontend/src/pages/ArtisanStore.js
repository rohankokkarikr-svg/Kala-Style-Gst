import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { artisanAPI } from '../services/api';
import ProductCard from '../components/ProductCard';
import { ProductCardSkeleton } from '../components/Skeleton';
import Footer from '../components/Footer';
import { HiLocationMarker, HiArrowLeft } from 'react-icons/hi';

export default function ArtisanStore() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    artisanAPI.getById(id).then(({ data }) => { setData(data); setLoading(false); }).catch(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 space-y-8">
      <div className="shimmer h-48 rounded-2xl" />
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">{[1,2,3,4].map(i => <ProductCardSkeleton key={i} />)}</div>
    </div>
  );

  if (!data?.profile) return (
    <div className="min-h-[60vh] flex items-center justify-center flex-col gap-4">
      <div className="text-6xl">🎨</div>
      <h2 className="text-xl font-semibold text-white">Artisan not found</h2>
      <Link to="/products" className="btn-outline">Browse Products</Link>
    </div>
  );

  const { profile, products } = data;

  return (
    <div className="min-h-screen">
      {/* Hero Banner — compact 2-col layout */}
      <div
        className="border-b border-dark-600 py-4 relative overflow-hidden"
        style={{
          backgroundImage: `url('/images/artisan_profile_bg.jpg')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center top',
          backgroundRepeat: 'no-repeat',
        }}
      >
        {/* Dark overlay */}
        <div className="absolute inset-0 bg-dark-950/80" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
          {/* Back link */}
          <Link to="/products" className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gold-400 text-xs mb-3 transition-colors">
            <HiArrowLeft className="w-3.5 h-3.5" /> Back to Products
          </Link>

          {/* 2-column grid: Left info | Right stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">

            {/* LEFT — Avatar + Name + Bio */}
            <div className="flex items-center gap-4">
              {/* Avatar */}
              <div className="relative w-14 h-14 rounded-full overflow-hidden ring-2 ring-gold-500/50 shrink-0 bg-dark-800 flex items-center justify-center shadow-lg">
                {profile.profile_image ? (
                  <img
                    src={profile.profile_image}
                    alt={profile.store_name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      if (e.currentTarget.nextSibling) e.currentTarget.nextSibling.style.display = 'flex';
                    }}
                  />
                ) : null}
                <div className={`w-full h-full bg-gradient-luxury items-center justify-center text-dark-900 font-bold text-xl ${profile.profile_image ? 'hidden' : 'flex'}`}>
                  {(profile.store_name || 'A')[0].toUpperCase()}
                </div>
              </div>

              {/* Name + location + short bio */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl md:text-2xl font-serif font-bold text-white leading-tight">{profile.store_name}</h1>
                  {profile.verification_status === 'verified' && (
                    <span className="badge bg-green-500/20 text-green-400 border border-green-500/30 text-[10px] px-2 py-0.5">✓ Verified</span>
                  )}
                </div>
                {profile.location && (
                  <p className="text-gray-400 text-xs mt-0.5 flex items-center gap-1">
                    <HiLocationMarker className="w-3 h-3 text-gold-500" />{profile.location}
                  </p>
                )}
                {profile.artisan_type && (
                  <p className="text-gray-500 text-xs mt-0.5">{profile.artisan_type}</p>
                )}
                {profile.bio && (
                  <p className="text-gray-400 text-xs mt-1.5 leading-relaxed line-clamp-2">
                    {profile.bio.split('__UPI_META__:')[0].trim()}
                  </p>
                )}
              </div>
            </div>

            {/* RIGHT — Stats + Specialization + Tags */}
            <div className="flex flex-col gap-3 md:items-end">
              {/* Stats row */}
              <div className="flex items-center gap-4">
                <div className="text-center px-4 py-2 rounded-xl bg-dark-800/70 border border-dark-600/80 backdrop-blur-sm">
                  <p className="text-2xl font-bold text-white font-mono">{products.length}</p>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">Products</p>
                </div>
                {profile.years_of_experience && (
                  <div className="text-center px-4 py-2 rounded-xl bg-dark-800/70 border border-dark-600/80 backdrop-blur-sm">
                    <p className="text-2xl font-bold text-gold-400 font-mono">{profile.years_of_experience}+</p>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider">Yrs Heritage</p>
                  </div>
                )}
              </div>
              {/* Specialization pill */}
              {profile.specialization && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gold-500/10 border border-gold-500/30 text-gold-300 text-xs font-medium">
                  🧵 {profile.specialization}
                </span>
              )}
            </div>

          </div>
        </div>
      </div>


      {/* Products Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <h2 className="text-2xl font-serif font-bold text-white mb-8">
          Products by {profile.store_name}
          <div className="h-1 w-16 bg-gold-500 rounded-full mt-2" />
        </h2>
        {products.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {products.map(p => <ProductCard key={p.id} product={p} />)}
          </div>
        ) : (
          <div className="text-center py-16 text-gray-500">
            <div className="text-6xl mb-4">📦</div>
            <p>No products listed yet. Check back soon!</p>
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}
