import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const payloadRoot = path.join(root, 'v21367-toolbar-final-payload');
const TARGET_VERSION = '2.13.67';
const ALLOWED_BASES = new Set(['2.13.66', TARGET_VERSION]);

function file(relative) { return path.join(root, relative); }
function exists(relative) { return fs.existsSync(file(relative)); }
function read(relative) { return fs.readFileSync(file(relative), 'utf8'); }
function write(relative, content) {
  const full = file(relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

for (const required of [
  'package.json',
  'src/App.jsx',
  'src/styles.css',
  'src/components/ToolbarToolsMenu.jsx'
]) {
  if (!exists(required)) throw new Error(`Required project file is missing: ${required}`);
}

const pkg = JSON.parse(read('package.json'));
const current = String(pkg.version || '');
if (!ALLOWED_BASES.has(current)) {
  throw new Error(`This patch expects CaneSprout 2.13.66. Current package version is ${current || 'unknown'}. Apply the clean toolbar reset first.`);
}

/* Replace the v2.13.66 block rather than stacking another toolbar cascade. */
let styles = read('src/styles.css');
const previousMarker = '/* ================================================================\n   v2.13.66 CLEAN TOOLBAR RESET';
const previousStart = styles.indexOf(previousMarker);
if (previousStart < 0) {
  throw new Error('Could not find the v2.13.66 clean toolbar CSS block. The local styles.css differs from the expected version.');
}
styles = styles.slice(0, previousStart).trimEnd();

const finalStyles = fs.readFileSync(path.join(payloadRoot, 'styles-v2.13.67.css'), 'utf8');
styles = `${styles}\n\n${finalStyles.trim()}\n`;
write('src/styles.css', styles);

/* Advance unique scope classes. */
let app = read('src/App.jsx');
app = app.replaceAll('toolbar-clean-v21366', 'toolbar-clean-v21367');
app = app.replaceAll('toolbar-nav-v21366', 'toolbar-nav-v21367');

if (!app.includes('toolbar-clean-v21367') || !app.includes('toolbar-nav-v21367')) {
  throw new Error('Could not update the toolbar scope classes in src/App.jsx.');
}

app = app.replace(/const APP_VERSION = ['"][^'"]+['"];/, `const APP_VERSION = '${TARGET_VERSION}';`);
write('src/App.jsx', app);

pkg.version = TARGET_VERSION;
pkg.scripts ||= {};
pkg.scripts['verify:toolbar-final'] = 'node scripts/verify-toolbar-final-v2.13.67.mjs';
pkg.scripts['verify:toolbar-tools-portal'] = 'node scripts/verify-toolbar-tools-portal-v2.13.67.mjs';
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

if (exists('package-lock.json')) {
  const lock = JSON.parse(read('package-lock.json'));
  lock.version = TARGET_VERSION;
  if (lock.packages?.['']) lock.packages[''].version = TARGET_VERSION;
  write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
}

write(
  'scripts/verify-toolbar-final-v2.13.67.mjs',
  fs.readFileSync(path.join(payloadRoot, 'scripts/verify-toolbar-final-v2.13.67.mjs'), 'utf8')
);
write(
  'scripts/verify-toolbar-tools-portal-v2.13.67.mjs',
  fs.readFileSync(path.join(payloadRoot, 'scripts/verify-toolbar-tools-portal-v2.13.67.mjs'), 'utf8')
);

if (exists('public/version.json')) {
  const info = JSON.parse(read('public/version.json'));
  info.version = TARGET_VERSION;
  info.notes = 'Corrects the clean toolbar geometry with four explicitly positioned equal navigation cells and updates the portal verifier for the current toolbar version.';
  info.updated = '2026-09-20';
  write('public/version.json', `${JSON.stringify(info, null, 2)}\n`);
}

if (exists('public/sw.js')) {
  let sw = read('public/sw.js');
  sw = sw.replace(/2\.13\.66/g, TARGET_VERSION);
  write('public/sw.js', sw);
}

console.log('');
console.log('CaneSprout v2.13.67 final toolbar geometry installed.');
console.log('Germplasm, Pedigree, Map, and Tools are explicitly locked to four equal cells.');
console.log('The legacy v2.13.62 portal verifier was replaced with a current behavior-based verifier.');
console.log('');
console.log('Next run:');
console.log('  npm.cmd run verify:toolbar-final');
console.log('  npm.cmd run verify:toolbar-tools-portal');
console.log('  npm.cmd run build');
console.log('');
