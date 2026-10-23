const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..');

const sqlFiles = [
  'ADMIN_SCHEMA.sql',
  'AI_ADMIN_SYSTEM_MIGRATION.sql',
  'KALASTYLE_SCHEMA.sql',
  'SUPABASE_SCHEMA.sql',
  'database/AI_AGENT_OPERATIONS_MIGRATION.sql'
];

// Add backend/migrations and database/migrations
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

const tablesCreated = new Set();
const tablesReferenced = new Set();
const functionsCreated = new Set();
const triggersCreated = new Set();
const policiesCreated = new Set();

const tableCreateRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-zA-Z0-9_]+)/gi;
const funcCreateRegex = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-zA-Z0-9_]+)/gi;
const triggerCreateRegex = /CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+([a-zA-Z0-9_]+)\s+(?:BEFORE|AFTER|INSTEAD\s+OF).*?\s+ON\s+(?:public\.)?([a-zA-Z0-9_]+)/gi;
const policyCreateRegex = /CREATE\s+POLICY\s+["']?([^"'\s]+)["']?\s+ON\s+(?:public\.)?([a-zA-Z0-9_]+)/gi;

sqlFiles.forEach(relPath => {
  const fullPath = path.join(rootDir, relPath);
  if (!fs.existsSync(fullPath)) return;
  const content = fs.readFileSync(fullPath, 'utf8');

  let match;
  while ((match = tableCreateRegex.exec(content)) !== null) {
    tablesCreated.add(match[1].toLowerCase());
  }
  while ((match = funcCreateRegex.exec(content)) !== null) {
    functionsCreated.add(match[1].toLowerCase());
  }
  while ((match = triggerCreateRegex.exec(content)) !== null) {
    triggersCreated.add(`${match[1].toLowerCase()} ON ${match[2].toLowerCase()}`);
  }
  while ((match = policyCreateRegex.exec(content)) !== null) {
    policiesCreated.add(`"${match[1]}" ON ${match[2].toLowerCase()}`);
  }
});

console.log('--- TABLES CREATED IN SQL FILES ---');
console.log(JSON.stringify([...tablesCreated].sort(), null, 2));

console.log('--- FUNCTIONS CREATED IN SQL FILES ---');
console.log(JSON.stringify([...functionsCreated].sort(), null, 2));

console.log('--- TRIGGERS CREATED IN SQL FILES ---');
console.log(JSON.stringify([...triggersCreated].sort(), null, 2));

console.log('--- POLICIES CREATED IN SQL FILES (Sample count: ' + policiesCreated.size + ') ---');
