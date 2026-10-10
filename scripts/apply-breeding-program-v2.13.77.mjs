import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const payloadRoot = path.join(root, 'v21377-breeding-program-payload');
const TARGET_VERSION = '2.13.77';
const ALLOWED_BASES = new Set(['2.13.76', TARGET_VERSION]);

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

function updateVersionConstant(relative, constantName) {
  if (!exists(relative)) return;
  let source = read(relative);
  const re = new RegExp(`const\\s+${constantName}\\s*=\\s*['"][^'"]+['"]\\s*;`);
  if (!re.test(source)) return;
  source = source.replace(re, `const ${constantName} = '${TARGET_VERSION}';`);
  write(relative, source);
}

for (const required of [
  'package.json',
  'src/App.jsx',
  'src/lib/appwrite.js',
  'src/styles.css',
  'src/components/DesktopPrimaryNav.jsx'
]) {
  if (!exists(required)) throw new Error(`Required project file is missing: ${required}`);
}

const pkg = JSON.parse(read('package.json'));
const current = String(pkg.version || '');
if (!ALLOWED_BASES.has(current)) {
  throw new Error(
    `This patch expects CaneSprout 2.13.76. Current package version is ${current || 'unknown'}.`
  );
}

/* Copy new implementation files and bundled user sources. */
for (const relative of [
  'src/components/DesktopPrimaryNav.jsx',
  'src/components/BreedingProgramModal.jsx',
  'src/lib/breedingProgramApi.js',
  'src/lib/varietyBrochure.js',
  'scripts/setup-breeding-program-v2.13.77.mjs',
  'scripts/verify-breeding-program-v2.13.77.mjs',
  'public/breeding-program/protocols/SCB-GC-SOP-01_Germplasm_Passport_Data_Management.pdf',
  'public/breeding-program/protocols/SCB-GC-SOP-02_Sugarcane_Germplasm_Characterization.pdf',
  'public/breeding-program/protocols/SCB-BR-SOP-03_Crossing_Block_Layout_and_Management.pdf',
  'public/breeding-program/protocols/SCB-GC-SOP-04_Germplasm_Field_Layout_and_Conservation.pdf',
  'public/breeding-program/protocols/SCB-BR-SOP-05_Single_Seedling_Plot_Test.pdf',
  'public/breeding-program/protocols/SCB-BR-SOP-06_Controlled_Pollination_and_Hybridization.pdf',
  'public/breeding-program/research/Research_Archive_1980-2017.xlsx'
]) copy(relative);

/* Appwrite configuration */
let appwrite = read('src/lib/appwrite.js');

if (!appwrite.includes('export const BREEDING_BUCKET_ID')) {
  const bucketAnchor = "export const MEDIA_BUCKET_ID = String(import.meta.env.VITE_APPWRITE_MEDIA_BUCKET_ID || 'germ-media').trim();";
  if (!appwrite.includes(bucketAnchor)) throw new Error('Could not locate MEDIA_BUCKET_ID in src/lib/appwrite.js.');
  appwrite = appwrite.replace(
    bucketAnchor,
    `${bucketAnchor}\nexport const BREEDING_BUCKET_ID = String(import.meta.env.VITE_APPWRITE_BREEDING_BUCKET_ID || 'breeding-program').trim();`
  );
}

if (!appwrite.includes("breedingDocuments: 'breeding_program_documents'")) {
  const collectionAnchor = "  combinations: 'sugarcane_combination_registry'";
  if (!appwrite.includes(collectionAnchor)) throw new Error('Could not locate Appwrite COLLECTIONS map.');
  appwrite = appwrite.replace(
    collectionAnchor,
    `${collectionAnchor},\n  breedingDocuments: 'breeding_program_documents'`
  );
}
write('src/lib/appwrite.js', appwrite);

/* App integration */
let app = read('src/App.jsx');

if (!app.includes("const BreedingProgramModal = lazy(() => import('./components/BreedingProgramModal.jsx'));")) {
  const lazyAnchor = "const VarietyMapModal = lazy(() => import('./components/VarietyMapModal.jsx'));";
  if (!app.includes(lazyAnchor)) throw new Error('Could not locate lazy modal imports in App.jsx.');
  app = app.replace(
    lazyAnchor,
    `${lazyAnchor}\nconst BreedingProgramModal = lazy(() => import('./components/BreedingProgramModal.jsx'));`
  );
}

if (!app.includes('const [showBreedingProgram, setShowBreedingProgram] = useState(false);')) {
  const stateAnchor = '  const [showMap, setShowMap] = useState(false);';
  if (!app.includes(stateAnchor)) throw new Error('Could not locate showMap state.');
  app = app.replace(
    stateAnchor,
    `${stateAnchor}\n  const [showBreedingProgram, setShowBreedingProgram] = useState(false);`
  );
}

/* Mobile toolbar entry after Combination Registry. */
if (!app.includes('<strong>Breeding Program</strong>')) {
  const mobileCombination = `              <button type="button" onClick={() => { setMobileToolbarOpen(false); setShowExcelMenu(false); setShowForm(false); setEditRecord(null); setShowAdminCenter(false); setShowOfflineQueue(false); setShowImport(false); setShowExportExcel(false); setShowSpreadsheetEditor(false); setShowCombinationRegistry(true); }}>
                <Dna size={20} />
                <span><strong>Combination Registry</strong><small>Search and record male × female crosses</small></span>
              </button>`;

  const mobileBreeding = `${mobileCombination}
              <button type="button" onClick={() => { setMobileToolbarOpen(false); setShowExcelMenu(false); setShowForm(false); setEditRecord(null); setShowAdminCenter(false); setShowOfflineQueue(false); setShowImport(false); setShowExportExcel(false); setShowSpreadsheetEditor(false); setShowCombinationRegistry(false); setShowPedigree(false); setShowMap(false); setShowBreedingProgram(true); }}>
                <Sprout size={20} />
                <span><strong>Breeding Program</strong><small>SOPs, research archive, and variety brochures</small></span>
              </button>`;

  if (!app.includes(mobileCombination)) throw new Error('Could not locate mobile Combination Registry tool.');
  app = app.replace(mobileCombination, mobileBreeding);
}

/* Desktop primary navigation active props. */
app = app.replace(
  "germplasmActive={!showImport && !showExcelMenu && !showExportExcel && !showSpreadsheetEditor && !showForm && !showAdminCenter && !showCombinationRegistry && !showPedigree && !showMap}",
  "germplasmActive={!showImport && !showExcelMenu && !showExportExcel && !showSpreadsheetEditor && !showForm && !showAdminCenter && !showCombinationRegistry && !showPedigree && !showMap && !showBreedingProgram}"
);

app = app.replace(
  "toolsActive={showExcelMenu || showImport || showExportExcel || showSpreadsheetEditor || showForm || showCombinationRegistry || showAdminCenter}",
  "toolsActive={showExcelMenu || showImport || showExportExcel || showSpreadsheetEditor || showForm || showCombinationRegistry || showBreedingProgram || showAdminCenter}"
);

if (!app.includes('breedingProgramActive={showBreedingProgram}')) {
  const activeAnchor = '          combinationActive={showCombinationRegistry}';
  if (!app.includes(activeAnchor)) throw new Error('Could not locate DesktopPrimaryNav combinationActive prop.');
  app = app.replace(
    activeAnchor,
    `${activeAnchor}\n          breedingProgramActive={showBreedingProgram}`
  );
}

if (!app.includes('onBreedingProgram={() =>')) {
  const adminCallbackAnchor = `          onAdminCenter={() => {
            setShowExcelMenu(false);
            setShowCombinationRegistry(false);
            openAdminCenter('approvals');
          }}`;

  const breedingCallback = `          onBreedingProgram={() => {
            setShowExcelMenu(false);
            setShowForm(false);
            setEditRecord(null);
            setShowAdminCenter(false);
            setShowOfflineQueue(false);
            setShowImport(false);
            setShowExportExcel(false);
            setShowSpreadsheetEditor(false);
            setShowCombinationRegistry(false);
            setShowPedigree(false);
            setShowMap(false);
            setShowBreedingProgram(true);
          }}
${adminCallbackAnchor}`;

  if (!app.includes(adminCallbackAnchor)) throw new Error('Could not locate DesktopPrimaryNav Admin callback.');
  app = app.replace(adminCallbackAnchor, breedingCallback);
}

/* Make major section switches close Breeding Program when they are used. */
const closeInsertions = [
  ['            setShowMap(false);\n            goToGermplasmCollection();', '            setShowMap(false);\n            setShowBreedingProgram(false);\n            goToGermplasmCollection();'],
  ['            setShowMap(false);\n            setPedigreeInitialVariety', '            setShowMap(false);\n            setShowBreedingProgram(false);\n            setPedigreeInitialVariety'],
  ['            setShowPedigree(false);\n            setShowMap(true);', '            setShowPedigree(false);\n            setShowBreedingProgram(false);\n            setShowMap(true);'],
  ['            setShowOfflineQueue(false);\n            setShowExcelMenu(true);', '            setShowOfflineQueue(false);\n            setShowBreedingProgram(false);\n            setShowExcelMenu(true);'],
  ['            setShowCombinationRegistry(false);\n            setEditRecord(null);\n            setShowForm(true);', '            setShowCombinationRegistry(false);\n            setShowBreedingProgram(false);\n            setEditRecord(null);\n            setShowForm(true);'],
  ['            setShowSpreadsheetEditor(false);\n            setShowCombinationRegistry(true);', '            setShowSpreadsheetEditor(false);\n            setShowBreedingProgram(false);\n            setShowCombinationRegistry(true);']
];
for (const [from, to] of closeInsertions) {
  if (app.includes(from)) app = app.replace(from, to);
}

/* Modal rendering */
if (!app.includes('{showBreedingProgram && <BreedingProgramModal')) {
  const modalAnchor = `        {showMap && !desktopMode && <VarietyMapModal onClose={() => setShowMap(false)} onOpenProfile={(recordId) => { setDetailId(recordId); }} />}`;
  if (!app.includes(modalAnchor)) throw new Error('Could not locate VarietyMapModal render.');
  app = app.replace(
    modalAnchor,
    `${modalAnchor}
        {showBreedingProgram && <BreedingProgramModal actor={user} isAdmin={isAdmin} online={online} toolbarBottom={toolbarBottom} onClose={() => setShowBreedingProgram(false)} />}`
  );
}

app = app.replace(
  /const APP_VERSION = ['"][^'"]+['"];/,
  `const APP_VERSION = '${TARGET_VERSION}';`
);
write('src/App.jsx', app);

/* Append styles once. */
let styles = read('src/styles.css');
if (!styles.includes('v2.13.77 BREEDING PROGRAM')) {
  const extra = fs.readFileSync(path.join(payloadRoot, 'styles-v2.13.77.css'), 'utf8');
  styles = `${styles.trimEnd()}\n\n${extra.trim()}\n`;
  write('src/styles.css', styles);
}

/* Package scripts/version. */
pkg.version = TARGET_VERSION;
pkg.scripts ||= {};
pkg.scripts['setup:breeding-program'] = 'node scripts/setup-breeding-program-v2.13.77.mjs';
pkg.scripts['verify:breeding-program'] = 'node scripts/verify-breeding-program-v2.13.77.mjs';
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

if (exists('package-lock.json')) {
  const lock = JSON.parse(read('package-lock.json'));
  lock.version = TARGET_VERSION;
  if (lock.packages?.['']) lock.packages[''].version = TARGET_VERSION;
  write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
}

updateVersionConstant('src/lib/offlineApp.js', 'OFFLINE_VERSION');

if (exists('public/version.json')) {
  const info = JSON.parse(read('public/version.json'));
  info.version = TARGET_VERSION;
  info.notes =
    'Adds a Breeding Program workspace with six bundled SOPs, administrator-managed shared protocol/research uploads, the 1980-2017 research archive workbook, and an improved core-data variety brochure.';
  info.updated = '2026-10-10';
  write('public/version.json', `${JSON.stringify(info, null, 2)}\n`);
}

if (exists('public/sw.js')) {
  let sw = read('public/sw.js');
  sw = sw.replace(/2\.13\.76/g, TARGET_VERSION);
  write('public/sw.js', sw);
}

console.log('');
console.log('CaneSprout v2.13.77 Breeding Program installed.');
console.log('  - 6 bundled SOP PDFs');
console.log('  - Historical Research Archive Excel workbook (1980-2017)');
console.log('  - Searchable Research Archive UI');
console.log('  - Administrator shared document upload library');
console.log('  - Improved Variety Brochure core-data layout');
console.log('');
console.log('Next run:');
console.log('  npm.cmd run verify:breeding-program');
console.log('  npm.cmd run build');
console.log('');
console.log('Optional one-time cloud upload setup (administrator):');
console.log('  npm.cmd run setup:breeding-program');
console.log('');
