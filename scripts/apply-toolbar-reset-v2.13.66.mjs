import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const payloadRoot = path.join(root, 'v21366-toolbar-reset-payload');
const TARGET_VERSION = '2.13.66';
const ALLOWED_BASES = new Set(['2.13.65', TARGET_VERSION]);

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
  throw new Error(`This patch expects CaneSprout 2.13.65. Current package version is ${current || 'unknown'}. Apply the previous toolbar patch first.`);
}

/*
  Remove the accumulated v2.13.60-v2.13.65 toolbar overrides completely.
  Those patches were appended consecutively, so truncating from the first
  toolbar-patch marker safely removes the conflicting cascade.
*/
let styles = read('src/styles.css');
const firstOldMarker = '/* ================================================================\n   v2.13.60 CLEAN + COLLAPSIBLE DESKTOP TOOLBAR';
const oldStart = styles.indexOf(firstOldMarker);

if (oldStart >= 0) {
  styles = styles.slice(0, oldStart).trimEnd();
}

const cleanStyles = fs.readFileSync(path.join(payloadRoot, 'styles-v2.13.66.css'), 'utf8');
styles = `${styles}\n\n${cleanStyles.trim()}\n`;
write('src/styles.css', styles);

/* Add unique scope classes so legacy pre-v2.13.60 rules cannot win. */
let app = read('src/App.jsx');

if (!app.includes('toolbar-clean-v21366')) {
  app = app.replace(
    "className={`topbar reference-toolbar ${isAdmin ? 'admin-toolbar' : 'user-toolbar'} ${desktopMode ? 'electron-toolbar' : 'web-pedigree-toolbar'}`}",
    "className={`topbar reference-toolbar toolbar-clean-v21366 ${isAdmin ? 'admin-toolbar' : 'user-toolbar'} ${desktopMode ? 'electron-toolbar' : 'web-pedigree-toolbar'}`}"
  );
}

if (!app.includes('toolbar-nav-v21366')) {
  app = app.replace(
    "className={`toolbar-main-actions segmented-toolbar toolbar-primary-actions ${isAdmin ? 'admin-actions' : ''}`}",
    "className={`toolbar-main-actions segmented-toolbar toolbar-primary-actions toolbar-nav-v21366 ${isAdmin ? 'admin-actions' : ''}`}"
  );

  /* Fallback for a local copy whose class predates toolbar-primary-actions. */
  app = app.replace(
    "className={`toolbar-main-actions segmented-toolbar ${isAdmin ? 'admin-actions' : ''}`}",
    "className={`toolbar-main-actions segmented-toolbar toolbar-primary-actions toolbar-nav-v21366 ${isAdmin ? 'admin-actions' : ''}`}"
  );
}

if (!app.includes('toolbar-clean-v21366') || !app.includes('toolbar-nav-v21366')) {
  throw new Error('Could not add the v2.13.66 toolbar scope classes to src/App.jsx. The local toolbar structure differs from the expected version.');
}

app = app.replace(/const APP_VERSION = ['"][^'"]+['"];/, `const APP_VERSION = '${TARGET_VERSION}';`);
write('src/App.jsx', app);

pkg.version = TARGET_VERSION;
pkg.scripts ||= {};
pkg.scripts['verify:toolbar-reset'] = 'node scripts/verify-toolbar-reset-v2.13.66.mjs';
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

if (exists('package-lock.json')) {
  const lock = JSON.parse(read('package-lock.json'));
  lock.version = TARGET_VERSION;
  if (lock.packages?.['']) lock.packages[''].version = TARGET_VERSION;
  write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
}

if (exists('public/version.json')) {
  const info = JSON.parse(read('public/version.json'));
  info.version = TARGET_VERSION;
  info.notes = 'Resets accumulated toolbar CSS and installs one clean updated layout with visible Germplasm, Pedigree, Map, Tools, Online, and Account sections.';
  info.updated = '2026-09-20';
  write('public/version.json', `${JSON.stringify(info, null, 2)}\n`);
}

if (exists('public/sw.js')) {
  let sw = read('public/sw.js');
  sw = sw.replace(/2\.13\.65/g, TARGET_VERSION);
  write('public/sw.js', sw);
}

const verifier = fs.readFileSync(path.join(payloadRoot, 'scripts/verify-toolbar-reset-v2.13.66.mjs'), 'utf8');
write('scripts/verify-toolbar-reset-v2.13.66.mjs', verifier);

console.log('');
console.log('CaneSprout v2.13.66 clean toolbar reset installed.');
console.log('Removed conflicting v2.13.60-v2.13.65 toolbar CSS.');
console.log('Installed one scoped layout: Brand | Germplasm | Pedigree | Map | Tools | Online | Account');
console.log('');
console.log('Next run:');
console.log('  npm.cmd run verify:toolbar-reset');
console.log('  npm.cmd run verify:toolbar-tools-portal');
console.log('  npm.cmd run build');
console.log('');
