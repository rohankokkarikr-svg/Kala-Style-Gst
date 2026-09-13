import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../services/api';
import toast from 'react-hot-toast';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('sh_user');
      const token = localStorage.getItem('sh_token');
      if (stored && token) {
        const parsed = JSON.parse(stored);
        if (parsed.role) parsed.role = parsed.role.trim().toLowerCase();
        return parsed;
      }
    } catch (e) {}
    return null;
  });
  const [loading, setLoading] = useState(false);

  const refreshUser = async () => {
    const token = localStorage.getItem('sh_token');
    if (!token) return null;
    try {
      const { data } = await authAPI.me();
      if (data) {
        const normalized = { ...data, role: (data.role || 'user').trim().toLowerCase() };
        setUser(normalized);
        localStorage.setItem('sh_user', JSON.stringify(normalized));
        return normalized;
      }
    } catch (err) {
      if (err.response?.status === 401) {
        localStorage.removeItem('sh_token');
        localStorage.removeItem('sh_user');
        setUser(null);
      }
    }
    return null;
  };

  // Auto-sync session on mount with database
  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
  }, []);

  // Real-time listener: immediately sync artisan verification across all devices
  useEffect(() => {
    const handleArtisanSync = (e) => {
      const payload = e.detail?.payload;
      if (payload?.verification_status) {
        setUser(prev => {
          if (!prev) return prev;
          const updatedProfile = {
            ...(prev.artisan_profile || {}),
            verification_status: payload.verification_status
          };
          const updatedUser = { ...prev, artisan_profile: updatedProfile };
          try {
            localStorage.setItem('sh_user', JSON.stringify(updatedUser));
          } catch {}
          return updatedUser;
        });
        refreshUser();
      }
    };
    window.addEventListener('kala:sync:artisans_updated', handleArtisanSync);
    return () => window.removeEventListener('kala:sync:artisans_updated', handleArtisanSync);
  }, []);

  const login = async (phone, password) => {
    const { data } = await authAPI.login({ phone, password });
    const normalizedUser = {
      ...data.user,
      role: (data.user?.role || 'user').trim().toLowerCase(),
    };
    localStorage.setItem('sh_token', data.token);
    localStorage.setItem('sh_user', JSON.stringify(normalizedUser));
    setUser(normalizedUser);
    toast.success(`Welcome back, ${normalizedUser.name}! 👑`);
    return normalizedUser;
  };

  const signup = async (name, phone, password, role = 'user', store_name, artisan_type) => {
    const { data } = await authAPI.signup({ name, phone, password, role, store_name, artisan_type });
    const normalizedUser = {
      ...data.user,
      role: (data.user?.role || 'user').trim().toLowerCase(),
    };
    localStorage.setItem('sh_token', data.token);
    localStorage.setItem('sh_user', JSON.stringify(normalizedUser));
    setUser(normalizedUser);
    toast.success('Account created! Welcome to KalaStyle AI ✨');
    return normalizedUser;
  };

  const logout = () => {
    localStorage.removeItem('sh_token');
    localStorage.removeItem('sh_user');
    setUser(null);
    toast.success('Logged out successfully');
  };

  const getStoredUser = () => {
    try {
      const stored = localStorage.getItem('sh_user');
      const token = localStorage.getItem('sh_token');
      if (stored && token) {
        const parsed = JSON.parse(stored);
        if (parsed.role) parsed.role = parsed.role.trim().toLowerCase();
        return parsed;
      }
    } catch (e) {}
    return null;
  };

  const currentUser = user || getStoredUser();
  const currentRole = (currentUser?.role || '').trim().toLowerCase();
  const isAdmin = currentRole === 'admin';
  const isArtisan = currentRole === 'artisan';
  const isAuthenticated = !!currentUser;

  return (
    <AuthContext.Provider value={{ user: currentUser, loading, login, signup, logout, isAdmin, isArtisan, isAuthenticated, refreshUser, setUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};
