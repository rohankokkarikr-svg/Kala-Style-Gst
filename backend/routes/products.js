const express = require('express');
const router = express.Router();
const { protect, admin, artisan, optionalProtect } = require('../middleware/auth');
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

// Public routes (with optional auth identification)
router.get('/', optionalProtect, getProducts);
router.get('/featured', getFeaturedProducts);
router.get('/categories', getCategories);
router.get('/:id', optionalProtect, getProductById);

const uploadMiddleware = (req, res, next) => {
  const contentType = (req.headers['content-type'] || '').toLowerCase();
  if (!contentType.includes('multipart/form-data')) {
    return next();
  }

  upload.any()(req, res, (err) => {
    if (err) {
      console.error('❌ Multer Upload Error:', err);
      if (req.body && req.body.image) {
        return next();
      }
      return res.status(400).json({ error: err.message || 'Media upload failed. Please try a different file.' });
    }
    if (req.files && req.files.length > 0 && !req.file) {
      req.file = req.files[0];
    }
    next();
  });
};

// Product upload routes — secured for authenticated artisans and administrators
router.post('/upload', protect, artisan, uploadLimiter, uploadMiddleware, uploadDirect);

// Admin + Artisan routes
router.post('/', protect, artisan, createProduct);
router.put('/:id', protect, artisan, updateProduct);
router.delete('/:id', protect, artisan, deleteProduct);
router.post('/:id/image', protect, artisan, uploadLimiter, uploadMiddleware, uploadProductImage);

module.exports = router;
