import React from 'react';
import { Navigate as NavRedirect, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

import { normalizeRole } from '../utils/authHelper';

/** Protects any route behind authenticated session */
export function PrivateRoute({ children }) {
  const { isAuthenticated, loading, user } = useAuth();
  const location = useLocation();

  if (loading) return <PageLoader />;
  return (isAuthenticated && user) ? children : <NavRedirect to="/login" state={{ from: location }} replace />;
}

/** Only allows verified admin-role users */
export function AdminRoute({ children }) {
  const { isAuthenticated, isAdmin, isArtisan, loading, user } = useAuth();
  const role = normalizeRole(user?.role);

  if (loading) return <PageLoader />;
  if (!isAuthenticated || !user) return <NavRedirect to="/login" replace />;

  if (role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-900 px-4">
        <div className="card max-w-md w-full p-8 text-center space-y-6 border border-red-500/30">
          <div className="w-16 h-16 bg-red-500/20 text-red-400 rounded-full flex items-center justify-center text-3xl mx-auto">
            🚫
          </div>
          <div>
            <h2 className="text-2xl font-serif font-bold text-white">Access Denied</h2>
            <p className="text-gray-400 text-sm mt-2">
              You do not have administrative permissions to access the Admin Control Center.
            </p>
          </div>
          <div className="flex flex-col gap-3 pt-2">
            <button
              onClick={() => window.history.back()}
              className="btn-secondary w-full"
            >
              ← Go Back
            </button>
            <Link
              to={role === 'artisan' ? '/artisan' : '/'}
              className="btn-primary w-full text-center block"
            >
              {role === 'artisan' ? 'Go to Artisan Studio' : 'Return to Storefront'}
            </Link>
          </div>
        </div>
      </div>
    );
  }
  return children;
}

/** Only allows verified artisan-role (and admin) users */
export function ArtisanRoute({ children }) {
  const { isAuthenticated, loading, user } = useAuth();
  const role = normalizeRole(user?.role);

  if (loading) return <PageLoader />;
  if (!isAuthenticated || !user) return <NavRedirect to="/login" replace />;

  const artisanAllowed = role === 'artisan' || role === 'admin';
  if (!artisanAllowed) return <NavRedirect to="/" replace />;
  return children;
}

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-900">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-dark-600 border-t-gold-500
                        rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-400 text-sm">Loading…</p>
      </div>
    </div>
  );
}
