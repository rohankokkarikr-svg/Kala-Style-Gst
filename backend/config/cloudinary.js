const cloudinary = require('cloudinary');
const multer = require('multer');

const CLOUD_NAME = (process.env.CLOUDINARY_CLOUD_NAME || '').trim();
const API_KEY = (process.env.CLOUDINARY_API_KEY || '').trim();
let API_SECRET = (process.env.CLOUDINARY_API_SECRET || '').trim();

// Strip surrounding quotes if entered in hosting dashboard
API_SECRET = API_SECRET.replace(/^["']|["']$/g, '');

if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
  console.warn('[cloudinary] ⚠️ Cloudinary credentials not fully configured in environment variables.');
}

cloudinary.v2.config({
  cloud_name: CLOUD_NAME,
  api_key: API_KEY,
  api_secret: API_SECRET,
  secure: true
});

// Memory storage for stream processing
const storage = multer.memoryStorage();

// Allowed MIME types for secure media uploads
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/heic',
  'image/heif',
  'image/svg+xml',
  'video/mp4',
  'video/webm',
]);

const ALLOWED_EXT_REGEX = /\.(jpe?g|png|webp|gif|avif|heic|heif|svg|mp4|webm)$/i;

const fileFilter = (req, file, cb) => {
  const mime = (file.mimetype || '').toLowerCase();
  const originalName = file.originalname || '';
  
  // Explicitly reject octet-stream and binary executables
  if (mime === 'application/octet-stream' || originalName.match(/\.(exe|sh|bat|cmd|msi|vbs|jar)$/i)) {
    return cb(new Error('Invalid file type. Binary executables are not permitted.'), false);
  }

  // Allow if MIME is recognized or starts with image/
  if (ALLOWED_MIME_TYPES.has(mime) || mime.startsWith('image/')) {
    return cb(null, true);
  }

  // Fallback: check extension
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

module.exports = { cloudinary: cloudinary.v2, upload, fileFilter };


