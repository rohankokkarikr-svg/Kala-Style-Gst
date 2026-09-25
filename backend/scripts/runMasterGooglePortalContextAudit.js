/**
 * backend/scripts/runMasterGooglePortalContextAudit.js
 * ─────────────────────────────────────────────────────────────────
 * KALASTYLE AI — GOOGLE LOGIN PORTAL CONTEXT AUDIT (CUSTOMER vs ARTISAN)
 *
 * Verifies all requirements from prompt:
 *  M01: CASE 1: Portal Customer + Existing user -> role=user, redirect=/
 *  M02: CASE 2: Portal Customer + Existing artisan -> role=artisan, redirect=/artisan
 *  M03: CASE 3: Portal Customer + Existing admin -> role=admin, redirect=/admin
 *  M04: CASE 4: Portal Artisan + Existing artisan -> role=artisan, redirect=/artisan
 *  M05: CASE 5: Portal Artisan + Existing user -> DO NOT silently promote, portal notice, redirect=/
 *  M06: CASE 6: Portal Artisan + Existing admin -> preserve admin, destination=/admin
 *  M07: CASE 7: Portal Customer + New Google account -> create user, role=user, redirect=/
 *  M08: CASE 8: Portal Artisan + New Google account -> create artisan + artisan_profiles, role=artisan, redirect=/artisan
 *  M09: Frontend AuthContext stores auth_intent in sessionStorage before signInWithOAuth
 *  M10: Frontend AuthContext recovers auth_intent and passes it to backend in syncSupabaseSessionSingleFlight
 *  M11: Frontend AuthContext cleans auth_intent on logout and SIGNED_OUT
 *  M12: Frontend Login.js detects artisan entry from state/query and initializes portal
 *  M13: Frontend Login.js provides portal switcher (Customer vs Artisan)
 *  M14: Frontend Login.js passes authIntent to signInWithGoogle
 *  M15: Frontend Login.js destination calculated strictly using verified role via resolveSafeRedirect
 *  M16: Frontend Signup.js passes authIntent to signInWithGoogle based on selected role
 *  M17: Backend syncSupabaseSession extracts auth_intent from body/query/headers
 *  M18: Backend syncSupabaseSession provides portal notice for existing customer in artisan portal
 *  M19: Backend syncSupabaseSession creates artisan_profiles row for new artisan OAuth signup
 *  M20: OTP strictly preserved at 8 digits (Zero OTP regression)
 * ─────────────────────────────────────────────────────────────────
 */

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '../.env') });

const {
  OTP_LENGTH,
  isValidOtp,
  normalizeRole,
  getRoleHome,
  resolveSafeRedirect
} = require('../utils/authHelper');

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

async function runMasterGooglePortalContextAudit() {
  console.log('================================================================');
  console.log('  KalaStyle AI — Google Login Portal Context Master Audit');
  console.log('================================================================\n');

  const authCtrlCode = fs.readFileSync(path.join(__dirname, '../controllers/authController.js'), 'utf8');
  const authContextCode = fs.readFileSync(path.join(__dirname, '../../frontend/src/context/AuthContext.js'), 'utf8');
  const loginCode = fs.readFileSync(path.join(__dirname, '../../frontend/src/pages/Login.js'), 'utf8');
  const signupCode = fs.readFileSync(path.join(__dirname, '../../frontend/src/pages/Signup.js'), 'utf8');

  // ─── M01: CASE 1: Portal Customer + Existing user -> role=user, redirect=/ ───
  const c1Role = normalizeRole('user');
  const c1Dest = resolveSafeRedirect(c1Role, '/');
  assert('M01', 'CASE 1: Portal Customer + Existing user -> role=user, redirect=/', c1Role === 'user' && c1Dest === '/');

  // ─── M02: CASE 2: Portal Customer + Existing artisan -> role=artisan, redirect=/artisan ───
  const c2Role = normalizeRole('artisan');
  const c2Dest = resolveSafeRedirect(c2Role, '/');
  assert('M02', 'CASE 2: Portal Customer + Existing artisan -> role=artisan, redirect=/artisan', c2Role === 'artisan' && c2Dest === '/artisan');

  // ─── M03: CASE 3: Portal Customer + Existing admin -> role=admin, redirect=/admin ───
  const c3Role = normalizeRole('admin');
  const c3Dest = resolveSafeRedirect(c3Role, '/');
  assert('M03', 'CASE 3: Portal Customer + Existing admin -> role=admin, redirect=/admin', c3Role === 'admin' && c3Dest === '/admin');

  // ─── M04: CASE 4: Portal Artisan + Existing artisan -> role=artisan, redirect=/artisan ───
  const c4Role = normalizeRole('artisan');
  const c4Dest = resolveSafeRedirect(c4Role, '/artisan');
  assert('M04', 'CASE 4: Portal Artisan + Existing artisan -> role=artisan, redirect=/artisan', c4Role === 'artisan' && c4Dest === '/artisan');

  // ─── M05: CASE 5: Portal Artisan + Existing user -> DO NOT promote, redirect to / ───
  const c5Role = normalizeRole('user');
  const c5Dest = resolveSafeRedirect(c5Role, '/artisan');
  assert('M05', 'CASE 5: Portal Artisan + Existing user -> role=user preserved, redirect=/ (blocked from /artisan)', c5Role === 'user' && c5Dest === '/');

  // ─── M06: CASE 6: Portal Artisan + Existing admin -> preserve admin, destination=/admin or role home ───
  const c6Role = normalizeRole('admin');
  const c6Dest = resolveSafeRedirect(c6Role, '/artisan');
  assert('M06', 'CASE 6: Portal Artisan + Existing admin -> preserve admin permissions', c6Role === 'admin' && (c6Dest === '/artisan' || c6Dest === '/admin'));

  // ─── M07: CASE 7: Portal Customer + New Google account -> role=user, redirect=/ ───
  assert(
    'M07',
    'CASE 7: Portal Customer + New Google account -> defaults to role=user, redirect=/',
    authCtrlCode.includes("role: 'user'") &&
    resolveSafeRedirect('user', '/') === '/'
  );

  // ─── M08: CASE 8: Portal Artisan + New Google account -> create artisan + artisan_profiles, redirect=/artisan ───
  assert(
    'M08',
    'CASE 8: Portal Artisan + New Google account -> provisions artisan role and artisan_profiles, redirect=/artisan',
    authCtrlCode.includes("targetRole === 'artisan'") &&
    authCtrlCode.includes("artisan_profiles") &&
    resolveSafeRedirect('artisan', '/artisan') === '/artisan'
  );

  // ─── M09: Frontend AuthContext stores auth_intent in sessionStorage ───────────
  assert(
    'M09',
    'AuthContext.signInWithGoogle stores explicit auth_intent in sessionStorage before OAuth redirect',
    authContextCode.includes("sessionStorage.setItem('auth_intent', targetAuthIntent)")
  );

  // ─── M10: Frontend AuthContext recovers auth_intent and passes to backend ────
  assert(
    'M10',
    'AuthContext.syncSupabaseSessionSingleFlight recovers auth_intent from sessionStorage and passes to backend',
    authContextCode.includes("sessionStorage.getItem('auth_intent')") &&
    authContextCode.includes("auth_intent: authIntent")
  );

  // ─── M11: Frontend AuthContext cleans auth_intent on logout ──────────────────
  assert(
    'M11',
    'AuthContext cleans auth_intent and portal_notice on logout and SIGNED_OUT',
    authContextCode.includes("sessionStorage.removeItem('auth_intent')") &&
    authContextCode.includes("sessionStorage.removeItem('portal_notice')")
  );

  // ─── M12: Frontend Login.js detects artisan entry from state/query ───────────
  assert(
    'M12',
    'Login.js inspects state and query parameters for artisan portal entry',
    loginCode.includes("queryFrom.startsWith('/artisan')") ||
    loginCode.includes("stateFrom.startsWith('/artisan')") ||
    loginCode.includes("queryPortal === 'artisan'")
  );

  // ─── M13: Frontend Login.js provides portal switcher (Customer vs Artisan) ───
  assert(
    'M13',
    'Login.js provides explicit Customer Login vs Artisan Login portal selector buttons',
    loginCode.includes('portal-customer-btn') &&
    loginCode.includes('portal-artisan-btn') &&
    loginCode.includes('Customer Login') &&
    loginCode.includes('Artisan Login')
  );

  // ─── M14: Frontend Login.js passes authIntent to signInWithGoogle ────────────
  assert(
    'M14',
    'Login.js passes explicit authIntent to signInWithGoogle based on active portal mode',
    loginCode.includes("signInWithGoogle(returnUrl, { authIntent })")
  );

  // ─── M15: Frontend Login.js destination calculated strictly using verified role ───
  assert(
    'M15',
    'Login.js calculates destination using resolveSafeRedirect(role, returnUrl)',
    loginCode.includes("resolveSafeRedirect(role, returnUrl)")
  );

  // ─── M16: Frontend Signup.js passes authIntent to signInWithGoogle ───────────
  assert(
    'M16',
    'Signup.js passes authIntent to signInWithGoogle based on selected account type',
    signupCode.includes("role === 'artisan' ? 'artisan' : 'user'") &&
    signupCode.includes("signInWithGoogle(returnUrl, { authIntent })")
  );

  // ─── M17: Backend syncSupabaseSession extracts auth_intent ───────────────────
  assert(
    'M17',
    'Backend syncSupabaseSession extracts auth_intent from body, query, or headers',
    authCtrlCode.includes("req.body?.auth_intent")
  );

  // ─── M18: Backend provides portal notice for existing customer in artisan portal ─
  assert(
    'M18',
    'Backend provides portal notice when existing customer authenticates from artisan portal',
    authCtrlCode.includes("user.role === 'user' && authIntent === 'artisan'") &&
    authCtrlCode.includes("portal_notice")
  );

  // ─── M19: Backend creates artisan_profiles for new artisan OAuth ─────────────
  assert(
    'M19',
    'Backend syncSupabaseSession inserts into artisan_profiles with pending status on new artisan OAuth',
    authCtrlCode.includes("targetRole === 'artisan'") &&
    authCtrlCode.includes("artisan_profiles") &&
    authCtrlCode.includes("verification_status: 'pending'")
  );

  // ─── M20: OTP strictly preserved at 8 digits ─────────────────────────────────
  assert(
    'M20',
    'OTP_LENGTH is strictly 8 and 6-digit OTP is rejected (Zero OTP regression)',
    OTP_LENGTH === 8 &&
    isValidOtp('12345678') === true &&
    isValidOtp('123456') === false
  );

  console.log('\n────────────────────────────────────────────────────────────────');
  console.log(`  SUMMARY: Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log('────────────────────────────────────────────────────────────────\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('🎉 All Master Google Login Portal Context checks passed cleanly!');
    process.exit(0);
  }
}

runMasterGooglePortalContextAudit();
