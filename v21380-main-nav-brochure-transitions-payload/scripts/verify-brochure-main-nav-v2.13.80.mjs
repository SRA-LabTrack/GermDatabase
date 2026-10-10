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
const css = read('src/styles.css');

console.log('\nCaneSprout v2.13.80 Main Breeding Program + Brochure Transitions Verification\n');

check(pkg.version === '2.13.80', 'Version is 2.13.80');
check(pkg.scripts?.['verify:brochure-main-nav'], 'v2.13.80 verifier npm script exists');

check(nav.includes('cs-primary-nav cs-primary-nav--five'), 'Primary navigation is explicitly five-section');
check(nav.includes('<span>Breeding Program</span>'), 'Breeding Program is a top-level primary navigation item');
check(nav.includes('onClick={onBreedingProgram}'), 'Top-level Breeding Program action is wired');
check(nav.includes('BookOpenText size={22}'), 'Breeding Program has a dedicated main-nav icon');

const toolMenuPart = nav.slice(nav.indexOf('const toolsMenu'), nav.indexOf('return ('));
check(!toolMenuPart.includes('<strong>Breeding Program</strong>'), 'Breeding Program is removed from the Tools dropdown');
check(toolMenuPart.includes('<strong>Excel Tools</strong>'), 'Excel Tools remains in Tools');
check(toolMenuPart.includes('<strong>Add record</strong>'), 'Add record remains in Tools');
check(toolMenuPart.includes('<strong>Combination Registry</strong>'), 'Combination Registry remains in Tools');

check(app.includes('breedingProgramActive={showBreedingProgram}'), 'App still controls top-level Breeding Program active state');
check(app.includes('onBreedingProgram={() =>'), 'App still opens the Breeding Program');
check(!app.includes('toolsActive={showExcelMenu || showImport || showExportExcel || showSpreadsheetEditor || showForm || showCombinationRegistry || showBreedingProgram || showAdminCenter}'), 'Breeding Program no longer marks Tools active');
check(app.includes('toolsActive={showExcelMenu || showImport || showExportExcel || showSpreadsheetEditor || showForm || showCombinationRegistry || showAdminCenter}'), 'Tools active state now excludes Breeding Program');

check(css.includes('v2.13.80 MAIN BREEDING PROGRAM NAV + BROCHURE MOTION POLISH'), 'v2.13.80 styles are installed');
check(css.includes('grid-template-columns: repeat(5, minmax(0, 1fr))'), 'Five primary navigation sections share space evenly');
check(css.includes('width: min(1600px, calc(100vw - 8px))'), 'Brochure display is enlarged again');
check(css.includes('width: min(1180px, 100%)'), 'Brochure sheet is enlarged again');
check(css.includes('min-height: 720px'), 'Whole-variety image area is larger');
check(css.includes('@keyframes csBrochureWindowIn'), 'Brochure opening transition exists');
check(css.includes('@keyframes csBrochurePhotoCardIn'), 'Photo-click transition exists');
check(css.includes('@keyframes csBrochureDetailCardIn'), 'Detail-click transition exists');
check(css.includes('@keyframes csFullProfilePanelIn'), 'Full-details page transition exists');
check(css.includes('@keyframes csBreedingProgramPaneIn'), 'Breeding Program tab/page transition exists');
check(css.includes('@media (prefers-reduced-motion: reduce)'), 'Motion accessibility fallback exists');

if (!process.exitCode) console.log('\n25/25 checks passed.\n');
