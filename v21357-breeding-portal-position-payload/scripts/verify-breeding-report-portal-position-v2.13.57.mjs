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
const panel = read('src/components/BreedingReportsPanel.jsx');
const css = read('src/styles.css');

console.log('\nCaneSprout v2.13.57 Breeding Reports Portal Position Verification\n');

check(pkg.version === '2.13.57', 'Version is 2.13.57');
check(pkg.scripts?.['verify:breeding-report-portal-position'], 'Portal-position verifier npm script exists');

check(panel.includes("'--breeding-report-top': `${reportTopOffset}px`"), 'Measured toolbar offset is passed through CSS custom property');
check(!panel.includes("top: `${reportTopOffset}px`"), 'Old non-important inline top declaration is removed');
check(panel.includes('return createPortal('), 'Breeding Reports still uses document-body portal');
check(panel.includes('document.body'), 'Portal still targets document.body');

check(css.includes('/* v2.13.57 Breeding Reports portal position conflict fix */'), 'Position-conflict CSS patch is installed');
check(css.includes('inset: var(--breeding-report-top, 120px) 0 8px 0 !important'), 'Backdrop inset is explicitly restored with !important');
check(css.includes('top: var(--breeding-report-top, 120px) !important'), 'Top offset cannot be erased by older inset:auto rule');
check(css.includes('right: 0 !important'), 'Right edge is pinned to viewport');
check(css.includes('bottom: 8px !important'), 'Bottom edge is pinned with safety gap');
check(css.includes('left: 0 !important'), 'Left edge is pinned to viewport');
check(css.includes('visibility: visible !important'), 'Portal is explicitly visible');
check(css.includes('opacity: 1 !important'), 'Portal cannot inherit hidden opacity');
check(css.includes('pointer-events: auto !important'), 'Portal remains clickable');
check(css.includes('overflow-y: auto !important'), 'Report body remains scrollable');
check(css.includes('height: 100% !important'), 'Report modal fills corrected portal area');

if (!process.exitCode) console.log('\n17/17 checks passed.\n');
