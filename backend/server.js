const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const dns = require('dns');

// Force IPv4 first to avoid ConnectTimeoutError on networks with broken IPv6
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

process.on('uncaughtException', (err) => {
  console.error('💥 UNCAUGHT EXCEPTION! Shutting down...');
  console.error(err.name, err.message, err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('💥 UNHANDLED REJECTION! Shutting down...');
  console.error(err);
  process.exit(1);
});

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const compression = require('compression');
const { initRealtime } = require('./utils/realtime');

const app = express();
// Enable trust proxy for Render / Netlify / reverse proxies so rate limiters inspect true client IPs
app.set('trust proxy', 1);
const server = http.createServer(app);

// Setup Socket.IO with CORS for any client device
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
  },
  pingTimeout: 30000,
  pingInterval: 15000,
});

initRealtime(io);

// Rate limiting middleware
// Enable open CORS for all clients (mobile, local dev, preview servers)
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-razorpay-signature'],
}));

// Permissive Helmet configuration (no CSP restrictions)
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: false,
  crossOriginEmbedderPolicy: false,
  frameguard: false,
}));
app.use(compression());
app.use(morgan('dev'));
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  },
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Payment routes (webhook uses req.rawBody, other endpoints use parsed req.body)
const paymentsRouter = require('./routes/payments');
app.use('/api/payments', paymentsRouter);
app.post('/api/create-order', paymentsRouter.createOrderDirect);
app.post('/api/verify-payment', paymentsRouter.verifyPaymentDirect);

// Fast HTTP caching headers ONLY on public catalog GET queries; NEVER cache private/user endpoints
app.use((req, res, next) => {
  const isPrivate = req.path.includes('/auth') || 
                    req.path.includes('/admin') || 
                    req.path.includes('/me') || 
                    req.path.includes('/my') || 
                    req.path.includes('/health');
  if (req.method === 'GET') {
    if (isPrivate) {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    } else {
      res.set('Cache-Control', 'public, max-age=15, stale-while-revalidate=60');
    }
  }
  next();
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/shipping', require('./routes/shipping'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/coupons', require('./routes/coupons'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/artisans', require('./routes/artisans'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/admin/ai-manager', require('./routes/aiAdminRoutes'));
app.use('/api/notifications', require('./routes/notifications'));

// Health check — also checks if Supabase is reachable
app.get('/health', async (req, res) => {
  let supabaseStatus = 'unknown';
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    if (supabaseUrl) {
      const host = new URL(supabaseUrl).hostname;
      await new Promise((resolve, reject) => {
        dns.lookup(host, { family: 4 }, (err, address) => {
          if (err) reject(err);
          else resolve(address);
        });
      });
      supabaseStatus = 'reachable';
    } else {
      supabaseStatus = 'not_configured';
    }
  } catch (e) {
    supabaseStatus = `unreachable (${e.code || e.message})`;
  }

  const isHealthy = supabaseStatus === 'reachable';
  res.status(isHealthy ? 200 : 503).json({ 
    status: isHealthy ? 'ok' : 'degraded', 
    time: new Date(),
    node: process.version,
    env: process.env.NODE_ENV,
    supabase: supabaseStatus,
    message: isHealthy
      ? 'All systems operational'
      : '⚠️  Cannot reach Supabase. Check your project URL in .env or resume the project at supabase.com'
  });
});

// Error handling middleware — sanitized in production (no stack traces, no internal leaks)
app.use((err, req, res, next) => {
  console.error('❌ Application Error:', err.message);

  // Friendly error for Supabase connectivity issues
  if (err.code === 'ENOTFOUND' || err.message?.includes('fetch failed')) {
    return res.status(503).json({
      error: 'Database Service Unavailable',
      message: 'The platform database is currently unreachable. Please try again shortly.',
    });
  }

  // Handle CORS errors specifically
  if (err.message && err.message.includes('CORS blocked')) {
    return res.status(403).json({
      error: 'Forbidden',
      message: err.message,
    });
  }

  const statusCode = err.status || err.statusCode || 500;
  const isProd = process.env.NODE_ENV === 'production';

  res.status(statusCode).json({
    error: isProd && statusCode === 500 ? 'Internal Server Error' : err.message,
    message: isProd && statusCode === 500 ? 'An unexpected error occurred. Please contact support if the issue persists.' : err.message,
    stack: !isProd ? err.stack : undefined
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, '0.0.0.0', async () => {
  console.log(`
  🚀 KalaStyle AI Backend is running!
  📡 Port: ${PORT}
  🌍 Host: 0.0.0.0 (Localhost)
  🛠️  Node: ${process.version}
  🎨 KalaStyle AI — From Artisan to Online Store in One Click.
  `);

  // Startup connectivity check
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    if (!supabaseUrl) {
      console.error('  ❌ SUPABASE_URL is not set in backend/.env');
      return;
    }
    const host = new URL(supabaseUrl).hostname;
    dns.lookup(host, { family: 4 }, (err, address) => {
      if (err) {
        console.error(`  ❌ Supabase DNS lookup FAILED for: ${host}`);
        console.error(`     Error: ${err.code} - ${err.message}`);
        console.error(`  ⚠️  ACTION REQUIRED:`);
        console.error(`     1. Go to https://supabase.com/dashboard`);
        console.error(`     2. Check if project "${host.split('.')[0]}" exists and is ACTIVE (not paused)`);
        console.error(`     3. If paused: click "Resume project"`);
        console.error(`     4. If deleted: create a new project and update SUPABASE_URL + SUPABASE_SERVICE_KEY in backend/.env`);
        console.error(`     5. Then restart the server`);
      } else {
        console.log(`  ✅ Supabase is reachable at ${address}`);
      }
    });
  } catch (e) {
    console.error('  ❌ Could not parse SUPABASE_URL:', e.message);
  }

  // Initialize Autonomous AI Job Processor
  try {
    const { startProcessor } = require('./ai/aiJobProcessor');
    startProcessor(30000);
  } catch (e) {
    console.warn('  ⚠️ Could not start AI Job Processor:', e.message);
  }

  // Initialize Autonomous AI Persistent Scheduler
  try {
    const { startScheduler } = require('./ai/aiScheduler');
    startScheduler(60000);
  } catch (e) {
    console.warn('  ⚠️ Could not start AI Scheduler:', e.message);
  }
});

// Trigger restart to load new environment variables from .env

