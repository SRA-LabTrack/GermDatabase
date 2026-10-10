import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const payloadRoot = path.join(root, 'v21382-breeding-program-edit-viewer-payload');
const TARGET_VERSION = '2.13.82';
const ALLOWED_BASES = new Set(['2.13.81', TARGET_VERSION]);

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
  'src/components/BreedingProgramModal.jsx',
  'src/lib/breedingProgramApi.js'
]) {
  if (!exists(required)) throw new Error(`Required project file is missing: ${required}`);
}

const pkg = JSON.parse(read('package.json'));
const current = String(pkg.version || '');

if (!ALLOWED_BASES.has(current)) {
  throw new Error(
    `This patch expects CaneSprout 2.13.81. Current package version is ${current || 'unknown'}.`
  );
}

for (const relative of [
  'src/components/DesktopPrimaryNav.jsx',
  'src/components/BreedingProgramModal.jsx',
  'src/lib/breedingProgramApi.js',
  'scripts/verify-breeding-program-edit-viewer-v2.13.82.mjs'
]) {
  copy(relative);
}

let css = read('src/styles.css');
if (!css.includes('v2.13.82 BREEDING PROGRAM NAV LABEL + RESEARCH PDF VIEWER + EDIT')) {
  const extra = fs.readFileSync(path.join(payloadRoot, 'styles-v2.13.82.css'), 'utf8');
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
pkg.scripts['verify:breeding-program-edit-viewer'] =
  'node scripts/verify-breeding-program-edit-viewer-v2.13.82.mjs';
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
    'Makes the Breeding Program label fully readable in the main navigation, adds a clickable PDF-style viewer for historical research, and adds administrator editing for Research Archive and SOP/Protocol metadata.';
  info.updated = '2026-10-10';
  write('public/version.json', `${JSON.stringify(info, null, 2)}\n`);
}

if (exists('public/sw.js')) {
  let sw = read('public/sw.js');
  sw = sw.replace(/2\.13\.81/g, TARGET_VERSION);
  write('public/sw.js', sw);
}

console.log('');
console.log('CaneSprout v2.13.82 installed.');
console.log('  - Breeding Program label now displays fully in the main navigation');
console.log('  - Five primary navigation cells are forced to fit, including Tools');
console.log('  - Every historical research entry is clickable');
console.log('  - Historical research opens in a PDF-style viewer');
console.log('  - Research viewer supports Print / Save PDF');
console.log('  - Administrators can edit historical Research Archive metadata/text');
console.log('  - Administrators can edit bundled SOP/Protocol display metadata');
console.log('  - Administrators can edit uploaded Research/SOP document metadata');
console.log('  - Original bundled source files remain unchanged for traceability');
console.log('');
console.log('Next run:');
console.log('  npm.cmd run verify:breeding-program-edit-viewer');
console.log('  npm.cmd run build');
console.log('');
