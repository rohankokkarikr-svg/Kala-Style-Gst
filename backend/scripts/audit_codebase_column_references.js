const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..');
const liveSchema = JSON.parse(fs.readFileSync(path.join(__dirname, 'live_supabase_schema.json'), 'utf8'));

// Scan frontend and backend
const dirsToScan = [
  path.join(rootDir, 'backend'),
  path.join(rootDir, 'src')
];

const jsFiles = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  const list = fs.readdirSync(dir);
  for (const item of list) {
    if (['node_modules', '.git', 'dist', 'build', '.gemini', 'scripts'].includes(item)) continue;
    const full = path.join(dir, item);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walk(full);
    } else if (/\.(js|jsx|ts|tsx)$/.test(item)) {
      jsFiles.push(full);
    }
  }
}

dirsToScan.forEach(walk);

console.log(`Scanning ${jsFiles.length} application code files for Supabase table operations...`);

const tableColUsage = {};

jsFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');

  // Find supabase.from('table_name')
  const fromRegex = /(?:supabase|\.from)\s*\(\s*['"`]([a-zA-Z0-9_]+)['"`]\s*\)/g;
  let match;
  while ((match = fromRegex.exec(content)) !== null) {
    const table = match[1];
    if (['product-images', 'site-config'].includes(table)) continue; // storage buckets
    if (!tableColUsage[table]) tableColUsage[table] = new Set();
  }

  // Find selects like .select('id, name, price, ...')
  const selectRegex = /\.from\s*\(\s*['"`]([a-zA-Z0-9_]+)['"`]\s*\)[\s\S]*?\.select\s*\(\s*['"`]([\s\S]*?)['"`]\s*\)/g;
  while ((match = selectRegex.exec(content)) !== null) {
    const table = match[1];
    const selectStr = match[2];
    if (!tableColUsage[table]) tableColUsage[table] = new Set();

    // Parse columns out of select string
    selectStr.split(',').forEach(col => {
      let clean = col.trim().split(':')[0].trim(); // handle aliases
      // handle table joins like artisan_profiles(store_name)
      if (clean.includes('(') || clean.includes(')') || clean.includes('*')) return;
      if (clean && !clean.includes(' ') && !clean.includes('.')) {
        tableColUsage[table].add(clean);
      }
    });
  }
});

console.log('\n--- VERIFYING COLUMNS REFERENCED IN CODE EXIST IN LIVE SUPABASE ---');

let anyMissing = false;
for (const [table, cols] of Object.entries(tableColUsage)) {
  const liveTable = liveSchema[table];
  if (!liveTable) {
    console.log(`❌ Table [${table}] referenced in code does NOT exist in live Supabase!`);
    anyMissing = true;
    continue;
  }

  const liveCols = Object.keys(liveTable.properties || {});
  const missing = Array.from(cols).filter(c => !liveCols.includes(c));
  if (missing.length > 0) {
    console.log(`❌ Table [${table}] is MISSING columns referenced in application code:`, missing);
    anyMissing = true;
  } else {
    console.log(`✅ Table [${table}]: All ${cols.size} code-referenced columns exist in live DB!`);
  }
}

if (!anyMissing) {
  console.log('\n🎉 ALL COLUMNS REFERENCED IN APPLICATION CODE ALREADY EXIST IN LIVE SUPABASE!');
}
