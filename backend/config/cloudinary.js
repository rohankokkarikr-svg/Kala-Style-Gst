const cloudinary = require('cloudinary');
const multer = require('multer');

const CLOUD_NAME = (process.env.CLOUDINARY_CLOUD_NAME || 'dcmmxmikz').trim();
const API_KEY = (process.env.CLOUDINARY_API_KEY || '149393542854794').trim();
let API_SECRET = (process.env.CLOUDINARY_API_SECRET || '_CBARObUZS9wuKFB3zi1Kuzb58k').trim();

// Strip surrounding quotes if entered in hosting dashboard
API_SECRET = API_SECRET.replace(/^["']|["']$/g, '');

// Auto-repair missing leading underscore if copied without '_' on deployment dashboards
if (CLOUD_NAME === 'dcmmxmikz') {
  if (API_SECRET === 'CBARObUZS9wuKFB3zi1Kuzb58k' || API_SECRET.startsWith('CBARObUZS9wuKFB3zi1Kuzb58k')) {
    API_SECRET = '_CBARObUZS9wuKFB3zi1Kuzb58k';
  } else if (!API_SECRET || API_SECRET === 'your_cloudinary_api_secret') {
    API_SECRET = '_CBARObUZS9wuKFB3zi1Kuzb58k';
  }
}

cloudinary.v2.config({
  cloud_name: CLOUD_NAME,
  api_key: API_KEY,
  api_secret: API_SECRET,
  secure: true
});

// Memory storage for stream processing
const storage = multer.memoryStorage();

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max
  fileFilter: (req, file, cb) => {
    const isImageMime = file.mimetype && (file.mimetype.startsWith('image/') || file.mimetype === 'application/octet-stream');
    const isImageExt = /\.(jpe?g|png|webp|gif|svg|heic|heif|avif)$/i.test(file.originalname || '');
    if (isImageMime || isImageExt) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

module.exports = { cloudinary: cloudinary.v2, upload };


