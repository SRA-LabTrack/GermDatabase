import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const payloadRoot = path.join(root, 'v21351-breeding-reports-payload');
const allowedBases = new Set(['2.13.49', '2.13.50', '2.13.51']);
const targetVersion = '2.13.51';

function read(pathname) {
  return fs.readFileSync(path.join(root, pathname), 'utf8');
}
function write(pathname, content) {
  const full = path.join(root, pathname);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}
function copyPayload(relative) {
  const source = path.join(payloadRoot, relative);
  if (!fs.existsSync(source)) throw new Error(`Patch payload is missing ${relative}. Re-extract the ZIP into the project root.`);
  const destination = path.join(root, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}
function replaceOnce(content, search, replacement, label) {
  const first = content.indexOf(search);
  if (first < 0) throw new Error(`Could not locate ${label}. The project files differ from the expected CaneSprout layout.`);
  return content.slice(0, first) + replacement + content.slice(first + search.length);
}

const packagePath = 'package.json';
const pkg = JSON.parse(read(packagePath));
const current = String(pkg.version || '');
if (!allowedBases.has(current)) {
  throw new Error(`This patch expects CaneSprout 2.13.49 or 2.13.50. Current package version is ${current || 'unknown'}.`);
}

copyPayload('src/lib/breedingReports.js');
copyPayload('src/components/BreedingReportsPanel.jsx');

let combo = read('src/components/CombinationRegistryModal.jsx');

if (!combo.includes("import BreedingReportsPanel from './BreedingReportsPanel.jsx';")) {
  combo = replaceOnce(
    combo,
    "import SugarcaneIcon from './SugarcaneIcon.jsx';",
    "import SugarcaneIcon from './SugarcaneIcon.jsx';\nimport BreedingReportsPanel from './BreedingReportsPanel.jsx';",
    'Combination Registry SugarcaneIcon import'
  );
}

if (!combo.includes("const [showBreedingReports, setShowBreedingReports] = useState(false);")) {
  combo = replaceOnce(
    combo,
    "  const [manageOpen, setManageOpen] = useState(false);",
    "  const [manageOpen, setManageOpen] = useState(false);\n  const [showBreedingReports, setShowBreedingReports] = useState(false);",
    'Combination Registry manageOpen state'
  );
}

if (!combo.includes('>Breeding reports</span></button>')) {
  const closeButton = '            <button type="button" className="secondary-button combination-close-button" onClick={onClose} aria-label="Close Combination Registry"><X size={18} /><span>Close</span></button>';
  combo = replaceOnce(
    combo,
    closeButton,
    '            <button type="button" className={`secondary-button compact combination-report-button ${showBreedingReports ? \'active\' : \'\'}`} onClick={() => setShowBreedingReports(true)}><CalendarDays size={16} /><span>Breeding reports</span></button>\n' + closeButton,
    'Combination Registry close button'
  );
}

if (!combo.includes('<BreedingReportsPanel actor={actor}')) {
  combo = replaceOnce(
    combo,
    '        <div className="modal-content combination-registry-content">',
    '        {showBreedingReports && <BreedingReportsPanel actor={actor} isAdmin={isAdmin} online={navigator.onLine} onClose={() => setShowBreedingReports(false)} />}\n\n        <div className="modal-content combination-registry-content">',
    'Combination Registry modal content'
  );
}

write('src/components/CombinationRegistryModal.jsx', combo);

let styles = read('src/styles.css');
const cssMarker = '/* v2.13.51 Breeding Reports */';
if (!styles.includes(cssMarker)) {
  const css = read('v21351-breeding-reports-payload/styles-v2.13.51.css');
  styles = `${styles.trimEnd()}\n\n${css.trim()}\n`;
  write('src/styles.css', styles);
}

pkg.version = targetVersion;
pkg.scripts = pkg.scripts || {};
pkg.scripts['verify:breeding-reports'] = 'node scripts/verify-breeding-reports-v2.13.51.mjs';
write(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);

if (fs.existsSync(path.join(root, 'public/version.json'))) {
  const version = JSON.parse(read('public/version.json'));
  version.version = targetVersion;
  version.channel = version.channel || 'stable';
  version.notes = 'Adds weekly, monthly, quarterly, and annual breeding reports with an optional technical report section.';
  version.updated = '2026-09-20';
  write('public/version.json', `${JSON.stringify(version, null, 2)}\n`);
}

if (fs.existsSync(path.join(root, 'public/sw.js'))) {
  let sw = read('public/sw.js');
  sw = sw.replace(/canesprout-(?:static|shell|cache)-v[\w.-]+/g, (match) => {
    const prefix = match.replace(/v[\w.-]+$/, '');
    return `${prefix}v2.13.51`;
  });
  sw = sw.replace(/2\.13\.(?:49|50)/g, '2.13.51');
  write('public/sw.js', sw);
}

copyPayload('scripts/verify-breeding-reports-v2.13.51.mjs');

console.log('');
console.log('CaneSprout v2.13.51 Breeding Reports installed.');
console.log('Run:');
console.log('  npm.cmd run verify:breeding-reports');
console.log('  npm.cmd run build');
console.log('');
