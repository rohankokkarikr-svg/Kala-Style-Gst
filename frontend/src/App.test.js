import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

// Virtual mock for react-router-dom to support Jest under Create React App CommonJS resolver
jest.mock('react-router-dom', () => ({
  Link: ({ children, to, 'aria-label': ariaLabel, className, ...props }) => (
    <a href={to} aria-label={ariaLabel} className={className} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => jest.fn(),
  useLocation: () => ({ pathname: '/', search: '' }),
  BrowserRouter: ({ children }) => <>{children}</>,
  MemoryRouter: ({ children }) => <>{children}</>,
}), { virtual: true });

const BrowserRouter = ({ children }) => <>{children}</>;
const MemoryRouter = ({ children }) => <>{children}</>;

import NotFound from './pages/NotFound';
import ProductCard from './components/ProductCard';

// Mock contexts required by ProductCard
jest.mock('./context/CartContext', () => ({
  useCart: () => ({ addToCart: jest.fn() }),
}));

jest.mock('./context/WishlistContext', () => ({
  useWishlist: () => ({
    isInWishlist: jest.fn((id) => id === 'prod-fav'),
    toggleWishlist: jest.fn(),
  }),
}));

jest.mock('./context/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true, user: { id: 'u1' } }),
}));

jest.mock('./context/LanguageContext', () => ({
  useLanguage: () => ({ currentLang: 'en', getCachedTranslation: null }),
}));

describe('KalaStyle AI Frontend Quality & Accessibility Suite', () => {
  describe('NotFound (404) Page', () => {
    test('renders 404 header, descriptive message, and navigation options', () => {
      render(
        <MemoryRouter>
          <NotFound />
        </MemoryRouter>
      );

      expect(screen.getByText(/Error 404/i)).toBeInTheDocument();
      expect(screen.getByText(/This Masterpiece Seems to be Missing/i)).toBeInTheDocument();
      expect(screen.getByText(/Return to Home/i)).toBeInTheDocument();
      expect(screen.getByText(/Explore Collections/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Handloom & Textiles/i)[0]).toBeInTheDocument();
    });
  });

  describe('ProductCard Accessibility & Integrity', () => {
    const mockProductWithoutReviews = {
      id: 'prod-1',
      name: 'Handcrafted Blue Pottery Vase',
      price: 1450,
      original_price: 1950,
      category: 'Pottery & Terracotta',
      state_of_origin: 'Rajasthan',
      image_url: 'https://example.com/blue-pottery.jpg',
      is_in_stock: true,
      stock_quantity: 10,
      review_count: 0,
      rating: null,
    };

    const mockProductWithReviews = {
      id: 'prod-fav',
      name: 'Pure Katan Banarasi Silk Saree',
      price: 12500,
      original_price: 18000,
      category: 'Handloom & Textiles',
      state_of_origin: 'Varanasi',
      image_url: 'https://example.com/banarasi.jpg',
      is_in_stock: true,
      stock_quantity: 5,
      review_count: 8,
      rating: 4.9,
    };

    test('renders separate, accessible Wishlist and Quick View controls with descriptive aria-labels', () => {
      render(
        <BrowserRouter>
          <ProductCard product={mockProductWithoutReviews} />
        </BrowserRouter>
      );

      // Wishlist button should have accessible aria-label
      const wishlistBtn = screen.getByRole('button', { name: /Add Handcrafted Blue Pottery Vase to Wishlist/i });
      expect(wishlistBtn).toBeInTheDocument();

      // Quick View button should have accessible aria-label
      const quickViewBtn = screen.getByRole('button', { name: /Quick view Handcrafted Blue Pottery Vase/i });
      expect(quickViewBtn).toBeInTheDocument();

      // Ensure controls are not nested inside links
      expect(wishlistBtn.closest('a')).toBeNull();
      expect(quickViewBtn.closest('a')).toBeNull();
    });

    test('does NOT fabricate ratings or review counts when a product has 0 reviews', () => {
      render(
        <BrowserRouter>
          <ProductCard product={mockProductWithoutReviews} />
        </BrowserRouter>
      );

      // Should show authentic handicraft notice instead of fake '4.8 (42)'
      expect(screen.getByText(/Authentic Handicraft/i)).toBeInTheDocument();
      expect(screen.queryByText(/4.8/)).toBeNull();
      expect(screen.queryByText(/\(42\)/)).toBeNull();
    });

    test('displays verified rating and count when product has actual customer reviews', () => {
      render(
        <BrowserRouter>
          <ProductCard product={mockProductWithReviews} />
        </BrowserRouter>
      );

      expect(screen.getByText('4.9')).toBeInTheDocument();
      expect(screen.getByText('(8)')).toBeInTheDocument();

      const removeWishlistBtn = screen.getByRole('button', { name: /Remove Pure Katan Banarasi Silk Saree from Wishlist/i });
      expect(removeWishlistBtn).toBeInTheDocument();
    });
  });
});
