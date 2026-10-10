import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const payloadRoot = path.join(root, 'v21380-main-nav-brochure-transitions-payload');
const TARGET_VERSION = '2.13.80';
const ALLOWED_BASES = new Set(['2.13.79', TARGET_VERSION]);

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
  'src/components/DesktopPrimaryNav.jsx',
  'src/components/VarietyBrochureModal.jsx'
]) {
  if (!exists(required)) throw new Error(`Required project file is missing: ${required}`);
}

const pkg = JSON.parse(read('package.json'));
const current = String(pkg.version || '');

if (!ALLOWED_BASES.has(current)) {
  throw new Error(
    `This patch expects CaneSprout 2.13.79. Current package version is ${current || 'unknown'}.`
  );
}

/* Main navigation: Breeding Program becomes a first-class destination. */
copy('src/components/DesktopPrimaryNav.jsx');
copy('scripts/verify-brochure-main-nav-v2.13.80.mjs');

/* Tools active state must no longer include the standalone Breeding Program. */
let app = read('src/App.jsx');

const oldToolsActive =
  'toolsActive={showExcelMenu || showImport || showExportExcel || showSpreadsheetEditor || showForm || showCombinationRegistry || showBreedingProgram || showAdminCenter}';

const newToolsActive =
  'toolsActive={showExcelMenu || showImport || showExportExcel || showSpreadsheetEditor || showForm || showCombinationRegistry || showAdminCenter}';

if (app.includes(oldToolsActive)) {
  app = app.replace(oldToolsActive, newToolsActive);
} else if (!app.includes(newToolsActive)) {
  throw new Error('Could not locate the DesktopPrimaryNav toolsActive expression in App.jsx.');
}

/* Version. */
app = app.replace(
  /const APP_VERSION = ['"][^'"]+['"];/,
  `const APP_VERSION = '${TARGET_VERSION}';`
);
write('src/App.jsx', app);

/* Motion and size polish. */
let css = read('src/styles.css');
if (!css.includes('v2.13.80 MAIN BREEDING PROGRAM NAV + BROCHURE MOTION POLISH')) {
  const extra = fs.readFileSync(path.join(payloadRoot, 'styles-v2.13.80.css'), 'utf8');
  css = `${css.trimEnd()}\n\n${extra.trim()}\n`;
  write('src/styles.css', css);
}

/* Package + verifier. */
pkg.version = TARGET_VERSION;
pkg.scripts ||= {};
pkg.scripts['verify:brochure-main-nav'] =
  'node scripts/verify-brochure-main-nav-v2.13.80.mjs';

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
    'Promotes Breeding Program to the main navigation, enlarges the interactive variety brochure, and adds smooth transitions for brochure, photo, detail, full-profile, and Breeding Program page changes.';
  info.updated = '2026-10-10';
  write('public/version.json', `${JSON.stringify(info, null, 2)}\n`);
}

if (exists('public/sw.js')) {
  let sw = read('public/sw.js');
  sw = sw.replace(/2\.13\.79/g, TARGET_VERSION);
  write('public/sw.js', sw);
}

console.log('');
console.log('CaneSprout v2.13.80 installed.');
console.log('  - Breeding Program is now a primary navigation section');
console.log('  - Tools keeps Excel, Add Record, Combination Registry, and Admin Center');
console.log('  - Brochure is slightly larger again');
console.log('  - Brochure/photo/detail/full-profile transitions added');
console.log('  - Breeding Program tab/page transitions added');
console.log('');
console.log('Next run:');
console.log('  npm.cmd run verify:brochure-main-nav');
console.log('  npm.cmd run build');
console.log('');
