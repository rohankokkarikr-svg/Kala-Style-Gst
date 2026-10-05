import React, { createContext, useContext, useState, useEffect } from 'react';
import toast from 'react-hot-toast';

const WishlistContext = createContext();

export const useWishlist = () => {
  const context = useContext(WishlistContext);
  if (!context) {
    throw new Error('useWishlist must be used within a WishlistProvider');
  }
  return context;
};

export const WishlistProvider = ({ children }) => {
  const [wishlist, setWishlist] = useState(() => {
    try {
      const saved = localStorage.getItem('sh_wishlist');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('sh_wishlist', JSON.stringify(wishlist));
    } catch (e) {
      console.warn('Could not save wishlist to localStorage', e);
    }
  }, [wishlist]);

  const addToWishlist = (product) => {
    if (!product || !product.id) return;
    setWishlist((prev) => {
      const exists = prev.some((item) => item.id === product.id);
      if (exists) {
        toast('Already in your Wishlist ❤️', { icon: '✨', id: 'wishlist-toast' });
        return prev;
      }
      toast.success(`${product.name || 'Item'} added to Wishlist! ❤️`, { id: 'wishlist-toast' });
      return [...prev, product];
    });

    try {
      window.dispatchEvent(new CustomEvent('kala:signal', { detail: { type: 'WISHLIST', product } }));
    } catch {}
  };

  const removeFromWishlist = (productId) => {
    setWishlist((prev) => {
      const next = prev.filter((item) => item.id !== productId);
      toast.success('Removed from Wishlist', { id: 'wishlist-toast' });
      return next;
    });
  };

  const toggleWishlist = (product) => {
    if (!product || !product.id) return;
    const exists = wishlist.some((item) => item.id === product.id);
    if (exists) {
      removeFromWishlist(product.id);
    } else {
      addToWishlist(product);
    }
  };

  const isInWishlist = (productId) => {
    return wishlist.some((item) => item.id === productId);
  };

  const clearWishlist = () => {
    setWishlist([]);
  };

  return (
    <WishlistContext.Provider
      value={{
        wishlist,
        totalWishlistItems: wishlist.length,
        addToWishlist,
        removeFromWishlist,
        toggleWishlist,
        isInWishlist,
        clearWishlist,
      }}
    >
      {children}
    </WishlistContext.Provider>
  );
};
