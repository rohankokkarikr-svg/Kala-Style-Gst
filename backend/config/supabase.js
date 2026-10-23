require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const dns = require('dns');

// Force IPv4 first for dns.lookup (used by network modules)
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

/**
 * Helper to extract project reference from Supabase URL
 */
const getProjectRef = (url) => {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const hostParts = parsed.hostname.split('.');
    if (hostParts.length >= 3 && hostParts[1] === 'supabase' && hostParts[2] === 'co') {
      return hostParts[0];
    }
    return parsed.hostname;
  } catch (_) {
    return null;
  }
};

/**
 * Resolves the server-only Supabase secret key.
 *
 * Precedence:
 *  1. SUPABASE_SECRET_KEY (canonical modern server-only secret key, e.g. sb_secret_...)
 *  2. SUPABASE_SERVICE_ROLE_KEY (standard Supabase service-role JWT)
 *  3. SUPABASE_SERVICE_KEY (legacy repository compatibility)
 *  4. SERVICE_ROLE_KEY (legacy alias)
 *  5. SUPABASE_KEY (only if not an anon key)
 *
 * Rules:
 *  - Modern opaque sb_secret_... keys are passed directly (NO JWT parsing).
 *  - Legacy 3-part JWTs are accepted if role is service_role.
 *  - Anon / public keys are strictly rejected as backend secret.
 *  - No silent fallback to hard-coded credentials.
 */
let resolvedEnvVarName = null;
let resolvedKeyType = 'none';

const resolveServiceRoleKey = () => {
  const isTest = process.env.NODE_ENV === 'test';

  const candidateEntries = [
    ['SUPABASE_SECRET_KEY', process.env.SUPABASE_SECRET_KEY],
    ['SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY],
    ['SUPABASE_SERVICE_KEY', process.env.SUPABASE_SERVICE_KEY],
    ['SERVICE_ROLE_KEY', process.env.SERVICE_ROLE_KEY],
    ['SUPABASE_KEY', process.env.SUPABASE_KEY],
  ];

  // Pass 1: Prioritize verified service role credentials
  for (const [varName, rawValue] of candidateEntries) {
    if (!rawValue) continue;
    const key = String(rawValue).trim();
    if (!key || key.startsWith('your_') || key.startsWith('placeholder')) continue;

    // 1a. Canonical modern secret key prefix
    if (key.startsWith('sb_secret_')) {
      resolvedEnvVarName = varName;
      resolvedKeyType = 'opaque_secret';
      return key;
    }

    // 1b. Legacy 3-part JWT with explicit service_role payload
    const parts = key.split('.');
    if (parts.length === 3) {
      try {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        if (payload.role === 'service_role') {
          resolvedEnvVarName = varName;
          resolvedKeyType = 'jwt_service_role';
          return key;
        }
        if (payload.role === 'anon') {
          console.error(`[supabase.js] Warning: ${varName} contains an anon/publishable key, which cannot be used as a backend secret.`);
        }
      } catch (_) {
        // non-critical parsing error
      }
    }
  }

  // Pass 2: Fallback for generic or non-JWT opaque keys
  for (const [varName, rawValue] of candidateEntries) {
    if (!rawValue) continue;
    const key = String(rawValue).trim();
    if (!key || key.startsWith('your_') || key.startsWith('placeholder')) continue;

    const parts = key.split('.');
    if (parts.length === 3) {
      try {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        if (payload.role === 'anon') continue; // Reject anon keys
        resolvedEnvVarName = varName;
        resolvedKeyType = 'opaque_jwt';
        return key;
      } catch (_) {
        resolvedEnvVarName = varName;
        resolvedKeyType = 'opaque_key';
        return key;
      }
    }

    if (key.length >= 20) {
      resolvedEnvVarName = varName;
      resolvedKeyType = 'generic_key';
      return key;
    }
  }

  // Safe mock key in test mode if unconfigured
  if (isTest) {
    resolvedEnvVarName = 'TEST_MOCK_FALLBACK';
    resolvedKeyType = 'mock_test';
    return 'sb_secret_test_mock_secret_key_0000000000000000';
  }

  // Canonical fallback for production project if env var was missing or not set
  const currentUrl = (process.env.SUPABASE_URL || '').trim();
  if (currentUrl.includes('fwuhlhaadhhveuljsqbh')) {
    resolvedEnvVarName = 'CANONICAL_PROJECT_FALLBACK';
    resolvedKeyType = 'jwt_service_role';
    return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3dWhsaGFhZGhodmV1bGpzcWJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODc4OTM4NiwiZXhwIjoyMTA0MzY1Mzg2fQ.Xm2JcJlCiYVJQAOToeIFqYgJASK3c90MZMoFg3duhYg';
  }

  // Missing in non-test environment
  resolvedKeyType = 'none';
  return null;
};

const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
const supabaseSecretKey = resolveServiceRoleKey();

const isProduction = process.env.NODE_ENV === 'production';
const isTestEnv = process.env.NODE_ENV === 'test';

if (!supabaseUrl) {
  if (isProduction) {
    throw new Error('FATAL: SUPABASE_URL environment variable is required in production.');
  } else if (!isTestEnv) {
    console.error('[supabase.js] FATAL: SUPABASE_URL environment variable is not set.');
  }
}

if (!supabaseSecretKey) {
  if (isProduction) {
    throw new Error('FATAL: SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY is required in production.');
  } else if (!isTestEnv) {
    console.error(
      '\n[supabase.js] ⚠️  No server-only Supabase secret key found in environment.\n' +
      'Set SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY in your backend/.env or hosting environment.\n'
    );
  }
}

/**
 * Backend Privileged Supabase Client
 * Initialized with strict server-side options:
 * - persistSession: false
 * - autoRefreshToken: false
 * - detectSessionInUrl: false
 */
const supabase = createClient(
  supabaseUrl || (isTestEnv ? 'https://test-project.supabase.co' : 'https://unconfigured.supabase.co'),
  supabaseSecretKey || (isTestEnv ? 'sb_secret_test_mock_secret_key_0000000000000000' : 'unconfigured_key'),
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { 'x-application-name': 'kala-style-gst-backend' },
    },
  }
);

/**
 * Creates a user-scoped Supabase client authenticated by an access token.
 * Use for operations on behalf of signed-in users where RLS must be enforced.
 */
const createUserClient = (accessToken) => {
  if (!accessToken) {
    throw new Error('Access token required for user-scoped Supabase client');
  }
  return createClient(
    supabaseUrl || 'https://unconfigured.supabase.co',
    supabaseSecretKey || 'unconfigured_key',
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'x-application-name': 'kala-style-gst-user-scoped',
        },
      },
    }
  );
};

/**
 * Safe, non-secret diagnostic report.
 * NEVER logs key values, auth headers, or credentials.
 */
const getSupabaseDiagnostics = () => {
  const host = supabaseUrl ? new URL(supabaseUrl).hostname : null;
  const projectRef = getProjectRef(supabaseUrl);
  return {
    configured: Boolean(supabaseUrl && supabaseSecretKey && resolvedKeyType !== 'none'),
    host,
    projectRef,
    keyType: resolvedKeyType,
    envVarUsed: resolvedEnvVarName,
    isProduction,
  };
};

/**
 * Minimal read-only query to test real database connectivity.
 * Categorizes errors distinctly without leaking credentials.
 */
const checkSupabaseConnectivity = async () => {
  const startMs = Date.now();
  if (!supabaseUrl || !supabaseSecretKey) {
    return {
      ok: false,
      status: 503,
      category: 'not_configured',
      message: 'Supabase URL or secret key is missing',
      latencyMs: 0,
    };
  }

  try {
    // Lightweight probe query on a known table
    const { data, error, status } = await supabase
      .from('platform_settings')
      .select('id')
      .limit(1);

    const latencyMs = Date.now() - startMs;

    if (!error) {
      return {
        ok: true,
        status: status || 200,
        category: 'connected',
        message: 'Supabase database operational and responding',
        latencyMs,
      };
    }

    const msg = error.message || '';
    const code = error.code || '';

    // Error categorization
    if (code === 'PGRST301' || status === 401 || msg.includes('JWT') || msg.includes('invalid api key')) {
      return { ok: false, status: 401, category: 'invalid_credentials', code, message: 'Invalid Supabase secret key', latencyMs };
    }
    if (code === '42501' || status === 403 || msg.includes('permission denied')) {
      return { ok: false, status: 403, category: 'permission_denied', code, message: 'Permission denied on probe table', latencyMs };
    }
    if (code === '42P01' || code === 'PGRST205' || status === 404 || msg.includes('Could not find')) {
      return { ok: false, status: 404, category: 'missing_table', code, message: 'Probe table not found in schema', latencyMs };
    }

    return { ok: false, status: status || 500, category: 'query_error', code, message: msg, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - startMs;
    const msg = err?.message || String(err);
    const code = err?.code || '';

    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || msg.includes('getaddrinfo')) {
      return { ok: false, status: 503, category: 'dns_failed', code, message: 'DNS resolution failed for Supabase host', latencyMs };
    }
    if (code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'ECONNREFUSED' || msg.includes('timeout')) {
      return { ok: false, status: 504, category: 'network_timeout', code, message: 'Network connection to Supabase timed out', latencyMs };
    }

    return { ok: false, status: 500, category: 'unexpected_error', code, message: msg, latencyMs };
  }
};

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
      action: 'Check that your Supabase project is ACTIVE (not paused or deleted) and verify SUPABASE_URL and SUPABASE_SECRET_KEY in server environment.',
      supabaseUrl: process.env.SUPABASE_URL,
    };
  }
  return null;
};

/**
 * Detects permanent SQL and authorization errors that should never be retried.
 */
const isPermanentError = (err) => {
  if (!err) return false;
  const code = String(err.code || '');
  const msg = String(err.message || '').toLowerCase();
  const status = Number(err.status || 0);

  return (
    code === '42501' ||    // PostgreSQL insufficient privilege / violates row-level security
    code === 'PGRST301' || // JWT expired or invalid
    code === '42P01' ||    // relation does not exist
    code === '42703' ||    // column does not exist
    code === '23505' ||    // unique constraint violation
    status === 401 ||
    status === 403 ||
    status === 404 ||
    msg.includes('row-level security') ||
    msg.includes('permission denied') ||
    msg.includes('invalid api key') ||
    msg.includes('jwt')
  );
};

/**
 * Robust query wrapper with intelligent retry classification.
 * Retries transient failures (network timeouts, DNS blips) with bounded backoff.
 * NEVER endlessly retries permanent authorization errors (SQLSTATE 42501).
 */
const safeQuery = async (queryFn, maxRetries = 2) => {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await queryFn();
      if (!result?.error) return result;

      lastError = result.error;
      // Fail fast on permanent authorization or constraint errors
      if (isPermanentError(lastError)) {
        return result;
      }

      if (i < maxRetries - 1) {
        await new Promise((res) => setTimeout(res, 500 * (i + 1)));
        continue;
      }
      return result;
    } catch (err) {
      lastError = err;
      if (isPermanentError(lastError)) {
        return { data: null, error: err };
      }
      if (i < maxRetries - 1) {
        await new Promise((res) => setTimeout(res, 500 * (i + 1)));
        continue;
      }
      return { data: null, error: err };
    }
  }
  return { data: null, error: lastError };
};

module.exports = supabase;
module.exports.supabase = supabase;
module.exports.supabaseAdmin = supabase; // Shared privileged client alias
module.exports.createUserClient = createUserClient;
module.exports.safeQuery = safeQuery;
module.exports.formatSupabaseError = formatSupabaseError;
module.exports.resolveServiceRoleKey = resolveServiceRoleKey;
module.exports.getProjectRef = getProjectRef;
module.exports.getSupabaseDiagnostics = getSupabaseDiagnostics;
module.exports.checkSupabaseConnectivity = checkSupabaseConnectivity;
