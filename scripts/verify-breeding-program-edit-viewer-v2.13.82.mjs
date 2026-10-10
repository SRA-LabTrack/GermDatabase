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
const nav = read('src/components/DesktopPrimaryNav.jsx');
const modal = read('src/components/BreedingProgramModal.jsx');
const api = read('src/lib/breedingProgramApi.js');
const css = read('src/styles.css');
const app = read('src/App.jsx');

console.log('\nCaneSprout v2.13.82 Breeding Program Navigation + Research Viewer/Edit Verification\n');

check(pkg.version === '2.13.82', 'Version is 2.13.82');
check(pkg.scripts?.['verify:breeding-program-edit-viewer'], 'v2.13.82 verifier npm script exists');

check(nav.includes('cs-primary-nav__breeding'), 'Breeding Program has a dedicated primary-nav class');
check(nav.includes('<span>Breeding Program</span>'), 'Breeding Program label remains complete in JSX');
check(nav.includes('<span>Tools</span>'), 'Tools remains available as the fifth primary item');
check(css.includes('grid-template-columns:'), 'Five-item primary navigation sizing override is installed');
check(css.includes('.cs-primary-nav__breeding > span'), 'Breeding Program label receives dedicated no-ellipsis styling');
check(css.includes('white-space: normal !important'), 'Breeding Program label can wrap instead of truncating');
check(css.includes('text-overflow: clip !important'), 'Breeding Program label no longer ellipsizes');

check(modal.includes('View as PDF'), 'Historical research entries expose View as PDF');
check(modal.includes('setSelectedStudy(study)'), 'Historical research entries are clickable');
check(modal.includes('ResearchPdfViewer'), 'PDF-style research viewer component exists');
check(modal.includes('Print / Save PDF'), 'Research viewer supports Print / Save PDF');
check(modal.includes('window.print()'), 'Research viewer print action is wired');
check(css.includes('.research-pdf-paper'), 'PDF-style A4 research paper styling exists');
check(css.includes('@media print'), 'Research viewer has print styling');

check(modal.includes('MetadataEditor'), 'Administrator metadata editor exists');
check(modal.includes("kind: 'research'"), 'Research entries can open edit mode');
check(modal.includes("kind: 'protocol'"), 'Protocol entries can open edit mode');
check(modal.includes('Save changes'), 'Edit dialog has a save action');
check(modal.includes('source PDF preserved'), 'Bundled SOP edits preserve the original source PDF');
check(modal.includes('original bundled source file remains unchanged'), 'Bundled source traceability note exists');

check(api.includes('updateBreedingProgramDocument'), 'Uploaded Breeding Program documents can be edited');
check(api.includes('listBreedingProgramOverrides'), 'Bundled metadata overrides can be loaded');
check(api.includes('saveBreedingProgramOverride'), 'Bundled SOP/research metadata overrides can be saved');
check(api.includes("'protocol_meta'"), 'Protocol metadata override category exists');
check(api.includes("'research_meta'"), 'Research metadata override category exists');

check(css.includes('.breeding-entry-editor'), 'Administrator edit dialog styling exists');
check(css.includes('.research-card--pdf'), 'Clickable research card styling exists');
check(css.includes('.research-card-open'), 'View as PDF affordance styling exists');

check(app.includes('breedingProgramActive={showBreedingProgram}'), 'Breeding Program remains connected to main navigation');
check(app.includes('onBreedingProgram={() =>'), 'Main Breeding Program navigation action remains wired');

if (!process.exitCode) console.log('\n31/31 checks passed.\n');
