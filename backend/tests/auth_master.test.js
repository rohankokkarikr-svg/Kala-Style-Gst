process.env.NODE_ENV = 'test';
process.env.MOCK_AI = 'true';
process.env.MOCK_CLOUDINARY = 'true';
process.env.JWT_SECRET = 'mock_test_jwt_secret_val_12345';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcryptjs');

const {
  normalizeEmail,
  normalizePhone,
  normalizeRole,
  sanitizeUser,
  OTP_LENGTH,
  OTP_REGEX,
  isValidOtp,
  getRoleHome,
  resolveSafeRedirect
} = require('../utils/authHelper');

const { protect, admin, artisan } = require('../middleware/auth');
const { forgotPassword, resetPassword, register, login, sendOtp, syncSupabaseSession } = require('../controllers/authController');

describe('Master Authentication & Canonical RBAC Security Suite', () => {
  // ─── 1. Canonical Role Normalization ───────────────────────────
  test('normalizeRole maps arbitrary inputs to canonical user | artisan | admin', () => {
    assert.strictEqual(normalizeRole('user'), 'user');
    assert.strictEqual(normalizeRole('USER'), 'user');
    assert.strictEqual(normalizeRole('customer'), 'user');
    assert.strictEqual(normalizeRole('artisan'), 'artisan');
    assert.strictEqual(normalizeRole('ARTISAN'), 'artisan');
    assert.strictEqual(normalizeRole('admin'), 'admin');
    assert.strictEqual(normalizeRole('ADMIN'), 'admin');
    assert.strictEqual(normalizeRole(''), 'user');
    assert.strictEqual(normalizeRole(null), 'user');
    assert.strictEqual(normalizeRole(undefined), 'user');
    assert.strictEqual(normalizeRole('superadmin'), 'user');
  });

  // ─── 2. Identifier Normalization ──────────────────────────────
  test('normalizeEmail lowercases and trims email addresses', () => {
    assert.strictEqual(normalizeEmail('  Test.User@Example.COM  '), 'test.user@example.com');
    assert.strictEqual(normalizeEmail(''), '');
    assert.strictEqual(normalizeEmail(null), '');
  });

  test('normalizePhone handles Indian phone formats to clean 10 digits', () => {
    assert.strictEqual(normalizePhone('+91 9876543210'), '9876543210');
    assert.strictEqual(normalizePhone('919876543210'), '9876543210');
    assert.strictEqual(normalizePhone('98765-43210'), '9876543210');
    assert.strictEqual(normalizePhone('09876543210'), '9876543210');
    assert.strictEqual(normalizePhone(''), '');
  });

  // ─── 3. Strict 8-Digit OTP Constraints ────────────────────────
  test('isValidOtp strictly enforces 8 numeric digits', () => {
    assert.strictEqual(OTP_LENGTH, 8);
    assert.strictEqual(isValidOtp('12345678'), true);
    assert.strictEqual(isValidOtp('01234567'), true); // Leading zero preserved
    assert.strictEqual(isValidOtp('123456'), false);  // 6 digits rejected
    assert.strictEqual(isValidOtp('1234567'), false); // 7 digits rejected
    assert.strictEqual(isValidOtp('123456789'), false);// 9 digits rejected
    assert.strictEqual(isValidOtp('1234abcd'), false); // Alpha rejected
    assert.strictEqual(isValidOtp(''), false);
    assert.strictEqual(isValidOtp(null), false);
  });

  // ─── 4. Safe Return URL and Navigation Security ───────────────
  test('resolveSafeRedirect protects admin and artisan route boundaries', () => {
    // Normal user attempting to access admin
    assert.strictEqual(resolveSafeRedirect('user', '/admin'), '/');
    assert.strictEqual(resolveSafeRedirect('user', '/admin/dashboard'), '/');

    // Artisan attempting to access admin
    assert.strictEqual(resolveSafeRedirect('artisan', '/admin'), '/artisan');

    // Admin allowed to access admin
    assert.strictEqual(resolveSafeRedirect('admin', '/admin'), '/admin');
    assert.strictEqual(resolveSafeRedirect('admin', '/admin/reports'), '/admin/reports');

    // Safe user routes preserved
    assert.strictEqual(resolveSafeRedirect('user', '/checkout'), '/checkout');
    assert.strictEqual(resolveSafeRedirect('user', '/orders'), '/orders');

    // Dangerous/malicious redirects blocked
    assert.strictEqual(resolveSafeRedirect('user', 'https://malicious.com'), '/');
    assert.strictEqual(resolveSafeRedirect('user', '//malicious.com'), '/');
    assert.strictEqual(resolveSafeRedirect('user', 'javascript:alert(1)'), '/');
    assert.strictEqual(resolveSafeRedirect('user', '/\\malicious.com'), '/');
  });

  test('getRoleHome directs canonical roles to their proper landing portals', () => {
    assert.strictEqual(getRoleHome('admin'), '/admin');
    assert.strictEqual(getRoleHome('artisan'), '/artisan');
    assert.strictEqual(getRoleHome('user'), '/');
  });

  // ─── 5. Public Registration Role Escalation Prevention ─────────
  test('register endpoint strictly rejects admin creation attempts with 403', async () => {
    const req = {
      body: {
        name: 'Attacker',
        phone: '9876543210',
        password: 'password123',
        role: 'admin'
      }
    };
    let statusCode = null;
    let responseBody = null;
    const res = {
      status: (code) => {
        statusCode = code;
        return { json: (data) => { responseBody = data; } };
      }
    };

    await register(req, res);
    assert.strictEqual(statusCode, 403);
    assert.ok(responseBody.error.includes('Administrative accounts cannot be created via public registration'));
  });

  // ─── 6. Forgot Password Security ──────────────────────────────
  test('forgotPassword rejects invalid or missing email with 400', async () => {
    const req = { body: { email: '' } };
    let statusCode = null;
    let responseBody = null;
    const res = {
      status: (code) => {
        statusCode = code;
        return { json: (data) => { responseBody = data; } };
      }
    };

    await forgotPassword(req, res);
    assert.strictEqual(statusCode, 400);
    assert.ok(responseBody.error.includes('Please provide a valid email address'));
  });

  test('forgotPassword returns generic success for valid email format to prevent enumeration', async () => {
    const req = { body: { email: 'customer@kalastyle.ai' } };
    let responseBody = null;
    const res = {
      json: (data) => { responseBody = data; }
    };

    await forgotPassword(req, res);
    assert.strictEqual(responseBody.success, true);
    assert.ok(responseBody.message.includes('If an account exists'));
  });

  // ─── 7. Reset Password Validation ─────────────────────────────
  test('resetPassword rejects requests without valid session token with 401', async () => {
    const req = {
      headers: {},
      body: { newPassword: 'newsecurepass123' }
    };
    let statusCode = null;
    let responseBody = null;
    const res = {
      status: (code) => {
        statusCode = code;
        return { json: (data) => { responseBody = data; } };
      }
    };

    await resetPassword(req, res);
    assert.strictEqual(statusCode, 401);
    assert.ok(responseBody.error.includes('Valid password recovery session token is required'));
  });

  test('resetPassword rejects passwords shorter than 6 characters with 400', async () => {
    const req = {
      headers: { authorization: 'Bearer mock_recovery_token' },
      body: { newPassword: '123' }
    };
    let statusCode = null;
    let responseBody = null;
    const res = {
      status: (code) => {
        statusCode = code;
        return { json: (data) => { responseBody = data; } };
      }
    };

    await resetPassword(req, res);
    assert.strictEqual(statusCode, 400);
    assert.ok(responseBody.error.includes('at least 6 characters'));
  });

  test('resetPassword rejects passwords missing letters (like 123456@123) with 400', async () => {
    const req = {
      headers: { authorization: 'Bearer mock_recovery_token' },
      body: { newPassword: '123456@123' }
    };
    let statusCode = null;
    let responseBody = null;
    const res = {
      status: (code) => {
        statusCode = code;
        return { json: (data) => { responseBody = data; } };
      }
    };

    await resetPassword(req, res);
    assert.strictEqual(statusCode, 400);
    assert.ok(responseBody.error.includes('at least one letter'));
  });

  test('resetPassword rejects passwords missing numbers with 400', async () => {
    const req = {
      headers: { authorization: 'Bearer mock_recovery_token' },
      body: { newPassword: 'PasswordOnly' }
    };
    let statusCode = null;
    let responseBody = null;
    const res = {
      status: (code) => {
        statusCode = code;
        return { json: (data) => { responseBody = data; } };
      }
    };

    await resetPassword(req, res);
    assert.strictEqual(statusCode, 400);
    assert.ok(responseBody.error.includes('at least one number'));
  });

  test('login returns 404 with notFound when account does not exist in database', async () => {
    const req = {
      body: { identifier: 'ghost_unregistered_account_xyz@test.com', password: 'Password123' }
    };
    let statusCode = null;
    let responseBody = null;
    const res = {
      status: (code) => {
        statusCode = code;
        return { json: (data) => { responseBody = data; } };
      }
    };

    await login(req, res);
    assert.strictEqual(statusCode, 404);
    assert.strictEqual(responseBody.notFound, true);
    assert.ok(responseBody.error.includes('No account found'));
  });

  test('sendOtp returns 404 with notFound on login attempt for unregistered email', async () => {
    const req = {
      body: { email: 'ghost_unregistered_account_xyz@test.com', isSignup: false }
    };
    let statusCode = null;
    let responseBody = null;
    const res = {
      status: (code) => {
        statusCode = code;
        return { json: (data) => { responseBody = data; } };
      }
    };

    await sendOtp(req, res);
    assert.strictEqual(statusCode, 404);
    assert.strictEqual(responseBody.notFound, true);
    assert.ok(responseBody.error.includes('No account found'));
  });

  test('syncSupabaseSession strictly returns 404 with notFound when uncreated account attempts to log in from welcome back page', async () => {
    const supabase = require('../config/supabase');
    const originalGetUser = supabase.auth.getUser;
    supabase.auth.getUser = async () => ({
      data: {
        user: {
          id: 'mock-sb-uid-unregistered-999',
          email: 'unregistered_google_shopper_999@test.com',
          user_metadata: { full_name: 'Unregistered Visitor' }
        }
      },
      error: null
    });

    let statusCode = null;
    let responseBody = null;
    const req = {
      headers: {},
      body: {
        accessToken: 'mock-valid-sb-access-token',
        auth_flow: 'login',
        auth_intent: 'user'
      }
    };
    const res = {
      status: (code) => {
        statusCode = code;
        return { json: (data) => { responseBody = data; } };
      }
    };

    try {
      await syncSupabaseSession(req, res);
      assert.strictEqual(statusCode, 404);
      assert.strictEqual(responseBody.notFound, true);
      assert.ok(responseBody.error.includes('No account found'));
    } finally {
      supabase.auth.getUser = originalGetUser;
    }
  });

  test('syncSupabaseSession allows account creation when flow is signup', async () => {
    const supabase = require('../config/supabase');
    const originalGetUser = supabase.auth.getUser;
    const testEmail = `new_verified_signup_${Date.now()}@test.com`;
    supabase.auth.getUser = async () => ({
      data: {
        user: {
          id: `mock-sb-uid-${Date.now()}`,
          email: testEmail,
          user_metadata: { full_name: 'New Registered Customer' }
        }
      },
      error: null
    });

    let statusCode = 200;
    let responseBody = null;
    const req = {
      headers: {},
      body: {
        accessToken: 'mock-valid-sb-access-token',
        auth_flow: 'signup',
        auth_intent: 'user',
        is_signup: true
      }
    };
    const res = {
      status: (code) => {
        statusCode = code;
        return { json: (data) => { responseBody = data; } };
      },
      json: (data) => {
        responseBody = data;
      }
    };

    try {
      await syncSupabaseSession(req, res);
      assert.strictEqual(statusCode, 200);
      assert.ok(responseBody.token, 'Must return JWT token');
      assert.strictEqual(responseBody.user.role, 'user', 'Must create account with role user');
      if (responseBody.user?.id) {
        await supabase.from('users').delete().eq('id', responseBody.user.id);
      }
    } finally {
      supabase.auth.getUser = originalGetUser;
    }
  });

  // ─── 8. RBAC Middleware Authorization Checks ──────────────────
  test('admin middleware grants access to admin and blocks non-admin users', () => {
    let nextCalled = false;
    const adminReq = { user: { id: 'u1', role: 'admin' } };
    admin(adminReq, {}, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true, 'Admin user must pass admin middleware');

    let deniedStatus = null;
    let deniedBody = null;
    const userReq = { user: { id: 'u2', role: 'user' } };
    const res = {
      status: (code) => {
        deniedStatus = code;
        return { json: (d) => { deniedBody = d; } };
      }
    };
    admin(userReq, res, () => {});
    assert.strictEqual(deniedStatus, 403, 'Non-admin user must receive 403');
    assert.ok(deniedBody.error.includes('Not authorized as an admin'));
  });

  test('artisan middleware grants access to artisan and admin, blocks normal user', () => {
    let artisanNext = false;
    const artisanReq = { user: { id: 'u3', role: 'artisan' } };
    artisan(artisanReq, {}, () => { artisanNext = true; });
    assert.strictEqual(artisanNext, true, 'Artisan must pass artisan middleware');

    let adminNext = false;
    const adminReq = { user: { id: 'u1', role: 'admin' } };
    artisan(adminReq, {}, () => { adminNext = true; });
    assert.strictEqual(adminNext, true, 'Admin must pass artisan middleware');

    let deniedStatus = null;
    const userReq = { user: { id: 'u2', role: 'user' } };
    const res = {
      status: (code) => {
        deniedStatus = code;
        return { json: () => {} };
      }
    };
    artisan(userReq, res, () => {});
    assert.strictEqual(deniedStatus, 403, 'Normal user must receive 403');
  });

  // ─── 9. Sanitization Helper ───────────────────────────────────
  test('sanitizeUser strips password and password_hash from response object', () => {
    const rawUser = {
      id: 'usr-123',
      name: 'Rohan',
      email: 'rohan@example.com',
      password: 'hashed_password_string',
      password_hash: 'legacy_hash_string',
      role: 'ADMIN'
    };

    const sanitized = sanitizeUser(rawUser);
    assert.strictEqual(sanitized.password, undefined);
    assert.strictEqual(sanitized.password_hash, undefined);
    assert.strictEqual(sanitized.role, 'admin');
    assert.strictEqual(sanitized.name, 'Rohan');
  });
});
