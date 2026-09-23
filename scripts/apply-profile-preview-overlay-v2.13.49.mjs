import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.cwd();
const PATCH_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET_VERSION = '2.13.49';
const EXPECTED_BASE = '2.13.48';
const STYLE_MARKER = '/* v2.13.49 in-app printable profile preview:';

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
    throw new Error(`This patch expects CaneSprout ${EXPECTED_BASE}. Current package version is ${current || 'unknown'}. Apply v2.13.48 first.`);
  }
  pkg.version = TARGET_VERSION;
  pkg.scripts ||= {};
  pkg.scripts['verify:profile-preview-actions'] = 'node scripts/verify-profile-preview-actions-v2.13.49.mjs';
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
  info.notes = 'Replaces the fragile about:blank printable profile popup with an in-app preview overlay. Export, print, download, and close controls now execute from the main CaneSprout document for reliable Brave/CSP behavior.';
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
  source = source.replace(/const\s+TARGET_VERSION\s*=\s*['\"]2\.13\.\d+['\"];?/g, `const TARGET_VERSION = '${TARGET_VERSION}';`);
  source = source.replace(/const\s+EXPECTED_VERSION\s*=\s*['\"]2\.13\.\d+['\"];?/g, `const EXPECTED_VERSION = '${TARGET_VERSION}';`);
  write(rel, source);
}

function installPayload(rel) {
  const source = path.join(PATCH_ROOT, rel);
  if (!fs.existsSync(source)) throw new Error(`Patch payload is missing ${rel}.`);
  fs.mkdirSync(path.dirname(file(rel)), { recursive: true });
  fs.copyFileSync(source, file(rel));
}

function appendOverlayStyles() {
  const cssPath = path.join(PATCH_ROOT, 'patch', 'profile-preview-overlay-v2.13.49.css');
  if (!fs.existsSync(cssPath)) throw new Error('Patch CSS payload is missing.');
  let styles = read('src/styles.css');
  if (!styles.includes(STYLE_MARKER)) {
    styles = `${styles.trimEnd()}\n\n${fs.readFileSync(cssPath, 'utf8').trim()}\n`;
    write('src/styles.css', styles);
  }
}

for (const rel of ['package.json', 'src/App.jsx', 'src/lib/profilePrint.js', 'src/styles.css', 'public/version.json', 'public/sw.js']) assertFile(rel);

patchPackage();
patchVersionConstant('src/App.jsx', 'APP_VERSION');
patchVersionConstant('src/lib/offlineApp.js', 'OFFLINE_VERSION');
patchPublicVersion();
patchServiceWorker();
installPayload('src/lib/profilePrint.js');
installPayload('scripts/verify-profile-preview-actions-v2.13.49.mjs');
installPayload('scripts/verify-profile-document-exports-v2.13.47.mjs');
installPayload('scripts/verify-profile-pdf-quality-v2.13.46.mjs');
appendOverlayStyles();

for (const rel of [
  'scripts/verify-profile-document-exports-v2.13.47.mjs',
  'scripts/verify-profile-pdf-quality-v2.13.46.mjs',
  'scripts/verify-profile-card-print-v2.13.43.mjs',
  'scripts/verify-profile-print-v2.13.42.mjs',
  'scripts/verify-profile-trait-visuals.mjs',
  'scripts/verify-profile-map-exact-v2.13.40.mjs',
  'scripts/verify-origin-attribute-coordinates-v2.13.41.mjs',
  'scripts/verify-variety-map-profile-return.mjs'
]) patchVerifierVersion(rel);

console.log(`\nCaneSprout ${TARGET_VERSION} in-app profile preview applied.`);
console.log('  - Removes the about:blank profile preview dependency');
console.log('  - Keeps Download HTML / Print / PDF / Word / Excel / Close in the main app document');
console.log('  - Save PDF, Word, and Excel now execute from CaneSprout itself');
console.log('  - Close and Escape reliably dismiss the preview overlay');
console.log('  - Printable content remains isolated in an iframe using srcdoc');
console.log('\nRun: npm.cmd run verify:profile-preview-actions');
console.log('Then: npm.cmd run verify:profile-document-exports');
console.log('Then: npm.cmd run build\n');
