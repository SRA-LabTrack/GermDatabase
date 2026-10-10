import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const payloadRoot = path.join(root, 'v21379-brochure-interaction-payload');
const TARGET_VERSION = '2.13.79';
const ALLOWED_BASES = new Set(['2.13.78', TARGET_VERSION]);

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
  'src/components/VarietyBrochureModal.jsx',
  'src/styles.css'
]) {
  if (!exists(required)) throw new Error(`Required project file is missing: ${required}`);
}

const pkg = JSON.parse(read('package.json'));
const current = String(pkg.version || '');
if (!ALLOWED_BASES.has(current)) {
  throw new Error(`This patch expects CaneSprout 2.13.78. Current package version is ${current || 'unknown'}.`);
}

copy('src/components/VarietyBrochureModal.jsx');
copy('scripts/verify-brochure-interaction-v2.13.79.mjs');

let css = read('src/styles.css');
if (!css.includes('v2.13.79 LARGER + CLICKABLE VARIETY BROCHURE')) {
  const extra = fs.readFileSync(path.join(payloadRoot, 'styles-v2.13.79.css'), 'utf8');
  css = `${css.trimEnd()}\n\n${extra.trim()}\n`;
  write('src/styles.css', css);
}

pkg.version = TARGET_VERSION;
pkg.scripts ||= {};
pkg.scripts['verify:brochure-interaction'] = 'node scripts/verify-brochure-interaction-v2.13.79.mjs';
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
    /const\s+OFFLINE_VERSION\s*=\s*['"][^'"]+['"]\s*;/,
    `const OFFLINE_VERSION = '${TARGET_VERSION}';`
  );
  write('src/lib/offlineApp.js', offline);
}

if (exists('public/version.json')) {
  const info = JSON.parse(read('public/version.json'));
  info.version = TARGET_VERSION;
  info.notes = 'Enlarges the on-screen variety brochure and makes uploaded brochure photos, parentage, and agronomic-morphological detail rows clickable with focused viewers.';
  info.updated = '2026-10-10';
  write('public/version.json', `${JSON.stringify(info, null, 2)}\n`);
}

if (exists('public/sw.js')) {
  let sw = read('public/sw.js');
  sw = sw.replace(/2\.13\.78/g, TARGET_VERSION);
  write('public/sw.js', sw);
}

console.log('');
console.log('CaneSprout v2.13.79 interactive brochure update installed.');
console.log('  - Larger brochure modal and brochure sheet');
console.log('  - Larger whole-variety, stalk, and eye/bud displays');
console.log('  - Click photos to open a full-size lightbox');
console.log('  - Click parentage or any characteristic row for a large focused detail view');
console.log('  - Escape closes the nested viewer before closing the brochure');
console.log('');
console.log('Run:');
console.log('  npm.cmd run verify:brochure-interaction');
console.log('  npm.cmd run build');
console.log('');
