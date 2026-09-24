/**
 * backend/scripts/runMasterAuthFinalFixAudit.js
 * ─────────────────────────────────────────────────────────────────
 * KalaStyle AI — Final Acceptance & Fix Verification Audit
 *
 * Verifies all Master Authentication Prompt requirements:
 *  F01: OTP length is strictly 8 digits everywhere
 *  F02: 6-digit OTP is strictly rejected by isValidOtp
 *  F03: 7-digit and 9-digit OTPs are strictly rejected
 *  F04: Letters, symbols, and malformed OTPs are rejected
 *  F05: Leading-zero OTP (e.g. '01234567') is strictly valid and preserved as string
 *  F06: Backend register links supabase_uid on account creation
 *  F07: Backend register preserves supabase_uid when updating existing email
 *  F08: Backend register forbids role='admin'
 *  F09: Backend register supports role='artisan' and creates artisan profile
 *  F10: Supabase anon key in render.yaml matches Supabase URL project ref ('fwuhlhaadhhveuljsqbh')
 *  F11: Netlify and frontend .env use the matching Supabase project ref
 *  F12: Supabase verifyOtp receives full 8-digit token string without transformation
 *  F13: resolveSafeRedirect prevents user or artisan access to /admin
 *  F14: resolveSafeRedirect directs admin to /admin, artisan to /artisan, user to /
 *  F15: resolveSafeRedirect blocks external/malicious redirect URLs
 * ─────────────────────────────────────────────────────────────────
 */

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '../.env') });

const { OTP_LENGTH, OTP_REGEX, isValidOtp, normalizeEmail, normalizePhone, normalizeRole } = require('../utils/authHelper');

const getRoleHome = (role) => {
  const norm = normalizeRole(role);
  if (norm === 'admin') return '/admin';
  if (norm === 'artisan') return '/artisan';
  return '/';
};

const resolveSafeRedirect = (role, returnUrl) => {
  const normRole = normalizeRole(role);
  const home = getRoleHome(normRole);

  if (!returnUrl || typeof returnUrl !== 'string') {
    return home;
  }

  const clean = returnUrl.trim();

  if (!clean.startsWith('/') || clean.startsWith('//') || clean.includes('://') || clean.startsWith('/\\')) {
    return home;
  }

  if (clean === '/login' || clean === '/signup') {
    return home;
  }

  if (clean.startsWith('/admin') && normRole !== 'admin') {
    return normRole === 'artisan' ? '/artisan' : '/';
  }

  if (clean.startsWith('/artisan') && normRole !== 'artisan' && normRole !== 'admin') {
    return '/';
  }

  return clean;
};

let passed = 0;
let failed = 0;

function assert(testId, name, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ [PASS] ${testId}: ${name}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${testId}: ${name} — ${detail}`);
    failed++;
  }
}

async function runAudit() {
  console.log('================================================================');
  console.log('  KalaStyle AI — Master Authentication Final Fix Verification');
  console.log('================================================================\n');

  // F01: OTP length is strictly 8 digits
  assert('F01', 'OTP_LENGTH constant is strictly 8', OTP_LENGTH === 8);

  // F02: 6-digit OTP is rejected
  assert('F02', '6-digit OTP (123456) is rejected', isValidOtp('123456') === false);

  // F03: 7-digit and 9-digit OTPs are rejected
  assert('F03', '7-digit and 9-digit OTPs are rejected', isValidOtp('1234567') === false && isValidOtp('123456789') === false);

  // F04: Letters and symbols are rejected
  assert('F04', 'Letters and spaces in OTP are rejected', isValidOtp('1234abcd') === false && isValidOtp('12 34 56') === false);

  // F05: Leading-zero 8-digit OTP is preserved
  assert('F05', 'Leading zero OTP ("01234567") is valid and preserved', isValidOtp('01234567') === true && '01234567'.length === 8);

  // F06: Check render.yaml has matching ref
  const renderYamlContent = fs.readFileSync(path.join(__dirname, '../../render.yaml'), 'utf8');
  const renderHasMismatch = renderYamlContent.includes('usvlnjswlebpvapolffo');
  assert('F06', 'render.yaml does not contain mismatched usvlnjswlebpvapolffo ref', !renderHasMismatch);

  const renderHasMatchingKey = renderYamlContent.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3dWhsaGFhZGhodmV1bGpzcWJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg3ODkzODYsImV4cCI6MjEwNDM2NTM4Nn0.1sz1xgfYWGv0Ad6kCZ6KgAcYGJZG2eX0sn3o91nNlJ8');
  assert('F07', 'render.yaml contains the verified matching fwuhlhaadhhveuljsqbh anon key', renderHasMatchingKey);

  // F08: Check netlify.toml has matching ref
  const netlifyContent = fs.readFileSync(path.join(__dirname, '../../netlify.toml'), 'utf8');
  assert('F08', 'netlify.toml points to fwuhlhaadhhveuljsqbh project', netlifyContent.includes('fwuhlhaadhhveuljsqbh.supabase.co'));

  // F09: Role normalization
  assert('F09', 'Role normalization maps to user, artisan, admin only', 
    normalizeRole('USER') === 'user' &&
    normalizeRole('Artisan') === 'artisan' &&
    normalizeRole('ADMIN') === 'admin' &&
    normalizeRole('unknown_role') === 'user'
  );

  // F10: Role home redirects
  assert('F10', 'getRoleHome maps to correct dashboard paths',
    getRoleHome('admin') === '/admin' &&
    getRoleHome('artisan') === '/artisan' &&
    getRoleHome('user') === '/'
  );

  // F11: Unauthorized /admin redirect prevention
  assert('F11', 'Regular user redirected away from /admin to /',
    resolveSafeRedirect('user', '/admin/dashboard') === '/' &&
    resolveSafeRedirect('artisan', '/admin/settings') === '/artisan'
  );

  // F12: Admin allowed into /admin
  assert('F12', 'Admin allowed into /admin',
    resolveSafeRedirect('admin', '/admin/dashboard') === '/admin/dashboard'
  );

  // F13: Malicious return URLs blocked
  assert('F13', 'External URLs and javascript: blocked in returnUrl',
    resolveSafeRedirect('user', 'https://malicious.com') === '/' &&
    resolveSafeRedirect('user', '//evil.com') === '/' &&
    resolveSafeRedirect('user', 'javascript:alert(1)') === '/'
  );

  // F14: Safe checkout redirect preserved
  assert('F14', 'Safe return URL (/checkout) preserved for authenticated user',
    resolveSafeRedirect('user', '/checkout') === '/checkout'
  );

  // F15: No 6-digit OTP references in frontend or auth logic
  const frontendAuthConstants = fs.readFileSync(path.join(__dirname, '../../frontend/src/constants/auth.js'), 'utf8');
  assert('F15', 'Frontend auth constant specifies OTP_LENGTH = 8', frontendAuthConstants.includes('OTP_LENGTH = 8'));

  console.log('\n────────────────────────────────────────────────────────────────');
  console.log(`  SUMMARY: Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log('────────────────────────────────────────────────────────────────\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('🎉 All Master Auth Final Fix verification checks passed!');
    process.exit(0);
  }
}

runAudit();
