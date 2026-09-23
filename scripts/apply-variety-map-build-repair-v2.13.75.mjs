import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const payloadRoot = path.join(root, 'v21375-map-build-repair-payload');
const TARGET_VERSION = '2.13.75';
const ALLOWED_BASES = new Set(['2.13.74', TARGET_VERSION]);

function file(relative) { return path.join(root, relative); }
function exists(relative) { return fs.existsSync(file(relative)); }
function read(relative) { return fs.readFileSync(file(relative), 'utf8'); }

function write(relative, content) {
  const full = file(relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

function updateConstant(relative, constantName) {
  if (!exists(relative)) return;
  let source = read(relative);
  const re = new RegExp(`const\\s+${constantName}\\s*=\\s*['"][^'"]+['"]\\s*;`);
  if (!re.test(source)) return;
  source = source.replace(re, `const ${constantName} = '${TARGET_VERSION}';`);
  write(relative, source);
}

for (const required of [
  'package.json',
  'src/components/VarietyMapModal.jsx',
  'src/styles.css'
]) {
  if (!exists(required)) throw new Error(`Required project file is missing: ${required}`);
}

const pkg = JSON.parse(read('package.json'));
const current = String(pkg.version || '');

if (!ALLOWED_BASES.has(current)) {
  throw new Error(
    `This repair expects CaneSprout 2.13.74. Current package version is ${current || 'unknown'}.`
  );
}

let component = read('src/components/VarietyMapModal.jsx');

if (!component.includes('v2.13.74 first redirect visual guard')) {
  throw new Error(
    'The v2.13.74 first-redirect guard is not present. Apply v2.13.74 before this repair.'
  );
}

/*
  v2.13.74 inserted its effect by matching the substring
  "function focusEntry(entry)". In the actual component the original
  declaration was "async function focusEntry(entry)", so the preceding
  "async" was left before the inserted effect while focusEntry itself became
  non-async.

  Normalize both sides:
  1. remove a stranded async token directly before the guard
  2. restore async on focusEntry
*/
component = component.replace(
  /(^|\n)([ \t]*)async[ \t]+\/\/ v2\.13\.74 first redirect visual guard/,
  '$1$2// v2.13.74 first redirect visual guard'
);

component = component.replace(
  /(^|\n)([ \t]*)(?!async\b)function[ \t]+focusEntry[ \t]*\([ \t]*entry[ \t]*\)/,
  '$1$2async function focusEntry(entry)'
);

/* Handle a malformed "async" separated from the marker by blank spaces/newlines. */
const guardIndex = component.indexOf('// v2.13.74 first redirect visual guard');
if (guardIndex >= 0) {
  const lookBehindStart = Math.max(0, guardIndex - 40);
  const before = component.slice(lookBehindStart, guardIndex);

  if (/\basync\s*$/.test(before)) {
    const cleanedBefore = before.replace(/\basync\s*$/, '');
    component =
      component.slice(0, lookBehindStart) +
      cleanedBefore +
      component.slice(guardIndex);
  }
}

/* Final hard guarantee: the first focusEntry declaration after the guard is async. */
const guardPos = component.indexOf('// v2.13.74 first redirect visual guard');
const focusPos = component.indexOf('function focusEntry(entry)', guardPos);

if (focusPos < 0) {
  throw new Error('Could not locate focusEntry(entry) after the first-redirect guard.');
}

const prefix = component.slice(Math.max(0, focusPos - 12), focusPos);
if (!/async\s+$/.test(prefix)) {
  component =
    component.slice(0, focusPos) +
    'async ' +
    component.slice(focusPos);
}

if (!/async\s+function\s+focusEntry\s*\(\s*entry\s*\)/.test(component)) {
  throw new Error('Repair could not restore async function focusEntry(entry).');
}

write('src/components/VarietyMapModal.jsx', component);

/* Update package + verifier scripts. */
pkg.version = TARGET_VERSION;
pkg.scripts ||= {};
pkg.scripts['verify:variety-map-build-repair'] =
  'node scripts/verify-variety-map-build-repair-v2.13.75.mjs';
pkg.scripts['verify:variety-map-smooth-redirect'] =
  'node scripts/verify-variety-map-smooth-redirect-v2.13.75.mjs';

write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

if (exists('package-lock.json')) {
  const lock = JSON.parse(read('package-lock.json'));
  lock.version = TARGET_VERSION;
  if (lock.packages?.['']) lock.packages[''].version = TARGET_VERSION;
  write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
}

write(
  'scripts/verify-variety-map-build-repair-v2.13.75.mjs',
  fs.readFileSync(
    path.join(payloadRoot, 'scripts/verify-variety-map-build-repair-v2.13.75.mjs'),
    'utf8'
  )
);

write(
  'scripts/verify-variety-map-smooth-redirect-v2.13.75.mjs',
  fs.readFileSync(
    path.join(payloadRoot, 'scripts/verify-variety-map-smooth-redirect-v2.13.75.mjs'),
    'utf8'
  )
);

updateConstant('src/App.jsx', 'APP_VERSION');
updateConstant('src/lib/offlineApp.js', 'OFFLINE_VERSION');

if (exists('public/version.json')) {
  const info = JSON.parse(read('public/version.json'));
  info.version = TARGET_VERSION;
  info.notes =
    'Repairs the v2.13.74 first-map-redirect patch by restoring async focusEntry and replaces the stale smooth-map verifier with current behavior-based checks.';
  info.updated = '2026-09-20';
  write('public/version.json', `${JSON.stringify(info, null, 2)}\n`);
}

if (exists('public/sw.js')) {
  let sw = read('public/sw.js');
  sw = sw.replace(/2\.13\.74/g, TARGET_VERSION);
  write('public/sw.js', sw);
}

console.log('');
console.log('CaneSprout v2.13.75 map build repair installed.');
console.log('  - Restored async function focusEntry(entry)');
console.log('  - Preserved the v2.13.74 first-redirect guard');
console.log('  - Replaced stale smooth-map CSS-marker verification');
console.log('');
console.log('Next run:');
console.log('  npm.cmd run verify:variety-map-build-repair');
console.log('  npm.cmd run verify:variety-map-first-redirect');
console.log('  npm.cmd run verify:variety-map-smooth-redirect');
console.log('  npm.cmd run build');
console.log('');
