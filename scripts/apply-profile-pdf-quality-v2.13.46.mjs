import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.cwd();
const PATCH_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET_VERSION = '2.13.46';
const EXPECTED_BASE = '2.13.45';

function file(rel) { return path.join(ROOT, rel); }
function read(rel) { return fs.readFileSync(file(rel), 'utf8'); }
function write(rel, content) { fs.mkdirSync(path.dirname(file(rel)), { recursive: true }); fs.writeFileSync(file(rel), content, 'utf8'); }
function exists(rel) { return fs.existsSync(file(rel)); }
function assertFile(rel) { if (!exists(rel)) throw new Error(`Required project file is missing: ${rel}`); }

function patchVersionConstant(rel, constantName) {
  if (!exists(rel)) return;
  let source = read(rel);
  const re = new RegExp(`const\\s+${constantName}\\s*=\\s*['\"]([^'\"]+)['\"]\\s*;`);
  if (!re.test(source)) return;
  source = source.replace(re, `const ${constantName} = '${TARGET_VERSION}';`);
  write(rel, source);
}

function patchPackage() {
  const pkg = JSON.parse(read('package.json'));
  const current = String(pkg.version || '');
  if (current !== EXPECTED_BASE && current !== TARGET_VERSION) {
    throw new Error(`This patch expects CaneSprout ${EXPECTED_BASE}. Current package version is ${current || 'unknown'}. Apply v2.13.45 first.`);
  }
  pkg.version = TARGET_VERSION;
  pkg.dependencies ||= {};
  pkg.dependencies.jspdf ||= '^2.5.2';
  pkg.scripts ||= {};
  pkg.scripts['verify:profile-pdf-quality'] = 'node scripts/verify-profile-pdf-quality-v2.13.46.mjs';
  pkg.scripts['verify:profile-print-actions'] = 'node scripts/verify-profile-pdf-quality-v2.13.46.mjs';
  pkg.scripts['verify:profile-print-preview'] = 'node scripts/verify-profile-pdf-quality-v2.13.46.mjs';
  write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

  if (exists('package-lock.json')) {
    const lock = JSON.parse(read('package-lock.json'));
    lock.version = TARGET_VERSION;
    if (lock.packages?.['']) lock.packages[''].version = TARGET_VERSION;
    write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
  }
}

function patchPublicVersion() {
  const info = JSON.parse(read('public/version.json'));
  info.version = TARGET_VERSION;
  info.notes = 'Replaces raster screenshot PDF export with sharp vector text and shapes, fixes profile spacing, and paginates complete profiles between field rows with continued section headings.';
  info.updated = '2026-09-20';
  write('public/version.json', `${JSON.stringify(info, null, 2)}\n`);
}

function patchServiceWorker() {
  let source = read('public/sw.js');
  source = source.replace(/canesprout-offline-v\d+\.\d+\.\d+/g, `canesprout-offline-v${TARGET_VERSION}`);
  write('public/sw.js', source);
}

function patchVerifierVersion(rel) {
  if (!exists(rel)) return;
  let source = read(rel);
  source = source.replace(/Version is 2\.13\.\d+/g, `Version is ${TARGET_VERSION}`);
  source = source.replace(/CaneSprout v2\.13\.\d+/g, `CaneSprout v${TARGET_VERSION}`);
  source = source.replace(/pkg\.version === '2\.13\.\d+'/g, `pkg.version === '${TARGET_VERSION}'`);
  source = source.replace(/const\s+TARGET_VERSION\s*=\s*['\"]2\.13\.\d+['\"];/g, `const TARGET_VERSION = '${TARGET_VERSION}';`);
  source = source.replace(/const\s+EXPECTED_VERSION\s*=\s*['\"]2\.13\.\d+['\"];/g, `const EXPECTED_VERSION = '${TARGET_VERSION}';`);
  write(rel, source);
}

for (const rel of [
  'package.json',
  'src/App.jsx',
  'src/lib/profilePrint.js',
  'public/version.json',
  'public/sw.js'
]) assertFile(rel);

patchPackage();
patchVersionConstant('src/App.jsx', 'APP_VERSION');
patchVersionConstant('src/lib/offlineApp.js', 'OFFLINE_VERSION');
patchPublicVersion();
patchServiceWorker();

const bundledPrinter = path.join(PATCH_ROOT, 'src', 'lib', 'profilePrint.js');
if (!fs.existsSync(bundledPrinter)) throw new Error('Patch payload is missing src/lib/profilePrint.js.');
fs.copyFileSync(bundledPrinter, file('src/lib/profilePrint.js'));

const bundledVerifier = path.join(PATCH_ROOT, 'scripts', 'verify-profile-pdf-quality-v2.13.46.mjs');
fs.copyFileSync(bundledVerifier, file('scripts/verify-profile-pdf-quality-v2.13.46.mjs'));

for (const rel of [
  'scripts/verify-profile-card-print-v2.13.43.mjs',
  'scripts/verify-profile-print-v2.13.42.mjs',
  'scripts/verify-profile-trait-visuals.mjs',
  'scripts/verify-profile-map-exact-v2.13.40.mjs',
  'scripts/verify-origin-attribute-coordinates-v2.13.41.mjs',
  'scripts/verify-variety-map-profile-return.mjs'
]) patchVerifierVersion(rel);

console.log(`\nCaneSprout ${TARGET_VERSION} PDF quality patch applied.`);
console.log('  - Save PDF now uses vector text and vector shapes');
console.log('  - Raster html2canvas/JPEG capture is no longer used for PDF export');
console.log('  - Field rows are kept intact across pages');
console.log('  - Long sections repeat their title when continued on the next page');
console.log('  - Header metadata and page spacing have been corrected');
console.log('\nRun: npm.cmd run verify:profile-pdf-quality');
console.log('Then: npm.cmd run build\n');
