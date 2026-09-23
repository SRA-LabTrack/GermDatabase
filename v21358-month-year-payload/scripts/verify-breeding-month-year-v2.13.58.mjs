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
const logic = read('src/lib/breedingReports.js');
const css = read('src/styles.css');

console.log('\nCaneSprout v2.13.58 Monthly Month + Year Verification\n');

check(pkg.version === '2.13.58', 'Version is 2.13.58');
check(pkg.scripts?.['verify:breeding-month-year'], 'Monthly month/year verifier exists');

check(panel.includes('<span>Month</span>'), 'Monthly mode shows Month control');
check(panel.includes('<span>Year</span>'), 'Monthly mode shows separate Year control');
check(panel.includes('<option value="1">January</option>'), 'January option exists');
check(panel.includes('<option value="12">December</option>'), 'December option exists');
check(panel.includes('request.monthNumber'), 'Month selector stores explicit month number');
check(panel.includes('request.monthYear'), 'Year field stores explicit monthly year');
check(!panel.includes('type="month"'), 'Browser native month picker is removed');

check(logic.includes('monthNumber: String(monthNumber)'), 'Default request stores explicit month number');
check(logic.includes('monthYear: String(year)'), 'Default request stores explicit monthly year');
check(logic.includes('const explicitYear = clampReportYear('), 'Monthly resolver validates explicit year');
check(logic.includes('const explicitMonth = Math.max('), 'Monthly resolver validates explicit month');
check(logic.includes('const safeMonth = `${explicitYear}-${pad2(explicitMonth)}`'), 'Monthly resolver combines selected month and year');
check(logic.includes("const legacyMonth = /^\\\\d{4}-\\\\d{2}$/.test(text(request.month))"), 'Old saved month value remains backward compatible');

check(css.includes('/* v2.13.58 Explicit monthly month + year controls */'), 'Monthly month/year styling is installed');

if (!process.exitCode) console.log('\n15/15 checks passed.\n');
