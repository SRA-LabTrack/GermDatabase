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

console.log('\nCaneSprout v2.13.69 Excel Tools Collapse Verification\n');

check(pkg.version === '2.13.69', 'Version is 2.13.69');
check(pkg.scripts?.['verify:excel-tools-collapse'], 'Excel Tools collapse verifier npm script exists');

check(app.includes('className="excel-tools-collapse-button"'), 'Collapse button exists in Excel Tools expansion');
check(app.includes('onClick={() => setShowExcelMenu(false)}'), 'Collapse button closes Excel Tools state');
check(app.includes('aria-label="Collapse Excel Tools"'), 'Collapse control has accessible label');
check(app.includes('aria-controls="excel-tools-expansion"'), 'Collapse control references Excel Tools expansion');
check(app.includes('<span>Collapse</span>'), 'Collapse control has visible label');
check(app.includes('excel-tools-collapse-chevron'), 'Collapse control includes direction icon');

check(css.includes('v2.13.69 EXCEL TOOLS COLLAPSE CONTROL'), 'Collapse control CSS is installed');
check(css.includes('grid-template-columns: auto minmax(0, 1fr) auto'), 'Header keeps icon, title, and Collapse control aligned');
check(css.includes('.excel-tools-collapse-button'), 'Collapse button has dedicated styling');
check(css.includes('transform: rotate(180deg)'), 'Collapse icon visually indicates upward collapse');
check(css.includes('@media (max-width: 1050px)'), 'Compact toolbar fallback exists');
check(css.includes('.excel-tools-collapse-button > span'), 'Compact fallback can hide only the Collapse text');

if (!process.exitCode) console.log('\n14/14 checks passed.\n');
