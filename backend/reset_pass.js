/**
 * backend/reset_pass.js
 * ─────────────────────────────────────────────────────────────────
 * SECURE TEST/STAGING PASSWORD RESET UTILITY
 * 
 * Safety Rules Enforced:
 * 1. Strictly refuses execution if NODE_ENV === 'production'.
 * 2. Requires explicit ALLOW_TEST_ACCOUNT_MUTATION=true environment confirmation.
 * 3. Requires target user ID passed via argument: --user-id=<uuid> or TARGET_USER_ID env.
 * 4. Requires new password passed via RESET_NEW_PASSWORD env (never hardcoded or default).
 * 5. Strictly sanitizes output: NEVER logs or prints passwords, tokens, or hashes.
 */

require('dotenv').config();
const supabase = require('./config/supabase');
const bcrypt = require('bcryptjs');

async function secureResetPassword() {
  // Guard 1: Block in production
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ SAFETY REFUSAL: Password reset utility is strictly disabled in production.');
    process.exit(1);
  }

  // Guard 2: Require explicit test account mutation permission
  if (process.env.ALLOW_TEST_ACCOUNT_MUTATION !== 'true') {
    console.error('❌ SAFETY REFUSAL: Password reset requires ALLOW_TEST_ACCOUNT_MUTATION=true.');
    console.error('This utility can only be executed in an isolated staging or test environment.');
    process.exit(1);
  }

  // Guard 3: Resolve target user ID
  const args = process.argv.slice(2);
  let targetUserId = process.env.TARGET_USER_ID || null;
  for (const arg of args) {
    if (arg.startsWith('--user-id=')) {
      targetUserId = arg.split('=')[1].trim();
    }
  }

  if (!targetUserId) {
    console.error('❌ USAGE ERROR: Explicit target user ID is required.');
    console.error('Pass via: node reset_pass.js --user-id=<uuid> or TARGET_USER_ID=<uuid>');
    process.exit(1);
  }

  // Guard 4: Require password from environment variable
  const newPassword = process.env.RESET_NEW_PASSWORD;
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    console.error('❌ USAGE ERROR: RESET_NEW_PASSWORD must be provided in environment with at least 8 characters.');
    process.exit(1);
  }

  try {
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    const { data, error } = await supabase
      .from('users')
      .update({ password: hashedPassword })
      .eq('id', targetUserId)
      .select('id, name, email, role, status')
      .single();

    if (error) {
      console.error('❌ Failed to update password:', error.message);
      process.exit(1);
    }

    if (!data) {
      console.error('❌ User not found with ID:', targetUserId);
      process.exit(1);
    }

    console.log('✅ Password successfully reset for user account.');
    console.log(`   User ID: ${data.id}`);
    console.log(`   Email:   ${data.email ? data.email.replace(/(?<=.{2}).(?=[^@]*?@)/g, '*') : 'N/A'}`);
    console.log(`   Role:    ${data.role}`);
  } catch (err) {
    console.error('❌ Unexpected error during password reset:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  secureResetPassword();
}

module.exports = { secureResetPassword };
