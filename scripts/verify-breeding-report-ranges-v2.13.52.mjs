import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}
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

console.log('\nCaneSprout v2.13.52 Breeding Report Time-Range Verification\n');

check(pkg.version === '2.13.52', 'Version is 2.13.52');
check(pkg.scripts?.['verify:breeding-report-ranges'], 'Time-range verifier npm script exists');

check(panel.includes('<option value="single">Single period</option>'), 'Single-period coverage option remains available');
check(panel.includes('<option value="range">Time period range</option>'), 'Time-period range option exists');
check(panel.includes('Break report down by'), 'Range breakdown selector exists');
check(panel.includes('<option value="weekly">Weekly</option>'), 'Weekly breakdown can be selected');
check(panel.includes('<option value="monthly">Monthly</option>'), 'Monthly breakdown can be selected');
check(panel.includes('<option value="quarterly">Quarterly</option>'), 'Quarterly breakdown can be selected');
check(panel.includes('<option value="annually">Annual</option>'), 'Annual breakdown can be selected');
check(panel.includes('Start year'), 'Range start-year input exists');
check(panel.includes('End year'), 'Range end-year input exists');
check(panel.includes('including intervals with zero recorded crosses'), 'UI explains zero-activity intervals are included');

check(logic.includes("coverage: 'single'"), 'Default report coverage remains single-period');
check(logic.includes("rangeStartYear"), 'Range start year is stored in report request');
check(logic.includes("rangeEndYear"), 'Range end year is stored in report request');
check(logic.includes("breakdown: 'weekly'"), 'Weekly is the default range breakdown');
check(logic.includes("period: 'range'"), 'Range reports use a dedicated range period');
check(logic.includes('buildBreedingReportBuckets'), 'Range bucket builder exists');
check(logic.includes("key: `week:${rawStart}`"), 'Weekly buckets are generated continuously');
check(logic.includes("cursor = addDays(cursor, 7)"), 'Weekly timeline advances exactly seven days');
check(logic.includes("key: `month:${year}-${pad2(month)}`"), 'Monthly range buckets exist');
check(logic.includes("key: `quarter:${year}:Q${quarter}`"), 'Quarterly range buckets exist');
check(logic.includes("key: `year:${year}`"), 'Annual range buckets exist');
check(logic.includes('buckets.filter((bucket) => bucket.active).length'), 'Active intervals are counted');
check(logic.includes('inactiveIntervals'), 'Zero-activity intervals are counted');
check(logic.includes('Period-by-period breeding activity'), 'Printable report includes a period timeline');
check(logic.includes('Every ${escapeHtml'), 'Printable timeline explicitly includes every interval');

check(panel.includes('report.buckets.map((bucket)'), 'On-screen report renders every generated interval');
check(panel.includes('Total intervals'), 'On-screen report shows total interval count');
check(panel.includes('Active intervals'), 'On-screen report shows active interval count');
check(css.includes('/* v2.13.52 Multi-year Breeding Report Time Ranges */'), 'Time-range report styles are installed');

if (!process.exitCode) console.log('\n30/30 checks passed.\n');
