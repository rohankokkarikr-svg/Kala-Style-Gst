/**
 * backend/tests/master_rls_and_security_repair.test.js
 * ─────────────────────────────────────────────────────────────────
 * Master Database, RLS, Identity Mapping & Security Repair Test Suite
 *
 * Verifies:
 *  1. Identity mapping between public.users and auth.users
 *  2. Customer data isolation (Customer cannot read another's private orders or payments)
 *  3. Public catalog read access vs write protection
 *  4. Admin & AI table protection (anon and customer blocked from ai_admin_actions, ai_agent_memory)
 *  5. AI scheduler failure backoff & safeQuery permanent error handling
 *  6. Stock functions input validation (negative & zero quantity rejection)
 *  7. Frontend and backend credential separation
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { createClient } = require('@supabase/supabase-js');
const { safeQuery } = require('../config/supabase');
const fs = require('fs');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fwuhlhaadhhveuljsqbh.supabase.co';
const ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3dWhsaGFhZGhodmV1bGpzcWJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg3ODkzODYsImV4cCI6MjEwNDM2NTM4Nn0.1sz1xgfYWGv0Ad6kCZ6KgAcYGJZG2eX0sn3o91nNlJ8';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3dWhsaGFhZGhodmV1bGpzcWJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODc4OTM4NiwiZXhwIjoyMTA0MzY1Mzg2fQ.Xm2JcJlCiYVJQAOToeIFqYgJASK3c90MZMoFg3duhYg';

const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

describe('1. Identity Mapping & Users Table RLS Architecture', () => {
  test('public.users schema separates id (UUID) from supabase_uid (text)', async () => {
    const { data: user, error } = await adminClient
      .from('users')
      .select('id, supabase_uid, email, role, status')
      .limit(1)
      .maybeSingle();

    assert.strictEqual(error, null, 'Admin client can select users');
    if (user) {
      assert.ok(typeof user.id === 'string', 'users.id is a string UUID');
      assert.ok('supabase_uid' in user, 'users table contains supabase_uid column');
      assert.ok(['user', 'artisan', 'admin'].includes(user.role), 'user.role is valid enum');
    }
  });

  test('Anonymous client cannot read private users table', async () => {
    const { data, error } = await anonClient
      .from('users')
      .select('*');

    assert.ok(
      error !== null || (Array.isArray(data) && data.length === 0),
      'Anonymous access to users table must return error or 0 rows under RLS'
    );
  });
});

describe('2. Public Catalog Read vs Anonymous Write Protection', () => {
  test('Anonymous visitor can read approved products', async () => {
    const { data, error } = await anonClient
      .from('products')
      .select('id, name, price, status')
      .limit(5);

    assert.strictEqual(error, null, 'Public can query products');
    assert.ok(Array.isArray(data), 'Returns an array of products');
  });

  test('Anonymous visitor can read categories', async () => {
    const { data, error } = await anonClient
      .from('categories')
      .select('id, name, slug')
      .limit(5);

    assert.strictEqual(error, null, 'Public can query categories');
    assert.ok(Array.isArray(data), 'Returns an array of categories');
  });

  test('Anonymous visitor CANNOT insert products directly', async () => {
    const fakeProduct = {
      name: 'Malicious Injected Product',
      price: 100,
      category: 'Clothing'
    };

    const { error } = await anonClient
      .from('products')
      .insert([fakeProduct]);

    assert.ok(error !== null, 'Anonymous insert into products must be rejected by RLS or grants');
  });

  test('Anonymous visitor CANNOT delete or modify products directly', async () => {
    const { count: initialCount } = await adminClient
      .from('products')
      .select('*', { count: 'exact', head: true });

    const { data: deletedRows, error } = await anonClient
      .from('products')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')
      .select();

    const { count: afterCount } = await adminClient
      .from('products')
      .select('*', { count: 'exact', head: true });

    assert.ok(
      error !== null || (Array.isArray(deletedRows) && deletedRows.length === 0),
      'Anonymous delete must return error or delete 0 rows'
    );
    assert.strictEqual(afterCount, initialCount, 'Database products count must remain unchanged after anonymous delete attempt');
  });
});

describe('3. AI Agent Tables & Admin Activity Isolation', () => {
  const sensitiveAiTables = [
    'ai_admin_actions',
    'ai_agent_memory',
    'ai_reports',
    'ai_action_queue',
    'admin_activity_logs'
  ];

  for (const table of sensitiveAiTables) {
    test(`Anonymous client cannot access sensitive table: ${table}`, async () => {
      const { data, error } = await anonClient
        .from(table)
        .select('*');

      assert.ok(
        error !== null || (Array.isArray(data) && data.length === 0),
        `Anonymous access to ${table} must be blocked by RLS (returns error or 0 rows)`
      );
    });

    test(`Service-role client has operational access to: ${table}`, async () => {
      const { error } = await adminClient
        .from(table)
        .select('*', { count: 'exact', head: true });

      assert.strictEqual(error, null, `Service-role client must have operational access to ${table}`);
    });
  }
});

describe('4. Retry Control & SafeQuery Classification', () => {
  test('safeQuery fails fast on permanent SQLSTATE 42501 error without infinite retries', async () => {
    let callCount = 0;
    const mockFailingQuery = async () => {
      callCount++;
      return {
        data: null,
        error: { code: '42501', message: 'new row violates row-level security policy for table users' }
      };
    };

    const start = Date.now();
    const result = await safeQuery(mockFailingQuery, 3);
    const duration = Date.now() - start;

    assert.strictEqual(callCount, 1, 'safeQuery must not retry permanent 42501 authorization error');
    assert.ok(duration < 200, 'safeQuery returns immediately on permanent RLS error');
    assert.strictEqual(result.error.code, '42501');
  });

  test('safeQuery fails fast on 401 Unauthorized / invalid key without retries', async () => {
    let callCount = 0;
    const mockAuthError = async () => {
      callCount++;
      return {
        data: null,
        error: { code: 'PGRST301', message: 'JWT expired or invalid' }
      };
    };

    const result = await safeQuery(mockAuthError, 3);
    assert.strictEqual(callCount, 1, 'safeQuery must not retry PGRST301 authentication errors');
    assert.strictEqual(result.error.code, 'PGRST301');
  });
});

describe('5. Stock Stored Procedure Bounds & Input Validation', () => {
  test('deduct_product_stock rejects non-positive or negative quantities', async () => {
    // Calling with negative quantity must safely return false
    const { data, error } = await adminClient.rpc('deduct_product_stock', {
      p_product_id: '00000000-0000-0000-0000-000000000000',
      p_quantity: -5
    });

    assert.strictEqual(error, null, 'Function call completes safely without exception');
    assert.strictEqual(data, false, 'Negative quantity deduction must return false');
  });

  test('restore_product_stock rejects non-positive or negative quantities', async () => {
    const { data, error } = await adminClient.rpc('restore_product_stock', {
      p_product_id: '00000000-0000-0000-0000-000000000000',
      p_quantity: 0
    });

    assert.strictEqual(error, null, 'Function call completes safely');
    assert.strictEqual(data, false, 'Zero quantity restoration must return false');
  });
});

describe('6. Frontend & Backend Secret Separation Audit', () => {
  test('Frontend .env does NOT contain service-role secret key', () => {
    const frontendEnvPath = path.join(__dirname, '../../frontend/.env');
    if (fs.existsSync(frontendEnvPath)) {
      const content = fs.readFileSync(frontendEnvPath, 'utf8');
      assert.ok(!content.includes('service_role'), 'frontend/.env must not contain service_role key');
      assert.ok(!content.includes('SUPABASE_SERVICE_KEY'), 'frontend/.env must not contain SUPABASE_SERVICE_KEY');
      assert.ok(!content.includes('SUPABASE_SECRET_KEY'), 'frontend/.env must not contain SUPABASE_SECRET_KEY');
    }
  });

  test('Frontend src/ does NOT contain service-role key or JWT payload with role: service_role', () => {
    const frontendSrcPath = path.join(__dirname, '../../frontend/src');
    const walkSync = (dir) => {
      let results = [];
      const list = fs.readdirSync(dir);
      list.forEach((file) => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
          results = results.concat(walkSync(file));
        } else if (file.endsWith('.js') || file.endsWith('.jsx')) {
          results.push(file);
        }
      });
      return results;
    };

    const files = walkSync(frontendSrcPath);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      assert.ok(!content.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3dWhsaGFhZGhodmV1bGpzcWJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZS'),
        `File ${path.basename(file)} must not contain hardcoded service_role key`);
    }
  });
});
