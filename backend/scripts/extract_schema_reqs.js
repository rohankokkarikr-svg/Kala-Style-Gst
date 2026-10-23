const fs = require('fs');
const path = require('path');

function walk(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file === 'node_modules' || file === '.git' || file === 'build') continue;
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walk(fullPath, fileList);
    } else if (file.endsWith('.js') || file.endsWith('.jsx') || file.endsWith('.sql')) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const rootDir = path.resolve(__dirname, '../..');
const allFiles = walk(rootDir);
const tableNames = new Set();
const rpcNames = new Set();

const fromRegex = /\.from\(['"]([a-zA-Z0-9_\-]+)['"]\)/g;
const rpcRegex = /\.rpc\(['"]([a-zA-Z0-9_\-]+)['"]/g;

for (const file of allFiles) {
  const content = fs.readFileSync(file, 'utf8');
  let match;
  while ((match = fromRegex.exec(content)) !== null) {
    tableNames.add(match[1]);
  }
  while ((match = rpcRegex.exec(content)) !== null) {
    rpcNames.add(match[1]);
  }
}

console.log('--- TABLES REFERENCED IN CODE ---');
console.log(JSON.stringify(Array.from(tableNames).sort(), null, 2));

console.log('--- RPCS REFERENCED IN CODE ---');
console.log(JSON.stringify(Array.from(rpcNames).sort(), null, 2));
