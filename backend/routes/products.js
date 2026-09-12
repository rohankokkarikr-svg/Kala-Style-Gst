const express = require('express');
const router = express.Router();
const { protect, admin, artisan } = require('../middleware/auth');
const { upload } = require('../config/cloudinary');
const { uploadLimiter } = require('../middleware/rateLimiter');
const {
  getProducts,
  getFeaturedProducts,
  getProductById,
  getCategories,
  createProduct,
  updateProduct,
  deleteProduct,
  uploadProductImage,
  uploadDirect
} = require('../controllers/productController');

// Public routes
router.get('/', getProducts);
router.get('/featured', getFeaturedProducts);
router.get('/categories', getCategories);
router.get('/:id', getProductById);

const uploadMiddleware = (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      console.error('❌ Cloudinary Multer Upload Error:', err);
      return res.status(400).json({ error: err.message || 'Cloudinary upload failed. Please try a different image.' });
    }
    next();
  });
};

// Product upload routes (Rate-limited, strictly validates safe MIME types)
router.post('/upload', uploadLimiter, uploadMiddleware, uploadDirect);

// Admin + Artisan routes
router.post('/', protect, artisan, createProduct);
router.put('/:id', protect, artisan, updateProduct);
router.delete('/:id', protect, artisan, deleteProduct);
router.post('/:id/image', protect, artisan, uploadLimiter, uploadMiddleware, uploadProductImage);

module.exports = router;
