import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const payloadRoot = path.join(root, 'v21362-toolbar-portal-payload');
const TARGET_VERSION = '2.13.62';
const ALLOWED_BASES = new Set(['2.13.61', TARGET_VERSION]);

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
    throw new Error(`This patch expects CaneSprout 2.13.61. Current package version is ${current || 'unknown'}. Apply the toolbar menu/proportion fix first.`);
  }
  pkg.version = TARGET_VERSION;
  pkg.scripts ||= {};
  pkg.scripts['verify:toolbar-tools-portal'] = 'node scripts/verify-toolbar-tools-portal-v2.13.62.mjs';
  write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

  if (exists('package-lock.json')) {
    const lock = JSON.parse(read('package-lock.json'));
    lock.version = TARGET_VERSION;
    if (lock.packages?.['']) lock.packages[''].version = TARGET_VERSION;
    write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
  }
}

function stripLegacyToolsState(source) {
  source = source.replace(/\n  const toolbarToolsRef = useRef\(null\);/, '');
  source = source.replace(/\n  const \[toolbarToolsOpen, setToolbarToolsOpen\] = useState\(false\);/, '');

  const marker = '  // v2.13.61 controlled desktop Tools menu';
  const start = source.indexOf(marker);
  if (start >= 0) {
    const endNeedle = '  }, [toolbarToolsOpen]);';
    const end = source.indexOf(endNeedle, start);
    if (end >= 0) {
      const after = end + endNeedle.length;
      source = source.slice(0, start) + source.slice(after).replace(/^\n{2}/, '\n');
    }
  }

  return source;
}

function replaceLegacyToolsMenu(source) {
  if (source.includes('<ToolbarToolsMenu')) return source;

  const oldControlled = fs.readFileSync(path.join(root, 'v21361-toolbar-fix-payload', 'toolbar-tools-controlled-v2.13.61.txt'), 'utf8');
  if (source.includes(oldControlled)) {
    const replacement = fs.readFileSync(path.join(payloadRoot, 'toolbar-tools-portal-replacement-v2.13.62.txt'), 'utf8');
    return source.replace(oldControlled, replacement);
  }

  const startMarker = '          <div\n            ref={toolbarToolsRef}\n            className={`toolbar-tools-drawer ';
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error('Could not locate the v2.13.61 Tools menu in src/App.jsx.');

  const endMarker = '          </div>';
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error('Could not locate the end of the v2.13.61 Tools menu.');

  const replacement = fs.readFileSync(path.join(payloadRoot, 'toolbar-tools-portal-replacement-v2.13.62.txt'), 'utf8');
  return source.slice(0, start) + replacement + source.slice(end + endMarker.length);
}

function patchApp() {
  let source = read('src/App.jsx');

  const importLine = "import ToolbarToolsMenu from './components/ToolbarToolsMenu.jsx';";
  if (!source.includes(importLine)) {
    const anchor = "import SugarcaneIcon from './components/SugarcaneIcon.jsx';";
    if (!source.includes(anchor)) throw new Error('Could not locate SugarcaneIcon import in src/App.jsx.');
    source = source.replace(anchor, `${anchor}\n${importLine}`);
  }

  source = replaceLegacyToolsMenu(source);
  source = stripLegacyToolsState(source);
  source = source.replace(/const APP_VERSION = ['"][^'"]+['"];/, `const APP_VERSION = '${TARGET_VERSION}';`);
  write('src/App.jsx', source);
}

function patchStyles() {
  let source = read('src/styles.css');
  const marker = 'v2.13.62 TOOLBAR PORTAL MENU + FULL-SPACE PROPORTION FIX';
  if (!source.includes(marker)) {
    const extra = fs.readFileSync(path.join(payloadRoot, 'styles-v2.13.62.css'), 'utf8');
    source = `${source.trimEnd()}\n\n${extra.trim()}\n`;
    write('src/styles.css', source);
  }
}

function copyPayload(relative) {
  const source = path.join(payloadRoot, relative);
  if (!fs.existsSync(source)) throw new Error(`Patch payload is missing ${relative}.`);
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function patchPublicVersion() {
  if (!exists('public/version.json')) return;
  const info = JSON.parse(read('public/version.json'));
  info.version = TARGET_VERSION;
  info.notes = 'Moves the desktop Tools dropdown into a body-level portal so its contents always display, while expanding primary navigation to occupy unused toolbar space.';
  info.updated = '2026-09-20';
  write('public/version.json', `${JSON.stringify(info, null, 2)}\n`);
}

function patchServiceWorker() {
  if (!exists('public/sw.js')) return;
  let source = read('public/sw.js');
  source = source.replace(/2\.13\.61/g, TARGET_VERSION);
  source = source.replace(/canesprout-(?:static|shell|cache|offline)-v[\w.-]+/g, (match) => {
    const prefix = match.replace(/v[\w.-]+$/, '');
    return `${prefix}v${TARGET_VERSION}`;
  });
  write('public/sw.js', source);
}

for (const required of ['package.json', 'src/App.jsx', 'src/styles.css']) requireFile(required);

patchPackage();
copyPayload('src/components/ToolbarToolsMenu.jsx');
patchApp();
patchStyles();
copyPayload('scripts/verify-toolbar-tools-portal-v2.13.62.mjs');
patchPublicVersion();
patchServiceWorker();

console.log('');
console.log('CaneSprout v2.13.62 toolbar portal menu installed.');
console.log('Tools dropdown now renders directly under document.body.');
console.log('Primary navigation now expands to occupy the previous blank toolbar space.');
console.log('');
console.log('Next run:');
console.log('  npm.cmd run verify:toolbar-tools-portal');
console.log('  npm.cmd run build');
console.log('');
