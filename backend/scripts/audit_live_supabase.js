const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const supabase = require('../config/supabase');

const tablesToCheck = [
  "users",
  "artisan_profiles",
  "products",
  "categories",
  "orders",
  "order_items",
  "artisan_orders",
  "artisan_earnings",
  "sales",
  "payments",
  "reviews",
  "coupons",
  "user_spins",
  "user_rewards",
  "reports",
  "customer_complaints",
  "notifications",
  "admin_activity_logs",
  "activity_logs",
  "platform_settings",
  "checkout_otp_challenges",
  "shipping_shipments",
  "shipping_webhook_events",
  "whatsapp_notifications",
  "ai_usage_logs",
  "ai_action_queue",
  "ai_admin_actions",
  "ai_admin_conversations",
  "ai_automation_rules",
  "ai_reports",
  "ai_agent_approvals",
  "ai_agent_memory",
  "ai_agent_sessions",
  "ai_daily_reports",
  "ai_job_queue"
];

async function audit() {
  console.log('=== AUDITING LIVE SUPABASE DATABASE ===');
  console.log('SUPABASE_URL:', process.env.SUPABASE_URL);

  const results = {};
  const missingTables = [];
  const existingTables = [];

  for (const tbl of tablesToCheck) {
    try {
      const { data, error, count } = await supabase.from(tbl).select('*', { count: 'exact' }).limit(3);
      if (error) {
        results[tbl] = {
          exists: false,
          error: error.message,
          code: error.code,
          hint: error.hint
        };
        missingTables.push(tbl);
      } else {
        const sampleColumns = (data && data.length > 0) ? Object.keys(data[0]) : [];
        results[tbl] = {
          exists: true,
          count: count,
          sampleColumns: sampleColumns
        };
        existingTables.push(tbl);
      }
    } catch (e) {
      results[tbl] = { exists: false, exception: e.message };
      missingTables.push(tbl);
    }
  }

  console.log('\n--- AUDIT SUMMARY ---');
  console.log(`Existing tables (${existingTables.length}/${tablesToCheck.length}):`);
  existingTables.forEach(t => {
    console.log(`  ✅ ${t.padEnd(26)}: ${results[t].count} rows | cols: [${results[t].sampleColumns.join(', ')}]`);
  });

  if (missingTables.length > 0) {
    console.log(`\nMissing / Inaccessible tables (${missingTables.length}):`);
    missingTables.forEach(t => {
      console.log(`  ❌ ${t.padEnd(26)}: ${results[t].error || results[t].exception}`);
    });
  } else {
    console.log('\nAll checked tables exist in Supabase!');
  }

  // Check RPCs
  console.log('\n--- CHECKING RPCS ---');
  const rpcs = ['deduct_product_stock', 'restore_product_stock'];
  for (const rpcName of rpcs) {
    try {
      const { data, error } = await supabase.rpc(rpcName, { p_product_id: '00000000-0000-0000-0000-000000000000', p_quantity: 0 });
      console.log(`RPC [${rpcName}]:`, error ? `Returned error (as expected for dummy ID): ${error.message} (code: ${error.code})` : `Executed successfully`);
    } catch (e) {
      console.log(`RPC [${rpcName}]: Exception - ${e.message}`);
    }
  }

  return { results, existingTables, missingTables };
}

audit().catch(err => {
  console.error('Fatal audit error:', err);
  process.exit(1);
});
