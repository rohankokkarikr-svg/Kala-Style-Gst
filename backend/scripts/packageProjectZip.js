/**
 * Script to package the complete KalaStyle AI project into a clean, low-size ZIP file.
 * Excludes heavy node_modules, build outputs, git history, and caches.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '../../');
const stagingDir = path.join(rootDir, 'temp_package_staging', 'KalaStyle-AI-Project');
const zipOutputPath = path.join(rootDir, 'KalaStyle_AI_Project.zip');

console.log('📦 Starting clean project packaging...');
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

const IGNORED_NAMES = new Set([
  'node_modules',
  '.git',
  'build',
  '.cache',
  '.vscode',
  '.agents',
  '.gemini',
  'temp_package_staging',
  'KalaStyle_AI_Project.zip',
]);

const IGNORED_EXTENSIONS = new Set([
  '.log',
  '.tmp',
  '.zip',
  '.tar',
  '.gz',
]);

function shouldIgnore(entryName, fullPath) {
  if (IGNORED_NAMES.has(entryName)) return true;
  const ext = path.extname(entryName).toLowerCase();
  if (IGNORED_EXTENSIONS.has(ext)) return true;
  return false;
}

let fileCount = 0;
let totalBytes = 0;

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    const entries = fs.readdirSync(src);
    for (const entry of entries) {
      if (shouldIgnore(entry, path.join(src, entry))) continue;
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    fileCount++;
    totalBytes += stat.size;
  }
}

console.log('📂 Copying clean source tree (excluding node_modules, .git, build)...');
copyRecursive(rootDir, stagingDir);

console.log(`✅ Staged ${fileCount} source files (${(totalBytes / (1024 * 1024)).toFixed(2)} MB uncompressed).`);

console.log('🗜️ Compressing into ZIP archive using optimal compression...');
try {
  const psCommand = `powershell.exe -NoProfile -Command "Compress-Archive -Path '${stagingDir}\\*' -DestinationPath '${zipOutputPath}' -CompressionLevel Optimal -Force"`;
  execSync(psCommand, { stdio: 'inherit' });

  const zipStat = fs.statSync(zipOutputPath);
  const zipSizeMb = (zipStat.size / (1024 * 1024)).toFixed(2);
  const zipSizeKb = (zipStat.size / 1024).toFixed(1);

  console.log('\n======================================================');
  console.log(`🎉 ZIP FILE CREATED SUCCESSFULLY!`);
  console.log(`📁 File: ${zipOutputPath}`);
  console.log(`📊 Size: ${zipSizeMb} MB (${zipSizeKb} KB)`);
  console.log(`📄 Total source files included: ${fileCount}`);
  console.log('======================================================\n');
} catch (err) {
  console.error('❌ Compression failed:', err.message);
  process.exit(1);
} finally {
  // Clean up temporary staging folder
  if (fs.existsSync(path.dirname(stagingDir))) {
    fs.rmSync(path.dirname(stagingDir), { recursive: true, force: true });
  }
}
