import React, { createContext, useContext, useState, useEffect } from 'react';
import toast from 'react-hot-toast';

const CartContext = createContext(null);

export const CartProvider = ({ children }) => {
  const [items, setItems] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('sh_cart') || '[]');
    } catch { return []; }
  });

  // Persist cart to localStorage on every change
  useEffect(() => {
    localStorage.setItem('sh_cart', JSON.stringify(items));
  }, [items]);

  const addToCart = (product, size, quantity = 1) => {
    const key = `${product.id}-${size}`;
    const exists = items.some((i) => i.key === key);

    setItems((prev) => {
      if (exists) {
        return prev.map((i) =>
          i.key === key ? { ...i, quantity: i.quantity + quantity } : i
        );
      }
      return [...prev, { key, product, size, quantity }];
    });

    if (exists) {
      toast.success(`${product.name} quantity updated! 🛒`, { id: 'cart-toast' });
    } else {
      toast.success(`${product.name} added to cart 🛒`, { id: 'cart-toast' });
    }

    try {
      window.dispatchEvent(new CustomEvent('kala:signal', { detail: { type: 'CART', product } }));
    } catch {}
  };

  const removeFromCart = (key) => {
    setItems((prev) => prev.filter((i) => i.key !== key));
    toast.success('Item removed', { id: 'cart-toast' });
  };

  const updateQuantity = (key, quantity) => {
    if (quantity < 1) return removeFromCart(key);
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, quantity } : i)));
  };

  const clearCart = () => setItems([]);

  const totalItems    = items.reduce((s, i) => s + i.quantity, 0);
  const totalPrice    = items.reduce((s, i) => s + i.product.price * i.quantity, 0);

  return (
    <CartContext.Provider value={{ items, addToCart, removeFromCart, updateQuantity, clearCart, totalItems, totalPrice }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be inside <CartProvider>');
  return ctx;
};
