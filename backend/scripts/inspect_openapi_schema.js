const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const https = require('https');
const fs = require('fs');

const url = new URL(process.env.SUPABASE_URL + '/rest/v1/');
const req = https.request(url, {
  method: 'GET',
  headers: {
    'apikey': process.env.SUPABASE_SERVICE_KEY,
    'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_KEY
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(body);
      console.log('OpenAPI definitions found count:', Object.keys(json.definitions || {}).length);
      console.log('Tables in definitions:', Object.keys(json.definitions || {}));

      // Let's write the openapi definitions to a scratch file so we can analyze all columns and types!
      const dumpPath = path.join(__dirname, 'live_supabase_schema.json');
      fs.writeFileSync(dumpPath, JSON.stringify(json.definitions, null, 2));
      console.log('Wrote live schema definitions to:', dumpPath);

      // Check each definition
      for (const [tableName, schema] of Object.entries(json.definitions)) {
        const props = Object.keys(schema.properties || {});
        console.log(`Table: ${tableName.padEnd(26)} (${props.length} cols): ${props.slice(0, 8).join(', ')}${props.length > 8 ? '...' : ''}`);
      }
    } catch(e) {
      console.log('Error parsing JSON:', e.message);
      console.log('Response status:', res.statusCode, 'body prefix:', body.substring(0, 300));
    }
  });
});
req.on('error', (err) => console.error('Request error:', err));
req.end();
