import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const payloadRoot = path.join(root, 'v21360-toolbar-cleanup-payload');
const TARGET_VERSION = '2.13.60';
const ALLOWED_BASES = new Set(['2.13.59', TARGET_VERSION]);

function file(relative) { return path.join(root, relative); }
function exists(relative) { return fs.existsSync(file(relative)); }
function read(relative) { return fs.readFileSync(file(relative), 'utf8'); }
function write(relative, content) {
  const full = file(relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}
function requireFile(relative) {
  if (!exists(relative)) throw new Error(`Required project file is missing: ${relative}`);
}

function patchPackage() {
  const pkg = JSON.parse(read('package.json'));
  const current = String(pkg.version || '');
  if (!ALLOWED_BASES.has(current)) {
    throw new Error(`This patch expects CaneSprout 2.13.59. Current package version is ${current || 'unknown'}. Apply the latest Germplasm Map smooth-redirect patch first.`);
  }
  pkg.version = TARGET_VERSION;
  pkg.scripts ||= {};
  pkg.scripts['verify:toolbar-cleanup'] = 'node scripts/verify-toolbar-cleanup-v2.13.60.mjs';
  write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

  if (exists('package-lock.json')) {
    const lock = JSON.parse(read('package-lock.json'));
    lock.version = TARGET_VERSION;
    if (lock.packages?.['']) lock.packages[''].version = TARGET_VERSION;
    write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
  }
}

function patchApp() {
  const relative = 'src/App.jsx';
  let source = read(relative);

  if (!source.includes('toolbar-tools-drawer') || !source.includes('toolbar-primary-actions')) {
    const startMarker = "        <nav className={`toolbar-main-actions segmented-toolbar ";
    const endMarker = "        <button\n          type=\"button\"\n          className={`toolbar-status-card connection ";

    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start);
    if (start < 0 || end < 0) {
      throw new Error('Could not locate the desktop toolbar navigation block in src/App.jsx.');
    }

    const replacement = fs.readFileSync(path.join(payloadRoot, 'desktop-toolbar-replacement-v2.13.60.txt'), 'utf8');
    source = source.slice(0, start) + replacement + source.slice(end);
  }

  source = source.replace(/const APP_VERSION = ['"][^'"]+['"];/, `const APP_VERSION = '${TARGET_VERSION}';`);
  write(relative, source);
}

function patchStyles() {
  const relative = 'src/styles.css';
  let source = read(relative);
  const marker = 'v2.13.60 CLEAN + COLLAPSIBLE DESKTOP TOOLBAR';
  if (!source.includes(marker)) {
    const extra = fs.readFileSync(path.join(payloadRoot, 'styles-v2.13.60.css'), 'utf8');
    source = `${source.trimEnd()}\n\n${extra.trim()}\n`;
    write(relative, source);
  }
}

function patchPublicVersion() {
  if (!exists('public/version.json')) return;
  const info = JSON.parse(read('public/version.json'));
  info.version = TARGET_VERSION;
  info.notes = 'Cleans up the desktop toolbar by keeping Germplasm, Pedigree, and Map primary while grouping Excel, Add Record, Combination Registry, and Admin Center into a collapsible Tools menu.';
  info.updated = '2026-09-20';
  write('public/version.json', `${JSON.stringify(info, null, 2)}\n`);
}

function patchServiceWorker() {
  if (!exists('public/sw.js')) return;
  let source = read('public/sw.js');
  source = source.replace(/2\.13\.59/g, TARGET_VERSION);
  source = source.replace(/canesprout-(?:static|shell|cache|offline)-v[\w.-]+/g, (match) => {
    const prefix = match.replace(/v[\w.-]+$/, '');
    return `${prefix}v${TARGET_VERSION}`;
  });
  write('public/sw.js', source);
}

for (const required of ['package.json', 'src/App.jsx', 'src/styles.css']) requireFile(required);

patchPackage();
patchApp();
patchStyles();
patchPublicVersion();
patchServiceWorker();

const verifier = fs.readFileSync(path.join(payloadRoot, 'scripts/verify-toolbar-cleanup-v2.13.60.mjs'), 'utf8');
write('scripts/verify-toolbar-cleanup-v2.13.60.mjs', verifier);

console.log('');
console.log('CaneSprout v2.13.60 clean collapsible toolbar installed.');
console.log('Primary: Germplasm, Pedigree, Map');
console.log('Collapsible Tools: Excel Tools, Add record, Combination Registry, Admin Center');
console.log('');
console.log('Next run:');
console.log('  npm.cmd run verify:toolbar-cleanup');
console.log('  npm.cmd run build');
console.log('');
