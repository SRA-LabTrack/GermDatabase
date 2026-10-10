import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const payloadRoot = path.join(root, 'v21384-tools-main-nav-payload');
const TARGET_VERSION = '2.13.84';
const ALLOWED_BASES = new Set(['2.13.83', TARGET_VERSION]);

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
  'src/components/DesktopPrimaryNav.jsx'
]) {
  if (!exists(required)) throw new Error(`Required project file is missing: ${required}`);
}

const pkg = JSON.parse(read('package.json'));
const current = String(pkg.version || '');

if (!ALLOWED_BASES.has(current)) {
  throw new Error(
    `This patch expects CaneSprout 2.13.83. Current package version is ${current || 'unknown'}.`
  );
}

copy('src/components/DesktopPrimaryNav.jsx');
copy('scripts/verify-main-tools-nav-v2.13.84.mjs');

let css = read('src/styles.css');
if (!css.includes('v2.13.84 RESTORE TOOLS AS FIFTH MAIN NAVIGATION SECTION')) {
  const extra = fs.readFileSync(path.join(payloadRoot, 'styles-v2.13.84.css'), 'utf8');
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
pkg.scripts['verify:main-tools-nav'] =
  'node scripts/verify-main-tools-nav-v2.13.84.mjs';
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
    'Restores Tools as the fifth permanent main navigation section beside Germplasm, Pedigree, Map, and Breeding Program. Tools contains Excel Tools, Add Record, Combination Registry, and Admin Center only.';
  info.updated = '2026-10-10';
  write('public/version.json', `${JSON.stringify(info, null, 2)}\n`);
}

if (exists('public/sw.js')) {
  let sw = read('public/sw.js');
  sw = sw.replace(/2\.13\.83/g, TARGET_VERSION);
  write('public/sw.js', sw);
}

console.log('');
console.log('CaneSprout v2.13.84 Main Tools Navigation installed.');
console.log('  - Germplasm remains a main section');
console.log('  - Pedigree remains a main section');
console.log('  - Map remains a main section');
console.log('  - Breeding Program remains a main section');
console.log('  - Tools is restored as the fifth main section');
console.log('  - Tools contains Excel Tools, Add Record, Combination Registry, and Admin Center');
console.log('  - Breeding Program is NOT inside Tools');
console.log('');
console.log('Next run:');
console.log('  npm.cmd run verify:main-tools-nav');
console.log('  npm.cmd run build');
console.log('');
