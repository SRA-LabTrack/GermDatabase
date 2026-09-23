import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const payloadRoot = path.join(root, 'v21368-isolated-nav-payload');
const TARGET_VERSION = '2.13.68';
const ALLOWED_BASES = new Set(['2.13.67', TARGET_VERSION]);

function file(relative) { return path.join(root, relative); }
function exists(relative) { return fs.existsSync(file(relative)); }
function read(relative) { return fs.readFileSync(file(relative), 'utf8'); }
function write(relative, content) {
  const full = file(relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

for (const required of ['package.json', 'src/App.jsx', 'src/styles.css']) {
  if (!exists(required)) throw new Error(`Required project file is missing: ${required}`);
}

const pkg = JSON.parse(read('package.json'));
const current = String(pkg.version || '');
if (!ALLOWED_BASES.has(current)) {
  throw new Error(`This patch expects CaneSprout 2.13.67. Current package version is ${current || 'unknown'}. Apply the previous toolbar patch first.`);
}

/* Install isolated component. */
const componentSource = fs.readFileSync(path.join(payloadRoot, 'src/components/DesktopPrimaryNav.jsx'), 'utf8');
write('src/components/DesktopPrimaryNav.jsx', componentSource);

/* Replace the complete legacy middle navigation block. */
let app = read('src/App.jsx');

const importLine = "import DesktopPrimaryNav from './components/DesktopPrimaryNav.jsx';";
if (!app.includes(importLine)) {
  const anchor = "import SugarcaneIcon from './components/SugarcaneIcon.jsx';";
  if (!app.includes(anchor)) throw new Error('Could not locate SugarcaneIcon import in src/App.jsx.');
  app = app.replace(anchor, `${anchor}\n${importLine}`);
}

/* Old ToolbarToolsMenu is no longer rendered. */
app = app.replace(/\nimport ToolbarToolsMenu from '\.\/components\/ToolbarToolsMenu\.jsx';/, '');

const navStartCandidates = [
  '        <nav className={`toolbar-main-actions segmented-toolbar toolbar-primary-actions toolbar-nav-v21367',
  '        <nav className={`toolbar-main-actions segmented-toolbar toolbar-primary-actions',
  '        <nav className={`toolbar-main-actions segmented-toolbar'
];

let navStart = -1;
for (const marker of navStartCandidates) {
  navStart = app.indexOf(marker);
  if (navStart >= 0) break;
}

const statusMarker = '        <button\n          type="button"\n          className={`toolbar-status-card connection ';
const navEnd = app.indexOf(statusMarker, navStart);

if (navStart < 0 || navEnd < 0) {
  throw new Error('Could not isolate the current desktop navigation block in src/App.jsx.');
}

const replacement = fs.readFileSync(path.join(payloadRoot, 'desktop-primary-nav-call-v2.13.68.txt'), 'utf8');
app = app.slice(0, navStart) + replacement + app.slice(navEnd);

app = app.replaceAll('toolbar-clean-v21367', 'toolbar-clean-v21368');
app = app.replaceAll('toolbar-clean-v21366', 'toolbar-clean-v21368');

if (!app.includes('toolbar-clean-v21368')) {
  throw new Error('Could not update the toolbar header scope to v2.13.68.');
}

app = app.replace(/const APP_VERSION = ['"][^'"]+['"];/, `const APP_VERSION = '${TARGET_VERSION}';`);
write('src/App.jsx', app);

/* Replace v2.13.67 geometry instead of stacking a new toolbar layer. */
let styles = read('src/styles.css');
const previousMarker = '/* ================================================================\n   v2.13.67 FINAL DESKTOP TOOLBAR GEOMETRY';
const start = styles.indexOf(previousMarker);
if (start < 0) {
  throw new Error('Could not find the v2.13.67 toolbar geometry block in src/styles.css.');
}
styles = styles.slice(0, start).trimEnd();

const newStyles = fs.readFileSync(path.join(payloadRoot, 'styles-v2.13.68.css'), 'utf8');
styles = `${styles}\n\n${newStyles.trim()}\n`;
write('src/styles.css', styles);

pkg.version = TARGET_VERSION;
pkg.scripts ||= {};
pkg.scripts['verify:toolbar-isolated-nav'] = 'node scripts/verify-toolbar-isolated-nav-v2.13.68.mjs';
pkg.scripts['verify:toolbar-tools-portal'] = 'node scripts/verify-toolbar-tools-portal-v2.13.68.mjs';
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

if (exists('package-lock.json')) {
  const lock = JSON.parse(read('package-lock.json'));
  lock.version = TARGET_VERSION;
  if (lock.packages?.['']) lock.packages[''].version = TARGET_VERSION;
  write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
}

write(
  'scripts/verify-toolbar-isolated-nav-v2.13.68.mjs',
  fs.readFileSync(path.join(payloadRoot, 'scripts/verify-toolbar-isolated-nav-v2.13.68.mjs'), 'utf8')
);
write(
  'scripts/verify-toolbar-tools-portal-v2.13.68.mjs',
  fs.readFileSync(path.join(payloadRoot, 'scripts/verify-toolbar-tools-portal-v2.13.68.mjs'), 'utf8')
);

if (exists('public/version.json')) {
  const info = JSON.parse(read('public/version.json'));
  info.version = TARGET_VERSION;
  info.notes = 'Replaces the legacy middle toolbar with an isolated four-cell navigation component and a self-contained body-level Tools popover.';
  info.updated = '2026-09-20';
  write('public/version.json', `${JSON.stringify(info, null, 2)}\n`);
}

if (exists('public/sw.js')) {
  let sw = read('public/sw.js');
  sw = sw.replace(/2\.13\.67/g, TARGET_VERSION);
  write('public/sw.js', sw);
}

console.log('');
console.log('CaneSprout v2.13.68 isolated primary navigation installed.');
console.log('The old middle toolbar markup has been replaced, not restyled.');
console.log('Germplasm | Pedigree | Map | Tools now use four isolated equal grid cells.');
console.log('');
console.log('Next run:');
console.log('  npm.cmd run verify:toolbar-isolated-nav');
console.log('  npm.cmd run verify:toolbar-tools-portal');
console.log('  npm.cmd run build');
console.log('');
