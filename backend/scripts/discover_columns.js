const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const supabase = require('../config/supabase');

async function checkEmptyTableColumns() {
  const emptyTables = [
    'artisan_orders',
    'artisan_earnings',
    'payments',
    'user_rewards',
    'customer_complaints',
    'notifications',
    'activity_logs',
    'checkout_otp_challenges',
    'shipping_shipments',
    'shipping_webhook_events',
    'whatsapp_notifications',
    'ai_action_queue',
    'ai_admin_conversations',
    'ai_automation_rules',
    'ai_agent_approvals',
    'ai_agent_sessions',
    'ai_daily_reports',
    'ai_job_queue'
  ];

  for (const tbl of emptyTables) {
    // Try inserting a dummy empty object or invalid column to get schema hint or list
    const { data, error } = await supabase.from(tbl).insert([{ non_existent_column_xyz: 123 }]);
    if (error) {
      console.log(`[${tbl}]: ${error.message}`);
    }
  }
}

checkEmptyTableColumns();
