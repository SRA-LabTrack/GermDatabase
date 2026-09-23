import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const payloadRoot = path.join(root, 'v21363-toolbar-equal-payload');
const TARGET_VERSION = '2.13.63';
const ALLOWED_BASES = new Set(['2.13.62', TARGET_VERSION]);

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
  throw new Error(`This patch expects CaneSprout 2.13.62. Current package version is ${current || 'unknown'}. Apply the toolbar portal/full-space patch first.`);
}

let styles = read('src/styles.css');
const marker = 'v2.13.63 EQUAL FOUR-WAY DESKTOP NAVIGATION';

if (!styles.includes(marker)) {
  const extra = fs.readFileSync(path.join(payloadRoot, 'styles-v2.13.63.css'), 'utf8');
  styles = `${styles.trimEnd()}\n\n${extra.trim()}\n`;
  write('src/styles.css', styles);
}

pkg.version = TARGET_VERSION;
pkg.scripts ||= {};
pkg.scripts['verify:toolbar-equal-nav'] = 'node scripts/verify-toolbar-equal-nav-v2.13.63.mjs';
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

if (exists('package-lock.json')) {
  const lock = JSON.parse(read('package-lock.json'));
  lock.version = TARGET_VERSION;
  if (lock.packages?.['']) lock.packages[''].version = TARGET_VERSION;
  write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
}

if (exists('src/App.jsx')) {
  let app = read('src/App.jsx');
  app = app.replace(/const APP_VERSION = ['"][^'"]+['"];/, `const APP_VERSION = '${TARGET_VERSION}';`);
  write('src/App.jsx', app);
}

if (exists('public/version.json')) {
  const info = JSON.parse(read('public/version.json'));
  info.version = TARGET_VERSION;
  info.notes = 'Makes Germplasm, Pedigree, Map, and Tools share the desktop navigation area equally with no negative space or overlap.';
  info.updated = '2026-09-20';
  write('public/version.json', `${JSON.stringify(info, null, 2)}\n`);
}

if (exists('public/sw.js')) {
  let source = read('public/sw.js');
  source = source.replace(/2\.13\.62/g, TARGET_VERSION);
  write('public/sw.js', source);
}

const verifier = fs.readFileSync(path.join(payloadRoot, 'scripts/verify-toolbar-equal-nav-v2.13.63.mjs'), 'utf8');
write('scripts/verify-toolbar-equal-nav-v2.13.63.mjs', verifier);

console.log('');
console.log('CaneSprout v2.13.63 equal four-way desktop navigation installed.');
console.log('Germplasm, Pedigree, Map, and Tools now each receive 25% of navigation width.');
console.log('');
console.log('Next run:');
console.log('  npm.cmd run verify:toolbar-equal-nav');
console.log('  npm.cmd run verify:toolbar-tools-portal');
console.log('  npm.cmd run build');
console.log('');
