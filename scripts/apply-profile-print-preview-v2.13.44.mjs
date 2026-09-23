import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.cwd();
const PATCH_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET_VERSION = '2.13.44';
const EXPECTED_BASE = '2.13.43';

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
    throw new Error(`This patch expects CaneSprout ${EXPECTED_BASE}. Current package version is ${current || 'unknown'}. Apply v2.13.43 first.`);
  }
  pkg.version = TARGET_VERSION;
  pkg.scripts ||= {};
  pkg.scripts['verify:profile-print-preview'] = 'node scripts/verify-profile-print-preview-v2.13.44.mjs';
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
  info.notes = 'Fixes blank Core Information printouts and changes profile printing to a preview-first flow with Download and Print / Save PDF actions.';
  info.updated = '2026-09-20';
  write('public/version.json', `${JSON.stringify(info, null, 2)}\n`);
}

function patchServiceWorker() {
  let source = read('public/sw.js');
  source = source.replace(/canesprout-offline-v\d+\.\d+\.\d+/g, `canesprout-offline-v${TARGET_VERSION}`);
  write('public/sw.js', source);
}

function patchCardRecordMerge() {
  const rel = 'src/App.jsx';
  let source = read(rel);
  const oldLine = '      printVarietyProfile(fullRecord || preview || record, mode);';
  if (source.includes(oldLine)) {
    const replacement = `      const printableRecord = { ...(preview || record || {}), ...(fullRecord || {}) };\n      // Preserve locally available card values when an older live record returns a blank core field.\n      for (const [key, value] of Object.entries(preview || record || {})) {\n        if (String(printableRecord[key] ?? '').trim() === '' && String(value ?? '').trim() !== '') printableRecord[key] = value;\n      }\n      printVarietyProfile(printableRecord, mode);`;
    source = source.replace(oldLine, replacement);
  }
  source = source.replace('title="Print this variety"', 'title="Preview, download or print this variety"');
  source = source.replace("{cardPrintBusy ? 'Preparing…' : 'Print'}", "{cardPrintBusy ? 'Preparing…' : 'Print'}");
  write(rel, source);
}

function patchPrintMenuCopy() {
  for (const rel of ['src/App.jsx', 'src/components/DetailModal.jsx']) {
    if (!exists(rel)) continue;
    let source = read(rel);
    source = source.replace('Identity, parentage, yield, locations and disease reaction.', 'Preview core identity, parentage, yield, locations and disease reaction.');
    source = source.replace('Core information plus every recorded additional trait and germination field.', 'Preview core information plus every recorded additional trait and germination field.');
    source = source.replace('Variety identity, parentage, yield, locations and disease reaction.', 'Preview variety identity, parentage, yield, locations and disease reaction.');
    source = source.replace('Core profile plus all recorded additional characterization and germination data.', 'Preview core profile plus all recorded additional characterization and germination data.');
    write(rel, source);
  }
}

function patchVerifierVersion(rel) {
  if (!exists(rel)) return;
  let source = read(rel);
  source = source.replace(/Version is 2\.13\.\d+/g, `Version is ${TARGET_VERSION}`);
  source = source.replace(/const\s+TARGET_VERSION\s*=\s*['\"]2\.13\.\d+['\"];/g, `const TARGET_VERSION = '${TARGET_VERSION}';`);
  source = source.replace(/const\s+EXPECTED_VERSION\s*=\s*['\"]2\.13\.\d+['\"];/g, `const EXPECTED_VERSION = '${TARGET_VERSION}';`);
  source = source.replace(/pkg\.version === '2\.13\.\d+'/g, `pkg.version === '${TARGET_VERSION}'`);
  source = source.replace(/CaneSprout v2\.13\.\d+/g, `CaneSprout v${TARGET_VERSION}`);
  source = source.replace("app.includes('printVarietyProfile(fullRecord || preview || record, mode);')", "app.includes('printVarietyProfile(printableRecord, mode);')");
  write(rel, source);
}

for (const rel of [
  'package.json',
  'src/App.jsx',
  'src/components/DetailModal.jsx',
  'src/lib/profilePrint.js',
  'public/version.json',
  'public/sw.js'
]) assertFile(rel);

patchPackage();
patchVersionConstant('src/App.jsx', 'APP_VERSION');
patchVersionConstant('src/lib/offlineApp.js', 'OFFLINE_VERSION');
patchPublicVersion();
patchServiceWorker();
patchCardRecordMerge();
patchPrintMenuCopy();

// Install the corrected preview-first print renderer shipped with this patch.
const bundledPrinter = path.join(PATCH_ROOT, 'src', 'lib', 'profilePrint.js');
if (!fs.existsSync(bundledPrinter)) throw new Error('Patch payload is missing src/lib/profilePrint.js.');
fs.copyFileSync(bundledPrinter, file('src/lib/profilePrint.js'));

for (const rel of [
  'scripts/verify-profile-card-print-v2.13.43.mjs',
  'scripts/verify-profile-print-v2.13.42.mjs',
  'scripts/verify-profile-trait-visuals.mjs',
  'scripts/verify-profile-map-exact-v2.13.40.mjs',
  'scripts/verify-origin-attribute-coordinates-v2.13.41.mjs',
  'scripts/verify-variety-map-profile-return.mjs'
]) patchVerifierVersion(rel);

console.log(`\nCaneSprout ${TARGET_VERSION} print preview/download patch applied.`);
console.log('  - Core Information always renders its core field cards');
console.log('  - Missing core values display as Not recorded instead of producing a blank sheet');
console.log('  - Card printing merges the full record with any useful local preview values');
console.log('  - Core and Complete now open a preview first');
console.log('  - Preview includes Download, Print / Save PDF, and Close actions');
console.log('  - No automatic print dialog is triggered');
console.log('\nNext: npm.cmd run verify:profile-print-preview && npm.cmd run build\n');
