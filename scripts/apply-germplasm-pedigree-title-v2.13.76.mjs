import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const TARGET_VERSION = '2.13.76';
const ALLOWED_BASES = new Set(['2.13.75', TARGET_VERSION]);

function file(relative) {
  return path.join(root, relative);
}

function exists(relative) {
  return fs.existsSync(file(relative));
}

function read(relative) {
  return fs.readFileSync(file(relative), 'utf8');
}

function write(relative, content) {
  const full = file(relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

function walk(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walk(full));
    } else if (/\.(jsx|tsx|js|ts|html)$/i.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

if (!exists('package.json')) {
  throw new Error('package.json is missing. Run this patch from the CaneSprout project root.');
}

const pkg = JSON.parse(read('package.json'));
const current = String(pkg.version || '');

if (!ALLOWED_BASES.has(current)) {
  throw new Error(
    `This patch expects CaneSprout 2.13.75. Current package version is ${current || 'unknown'}.`
  );
}

const srcDir = file('src');
if (!fs.existsSync(srcDir)) {
  throw new Error('src folder is missing.');
}

let replacements = 0;

for (const full of walk(srcDir)) {
  let source = fs.readFileSync(full, 'utf8');

  if (source.includes('Three-Generation Pedigree')) {
    source = source.replaceAll('Three-Generation Pedigree', 'Germplasm Pedigree');
    fs.writeFileSync(full, source, 'utf8');
    replacements += 1;
  }
}

if (replacements === 0) {
  const allSource = walk(srcDir)
    .map((full) => fs.readFileSync(full, 'utf8'))
    .join('\n');

  if (!allSource.includes('Germplasm Pedigree')) {
    throw new Error(
      'Could not find the "Three-Generation Pedigree" title in src. ' +
      'The local pedigree component differs from the expected version.'
    );
  }
}

pkg.version = TARGET_VERSION;
pkg.scripts ||= {};
pkg.scripts['verify:germplasm-pedigree-title'] =
  'node scripts/verify-germplasm-pedigree-title-v2.13.76.mjs';

write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

if (exists('package-lock.json')) {
  const lock = JSON.parse(read('package-lock.json'));
  lock.version = TARGET_VERSION;
  if (lock.packages?.['']) lock.packages[''].version = TARGET_VERSION;
  write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
}

if (exists('src/App.jsx')) {
  let app = read('src/App.jsx');
  app = app.replace(
    /const APP_VERSION = ['"][^'"]+['"];/,
    `const APP_VERSION = '${TARGET_VERSION}';`
  );
  write('src/App.jsx', app);
}

if (exists('src/lib/offlineApp.js')) {
  let offline = read('src/lib/offlineApp.js');
  offline = offline.replace(
    /const OFFLINE_VERSION = ['"][^'"]+['"];/,
    `const OFFLINE_VERSION = '${TARGET_VERSION}';`
  );
  write('src/lib/offlineApp.js', offline);
}

if (exists('public/version.json')) {
  const info = JSON.parse(read('public/version.json'));
  info.version = TARGET_VERSION;
  info.notes = 'Renames the pedigree modal title from Three-Generation Pedigree to Germplasm Pedigree.';
  info.updated = '2026-09-20';
  write('public/version.json', `${JSON.stringify(info, null, 2)}\n`);
}

if (exists('public/sw.js')) {
  let sw = read('public/sw.js');
  sw = sw.replace(/2\.13\.75/g, TARGET_VERSION);
  write('public/sw.js', sw);
}

const verifierSource = fs.readFileSync(
  path.join(root, 'scripts', 'verify-germplasm-pedigree-title-v2.13.76.mjs'),
  'utf8'
);

console.log('');
console.log('CaneSprout v2.13.76 Germplasm Pedigree title update installed.');
console.log(`Updated source files: ${replacements}`);
console.log('');
console.log('Next run:');
console.log('  npm.cmd run verify:germplasm-pedigree-title');
console.log('  npm.cmd run build');
console.log('');
