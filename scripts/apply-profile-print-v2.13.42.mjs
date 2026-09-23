import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TARGET_VERSION = '2.13.42';
const EXPECTED_BASE = '2.13.41';

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
    throw new Error(`This patch expects CaneSprout ${EXPECTED_BASE}. Current package version is ${current || 'unknown'}. Apply v2.13.41 first.`);
  }
  pkg.version = TARGET_VERSION;
  pkg.scripts ||= {};
  pkg.scripts['verify:profile-print'] = 'node scripts/verify-profile-print-v2.13.42.mjs';
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
  info.notes = 'Adds two printable variety profile formats: Core Information and Complete Information, with A4-friendly grouped output and printable RHS color swatches.';
  info.updated = '2026-09-20';
  write('public/version.json', `${JSON.stringify(info, null, 2)}\n`);
}

function patchServiceWorker() {
  let source = read('public/sw.js');
  source = source.replace(/canesprout-offline-v\d+\.\d+\.\d+/g, `canesprout-offline-v${TARGET_VERSION}`);
  write('public/sw.js', source);
}

function addPrinterToLucideImport(source) {
  if (/\bPrinter\b/.test(source.match(/import\s*\{[\s\S]*?\}\s*from\s*['\"]lucide-react['\"];?/)?.[0] || '')) return source;
  return source.replace(/import\s*\{([\s\S]*?)\}\s*from\s*(['\"]lucide-react['\"]);?/, (match, names, moduleName) => {
    const parts = names.split(',').map((name) => name.trim()).filter(Boolean);
    if (!parts.includes('Printer')) parts.push('Printer');
    return `import { ${parts.join(', ')} } from ${moduleName};`;
  });
}

function patchDetailModal() {
  const rel = 'src/components/DetailModal.jsx';
  let source = read(rel);

  source = addPrinterToLucideImport(source);
  if (!source.includes("import { printVarietyProfile } from '../lib/profilePrint.js';")) {
    const anchor = "import SugarcaneIcon from './SugarcaneIcon.jsx';";
    if (!source.includes(anchor)) throw new Error('Could not find SugarcaneIcon import in DetailModal.jsx.');
    source = source.replace(anchor, `${anchor}\nimport { printVarietyProfile } from '../lib/profilePrint.js';`);
  }

  if (!source.includes('const [showPrintMenu, setShowPrintMenu]')) {
    const stateRe = /(const\s+\[photoViewIndex,\s*setPhotoViewIndex\]\s*=\s*useState\([^\n]+\);)/;
    if (!stateRe.test(source)) throw new Error('Could not find DetailModal state insertion point.');
    source = source.replace(stateRe, `$1\n  const [showPrintMenu, setShowPrintMenu] = useState(false);`);
  }

  if (!source.includes('function printProfile(mode)')) {
    const anchor = '  const photos = record?.photo_file_ids || [];';
    if (!source.includes(anchor)) throw new Error('Could not find DetailModal print helper insertion point.');
    const helper = `  function printProfile(mode) {\n    if (!record) return;\n    try {\n      printVarietyProfile(record, mode);\n      setShowPrintMenu(false);\n    } catch (err) {\n      setError(err?.message || 'CaneSprout could not open the print preview.');\n    }\n  }\n\n`;
    source = source.replace(anchor, `${helper}${anchor}`);
  }

  if (!source.includes('className="profile-print-action"')) {
    const spacer = '<span className="footer-spacer" />';
    if (!source.includes(spacer)) throw new Error('Could not find DetailModal footer spacer for Print action.');
    const printAction = `${spacer}\n          <div className="profile-print-action" onMouseDown={(event) => event.stopPropagation()}>\n            <button\n              type="button"\n              className={\`secondary-button profile-print-trigger \${showPrintMenu ? 'active' : ''}\`}\n              onClick={() => setShowPrintMenu((current) => !current)}\n              aria-haspopup="menu"\n              aria-expanded={showPrintMenu}\n            >\n              <Printer size={16} /> Print\n            </button>\n            {showPrintMenu && (\n              <div className="profile-print-menu" role="menu" aria-label="Printable variety profile formats">\n                <button type="button" role="menuitem" onClick={() => printProfile('core')}>\n                  <strong>Core Information</strong>\n                  <span>Variety identity, parentage, yield, locations and disease reaction.</span>\n                </button>\n                <button type="button" role="menuitem" onClick={() => printProfile('complete')}>\n                  <strong>Complete Information</strong>\n                  <span>Core profile plus all recorded additional characterization and germination data.</span>\n                </button>\n              </div>\n            )}\n          </div>`;
    source = source.replace(spacer, printAction);
  }

  if (!source.includes("printProfile('core')") || !source.includes("printProfile('complete')")) {
    throw new Error('Print options were not installed into DetailModal.jsx.');
  }
  write(rel, source);
}

const CSS_MARKER = 'v2.13.42 PRINTABLE CORE + COMPLETE VARIETY PROFILE';
const CSS_BLOCK = `\n\n/* ================================================================\n   ${CSS_MARKER}\n   ================================================================ */\n.detail-profile-footer {\n  overflow: visible;\n}\n.profile-print-action {\n  position: relative;\n  flex: 0 0 auto;\n}\n.profile-print-trigger.active {\n  border-color: rgba(69, 123, 76, .34);\n  background: rgba(231, 242, 226, .92);\n  color: #28553a;\n}\n.profile-print-menu {\n  position: absolute;\n  right: 0;\n  bottom: calc(100% + 9px);\n  z-index: 60;\n  width: min(360px, calc(100vw - 34px));\n  padding: 7px;\n  border: 1px solid rgba(48, 92, 56, .16);\n  border-radius: 16px;\n  background: rgba(252, 254, 250, .98);\n  box-shadow: 0 18px 48px rgba(25, 57, 32, .18), inset 0 1px 0 rgba(255,255,255,.9);\n  backdrop-filter: blur(14px);\n}\n.profile-print-menu::after {\n  content: '';\n  position: absolute;\n  right: 26px;\n  bottom: -6px;\n  width: 11px;\n  height: 11px;\n  transform: rotate(45deg);\n  background: #fcfefa;\n  border-right: 1px solid rgba(48, 92, 56, .16);\n  border-bottom: 1px solid rgba(48, 92, 56, .16);\n}\n.profile-print-menu > button {\n  position: relative;\n  z-index: 1;\n  width: 100%;\n  display: grid;\n  gap: 3px;\n  padding: 11px 12px;\n  border: 0;\n  border-radius: 11px;\n  background: transparent;\n  text-align: left;\n  cursor: pointer;\n  transition: background-color .16s ease, transform .16s ease;\n}\n.profile-print-menu > button:hover,\n.profile-print-menu > button:focus-visible {\n  background: #eef6e9;\n  transform: translateY(-1px);\n  outline: none;\n}\n.profile-print-menu > button + button {\n  margin-top: 3px;\n  border-top: 1px solid rgba(48, 92, 56, .08);\n}\n.profile-print-menu strong {\n  color: #2b5839;\n  font-size: 11px;\n}\n.profile-print-menu span {\n  color: #78867b;\n  font-size: 8.5px;\n  line-height: 1.4;\n}\n@media (max-width: 620px) {\n  .profile-print-action { position: static; }\n  .profile-print-menu {\n    left: 10px;\n    right: 10px;\n    bottom: calc(100% + 8px);\n    width: auto;\n  }\n  .profile-print-menu::after { right: 50%; }\n}\n`;

function patchStyles() {
  let source = read('src/styles.css');
  if (!source.includes(CSS_MARKER)) source += CSS_BLOCK;
  write('src/styles.css', source);
}

function patchVerifierVersion(rel) {
  if (!exists(rel)) return;
  let source = read(rel);
  source = source.replace(/Version is 2\.13\.\d+/g, `Version is ${TARGET_VERSION}`);
  source = source.replace(/pkg\.version === '2\.13\.\d+'/g, `pkg.version === '${TARGET_VERSION}'`);
  source = source.replace(/CaneSprout v2\.13\.\d+/g, `CaneSprout v${TARGET_VERSION}`);
  write(rel, source);
}

for (const rel of [
  'package.json',
  'src/App.jsx',
  'src/styles.css',
  'src/components/DetailModal.jsx',
  'src/lib/profilePrint.js',
  'src/lib/characterizationFields.js',
  'src/lib/germinationFields.js',
  'src/lib/traitVisuals.js',
  'src/lib/legacyHyv.js',
  'public/version.json',
  'public/sw.js'
]) assertFile(rel);

patchPackage();
patchVersionConstant('src/App.jsx', 'APP_VERSION');
patchVersionConstant('src/lib/offlineApp.js', 'OFFLINE_VERSION');
patchPublicVersion();
patchServiceWorker();
patchDetailModal();
patchStyles();

for (const rel of [
  'scripts/verify-profile-trait-visuals.mjs',
  'scripts/verify-profile-map-exact-v2.13.40.mjs',
  'scripts/verify-origin-attribute-coordinates-v2.13.41.mjs',
  'scripts/verify-variety-map-profile-return.mjs'
]) patchVerifierVersion(rel);

console.log(`\nCaneSprout ${TARGET_VERSION} printable variety profile patch applied.`);
console.log('  - Print action added to every variety profile');
console.log('  - Core Information print format added');
console.log('  - Complete Information print format added');
console.log('  - Complete print includes additional characterization, coordinates, germination and registry documentation');
console.log('  - Print output is A4-friendly and omits blank fields');
console.log('  - RHS screen swatches and leaf-length classifications are preserved in print output');
console.log('\nNext: npm.cmd run verify:profile-print && npm.cmd run build\n');
