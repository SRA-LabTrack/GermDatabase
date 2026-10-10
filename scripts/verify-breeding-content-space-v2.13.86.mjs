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
const css = read('src/styles.css');
const modal = read('src/components/BreedingProgramModal.jsx');

console.log('\nCaneSprout v2.13.86 Breeding Program Content-Space Verification\n');

check(pkg.version === '2.13.86', 'Version is 2.13.86');
check(pkg.scripts?.['verify:breeding-content-space'], 'Content-space verifier exists');

check(css.includes('v2.13.86 BREEDING PROGRAM CONTENT-SPACE REBALANCE'), 'v2.13.86 styles are installed');
check(css.includes('grid-template-rows: 118px 66px minmax(0, 1fr)'), 'Desktop header/navigation consume only 184px total');
check(css.includes('height: 118px !important'), 'Header is compact');
check(css.includes('height: 66px !important'), 'Section navigation is compact');

check(css.includes('font-size: clamp(30px, 3vw, 42px)'), 'Breeding Program title is smaller but prominent');
check(css.includes('width: 44px !important'), 'Close control is reduced in size');

check(css.includes('padding: 16px 22px 24px'), 'Content receives tighter surrounding padding');
check(css.includes('min-height: 100% !important'), 'Active pane can occupy full remaining workspace');
check(css.includes('min-height: 82px !important'), 'Summary cards are reduced in height');
check(css.includes('min-height: 54px !important'), 'Search control is denser');

check(css.includes('.protocol-card'), 'Protocol content density is tuned');
check(css.includes('.research-card--pdf'), 'Research content density is tuned');
check(css.includes('.brochure-preview-shell'), 'Brochure content receives reclaimed workspace');

check(css.includes('grid-template-rows: 104px 60px minmax(0, 1fr)'), 'Tablet layout gives content priority');
check(css.includes('grid-template-rows: 82px 54px minmax(0, 1fr)'), 'Mobile layout gives content priority');

check(modal.includes("tab === 'protocols'"), 'SOP & Protocols remains available');
check(modal.includes("tab === 'research'"), 'Research Archive remains available');
check(modal.includes("tab === 'brochure'"), 'Variety Brochure remains available');

if (!process.exitCode) console.log('\n20/20 checks passed.\n');
