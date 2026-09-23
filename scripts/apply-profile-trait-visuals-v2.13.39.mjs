import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TARGET_VERSION = '2.13.39';
const EXPECTED_BASE = '2.13.38';

function file(rel) { return path.join(ROOT, rel); }
function read(rel) { return fs.readFileSync(file(rel), 'utf8'); }
function write(rel, content) { fs.mkdirSync(path.dirname(file(rel)), { recursive: true }); fs.writeFileSync(file(rel), content, 'utf8'); }
function exists(rel) { return fs.existsSync(file(rel)); }

function assertFile(rel) {
  if (!exists(rel)) throw new Error(`Required project file is missing: ${rel}`);
}

function patchVersionConstant(rel, constantName) {
  let source = read(rel);
  const re = new RegExp(`const\\s+${constantName}\\s*=\\s*['\"]([^'\"]+)['\"]\\s*;`);
  if (!re.test(source)) throw new Error(`Could not find ${constantName} in ${rel}.`);
  source = source.replace(re, `const ${constantName} = '${TARGET_VERSION}';`);
  write(rel, source);
}

function patchDetailModal() {
  const rel = 'src/components/DetailModal.jsx';
  let source = read(rel);

  if (!source.includes("import TraitValue from './TraitValue.jsx';")) {
    const anchor = "import SugarcaneIcon from './SugarcaneIcon.jsx';";
    if (source.includes(anchor)) {
      source = source.replace(anchor, `${anchor}\nimport TraitValue from './TraitValue.jsx';`);
    } else {
      const firstImportEnd = source.lastIndexOf("\nimport ");
      if (firstImportEnd < 0) throw new Error('Could not find a safe import location in DetailModal.jsx.');
      const lineEnd = source.indexOf('\n', firstImportEnd + 1);
      source = `${source.slice(0, lineEnd + 1)}import TraitValue from './TraitValue.jsx';\n${source.slice(lineEnd + 1)}`;
    }
  }

  const oldValue = "<strong>{shown(record[field.key], 'Not provided')}</strong>";
  const newValue = '<TraitValue fieldKey={field.key} value={record[field.key]} fallback="Not provided" />';

  if (source.includes(oldValue)) {
    source = source.split(oldValue).join(newValue);
  }

  if (!source.includes('TraitValue fieldKey={field.key}')) {
    throw new Error('The DetailModal field renderer did not match the expected v2.13.38 structure. No profile values were changed.');
  }

  write(rel, source);
}

const CSS_MARKER = 'v2.13.39 RHS COLOR VISUALIZATION + LEAF LENGTH SIZE';
const CSS_BLOCK = `\n\n/* ================================================================\n   ${CSS_MARKER}\n   Digital RHS swatches are screen approximations, not replacements\n   for a calibrated physical RHS Colour Chart.\n   ================================================================ */\n.trait-color-value {\n  display: flex;\n  align-items: center;\n  gap: 12px;\n  min-width: 0;\n  flex-wrap: wrap;\n}\n\n.detail-grid .trait-color-value > strong {\n  margin-top: 0;\n  flex: 0 0 auto;\n}\n\n.trait-color-preview {\n  display: inline-flex;\n  align-items: center;\n  gap: 8px;\n  min-width: 112px;\n  padding: 5px 8px 5px 5px;\n  border: 1px solid rgba(53, 84, 63, .14);\n  border-radius: 10px;\n  background: rgba(255,255,255,.72);\n  box-shadow: inset 0 1px 0 rgba(255,255,255,.78), 0 4px 12px rgba(37,75,45,.05);\n}\n\n.trait-color-swatches {\n  display: flex;\n  width: 48px;\n  height: 27px;\n  overflow: hidden;\n  flex: 0 0 48px;\n  border-radius: 7px;\n  border: 1px solid rgba(28, 44, 32, .22);\n  box-shadow: inset 0 0 0 1px rgba(255,255,255,.26);\n}\n\n.trait-color-swatches i {\n  display: block;\n  flex: 1 1 0;\n  min-width: 0;\n}\n\n.trait-color-preview-copy {\n  display: grid;\n  gap: 1px;\n  min-width: 0;\n}\n\n.trait-color-preview-copy b {\n  color: #35543f;\n  font-size: 9px;\n  line-height: 1.1;\n  font-weight: 800;\n  letter-spacing: .025em;\n}\n\n.trait-color-preview-copy small {\n  margin: 0;\n  color: #8a968d;\n  font-size: 6.8px;\n  line-height: 1.05;\n  letter-spacing: .07em;\n  white-space: nowrap;\n}\n\n.detail-grid .trait-length-value {\n  display: flex;\n  align-items: baseline;\n  gap: 6px;\n  flex-wrap: wrap;\n}\n\n.trait-length-value em {\n  color: #5f7c64;\n  font-size: 9px;\n  font-style: normal;\n  font-weight: 850;\n  letter-spacing: .045em;\n}\n\n@media (max-width: 620px) {\n  .trait-color-value { gap: 8px; }\n  .trait-color-preview { min-width: 102px; }\n  .trait-color-swatches { width: 42px; flex-basis: 42px; }\n}\n`;

function patchStyles() {
  const rel = 'src/styles.css';
  let source = read(rel);
  if (!source.includes(CSS_MARKER)) source += CSS_BLOCK;
  write(rel, source);
}

function patchPackageJson() {
  const rel = 'package.json';
  const pkg = JSON.parse(read(rel));
  const current = String(pkg.version || '');
  if (current !== EXPECTED_BASE && current !== TARGET_VERSION) {
    throw new Error(`This patch expects CaneSprout ${EXPECTED_BASE}. Current package version is ${current || 'unknown'}. Apply the v2.13.38 patch first.`);
  }
  pkg.version = TARGET_VERSION;
  pkg.scripts = pkg.scripts || {};
  pkg.scripts['verify:profile-trait-visuals'] = 'node scripts/verify-profile-trait-visuals.mjs';
  write(rel, `${JSON.stringify(pkg, null, 2)}\n`);
}

function patchPackageLock() {
  const rel = 'package-lock.json';
  if (!exists(rel)) return;
  const lock = JSON.parse(read(rel));
  lock.version = TARGET_VERSION;
  if (lock.packages?.['']) lock.packages[''].version = TARGET_VERSION;
  write(rel, `${JSON.stringify(lock, null, 2)}\n`);
}

function patchPublicVersion() {
  const rel = 'public/version.json';
  const info = JSON.parse(read(rel));
  info.version = TARGET_VERSION;
  info.notes = 'Adds RHS coded-color screen swatches beside profile color values and leaf-length SMALL/MEDIUM/LARGE interpretation.';
  info.updated = '2026-09-20';
  write(rel, `${JSON.stringify(info, null, 2)}\n`);
}

function patchServiceWorker() {
  const rel = 'public/sw.js';
  let source = read(rel);
  source = source.replace(/canesprout-offline-v\d+\.\d+\.\d+/g, `canesprout-offline-v${TARGET_VERSION}`);
  write(rel, source);
}

for (const rel of [
  'package.json',
  'src/App.jsx',
  'src/styles.css',
  'src/components/DetailModal.jsx',
  'src/components/TraitValue.jsx',
  'src/lib/traitVisuals.js',
  'src/lib/rhsColorData.js',
  'public/version.json',
  'public/sw.js'
]) assertFile(rel);

patchPackageJson();
patchPackageLock();
patchVersionConstant('src/App.jsx', 'APP_VERSION');
if (exists('src/lib/offlineApp.js')) patchVersionConstant('src/lib/offlineApp.js', 'OFFLINE_VERSION');
patchPublicVersion();
patchServiceWorker();
patchDetailModal();
patchStyles();

console.log(`\nCaneSprout ${TARGET_VERSION} profile trait visualization patch applied.`);
console.log('  - RHS color-code swatches enabled for profile color traits');
console.log('  - Leaf blade length now displays SMALL / MEDIUM / LARGE');
console.log('  - SMALL: 0-100 cm | MEDIUM: >100-150 cm | LARGE: >150 cm');
console.log('  - Version/cache metadata updated');
console.log('\nNext: npm.cmd run verify:profile-trait-visuals && npm.cmd run build\n');
