import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const payloadRoot = path.join(root, 'v21386-breeding-content-space-payload');
const TARGET_VERSION = '2.13.86';
const ALLOWED_BASES = new Set(['2.13.85', TARGET_VERSION]);

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
  'src/styles.css',
  'src/components/BreedingProgramModal.jsx'
]) {
  if (!exists(required)) throw new Error(`Required project file is missing: ${required}`);
}

const pkg = JSON.parse(read('package.json'));
const current = String(pkg.version || '');

if (!ALLOWED_BASES.has(current)) {
  throw new Error(
    `This patch expects CaneSprout 2.13.85. Current package version is ${current || 'unknown'}.`
  );
}

copy('scripts/verify-breeding-content-space-v2.13.86.mjs');

let css = read('src/styles.css');
if (!css.includes('v2.13.86 BREEDING PROGRAM CONTENT-SPACE REBALANCE')) {
  const extra = fs.readFileSync(path.join(payloadRoot, 'styles-v2.13.86.css'), 'utf8');
  css = `${css.trimEnd()}\n\n${extra.trim()}\n`;
  write('src/styles.css', css);
}

let app = read('src/App.jsx');
app = app.replace(
  /const APP_VERSION = ['"][^'"]+['"];/,
  `const APP_VERSION = '${TARGET_VERSION}';`
);
write('src/App.jsx', app);

pkg.version = TARGET_VERSION;
pkg.scripts ||= {};
pkg.scripts['verify:breeding-content-space'] =
  'node scripts/verify-breeding-content-space-v2.13.86.mjs';
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

if (exists('package-lock.json')) {
  const lock = JSON.parse(read('package-lock.json'));
  lock.version = TARGET_VERSION;
  if (lock.packages?.['']) lock.packages[''].version = TARGET_VERSION;
  write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
}

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
    'Rebalances the Breeding Program map-style workspace so the header and section navigation are smaller and SOP, Research Archive, and Variety Brochure content gets substantially more visible space.';
  info.updated = '2026-10-10';
  write('public/version.json', `${JSON.stringify(info, null, 2)}\n`);
}

if (exists('public/sw.js')) {
  let sw = read('public/sw.js');
  sw = sw.replace(/2\.13\.85/g, TARGET_VERSION);
  write('public/sw.js', sw);
}

console.log('');
console.log('CaneSprout v2.13.86 Breeding Program content-space rebalance installed.');
console.log('  - Header reduced to 118px desktop');
console.log('  - Section navigation reduced to 66px desktop');
console.log('  - Content receives the reclaimed vertical space');
console.log('  - SOP cards, Research Archive, and Variety Brochure remain fully available');
console.log('  - Summary/search controls are denser so more real content is visible');
console.log('');
console.log('Next run:');
console.log('  npm.cmd run verify:breeding-content-space');
console.log('  npm.cmd run build');
console.log('');
