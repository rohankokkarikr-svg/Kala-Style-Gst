require('dotenv').config();
const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const apiKeySid = process.env.TWILIO_API_KEY_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_WHATSAPP_FROM || '+14155238886';
const targetPhone = process.argv[2] || '917349083982';

const formattedTarget = `whatsapp:+${targetPhone.replace(/\D/g, '')}`;
const formattedFrom = `whatsapp:${fromNumber.replace(/\s+/g, '').replace('whatsapp:', '')}`;

console.log('\n========================================');
console.log('📱 Testing Twilio WhatsApp Message Send');
console.log('========================================');
console.log(`From:   ${formattedFrom}`);
console.log(`To:     ${formattedTarget}`);
console.log('----------------------------------------');

const client = twilio(apiKeySid || accountSid, authToken, { accountSid });

(async () => {
  try {
    const message = await client.messages.create({
      from: formattedFrom,
      to: formattedTarget,
      body: '🎉 *KalaStyle AI Notification*\n\nYour WhatsApp order notification channel is successfully connected! You will receive live alerts for all customer orders.'
    });

    console.log('✅ WhatsApp message delivered successfully!');
    console.log(`📦 Message SID: ${message.sid}`);
    console.log(`⚡ Status:      ${message.status}`);
    console.log('========================================\n');
  } catch (err) {
    console.error('❌ Twilio WhatsApp send error:');
    console.error(`   ${err.message}`);
    console.log('\n💡 Why this happens:');
    console.log('   In Twilio Trial accounts, WhatsApp requires your phone to join the Sandbox first:');
    console.log('   1. Open WhatsApp on ' + targetPhone);
    console.log('   2. Send your sandbox keyword (e.g. "join <your-keyword>") to +1 415 523 8886');
    console.log('   3. Run this script again: node test_send_whatsapp.js\n');
  }
})();
