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
const css = read('src/styles.css');

console.log('\nCaneSprout v2.13.67 Final Toolbar Geometry Verification\n');

check(pkg.version === '2.13.67', 'Version is 2.13.67');
check(pkg.scripts?.['verify:toolbar-final'], 'Final toolbar verifier npm script exists');
check(app.includes('toolbar-clean-v21367'), 'Header uses v2.13.67 clean scope');
check(app.includes('toolbar-nav-v21367'), 'Navigation uses v2.13.67 clean scope');

check(css.includes('v2.13.67 FINAL DESKTOP TOOLBAR GEOMETRY'), 'Only final toolbar geometry block is installed');
check(!css.includes('v2.13.66 CLEAN TOOLBAR RESET'), 'Previous v2.13.66 geometry block is removed');
check(css.includes('grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)'), 'Navigation uses four explicit equal columns');
check(css.includes('> :nth-child(1)'), 'First navigation cell is explicitly positioned');
check(css.includes('> :nth-child(4)'), 'Fourth navigation cell is explicitly positioned');
check(css.includes('grid-column: 4 !important'), 'Tools cannot stretch across multiple columns');
check(css.includes('font-size: 13px !important'), 'Desktop navigation labels use readable size');
check(css.includes('visibility: visible !important'), 'Navigation labels are explicitly visible');
check(css.includes('grid-column: 3 !important'), 'Online occupies dedicated utility column');
check(css.includes('grid-column: 4 !important'), 'Account occupies dedicated final column');
check(css.includes('z-index: 100000 !important'), 'Tools portal remains above the application');

if (!process.exitCode) console.log('\n15/15 checks passed.\n');
