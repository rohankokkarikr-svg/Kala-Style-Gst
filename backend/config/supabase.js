require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const dns = require('dns');
const https = require('https');

// Force IPv4 first for the dns.lookup (used by most modules)
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

// ─── SECURITY WARNING ────────────────────────────────────────────────────────
// The ZIP distribution of this repository contained a hard-coded Supabase
// service-role key. That key has been REMOVED from source code.
// ACTION REQUIRED for the operator:
//   1. Go to Supabase Dashboard → Settings → API → Rotate the service_role key NOW.
//      The old key in the ZIP is considered EXPOSED and must be revoked.
//   2. Set the NEW key as SUPABASE_SERVICE_ROLE_KEY in your Render environment.
//   3. NEVER commit real credentials to source control or ZIP distributions.
// ─────────────────────────────────────────────────────────────────────────────

const resolveServiceRoleKey = () => {
  // In test environments, return a safe mock token if no real key is configured
  if (process.env.NODE_ENV === 'test' && !process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SERVICE_KEY) {
    return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.mock_test_key';
  }

  // Check all recognized environment variable names for the service-role key
  const candidates = [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_SERVICE_KEY,
    process.env.SERVICE_ROLE_KEY,
    process.env.SUPABASE_SECRET_KEY,
    process.env.SUPABASE_KEY,
  ].filter(Boolean).map(k => String(k).trim());

  for (const candidate of candidates) {
    try {
      const parts = candidate.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        if (payload.role === 'service_role') {
          return candidate;
        }
      }
    } catch (_) {}
  }

  // No hard-coded fallback — fail loudly so the operator knows they must configure this
  const availableUrl = process.env.SUPABASE_URL || 'NOT SET';
  console.error(
    '\n\n' +
    '╔══════════════════════════════════════════════════════════════════════╗\n' +
    '║  FATAL: No Supabase service-role key found in environment.          ║\n' +
    '║                                                                      ║\n' +
    '║  Set one of these environment variables in your Render/backend env: ║\n' +
    '║    SUPABASE_SERVICE_ROLE_KEY=eyJ...                                 ║\n' +
    '║                                                                      ║\n' +
    '║  Get your service_role key from:                                     ║\n' +
    `║    Supabase Dashboard → Project (${availableUrl.slice(0, 30)}) ║\n` +
    '║    → Settings → API → service_role (secret)                         ║\n' +
    '║                                                                      ║\n' +
    '║  SECURITY: If this key was ever committed to source control or       ║\n' +
    '║  included in a ZIP distribution, ROTATE IT IMMEDIATELY in Supabase. ║\n' +
    '╚══════════════════════════════════════════════════════════════════════╝\n'
  );
  return null;
};

const supabaseUrl = (process.env.SUPABASE_URL || '').trim();

if (!supabaseUrl) {
  console.error('[supabase.js] FATAL: SUPABASE_URL environment variable is not set.');
}

const supabaseServiceKey = resolveServiceRoleKey();

if (!supabaseServiceKey && process.env.NODE_ENV !== 'test') {
  // Allow process to continue so error message is visible, but all DB calls will fail
  console.error('[supabase.js] No service-role key available. Database operations will fail until this is configured.');
}

/**
 * Detects common Supabase connectivity errors and returns a friendly message.
 */
const formatSupabaseError = (error) => {
  const msg = error?.message || String(error);
  if (
    msg.includes('ENOTFOUND') ||
    msg.includes('fetch failed') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('getaddrinfo')
  ) {
    return {
      error: 'Database unreachable',
      details: `Cannot connect to Supabase (${msg}).`,
      action: 'Go to https://supabase.com → check your project is ACTIVE (not paused or deleted) → verify SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env → restart the server.',
      supabaseUrl: process.env.SUPABASE_URL,
    };
  }
  return null;
};

// Initialize Supabase client with native fetch (more reliable)
const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseServiceKey || 'placeholder',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: { 'x-application-name': 'kala-style-gst-1' },
    },
  }
);

/**
 * Robust query wrapper with automatic retries
 */
const safeQuery = async (queryFn, maxRetries = 2) => {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await queryFn();
      if (!result.error) return result;
      
      lastError = result.error;
      console.warn(`⚠️ Supabase error: ${lastError.message} (Attempt ${i + 1}/${maxRetries})`);
      
      if (i < maxRetries - 1) {
        await new Promise(res => setTimeout(res, 1000 * (i + 1)));
        continue;
      }
      return result;
    } catch (err) {
      lastError = err;
      if (i < maxRetries - 1) {
        await new Promise(res => setTimeout(res, 1000));
        continue;
      }
      return { data: null, error: err };
    }
  }
  return { data: null, error: lastError };
};

module.exports = supabase;
module.exports.safeQuery = safeQuery;
module.exports.formatSupabaseError = formatSupabaseError;
