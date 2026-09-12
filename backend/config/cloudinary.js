/**
 * backend/config/cloudinary.js
 * ─────────────────────────────────────────────────────────────────
 * Secure Cloudinary configuration & upload validator.
 * Enforces strict MIME checks (rejecting SVGs and octet-streams to prevent Stored XSS)
 * and eliminates all hardcoded secret fallbacks.
 */

const cloudinary = require('cloudinary');
const multer = require('multer');

const CLOUD_NAME = (process.env.CLOUDINARY_CLOUD_NAME || '').trim();
const API_KEY = (process.env.CLOUDINARY_API_KEY || '').trim();
let API_SECRET = (process.env.CLOUDINARY_API_SECRET || '').trim();

// Strip surrounding quotes if entered in hosting dashboard
API_SECRET = API_SECRET.replace(/^["']|["']$/g, '');

if (CLOUD_NAME && API_KEY && API_SECRET) {
  cloudinary.v2.config({
    cloud_name: CLOUD_NAME,
    api_key: API_KEY,
    api_secret: API_SECRET,
    secure: true
  });
} else {
  console.warn('⚠️ Cloudinary credentials incomplete in environment. Uploads may fail.');
}

// Memory storage for secure stream processing
const storage = multer.memoryStorage();

// Allowed MIME types and extensions (Strictly prohibit SVG and octet-stream to prevent XSS)
const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp'
]);

const ALLOWED_EXTS = /\.(jpe?g|png|webp)$/i;

const upload = multer({ 
  storage: storage,
  limits: { 
    fileSize: 10 * 1024 * 1024, // 10MB max
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    const mimeValid = file.mimetype && ALLOWED_MIMES.has(file.mimetype.toLowerCase());
    const extValid = ALLOWED_EXTS.test(file.originalname || '');

    if (mimeValid && extValid) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file format. Only safe image files (JPG, PNG, WEBP) under 10MB are permitted. SVGs and executable files are prohibited for security.'), false);
    }
  }
});

module.exports = { cloudinary: cloudinary.v2, upload };


