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
const css = read('src/styles.css');
const app = read('src/App.jsx');

console.log('\nCaneSprout v2.13.84 Main Tools Navigation Verification\n');

check(pkg.version === '2.13.84', 'Version is 2.13.84');
check(pkg.scripts?.['verify:main-tools-nav'], 'Main Tools verifier npm script exists');

check(nav.includes('cs-primary-nav cs-primary-nav--five'), 'Primary navigation explicitly uses five sections');
check(nav.includes('<span>Germplasm</span>'), 'Germplasm section exists');
check(nav.includes('<span>Pedigree</span>'), 'Pedigree section exists');
check(nav.includes('<span>Map</span>'), 'Map section exists');
check(nav.includes('<span>Breeding Program</span>'), 'Breeding Program section exists');
check(nav.includes('<span>Tools</span>'), 'Tools section exists');

check(nav.includes('<strong>Excel Tools</strong>'), 'Tools contains Excel Tools');
check(nav.includes('<strong>Add Record</strong>'), 'Tools contains Add Record');
check(nav.includes('<strong>Combination Registry</strong>'), 'Tools contains Combination Registry');
check(nav.includes('<strong>Admin Center</strong>'), 'Tools contains Admin Center for administrators');

const toolsMenuStart = nav.indexOf('const toolsMenu');
const toolsMenuEnd = nav.indexOf('return (', toolsMenuStart);
const toolsMenu = nav.slice(toolsMenuStart, toolsMenuEnd);
check(!toolsMenu.includes('Breeding Program'), 'Breeding Program is not inside Tools');

check(nav.includes('createPortal'), 'Tools dropdown still renders through a portal');
check(nav.includes('setToolsOpen((open) => !open)'), 'Tools button opens and closes dropdown');
check(nav.includes("event.key !== 'Escape'"), 'Escape can close Tools dropdown');
check(nav.includes('handlePointerDown'), 'Outside click closes Tools dropdown');

check(css.includes('v2.13.84 RESTORE TOOLS AS FIFTH MAIN NAVIGATION SECTION'), 'v2.13.84 navigation styles are installed');
check(css.includes('grid-template-columns: repeat(5, minmax(0, 1fr))'), 'Five sections share available width equally');
check(css.includes('nth-child(5)'), 'Fifth Tools cell is explicitly pinned');
check(css.includes('.cs-primary-nav__tools'), 'Tools visibility override exists');
check(css.includes('display: flex !important'), 'Tools cell is forcibly visible');
check(css.includes('pointer-events: auto !important'), 'Tools remains clickable');
check(css.includes('.cs-tools-popover'), 'Tools dropdown styling remains installed');

check(app.includes('onBreedingProgram={() =>'), 'Breeding Program action remains wired from App');
check(app.includes('onExcelTools='), 'Excel Tools action remains wired from App');
check(app.includes('onAddRecord='), 'Add Record action remains wired from App');
check(app.includes('onCombinationRegistry='), 'Combination Registry action remains wired from App');
check(app.includes('onAdminCenter='), 'Admin Center action remains wired from App');

if (!process.exitCode) console.log('\n29/29 checks passed.\n');
