import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useSettings } from './context/SettingsContext';
import { useAuth } from './context/AuthContext';
import Maintenance from './pages/Maintenance';

// Contexts
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { WishlistProvider } from './context/WishlistContext';
import { SettingsProvider } from './context/SettingsContext';
import { RealtimeSyncProvider } from './context/RealtimeSyncContext';
import { LanguageProvider } from './context/LanguageContext';

// Core layout components (immediate paint)
import Navbar from './components/Navbar';
import { PrivateRoute, AdminRoute, ArtisanRoute } from './components/ProtectedRoute';
import SpinWheelPopup from './components/SpinWheelPopup';
import Home from './pages/Home';

// Lazy-loaded Public Pages for ultra-fast bundle & instant loading
const Login = lazy(() => import('./pages/Login'));
const Signup = lazy(() => import('./pages/Signup'));
const ProductList = lazy(() => import('./pages/ProductList'));
const ProductDetail = lazy(() => import('./pages/ProductDetail'));
const Cart = lazy(() => import('./pages/Cart'));
const Wishlist = lazy(() => import('./pages/Wishlist'));
const Checkout = lazy(() => import('./pages/Checkout'));
const Orders = lazy(() => import('./pages/Orders'));
const Rewards = lazy(() => import('./pages/Rewards'));
const Profile = lazy(() => import('./pages/Profile'));
const Leaderboard = lazy(() => import('./pages/Leaderboard'));
const PaymentGateway = lazy(() => import('./pages/PaymentGateway'));
const OrderTracking = lazy(() => import('./pages/OrderTracking'));
const ArtisanStore = lazy(() => import('./pages/ArtisanStore'));

// Lazy-loaded Artisan Pages
const ArtisanLayout = lazy(() => import('./pages/artisan/ArtisanLayout'));
const ArtisanDashboard = lazy(() => import('./pages/artisan/ArtisanDashboard'));
const ArtisanProducts = lazy(() => import('./pages/artisan/ArtisanProducts'));
const AIProductStudio = lazy(() => import('./pages/artisan/AIProductStudio'));
const AIPriceSuggestion = lazy(() => import('./pages/artisan/AIPriceSuggestion'));
const AIArtisanStory = lazy(() => import('./pages/artisan/AIArtisanStory'));
const AIInsightsDashboard = lazy(() => import('./pages/artisan/AIInsightsDashboard'));
const ArtisanOrders = lazy(() => import('./pages/artisan/ArtisanOrders'));
const ArtisanEarnings = lazy(() => import('./pages/artisan/ArtisanEarnings'));
const ArtisanProfile = lazy(() => import('./pages/artisan/ArtisanProfile'));

// Lazy-loaded Admin Pages
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const Dashboard = lazy(() => import('./pages/admin/Dashboard'));
const AdminArtisans = lazy(() => import('./pages/admin/Artisans'));
const Customers = lazy(() => import('./pages/admin/Customers'));
const AdminProducts = lazy(() => import('./pages/admin/Products'));
const Categories = lazy(() => import('./pages/admin/Categories'));
const AdminOrders = lazy(() => import('./pages/admin/Orders'));
const Payments = lazy(() => import('./pages/admin/Payments'));
const AIManagement = lazy(() => import('./pages/admin/AIManagement'));
const AdminReviews = lazy(() => import('./pages/admin/Reviews'));
const Reports = lazy(() => import('./pages/admin/Reports'));
const Analytics = lazy(() => import('./pages/admin/Analytics'));
const Notifications = lazy(() => import('./pages/admin/Notifications'));
const ContentManagement = lazy(() => import('./pages/admin/ContentManagement'));
const HeroSettings = lazy(() => import('./pages/admin/HeroSettings'));
const DiscountBanner = lazy(() => import('./pages/admin/DiscountBanner'));
const ActivityLogs = lazy(() => import('./pages/admin/ActivityLogs'));
const Settings = lazy(() => import('./pages/admin/Settings'));

// Lightweight, sleek loading fallback
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[50vh] w-full">
    <div className="flex flex-col items-center gap-3">
      <div className="w-9 h-9 border-2 border-gold-500/20 border-t-gold-500 rounded-full animate-spin" />
      <span className="text-xs text-gold-400 font-medium tracking-widest uppercase">Loading KalaStyle...</span>
    </div>
  </div>
);

function MaintenanceGuard({ children }) {
  const { settings } = useSettings();
  const { isAdmin, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;

  if (settings.maintenanceMode && !isAdmin && location.pathname !== '/login') {
    return <Maintenance />;
  }

  return children;
}

function App() {
  return (
    <SettingsProvider>
      <AuthProvider>
        <CartProvider>
          <WishlistProvider>
            <LanguageProvider>
              <RealtimeSyncProvider>
              <Router>
                {/* Global Toast Notifications */}
                <Toaster 
                  position="bottom-right"
                  toastOptions={{
                    style: {
                      background: '#1a1a1a',
                      color: '#fff',
                      border: '1px solid #333',
                    },
                    success: { iconTheme: { primary: '#D4AF37', secondary: '#1a1a1a' } }
                  }}
                />
                
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                    {/* Admin Routes */}
                    <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
                      <Route index element={<Dashboard />} />
                      <Route path="dashboard" element={<Dashboard />} />
                      <Route path="artisans" element={<AdminArtisans />} />
                      <Route path="customers" element={<Customers />} />
                      <Route path="products" element={<AdminProducts />} />
                      <Route path="categories" element={<Categories />} />
                      <Route path="orders" element={<AdminOrders />} />
                      <Route path="payments" element={<Payments />} />
                      <Route path="ai" element={<AIManagement />} />
                      <Route path="ai-manager" element={<AIManagement />} />
                      <Route path="reviews" element={<AdminReviews />} />
                      <Route path="reports" element={<Reports />} />
                      <Route path="analytics" element={<Analytics />} />
                      <Route path="notifications" element={<Notifications />} />
                      <Route path="content" element={<ContentManagement />} />
                      <Route path="hero-settings" element={<HeroSettings />} />
                      <Route path="discount-banner" element={<DiscountBanner />} />
                      <Route path="activity" element={<ActivityLogs />} />
                      <Route path="settings" element={<Settings />} />
                    </Route>

                    {/* Artisan Routes */}
                    <Route path="/artisan" element={<ArtisanRoute><ArtisanLayout /></ArtisanRoute>}>
                      <Route index element={<ArtisanDashboard />} />
                      <Route path="products"    element={<ArtisanProducts />} />
                      <Route path="ai-studio"   element={<AIProductStudio />} />
                      <Route path="ai-price"    element={<AIPriceSuggestion />} />
                      <Route path="ai-story"    element={<AIArtisanStory />} />
                      <Route path="ai-insights" element={<AIInsightsDashboard />} />
                      <Route path="orders"      element={<ArtisanOrders />} />
                      <Route path="earnings"    element={<ArtisanEarnings />} />
                      <Route path="profile"     element={<ArtisanProfile />} />
                    </Route>

                    {/* Payment Gateway (No Navbar/Footer) */}
                    <Route path="/payment-gateway" element={<PrivateRoute><PaymentGateway /></PrivateRoute>} />

                    {/* Public/User Routes */}
                    <Route path="*" element={
                      <MaintenanceGuard>
                        <div className="flex flex-col min-h-screen">
                          <Navbar />
                          <SpinWheelPopup />
                          <main className="flex-1">
                            <Suspense fallback={<PageLoader />}>
                              <Routes>
                                <Route path="/" element={<Home />} />
                                <Route path="/login" element={<Login />} />
                                <Route path="/signup" element={<Signup />} />
                                <Route path="/products" element={<ProductList />} />
                                <Route path="/categories/:categorySlug" element={<ProductList />} />
                                <Route path="/products/:id" element={<ProductDetail />} />
                                <Route path="/cart" element={<Cart />} />
                                <Route path="/wishlist" element={<Wishlist />} />
                                <Route path="/artisans/:id" element={<ArtisanStore />} />
                                
                                {/* Protected User Routes */}
                                <Route path="/checkout" element={<PrivateRoute><Checkout /></PrivateRoute>} />
                                <Route path="/orders" element={<PrivateRoute><Orders /></PrivateRoute>} />
                                <Route path="/orders/:id/tracking" element={<PrivateRoute><OrderTracking /></PrivateRoute>} />
                                <Route path="/rewards" element={<PrivateRoute><Rewards /></PrivateRoute>} />
                                <Route path="/leaderboard" element={<Leaderboard />} />
                                <Route path="/profile" element={<PrivateRoute><Profile /></PrivateRoute>} />
                              </Routes>
                            </Suspense>
                          </main>
                        </div>
                      </MaintenanceGuard>
                    } />
                  </Routes>
                </Suspense>
              </Router>
            </RealtimeSyncProvider>
          </LanguageProvider>
        </WishlistProvider>
        </CartProvider>
      </AuthProvider>
    </SettingsProvider>
  );
}

export default App;
