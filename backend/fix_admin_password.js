/**
 * fix_admin_password.js
 * Resets the admin password in both public.users (bcrypt) and Supabase Auth.
 * Usage: node fix_admin_password.js
 */
require('dotenv').config();
const supabase = require('./config/supabase');
const bcrypt = require('bcryptjs');

const ADMIN_ID = '9a1b4ca0-0869-4b34-a93d-10113b164a0d';
const ADMIN_EMAIL = 'rohankokkarikr@gmail.com';

// ← SET YOUR NEW ADMIN PASSWORD HERE
const NEW_PASSWORD = 'Admin@1234';

async function fixAdminPassword() {
  console.log('🔐 Fixing admin password...');

  // 1. Hash password for public.users
  const salt = await bcrypt.genSalt(12);
  const hashed = await bcrypt.hash(NEW_PASSWORD, salt);

  // 2. Update public.users bcrypt hash
  const { data, error } = await supabase
    .from('users')
    .update({ password: hashed })
    .eq('id', ADMIN_ID)
    .select('id, email, role')
    .single();

  if (error) {
    console.error('❌ Failed to update public.users password:', error.message);
    process.exit(1);
  }
  console.log('✅ public.users bcrypt hash updated for:', data.email, '| role:', data.role);

  // 3. Also update Supabase Auth password
  try {
    const { error: sbErr } = await supabase.auth.admin.updateUserById(ADMIN_ID, {
      password: NEW_PASSWORD,
    });
    if (sbErr) {
      console.warn('⚠️  Supabase Auth (by ID) notice:', sbErr.message);
    } else {
      console.log('✅ Supabase Auth password updated.');
    }
  } catch (e) {
    console.warn('⚠️  Supabase Auth password sync skipped:', e.message);
  }

  console.log('\n✅ Admin password reset complete!');
  console.log(`   Email: ${ADMIN_EMAIL}`);
  console.log(`   Password: [set to what you configured in NEW_PASSWORD]`);
  console.log('\n💡 You can now log in to the Admin panel with these credentials.');
  process.exit(0);
}

fixAdminPassword();
