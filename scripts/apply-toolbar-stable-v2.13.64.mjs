import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const payloadRoot = path.join(root, 'v21364-toolbar-stable-payload');
const TARGET_VERSION = '2.13.64';
const ALLOWED_BASES = new Set(['2.13.63', TARGET_VERSION]);

function file(relative) { return path.join(root, relative); }
function exists(relative) { return fs.existsSync(file(relative)); }
function read(relative) { return fs.readFileSync(file(relative), 'utf8'); }
function write(relative, content) {
  const full = file(relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

const pkg = JSON.parse(read('package.json'));
const current = String(pkg.version || '');

if (!ALLOWED_BASES.has(current)) {
  throw new Error(`This patch expects CaneSprout 2.13.63. Current package version is ${current || 'unknown'}. Apply the equal-navigation patch first.`);
}

for (const required of [
  'src/styles.css',
  'src/App.jsx',
  'src/components/ToolbarToolsMenu.jsx'
]) {
  if (!exists(required)) throw new Error(`Required file is missing: ${required}`);
}

let styles = read('src/styles.css');
const marker = 'v2.13.64 STABLE DESKTOP TOOLBAR LAYOUT';
if (!styles.includes(marker)) {
  const extra = fs.readFileSync(path.join(payloadRoot, 'styles-v2.13.64.css'), 'utf8');
  styles = `${styles.trimEnd()}\n\n${extra.trim()}\n`;
  write('src/styles.css', styles);
}

pkg.version = TARGET_VERSION;
pkg.scripts ||= {};
pkg.scripts['verify:toolbar-stable'] = 'node scripts/verify-toolbar-stable-v2.13.64.mjs';
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

if (exists('package-lock.json')) {
  const lock = JSON.parse(read('package-lock.json'));
  lock.version = TARGET_VERSION;
  if (lock.packages?.['']) lock.packages[''].version = TARGET_VERSION;
  write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
}

let app = read('src/App.jsx');
app = app.replace(/const APP_VERSION = ['"][^'"]+['"];/, `const APP_VERSION = '${TARGET_VERSION}';`);
write('src/App.jsx', app);

if (exists('public/version.json')) {
  const info = JSON.parse(read('public/version.json'));
  info.version = TARGET_VERSION;
  info.notes = 'Fixes desktop toolbar layout detection so Germplasm, Pedigree, Map, and Tools display evenly with no blank space or overlap.';
  info.updated = '2026-09-20';
  write('public/version.json', `${JSON.stringify(info, null, 2)}\n`);
}

if (exists('public/sw.js')) {
  let sw = read('public/sw.js');
  sw = sw.replace(/2\.13\.63/g, TARGET_VERSION);
  write('public/sw.js', sw);
}

const verifier = fs.readFileSync(path.join(payloadRoot, 'scripts/verify-toolbar-stable-v2.13.64.mjs'), 'utf8');
write('scripts/verify-toolbar-stable-v2.13.64.mjs', verifier);

console.log('');
console.log('CaneSprout v2.13.64 stable desktop toolbar installed.');
console.log('Desktop rules now use media queries instead of :has(.mobile-toolbar-toggle).');
console.log('Germplasm, Pedigree, Map, and Tools share the navigation region equally.');
console.log('');
console.log('Next run:');
console.log('  npm.cmd run verify:toolbar-stable');
console.log('  npm.cmd run verify:toolbar-tools-portal');
console.log('  npm.cmd run build');
console.log('');
