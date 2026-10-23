const fs = require('fs');
const path = require('path');

const liveSchema = JSON.parse(fs.readFileSync(path.join(__dirname, 'live_supabase_schema.json'), 'utf8'));

// Parse all SQL files to find all ALTER TABLE ... ADD COLUMN and CREATE TABLE definitions
const rootDir = path.resolve(__dirname, '..', '..');

const sqlFiles = [
  'ADMIN_SCHEMA.sql',
  'AI_ADMIN_SYSTEM_MIGRATION.sql',
  'KALASTYLE_SCHEMA.sql',
  'SUPABASE_SCHEMA.sql',
  'database/AI_AGENT_OPERATIONS_MIGRATION.sql'
];

const bmDir = path.join(rootDir, 'backend', 'migrations');
if (fs.existsSync(bmDir)) {
  fs.readdirSync(bmDir).forEach(f => {
    if (f.endsWith('.sql')) sqlFiles.push(`backend/migrations/${f}`);
  });
}
const dmDir = path.join(rootDir, 'database', 'migrations');
if (fs.existsSync(dmDir)) {
  fs.readdirSync(dmDir).forEach(f => {
    if (f.endsWith('.sql')) sqlFiles.push(`database/migrations/${f}`);
  });
}

// Track expected columns per table
const expectedColumns = {};

function addColumn(table, col) {
  table = table.toLowerCase().trim();
  col = col.toLowerCase().trim();
  if (!expectedColumns[table]) expectedColumns[table] = new Set();
  expectedColumns[table].add(col);
}

// Parse CREATE TABLE and ALTER TABLE ADD COLUMN
sqlFiles.forEach(relPath => {
  const fullPath = path.join(rootDir, relPath);
  if (!fs.existsSync(fullPath)) return;
  const content = fs.readFileSync(fullPath, 'utf8');

  // ALTER TABLE ... ADD COLUMN [IF NOT EXISTS] col_name
  const alterRegex = /ALTER\s+TABLE\s+(?:ONLY\s+)?(?:public\.)?([a-zA-Z0-9_]+)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)/gi;
  let match;
  while ((match = alterRegex.exec(content)) !== null) {
    addColumn(match[1], match[2]);
  }

  // CREATE TABLE
  // Match CREATE TABLE [IF NOT EXISTS] table_name ( ... );
  const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\n\);/gi;
  while ((match = createTableRegex.exec(content)) !== null) {
    const tableName = match[1].toLowerCase();
    const body = match[2];
    const lines = body.split('\n');
    for (let line of lines) {
      line = line.trim();
      if (!line || line.startsWith('--')) continue;
      // Skip table constraints like CONSTRAINT, PRIMARY KEY (, FOREIGN KEY, UNIQUE (
      if (/^(CONSTRAINT|PRIMARY\s+KEY\s*\(|FOREIGN\s+KEY|UNIQUE\s*\(|CHECK\s*\()/i.test(line)) continue;

      // Match first token as column name
      const colMatch = line.match(/^([a-zA-Z0-9_]+)\s+/);
      if (colMatch) {
        const colName = colMatch[1];
        if (!['references', 'check', 'constraint'].includes(colName.toLowerCase())) {
          addColumn(tableName, colName);
        }
      }
    }
  }
});

console.log('=== COMPARISON: EXPECTED IN SQL VS LIVE SUPABASE ===\n');

const comparison = {};

for (const [table, colsSet] of Object.entries(expectedColumns)) {
  const liveTable = liveSchema[table];
  const expectedCols = Array.from(colsSet).sort();

  if (!liveTable) {
    comparison[table] = { status: 'MISSING_TABLE', expectedCols };
    console.log(`❌ Table [${table}] is MISSING in Supabase!`);
    continue;
  }

  const liveCols = Object.keys(liveTable.properties || {});
  const missingCols = expectedCols.filter(c => !liveCols.includes(c));
  const extraCols = liveCols.filter(c => !expectedCols.includes(c));

  comparison[table] = {
    status: missingCols.length === 0 ? 'COMPATIBLE' : 'MISSING_COLUMNS',
    expectedCols,
    liveCols,
    missingCols,
    extraCols
  };

  if (missingCols.length > 0) {
    console.log(`⚠️ Table [${table}]: MISSING ${missingCols.length} columns:`, missingCols);
  } else {
    console.log(`✅ Table [${table}]: FULLY COMPATIBLE (${liveCols.length} columns, ${extraCols.length} extra/newer columns)`);
  }
}

// Check tables in live that were not in expectedColumns
console.log('\n--- LIVE TABLES NOT FOUND IN SQL MIGRATIONS ---');
for (const table of Object.keys(liveSchema)) {
  if (!expectedColumns[table]) {
    console.log(`ℹ️ Live table [${table}] exists in Supabase (${Object.keys(liveSchema[table].properties || {}).length} columns)`);
  }
}

fs.writeFileSync(path.join(__dirname, 'schema_comparison.json'), JSON.stringify(comparison, null, 2));
console.log('\nDetailed comparison written to schema_comparison.json');
