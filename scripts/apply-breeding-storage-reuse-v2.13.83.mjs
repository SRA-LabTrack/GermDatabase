import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const payloadRoot = path.join(root, 'v21383-shared-germ-media-payload');
const TARGET_VERSION = '2.13.83';
const ALLOWED_BASES = new Set(['2.13.82', TARGET_VERSION]);

function file(relative) { return path.join(root, relative); }
function exists(relative) { return fs.existsSync(file(relative)); }
function read(relative) { return fs.readFileSync(file(relative), 'utf8'); }

function write(relative, content) {
  const full = file(relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

function copy(relative) {
  const source = path.join(payloadRoot, relative);
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

for (const required of [
  'package.json',
  'src/App.jsx',
  'src/lib/appwrite.js',
  'src/lib/breedingProgramApi.js',
  'src/components/BreedingProgramModal.jsx'
]) {
  if (!exists(required)) throw new Error(`Required project file is missing: ${required}`);
}

const pkg = JSON.parse(read('package.json'));
const current = String(pkg.version || '');

if (!ALLOWED_BASES.has(current)) {
  throw new Error(
    `This patch expects CaneSprout 2.13.82. Current package version is ${current || 'unknown'}.`
  );
}

/* 1. Reuse germ-media for all Breeding Program document files. */
let appwrite = read('src/lib/appwrite.js');

if (/export const BREEDING_BUCKET_ID\s*=/.test(appwrite)) {
  appwrite = appwrite.replace(
    /export const BREEDING_BUCKET_ID\s*=\s*[^;]+;/,
    'export const BREEDING_BUCKET_ID = MEDIA_BUCKET_ID;'
  );
} else {
  const anchor = "export const MEDIA_BUCKET_ID = 'germ-media';";
  if (!appwrite.includes(anchor)) {
    throw new Error('Could not find MEDIA_BUCKET_ID in src/lib/appwrite.js.');
  }
  appwrite = appwrite.replace(
    anchor,
    `${anchor}\n// v2.13.83: Free-plan compatible shared storage for Breeding Program documents.\nexport const BREEDING_BUCKET_ID = MEDIA_BUCKET_ID;`
  );
}

write('src/lib/appwrite.js', appwrite);

/* 2. Remove CSV from Research Archive upload accept list because the existing
      bucket shown by the user does not allow CSV. */
let modal = read('src/components/BreedingProgramModal.jsx');
modal = modal.replace(
  '.pdf,.doc,.docx,.xls,.xlsx,.csv,application/pdf',
  '.pdf,.doc,.docx,.xls,.xlsx,application/pdf'
);
write('src/components/BreedingProgramModal.jsx', modal);

/* 3. Install safe setup/reuse verifier. */
copy('scripts/setup-breeding-program-v2.13.83.mjs');
copy('scripts/verify-breeding-storage-reuse-v2.13.83.mjs');

/* 4. Package/version wiring. */
pkg.version = TARGET_VERSION;
pkg.scripts ||= {};
pkg.scripts['setup:breeding-program'] = 'node scripts/setup-breeding-program-v2.13.83.mjs';
pkg.scripts['verify:breeding-storage-reuse'] = 'node scripts/verify-breeding-storage-reuse-v2.13.83.mjs';
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

if (exists('package-lock.json')) {
  const lock = JSON.parse(read('package-lock.json'));
  lock.version = TARGET_VERSION;
  if (lock.packages?.['']) lock.packages[''].version = TARGET_VERSION;
  write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
}

let app = read('src/App.jsx');
app = app.replace(
  /const APP_VERSION = ['"][^'"]+['"];/,
  `const APP_VERSION = '${TARGET_VERSION}';`
);
write('src/App.jsx', app);

if (exists('src/lib/offlineApp.js')) {
  let offline = read('src/lib/offlineApp.js');
  offline = offline.replace(
    /const\s+OFFLINE_VERSION\s*=\s*['"][^'"]+['"]\s*;/,
    `const OFFLINE_VERSION = '${TARGET_VERSION}';`
  );
  write('src/lib/offlineApp.js', offline);
}

if (exists('public/version.json')) {
  const info = JSON.parse(read('public/version.json'));
  info.version = TARGET_VERSION;
  info.notes =
    'Reuses the existing germ-media Sugarcane Photos bucket for Breeding Program SOP and Research Archive documents, avoiding the Appwrite Free-plan one-bucket limit.';
  info.updated = '2026-10-10';
  write('public/version.json', `${JSON.stringify(info, null, 2)}\n`);
}

if (exists('public/sw.js')) {
  let sw = read('public/sw.js');
  sw = sw.replace(/2\.13\.82/g, TARGET_VERSION);
  write('public/sw.js', sw);
}

console.log('');
console.log('CaneSprout v2.13.83 shared-storage fix installed.');
console.log('  - Breeding Program now reuses germ-media');
console.log('  - No second Appwrite bucket will be created');
console.log('  - Existing Sugarcane Photos remain untouched');
console.log('  - PDF/DOC/DOCX/XLS/XLSX uploads remain supported');
console.log('  - CSV upload was removed because germ-media does not currently allow CSV');
console.log('');
console.log('Next run:');
console.log('  npm.cmd run verify:breeding-storage-reuse');
console.log('  npm.cmd run setup:breeding-program');
console.log('  npm.cmd run build');
console.log('');
