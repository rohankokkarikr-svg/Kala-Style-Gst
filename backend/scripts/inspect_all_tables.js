const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });
const supabase = require('../config/supabase');

async function getAllReferencedTables() {
  const rootDir = path.join(__dirname, '../..');
  const tableSet = new Set();
  
  // Recursively find .from('table_name') or .from("table_name") in backend and frontend/src
  function scanDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'build') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (/\.(js|jsx|ts|tsx|sql)$/.test(entry.name)) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const regex = /\.from\(['"]([a-zA-Z0-9_]+)['"]\)/g;
          let match;
          while ((match = regex.exec(content)) !== null) {
            tableSet.add(match[1]);
          }
          // Also look for CREATE TABLE IF NOT EXISTS ([a-zA-Z0-9_]+)
          const sqlRegex = /create\s+table(?:\s+if\s+not\s+exists)?\s+(?:public\.)?([a-zA-Z0-9_]+)/gi;
          while ((match = sqlRegex.exec(content)) !== null) {
            tableSet.add(match[1].toLowerCase());
          }
        } catch (_) {}
      }
    }
  }

  scanDir(path.join(rootDir, 'backend'));
  if (fs.existsSync(path.join(rootDir, 'frontend', 'src'))) {
    scanDir(path.join(rootDir, 'frontend', 'src'));
  }
  if (fs.existsSync(path.join(rootDir, 'database'))) {
    scanDir(path.join(rootDir, 'database'));
  }

  return Array.from(tableSet).sort();
}

async function runAudit() {
  console.log('🔍 Starting comprehensive database tables audit...');
  console.log('Supabase URL:', process.env.SUPABASE_URL);
  
  const tables = await getAllReferencedTables();
  console.log(`Found ${tables.length} unique table references across codebase.`);

  const results = {
    accessible: [],
    empty: [],
    populated: [],
    errors: [],
  };

  for (const table of tables) {
    try {
      const { data, error, count } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (error) {
        results.errors.push({ table, error: error.message, code: error.code });
        console.log(`❌ [${table}]: ERROR - ${error.code} ${error.message}`);
      } else {
        const rowCount = count !== null ? count : (data ? data.length : 0);
        if (rowCount > 0) {
          results.populated.push({ table, count: rowCount });
          console.log(`✅ [${table}]: POPULATED (${rowCount} rows)`);
        } else {
          results.empty.push({ table, count: 0 });
          console.log(`⚠️  [${table}]: EMPTY (0 rows, table exists)`);
        }
        results.accessible.push(table);
      }
    } catch (e) {
      results.errors.push({ table, error: e.message });
      console.log(`💥 [${table}]: EXCEPTION - ${e.message}`);
    }
  }

  console.log('\n================ SUMMARY ================');
  console.log(`Total Tables Checked: ${tables.length}`);
  console.log(`Populated Tables (${results.populated.length}):`, results.populated.map(p => `${p.table}(${p.count})`).join(', '));
  console.log(`Empty Tables (${results.empty.length}):`, results.empty.map(e => e.table).join(', '));
  console.log(`Error/Missing Tables (${results.errors.length}):`, results.errors.map(e => `${e.table}: ${e.error}`).join(' | '));
}

runAudit();
