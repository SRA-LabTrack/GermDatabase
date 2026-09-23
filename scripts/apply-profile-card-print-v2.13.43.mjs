import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TARGET_VERSION = '2.13.43';
const EXPECTED_BASE = '2.13.42';

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
    throw new Error(`This patch expects CaneSprout ${EXPECTED_BASE}. Current package version is ${current || 'unknown'}. Apply v2.13.42 first.`);
  }
  pkg.version = TARGET_VERSION;
  pkg.scripts ||= {};
  pkg.scripts['verify:profile-card-print'] = 'node scripts/verify-profile-card-print-v2.13.43.mjs';
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
  info.notes = 'Adds Core and Complete printable profile actions directly to every germplasm collection card while retaining the existing print action inside the opened profile.';
  info.updated = '2026-09-20';
  write('public/version.json', `${JSON.stringify(info, null, 2)}\n`);
}

function patchServiceWorker() {
  let source = read('public/sw.js');
  source = source.replace(/canesprout-offline-v\d+\.\d+\.\d+/g, `canesprout-offline-v${TARGET_VERSION}`);
  write('public/sw.js', source);
}

function addPrinterToLucideImport(source) {
  const importMatch = source.match(/import\s*\{[\s\S]*?\}\s*from\s*['\"]lucide-react['\"];?/);
  if (!importMatch) throw new Error('Could not find lucide-react import in src/App.jsx.');
  if (/\bPrinter\b/.test(importMatch[0])) return source;
  return source.replace(/import\s*\{([\s\S]*?)\}\s*from\s*(['\"]lucide-react['\"]);?/, (match, names, moduleName) => {
    const parts = names.split(',').map((name) => name.trim()).filter(Boolean);
    if (!parts.includes('Printer')) parts.push('Printer');
    return `import { ${parts.join(', ')} } from ${moduleName};`;
  });
}

function patchApp() {
  const rel = 'src/App.jsx';
  let source = read(rel);

  if (!source.includes('function RecordCard(')) throw new Error('Could not find RecordCard in src/App.jsx.');
  if (!source.includes('getRecord')) throw new Error('src/App.jsx does not currently import getRecord from registryApi.');

  source = addPrinterToLucideImport(source);

  if (!source.includes("import { printVarietyProfile } from './lib/profilePrint.js';")) {
    const preferredAnchor = "import { normalizeVarietyDisplay } from './lib/legacyHyv';";
    const fallbackAnchor = "import SugarcaneIcon from './components/SugarcaneIcon.jsx';";
    if (source.includes(preferredAnchor)) {
      source = source.replace(preferredAnchor, `${preferredAnchor}\nimport { printVarietyProfile } from './lib/profilePrint.js';`);
    } else if (source.includes(fallbackAnchor)) {
      source = source.replace(fallbackAnchor, `${fallbackAnchor}\nimport { printVarietyProfile } from './lib/profilePrint.js';`);
    } else {
      throw new Error('Could not find an App.jsx import insertion point for profilePrint.');
    }
  }

  if (!source.includes('const [cardPrintMenuOpen, setCardPrintMenuOpen]')) {
    const anchor = '  const [profilePreview, setProfilePreview] = useState(record.__bundledSnapshot ? record : null);';
    if (!source.includes(anchor)) throw new Error('Could not find RecordCard profilePreview state.');
    source = source.replace(anchor, `${anchor}\n  const [cardPrintMenuOpen, setCardPrintMenuOpen] = useState(false);\n  const [cardPrintBusy, setCardPrintBusy] = useState('');`);
  }

  if (!source.includes('async function printFromCard(event, mode)')) {
    const anchor = '  const disease = preview.disease_reaction || missing;';
    if (!source.includes(anchor)) throw new Error('Could not find RecordCard print helper insertion point.');
    const helper = `\n\n  async function printFromCard(event, mode) {\n    event?.preventDefault?.();\n    event?.stopPropagation?.();\n    if (cardPrintBusy) return;\n    setCardPrintBusy(mode);\n    try {\n      // Printing is an explicit user action, so fetch the complete record first.\n      // This prevents the collection card's lean preview from producing an incomplete printout.\n      const fullRecord = await getRecord(record.$id);\n      printVarietyProfile(fullRecord || preview || record, mode);\n      setCardPrintMenuOpen(false);\n    } catch (err) {\n      window.alert(err?.message || 'CaneSprout could not open the printable variety profile.');\n    } finally {\n      setCardPrintBusy('');\n    }\n  }`;
    source = source.replace(anchor, `${anchor}${helper}`);
  }

  if (!source.includes('className="germplasm-card-actions"')) {
    const buttonRe = /(<button\s+type="button"\s+className="primary-button view-profile-button"[\s\S]*?<\/button>)/;
    const match = source.match(buttonRe);
    if (!match) throw new Error('Could not find the View Profile button inside RecordCard.');
    const originalViewButton = match[1];
    const actionBlock = `<div className="germplasm-card-actions" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>\n            <div className="germplasm-card-print-action">\n              <button\n                type="button"\n                className={\`secondary-button germplasm-card-print-trigger \${cardPrintMenuOpen ? 'active' : ''}\`}\n                onClick={(event) => { event.preventDefault(); event.stopPropagation(); setCardPrintMenuOpen((current) => !current); }}\n                aria-haspopup="menu"\n                aria-expanded={cardPrintMenuOpen}\n                title="Print this variety"\n              >\n                <Printer size={15} /> {cardPrintBusy ? 'Preparing…' : 'Print'}\n              </button>\n              {cardPrintMenuOpen && (\n                <div className="germplasm-card-print-menu" role="menu" aria-label={\`Print \${record.variety || 'variety'}\`}>\n                  <button type="button" role="menuitem" disabled={Boolean(cardPrintBusy)} onClick={(event) => printFromCard(event, 'core')}>\n                    <strong>Core Information</strong>\n                    <span>Identity, parentage, yield, locations and disease reaction.</span>\n                  </button>\n                  <button type="button" role="menuitem" disabled={Boolean(cardPrintBusy)} onClick={(event) => printFromCard(event, 'complete')}>\n                    <strong>Complete Information</strong>\n                    <span>Core information plus every recorded additional trait and germination field.</span>\n                  </button>\n                </div>\n              )}\n            </div>\n            ${originalViewButton}\n          </div>`;
    source = source.replace(originalViewButton, actionBlock);
  }

  if (!source.includes("printFromCard(event, 'core')") || !source.includes("printFromCard(event, 'complete')")) {
    throw new Error('Both card print modes were not installed into src/App.jsx.');
  }
  if (!source.includes('const fullRecord = await getRecord(record.$id);')) {
    throw new Error('Card print must fetch the complete record before printing.');
  }
  write(rel, source);
}

const CSS_MARKER = 'v2.13.43 PRINT ACTION DIRECTLY ON GERMLASM COLLECTION CARDS';
const CSS_BLOCK = `\n\n/* ================================================================\n   ${CSS_MARKER}\n   ================================================================ */\n.germplasm-card-footer {\n  overflow: visible;\n}\n.germplasm-card-actions {\n  display: flex;\n  align-items: center;\n  justify-content: flex-end;\n  gap: 7px;\n  flex: 0 0 auto;\n}\n.germplasm-card-print-action {\n  position: relative;\n  flex: 0 0 auto;\n}\n.germplasm-card-print-trigger {\n  min-height: 38px;\n  padding-inline: 12px;\n  white-space: nowrap;\n}\n.germplasm-card-print-trigger.active {\n  border-color: rgba(69, 123, 76, .34);\n  background: rgba(231, 242, 226, .96);\n  color: #28553a;\n}\n.germplasm-card-print-menu {\n  position: absolute;\n  right: 0;\n  bottom: calc(100% + 9px);\n  z-index: 80;\n  width: min(330px, calc(100vw - 34px));\n  padding: 7px;\n  border: 1px solid rgba(48, 92, 56, .16);\n  border-radius: 15px;\n  background: rgba(252, 254, 250, .99);\n  box-shadow: 0 18px 48px rgba(25, 57, 32, .20), inset 0 1px 0 rgba(255,255,255,.92);\n  backdrop-filter: blur(14px);\n}\n.germplasm-card-print-menu::after {\n  content: '';\n  position: absolute;\n  right: 27px;\n  bottom: -6px;\n  width: 11px;\n  height: 11px;\n  transform: rotate(45deg);\n  background: #fcfefa;\n  border-right: 1px solid rgba(48, 92, 56, .16);\n  border-bottom: 1px solid rgba(48, 92, 56, .16);\n}\n.germplasm-card-print-menu > button {\n  position: relative;\n  z-index: 1;\n  width: 100%;\n  display: grid;\n  gap: 3px;\n  padding: 10px 11px;\n  border: 0;\n  border-radius: 10px;\n  background: transparent;\n  text-align: left;\n  cursor: pointer;\n  transition: background-color .16s ease, transform .16s ease;\n}\n.germplasm-card-print-menu > button:hover,\n.germplasm-card-print-menu > button:focus-visible {\n  background: #eef6e9;\n  transform: translateY(-1px);\n  outline: none;\n}\n.germplasm-card-print-menu > button:disabled {\n  opacity: .62;\n  cursor: wait;\n}\n.germplasm-card-print-menu > button + button {\n  margin-top: 3px;\n  border-top: 1px solid rgba(48, 92, 56, .08);\n}\n.germplasm-card-print-menu strong {\n  color: #2b5839;\n  font-size: 10.5px;\n}\n.germplasm-card-print-menu span {\n  color: #78867b;\n  font-size: 8px;\n  line-height: 1.4;\n}\n@media (max-width: 760px) {\n  .germplasm-card-footer {\n    align-items: stretch;\n    flex-direction: column;\n    gap: 10px;\n  }\n  .germplasm-card-actions {\n    width: 100%;\n    display: grid;\n    grid-template-columns: minmax(0, .8fr) minmax(0, 1.2fr);\n  }\n  .germplasm-card-print-action,\n  .germplasm-card-print-trigger,\n  .germplasm-card-actions .view-profile-button {\n    width: 100%;\n  }\n  .germplasm-card-print-menu {\n    left: 0;\n    right: auto;\n    width: min(330px, calc(100vw - 54px));\n  }\n  .germplasm-card-print-menu::after { left: 28px; right: auto; }\n}\n`;

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
  'src/lib/profilePrint.js',
  'public/version.json',
  'public/sw.js'
]) assertFile(rel);

patchPackage();
patchVersionConstant('src/App.jsx', 'APP_VERSION');
patchVersionConstant('src/lib/offlineApp.js', 'OFFLINE_VERSION');
patchPublicVersion();
patchServiceWorker();
patchApp();
patchStyles();

for (const rel of [
  'scripts/verify-profile-print-v2.13.42.mjs',
  'scripts/verify-profile-trait-visuals.mjs',
  'scripts/verify-profile-map-exact-v2.13.40.mjs',
  'scripts/verify-origin-attribute-coordinates-v2.13.41.mjs',
  'scripts/verify-variety-map-profile-return.mjs'
]) patchVerifierVersion(rel);

console.log(`\nCaneSprout ${TARGET_VERSION} collection-card print patch applied.`);
console.log('  - Print action is now visible directly on every germplasm collection card');
console.log('  - Core Information and Complete Information choices are available from the card');
console.log('  - Print clicks do not accidentally open the profile modal');
console.log('  - Full record details are fetched before either printable format opens');
console.log('  - Existing Print action inside the opened profile remains unchanged');
console.log('\nNext: npm.cmd run verify:profile-card-print && npm.cmd run build\n');
