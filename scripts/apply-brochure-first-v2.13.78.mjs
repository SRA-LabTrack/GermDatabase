import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const payloadRoot = path.join(root, 'v21378-brochure-first-payload');
const TARGET_VERSION = '2.13.78';
const ALLOWED_BASES = new Set(['2.13.77', TARGET_VERSION]);

function file(relative) { return path.join(root, relative); }
function exists(relative) { return fs.existsSync(file(relative)); }
function read(relative) { return fs.readFileSync(file(relative), 'utf8'); }
function write(relative, content) {
  const full = file(relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}
function copy(relative) {
  const source = path.join(payloadRoot, relative);
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

for (const required of [
  'package.json',
  'src/App.jsx',
  'src/styles.css',
  'src/lib/photoSections.js',
  'src/lib/varietyBrochure.js'
]) {
  if (!exists(required)) throw new Error(`Required project file is missing: ${required}`);
}

const pkg = JSON.parse(read('package.json'));
const current = String(pkg.version || '');
if (!ALLOWED_BASES.has(current)) {
  throw new Error(`This patch expects CaneSprout 2.13.77. Current package version is ${current || 'unknown'}.`);
}

/* Install replacements/new files. */
for (const relative of [
  'src/lib/photoSections.js',
  'src/lib/varietyBrochure.js',
  'src/components/VarietyBrochureModal.jsx',
  'scripts/verify-brochure-first-v2.13.78.mjs'
]) copy(relative);

/* Integrate the brochure-first flow. */
let app = read('src/App.jsx');

if (!app.includes("const VarietyBrochureModal = lazy(() => import('./components/VarietyBrochureModal.jsx'));")) {
  const anchor = "const BreedingProgramModal = lazy(() => import('./components/BreedingProgramModal.jsx'));";
  const fallback = "const VarietyMapModal = lazy(() => import('./components/VarietyMapModal.jsx'));";
  const target = app.includes(anchor) ? anchor : fallback;
  if (!app.includes(target)) throw new Error('Could not locate lazy modal import anchor in App.jsx.');
  app = app.replace(target, `${target}\nconst VarietyBrochureModal = lazy(() => import('./components/VarietyBrochureModal.jsx'));`);
}

if (!app.includes("const [brochureId, setBrochureId] = useState('');")) {
  const stateAnchor = "  const [detailId, setDetailId] = useState('');";
  if (!app.includes(stateAnchor)) throw new Error('Could not locate detailId state.');
  app = app.replace(stateAnchor, `${stateAnchor}\n  const [brochureId, setBrochureId] = useState('');`);
}

app = app.replace(
  'aria-label={`Open ${record.variety || \'unnamed variety\'} profile`}',
  'aria-label={`Open ${record.variety || \'unnamed variety\'} brochure`}'
);

app = app.replace(
  'Preview only. Open the profile for complete characterization data.',
  'Brochure preview available. Expand the brochure for complete characterization data.'
);

app = app.replace(
  '>View Profile <ArrowUpRight size={16} /></button>',
  '>View Brochure <ArrowUpRight size={16} /></button>'
);

app = app.replace(
  'onOpen={setDetailId}',
  'onOpen={setBrochureId}'
);

if (!app.includes('{brochureId && <VarietyBrochureModal')) {
  const suspenseAnchor = `        {detailId && <DetailModal recordId={detailId}`;
  const index = app.indexOf(suspenseAnchor);
  if (index < 0) throw new Error('Could not locate DetailModal render in App.jsx.');
  const insertion = `        {brochureId && <VarietyBrochureModal recordId={brochureId} onClose={() => setBrochureId('')} onExpandDetails={(recordId) => setDetailId(recordId)} />}\n`;
  app = app.slice(0, index) + insertion + app.slice(index);
}

/* Clear brochure state when opening editing directly from the full profile. */
app = app.replace(
  "  async function openEdit(record) {\n    setDetailId('');",
  "  async function openEdit(record) {\n    setDetailId('');\n    setBrochureId('');"
);

app = app.replace(
  /const APP_VERSION = ['"][^'"]+['"];/,
  `const APP_VERSION = '${TARGET_VERSION}';`
);
write('src/App.jsx', app);

/* Append styles once. */
let css = read('src/styles.css');
if (!css.includes('v2.13.78 BROCHURE-FIRST GERMPLASM COLLECTION')) {
  const extra = fs.readFileSync(path.join(payloadRoot, 'styles-v2.13.78.css'), 'utf8');
  css = `${css.trimEnd()}\n\n${extra.trim()}\n`;
  write('src/styles.css', css);
}

/* Version + verifier */
pkg.version = TARGET_VERSION;
pkg.scripts ||= {};
pkg.scripts['verify:brochure-first'] = 'node scripts/verify-brochure-first-v2.13.78.mjs';
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

if (exists('package-lock.json')) {
  const lock = JSON.parse(read('package-lock.json'));
  lock.version = TARGET_VERSION;
  if (lock.packages?.['']) lock.packages[''].version = TARGET_VERSION;
  write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
}

if (exists('src/lib/offlineApp.js')) {
  let offline = read('src/lib/offlineApp.js');
  offline = offline.replace(/const\s+OFFLINE_VERSION\s*=\s*['"][^'"]+['"]\s*;/, `const OFFLINE_VERSION = '${TARGET_VERSION}';`);
  write('src/lib/offlineApp.js', offline);
}

if (exists('public/version.json')) {
  const info = JSON.parse(read('public/version.json'));
  info.version = TARGET_VERSION;
  info.notes = 'Germplasm Collection cards now open a reference-style variety brochure first, with whole-variety, stalk, and eye/bud photo slots, N/A for missing part photos, and an Expand Full Details action.';
  info.updated = '2026-10-10';
  write('public/version.json', `${JSON.stringify(info, null, 2)}\n`);
}

if (exists('public/sw.js')) {
  let sw = read('public/sw.js');
  sw = sw.replace(/2\.13\.77/g, TARGET_VERSION);
  write('public/sw.js', sw);
}

console.log('');
console.log('CaneSprout v2.13.78 brochure-first Germplasm Collection installed.');
console.log('  - Clicking a variety card opens its brochure first.');
console.log('  - Brochure has whole-variety, stalk, and eye/bud photo slots.');
console.log('  - Missing part photos show N/A instead of substituting another image.');
console.log('  - New uploads can be categorized as Stalk, Eye/Bud, Leaf/Sheath, or Overview.');
console.log('  - Expand Full Details opens the existing complete profile over the brochure.');
console.log('');
console.log('Run:');
console.log('  npm.cmd run verify:brochure-first');
console.log('  npm.cmd run build');
console.log('');
