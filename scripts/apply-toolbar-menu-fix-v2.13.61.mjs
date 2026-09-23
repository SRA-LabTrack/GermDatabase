import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const payloadRoot = path.join(root, 'v21361-toolbar-fix-payload');
const TARGET_VERSION = '2.13.61';
const ALLOWED_BASES = new Set(['2.13.60', TARGET_VERSION]);

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
    throw new Error(`This patch expects CaneSprout 2.13.60. Current package version is ${current || 'unknown'}. Apply the clean toolbar patch first.`);
  }
  pkg.version = TARGET_VERSION;
  pkg.scripts ||= {};
  pkg.scripts['verify:toolbar-menu-fix'] = 'node scripts/verify-toolbar-menu-fix-v2.13.61.mjs';
  write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

  if (exists('package-lock.json')) {
    const lock = JSON.parse(read('package-lock.json'));
    lock.version = TARGET_VERSION;
    if (lock.packages?.['']) lock.packages[''].version = TARGET_VERSION;
    write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
  }
}

function patchAppState(source) {
  if (!source.includes('const toolbarToolsRef = useRef(null);')) {
    const anchor = '  const excelMenuRef = useRef(null);';
    if (!source.includes(anchor)) throw new Error('Could not locate the toolbar ref section in src/App.jsx.');
    source = source.replace(anchor, `${anchor}\n  const toolbarToolsRef = useRef(null);`);
  }

  if (!source.includes('const [toolbarToolsOpen, setToolbarToolsOpen] = useState(false);')) {
    const anchor = '  const [showExcelMenu, setShowExcelMenu] = useState(false);';
    if (!source.includes(anchor)) throw new Error('Could not locate the Excel menu state in src/App.jsx.');
    source = source.replace(anchor, `${anchor}\n  const [toolbarToolsOpen, setToolbarToolsOpen] = useState(false);`);
  }

  const effectMarker = '  // v2.13.61 controlled desktop Tools menu';
  if (!source.includes(effectMarker)) {
    const effectAnchor = '  useEffect(() => {\n    let frame = 0;';
    if (!source.includes(effectAnchor)) throw new Error('Could not locate the first toolbar measurement effect in src/App.jsx.');

    const effect = `  // v2.13.61 controlled desktop Tools menu
  useEffect(() => {
    if (!toolbarToolsOpen) return undefined;

    function handleToolbarToolsPointerDown(event) {
      if (toolbarToolsRef.current?.contains(event.target)) return;
      setToolbarToolsOpen(false);
    }

    function handleToolbarToolsKeyDown(event) {
      if (event.key === 'Escape') setToolbarToolsOpen(false);
    }

    document.addEventListener('pointerdown', handleToolbarToolsPointerDown, true);
    window.addEventListener('keydown', handleToolbarToolsKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handleToolbarToolsPointerDown, true);
      window.removeEventListener('keydown', handleToolbarToolsKeyDown);
    };
  }, [toolbarToolsOpen]);

`;
    source = source.replace(effectAnchor, effect + effectAnchor);
  }

  return source;
}

function patchToolsMenu(source) {
  if (source.includes('ref={toolbarToolsRef}') && source.includes('aria-expanded={toolbarToolsOpen}')) return source;

  const startMarker = '          <details\n            className={`toolbar-tools-drawer ';
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error('Could not locate the v2.13.60 native Tools menu in src/App.jsx.');

  const endMarker = '          </details>';
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error('Could not locate the end of the v2.13.60 Tools menu in src/App.jsx.');

  const replacement = fs.readFileSync(path.join(payloadRoot, 'toolbar-tools-controlled-v2.13.61.txt'), 'utf8');
  return source.slice(0, start) + replacement + source.slice(end + endMarker.length);
}

function patchApp() {
  let source = read('src/App.jsx');
  source = patchAppState(source);
  source = patchToolsMenu(source);
  source = source.replace(/const APP_VERSION = ['"][^'"]+['"];/, `const APP_VERSION = '${TARGET_VERSION}';`);
  write('src/App.jsx', source);
}

function patchStyles() {
  let source = read('src/styles.css');
  const marker = 'v2.13.61 TOOLBAR PROPORTION + CONTROLLED TOOLS MENU FIX';
  if (!source.includes(marker)) {
    const extra = fs.readFileSync(path.join(payloadRoot, 'styles-v2.13.61.css'), 'utf8');
    source = `${source.trimEnd()}\n\n${extra.trim()}\n`;
    write('src/styles.css', source);
  }
}

function patchPublicVersion() {
  if (!exists('public/version.json')) return;
  const info = JSON.parse(read('public/version.json'));
  info.version = TARGET_VERSION;
  info.notes = 'Fixes the desktop Tools dropdown and rebalances toolbar widths to remove large empty gaps and overlap.';
  info.updated = '2026-09-20';
  write('public/version.json', `${JSON.stringify(info, null, 2)}\n`);
}

function patchServiceWorker() {
  if (!exists('public/sw.js')) return;
  let source = read('public/sw.js');
  source = source.replace(/2\.13\.60/g, TARGET_VERSION);
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

const verifier = fs.readFileSync(path.join(payloadRoot, 'scripts/verify-toolbar-menu-fix-v2.13.61.mjs'), 'utf8');
write('scripts/verify-toolbar-menu-fix-v2.13.61.mjs', verifier);

console.log('');
console.log('CaneSprout v2.13.61 toolbar menu + proportion fix installed.');
console.log('Tools now uses controlled React state instead of native <details>.');
console.log('Desktop toolbar proportions now use bounded flex widths.');
console.log('');
console.log('Next run:');
console.log('  npm.cmd run verify:toolbar-menu-fix');
console.log('  npm.cmd run verify:toolbar-cleanup');
console.log('  npm.cmd run build');
console.log('');
