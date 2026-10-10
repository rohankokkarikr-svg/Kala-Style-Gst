const cloudinary = require('cloudinary');
const multer = require('multer');

const CLOUD_NAME = (process.env.CLOUDINARY_CLOUD_NAME || '').trim();
const API_KEY = (process.env.CLOUDINARY_API_KEY || '').trim();
let API_SECRET = (process.env.CLOUDINARY_API_SECRET || '').trim();

// Strip surrounding quotes if entered in hosting dashboard
API_SECRET = API_SECRET.replace(/^["']|["']$/g, '');

const isCloudinaryConfigured = () => Boolean(
  CLOUD_NAME && !CLOUD_NAME.startsWith('your_') &&
  API_KEY && !API_KEY.startsWith('your_') &&
  API_SECRET && !API_SECRET.startsWith('your_')
);

if (isCloudinaryConfigured()) {
  cloudinary.v2.config({
    cloud_name: CLOUD_NAME,
    api_key: API_KEY,
    api_secret: API_SECRET,
    secure: true
  });
}

// Memory storage for stream processing
const storage = multer.memoryStorage();

// Allowed MIME types for secure media uploads (SVG disallowed to prevent XSS)
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/heic',
  'image/heif',
  'video/mp4',
  'video/webm',
]);

const ALLOWED_EXT_REGEX = /\.(jpe?g|png|webp|gif|avif|heic|heif|mp4|webm)$/i;

const fileFilter = (req, file, cb) => {
  const mime = (file.mimetype || '').toLowerCase();
  const originalName = file.originalname || '';
  
  // Explicitly reject octet-stream, executables, scripts, and SVG vectors (XSS risk)
  if (
    mime === 'application/octet-stream' ||
    mime === 'image/svg+xml' ||
    mime.includes('script') ||
    mime.includes('html') ||
    originalName.match(/\.(exe|sh|bat|cmd|msi|vbs|jar|svg|html?|js)$/i)
  ) {
    return cb(new Error('Invalid file type. Only secure images and craft videos are permitted.'), false);
  }

  // Allow if recognized MIME type
  if (ALLOWED_MIME_TYPES.has(mime)) {
    return cb(null, true);
  }

  // Fallback: check extension if standard image
  if (ALLOWED_EXT_REGEX.test(originalName)) {
    return cb(null, true);
  }

  cb(new Error('Invalid file type. Only JPG, PNG, WebP images are permitted.'), false);
};

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max limit for banner media; individual endpoints enforce tighter limits
  fileFilter
});

module.exports = { cloudinary: cloudinary.v2, upload, fileFilter, isCloudinaryConfigured };


