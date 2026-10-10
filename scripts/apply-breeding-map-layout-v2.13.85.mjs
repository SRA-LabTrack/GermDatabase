import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const payloadRoot = path.join(root, 'v21385-breeding-map-layout-payload');
const TARGET_VERSION = '2.13.85';
const ALLOWED_BASES = new Set(['2.13.84', TARGET_VERSION]);

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
    `This patch expects CaneSprout 2.13.84. Current package version is ${current || 'unknown'}.`
  );
}

copy('scripts/verify-breeding-map-layout-v2.13.85.mjs');

let css = read('src/styles.css');
if (!css.includes('v2.13.85 MAP-STYLE BREEDING PROGRAM WORKSPACE')) {
  const extra = fs.readFileSync(path.join(payloadRoot, 'styles-v2.13.85.css'), 'utf8');
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
pkg.scripts['verify:breeding-map-layout'] =
  'node scripts/verify-breeding-map-layout-v2.13.85.mjs';
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
    'Changes Breeding Program from a rounded modal below the toolbar into a full map-style workspace with a large header, square close control, fixed section navigation, and one internal scrolling content area.';
  info.updated = '2026-10-10';
  write('public/version.json', `${JSON.stringify(info, null, 2)}\n`);
}

if (exists('public/sw.js')) {
  let sw = read('public/sw.js');
  sw = sw.replace(/2\.13\.84/g, TARGET_VERSION);
  write('public/sw.js', sw);
}

console.log('');
console.log('CaneSprout v2.13.85 map-style Breeding Program layout installed.');
console.log('  - Breeding Program now overlays the application like Variety Map');
console.log('  - Large map-style header and title');
console.log('  - Square X close control');
console.log('  - SOP, Research Archive, and Variety Brochure remain available');
console.log('  - Section navigation stays fixed while content scrolls internally');
console.log('  - Rounded dialog appearance removed');
console.log('');
console.log('Next run:');
console.log('  npm.cmd run verify:breeding-map-layout');
console.log('  npm.cmd run build');
console.log('');
