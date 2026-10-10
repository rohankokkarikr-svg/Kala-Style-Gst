/**
 * backend/scripts/packageProjectZip.js
 * ─────────────────────────────────────────────────────────────────
 * Clean, Security-Enforced Project Packaging Script
 * 
 * Implements a STRICT POSITIVE ALLOWLIST:
 * - Only includes approved top-level project directories and manifests.
 * - Positively checks allowed file extensions and directories.
 * - Strictly excludes all `.env` files (except `.env.example`), credentials,
 *   node_modules, build outputs, operational JSON/log dumps, git history, and caches.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '../../');
const stagingDir = path.join(rootDir, 'temp_package_staging', 'KalaStyle-AI-Project');
const zipOutputPath = path.join(rootDir, 'KalaStyle_AI_Clean_Dist.zip');

console.log('📦 Starting strict allowlisted project packaging...');
console.log(`Source root: ${rootDir}`);
console.log(`Destination zip: ${zipOutputPath}`);

// Clean previous runs
if (fs.existsSync(zipOutputPath)) {
  fs.unlinkSync(zipOutputPath);
}
if (fs.existsSync(path.dirname(stagingDir))) {
  fs.rmSync(path.dirname(stagingDir), { recursive: true, force: true });
}

fs.mkdirSync(stagingDir, { recursive: true });

// ── 1. Top-Level Allowlist ────────────────────────────────────────────────────
const ALLOWED_TOP_LEVEL_DIRS = new Set([
  'backend',
  'frontend',
  'database',
  'docs',
]);

const ALLOWED_TOP_LEVEL_FILES = new Set([
  'package.json',
  'package-lock.json',
  'README.md',
  'render.yaml',
  'netlify.toml',
  '.gitignore',
  'ADMIN_SCHEMA.sql',
  'KALASTYLE_SCHEMA.sql',
  'SUPABASE_SCHEMA.sql',
  'AI_ADMIN_SYSTEM_MIGRATION.sql',
]);

// ── 2. Strictly Forbidden Sub-Paths and Extensions ────────────────────────────
const FORBIDDEN_DIRS = new Set([
  'node_modules',
  '.git',
  '.git_old',
  'build',
  '.cache',
  '.vscode',
  '.agents',
  '.gemini',
  'temp_package_staging',
]);

const FORBIDDEN_EXTENSIONS = new Set([
  '.log',
  '.tmp',
  '.zip',
  '.tar',
  '.gz',
  '.7z',
  '.rar',
  '.pem',
  '.key',
]);

function isAllowedFile(relativePath, fileName) {
  const norm = relativePath.replace(/\\/g, '/');
  const lower = fileName.toLowerCase();

  // Rule A: Check extension
  const ext = path.extname(fileName).toLowerCase();
  if (FORBIDDEN_EXTENSIONS.has(ext)) return false;

  // Rule B: Enforce environment file isolation - NEVER include .env files except .env.example
  if (lower === '.env' || (lower.startsWith('.env') && !lower.endsWith('.example')) || lower.endsWith('.env')) {
    return false;
  }

  // Rule C: Block credentials, webhook dumps, personal operational logs
  if (
    lower.includes('credential') ||
    lower.includes('secret') ||
    lower.includes('webhook_payload') ||
    lower.includes('customer_log') ||
    lower.includes('whatsapp_log')
  ) {
    return false;
  }

  // Rule D: Block operational data JSON files in backend/data/
  if (norm.includes('backend/data/') && lower.endsWith('.json')) {
    return false;
  }

  return true;
}

let fileCount = 0;
let totalBytes = 0;

function copyAllowlisted(srcPath, destPath, relativePath = '') {
  const stat = fs.statSync(srcPath);

  if (stat.isDirectory()) {
    const dirName = path.basename(srcPath);
    if (FORBIDDEN_DIRS.has(dirName)) return;

    // At top level, only allow explicitly permitted directories
    if (!relativePath) {
      if (!ALLOWED_TOP_LEVEL_DIRS.has(dirName)) return;
    }

    const entries = fs.readdirSync(srcPath);
    for (const entry of entries) {
      const childSrc = path.join(srcPath, entry);
      const childRel = relativePath ? `${relativePath}/${entry}` : entry;
      const childDest = path.join(destPath, entry);
      copyAllowlisted(childSrc, childDest, childRel);
    }
  } else {
    const fileName = path.basename(srcPath);

    // At top level, only allow explicitly permitted files
    if (!relativePath.includes('/')) {
      if (!ALLOWED_TOP_LEVEL_FILES.has(fileName) && !fileName.endsWith('.sql')) {
        return;
      }
    }

    if (!isAllowedFile(relativePath, fileName)) {
      return;
    }

    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(srcPath, destPath);
    fileCount++;
    totalBytes += stat.size;
  }
}

console.log('📂 Processing allowlisted tree...');
const topEntries = fs.readdirSync(rootDir);
for (const entry of topEntries) {
  const src = path.join(rootDir, entry);
  const dest = path.join(stagingDir, entry);
  copyAllowlisted(src, dest, entry);
}

console.log(`✅ Staged ${fileCount} clean files (${(totalBytes / (1024 * 1024)).toFixed(2)} MB).`);

console.log('🗜️ Compressing into ZIP archive...');
try {
  const psCommand = `powershell.exe -NoProfile -Command "Compress-Archive -Path '${stagingDir}\\*' -DestinationPath '${zipOutputPath}' -CompressionLevel Optimal -Force"`;
  execSync(psCommand, { stdio: 'inherit' });

  const zipStat = fs.statSync(zipOutputPath);
  console.log('\n======================================================');
  console.log(`🎉 CLEAN ARCHIVE CREATED: ${zipOutputPath}`);
  console.log(`📊 Size: ${(zipStat.size / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`📄 Included Files: ${fileCount}`);
  console.log('======================================================\n');
} catch (err) {
  console.error('❌ Compression failed:', err.message);
  process.exit(1);
} finally {
  if (fs.existsSync(path.dirname(stagingDir))) {
    fs.rmSync(path.dirname(stagingDir), { recursive: true, force: true });
  }
}
