import fs from 'node:fs';

function read(path) { return fs.readFileSync(path, 'utf8'); }
function check(condition, label) {
  if (!condition) {
    console.error(`FAIL  ${label}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS  ${label}`);
  }
}

const pkg = JSON.parse(read('package.json'));
const app = read('src/App.jsx');
const nav = read('src/components/DesktopPrimaryNav.jsx');
const modal = read('src/components/BreedingProgramModal.jsx');
const api = read('src/lib/breedingProgramApi.js');
const brochure = read('src/lib/varietyBrochure.js');
const appwrite = read('src/lib/appwrite.js');
const css = read('src/styles.css');

console.log('\nCaneSprout v2.13.77 Breeding Program Verification\n');

check(pkg.version === '2.13.77', 'Version is 2.13.77');
check(pkg.scripts?.['verify:breeding-program'], 'Breeding Program verifier npm script exists');
check(pkg.scripts?.['setup:breeding-program'], 'Breeding Program Appwrite setup npm script exists');

check(app.includes("const BreedingProgramModal = lazy(() => import('./components/BreedingProgramModal.jsx'));"), 'Breeding Program modal is lazy-loaded');
check(app.includes('const [showBreedingProgram, setShowBreedingProgram] = useState(false);'), 'Breeding Program state exists');
check(app.includes('<BreedingProgramModal'), 'Breeding Program modal is rendered by App');
check(app.includes('breedingProgramActive={showBreedingProgram}'), 'Desktop Tools active state includes Breeding Program');
check(app.includes('onBreedingProgram={() =>'), 'Desktop Tools can open Breeding Program');
check(app.includes('<strong>Breeding Program</strong>'), 'Mobile toolbar contains Breeding Program entry');

check(nav.includes('<strong>Breeding Program</strong>'), 'Desktop Tools menu contains Breeding Program entry');
check(nav.includes('onBreedingProgram'), 'Desktop Tools callback is wired');

check(modal.includes('SOP & Protocols'), 'SOP and Protocols tab exists');
check(modal.includes('Research Archive'), 'Research Archive tab exists');
check(modal.includes('Variety Brochure'), 'Variety Brochure tab exists');
check(modal.includes('SCB-GC-SOP-01'), 'Bundled Passport Data protocol is registered');
check(modal.includes('SCB-GC-SOP-02'), 'Bundled Characterization protocol is registered');
check(modal.includes('SCB-BR-SOP-03'), 'Bundled Crossing Block protocol is registered');
check(modal.includes('SCB-GC-SOP-04'), 'Bundled Field Layout protocol is registered');
check(modal.includes('SCB-BR-SOP-05'), 'Bundled SSPT protocol is registered');
check(modal.includes('SCB-BR-SOP-06'), 'Bundled Pollination protocol is registered');
check(modal.includes("await import('xlsx')"), 'Research Archive parses the bundled Excel workbook');
check(modal.includes('Research_Archive_1980-2017.xlsx'), 'Historical research workbook is linked');
check(modal.includes('uploadBreedingProgramDocument'), 'Administrator document upload is wired');
check(modal.includes('deleteBreedingProgramDocument'), 'Administrator document deletion is wired');
check(modal.includes('openVarietyBrochure(selected)'), 'Variety brochure printable preview is wired');

check(api.includes('BREEDING_BUCKET_ID'), 'Shared Breeding Program storage bucket is used');
check(api.includes('COLLECTIONS.breedingDocuments'), 'Shared Breeding Program document collection is used');
check(api.includes('Permission.read(Role.users())'), 'Uploaded documents are readable by signed-in users');
check(api.includes('Permission.update(Role.label(ADMIN_LABEL))'), 'Uploaded documents stay administrator-controlled');

check(appwrite.includes("export const BREEDING_BUCKET_ID"), 'Appwrite exports Breeding Program bucket ID');
check(appwrite.includes("breedingDocuments: 'breeding_program_documents'"), 'Appwrite collection map includes Breeding Program documents');

check(brochure.includes('Variety Brochure'), 'Printable brochure helper exists');
check(brochure.includes('Parentage'), 'Brochure presents core parentage');
check(brochure.includes('Yield Potential'), 'Brochure presents core yield data');
check(brochure.includes('Recommended / Tested Locations'), 'Brochure presents recommended/tested locations');

check(css.includes('v2.13.77 BREEDING PROGRAM'), 'Breeding Program styles are installed');
check(css.includes('.protocol-card-grid'), 'Protocol card layout is installed');
check(css.includes('.research-card-list'), 'Research Archive layout is installed');
check(css.includes('.brochure-preview'), 'Variety brochure preview layout is installed');

const bundled = [
  'public/breeding-program/protocols/SCB-GC-SOP-01_Germplasm_Passport_Data_Management.pdf',
  'public/breeding-program/protocols/SCB-GC-SOP-02_Sugarcane_Germplasm_Characterization.pdf',
  'public/breeding-program/protocols/SCB-BR-SOP-03_Crossing_Block_Layout_and_Management.pdf',
  'public/breeding-program/protocols/SCB-GC-SOP-04_Germplasm_Field_Layout_and_Conservation.pdf',
  'public/breeding-program/protocols/SCB-BR-SOP-05_Single_Seedling_Plot_Test.pdf',
  'public/breeding-program/protocols/SCB-BR-SOP-06_Controlled_Pollination_and_Hybridization.pdf',
  'public/breeding-program/research/Research_Archive_1980-2017.xlsx'
];

for (const path of bundled) {
  check(fs.existsSync(path) && fs.statSync(path).size > 0, `Bundled source exists: ${path}`);
}

if (!process.exitCode) console.log('\n46/46 checks passed.\n');
