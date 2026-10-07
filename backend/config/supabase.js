require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const dns = require('dns');
const https = require('https');

// Force IPv4 first for the dns.lookup (used by most modules)
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

const supabaseUrl = (process.env.SUPABASE_URL || 'https://fwuhlhaadhhveuljsqbh.supabase.co').trim();
const supabaseServiceKey = (process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3dWhsaGFhZGhodmV1bGpzcWJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODc4OTM4NiwiZXhwIjoyMTA0MzY1Mzg2fQ.Xm2JcJlCiYVJQAOToeIFqYgJASK3c90MZMoFg3duhYg').trim();

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.warn('⚠️ Notice: Using built-in Supabase credentials fallback');
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
      action: 'Go to https://supabase.com → check your project is ACTIVE (not paused or deleted) → verify SUPABASE_URL and SUPABASE_SERVICE_KEY in backend/.env → restart the server.',
      supabaseUrl: process.env.SUPABASE_URL,
    };
  }
  return null;
};

// Initialize Supabase client with native fetch (more reliable)
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  global: {
    headers: { 'x-application-name': 'kala-style-gst-1' },
  },
});

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
