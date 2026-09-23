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
const combo = read('src/components/CombinationRegistryModal.jsx');
const panel = read('src/components/BreedingReportsPanel.jsx');
const logic = read('src/lib/breedingReports.js');
const css = read('src/styles.css');

console.log('\nCaneSprout v2.13.51 Breeding Reports Verification\n');

check(pkg.version === '2.13.51', 'Version is 2.13.51');
check(pkg.scripts?.['verify:breeding-reports'], 'Breeding report verifier npm script exists');
check(combo.includes("import BreedingReportsPanel from './BreedingReportsPanel.jsx';"), 'Combination Registry imports Breeding Reports');
check(combo.includes('Breeding reports</span></button>'), 'Combination Registry exposes Breeding reports to users/admins');
check(combo.includes('<BreedingReportsPanel actor={actor}'), 'Breeding Reports panel renders from Combination Registry');

check(panel.includes('<option value="weekly">Weekly</option>'), 'Weekly report option exists');
check(panel.includes('<option value="monthly">Monthly</option>'), 'Monthly report option exists');
check(panel.includes('<option value="quarterly">Quarterly</option>'), 'Quarterly report option exists');
check(panel.includes('<option value="annually">Annual</option>'), 'Annual report option exists');
check(panel.includes('Include Technical Report'), 'Technical Report inclusion option exists');
check(panel.includes('Observations / Findings'), 'Technical report observations field exists');
check(panel.includes('Recommendations'), 'Technical report recommendations field exists');
check(panel.includes('Include live cloud records'), 'Live cloud breeding records can be included');
check(panel.includes('Download HTML'), 'Generated breeding report can be downloaded');
check(panel.includes('Print / Save PDF'), 'Generated breeding report can be printed/saved as PDF');
check(!panel.includes("window.open('', '_blank'"), 'Breeding report printing does not depend on a popup window');
check(panel.includes("document.createElement('iframe')"), 'Breeding report printing uses an in-app hidden print frame');

check(logic.includes('source_date_text'), 'Source date text is considered for historical breeding dates');
check(logic.includes('if (sourceHash && sourceDate) return sourceDate;'), 'Audited workbook source date takes priority when parseable');
check(logic.includes("period === 'weekly'"), 'Weekly range calculation exists');
check(logic.includes("period === 'quarterly'"), 'Quarterly range calculation exists');
check(logic.includes("period === 'annually'"), 'Annual range calculation exists');
check(logic.includes("period: 'monthly'"), 'Monthly range calculation exists');
check(logic.includes("Query.equal('source_hash', [''])"), 'Live manual breeding records are queried from Combination Registry');
check(logic.includes('reportStats(events)'), 'Report breeding metrics are calculated');
check(logic.includes('TECHNICAL REPORT'), 'Printable output includes Technical Report section when requested');
check(css.includes('/* v2.13.51 Breeding Reports */'), 'Breeding report UI styles are present');

if (!process.exitCode) console.log('\n27/27 checks passed.\n');
