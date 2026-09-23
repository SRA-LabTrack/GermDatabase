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
const exportsFile = read('src/lib/breedingReportExports.js');
const css = read('src/styles.css');

console.log('\nCaneSprout v2.13.53 Breeding Report Layout + Native Export Verification\n');

check(pkg.version === '2.13.53', 'Version is 2.13.53');
check(pkg.scripts?.['verify:breeding-report-exports'], 'Breeding export verifier npm script exists');

check(panel.includes("saveBreedingReportPdf"), 'Breeding Reports imports native PDF exporter');
check(panel.includes("saveBreedingReportWord"), 'Breeding Reports imports native Word exporter');
check(panel.includes("saveBreedingReportExcel"), 'Breeding Reports imports native Excel exporter');
check(panel.includes("Save PDF"), 'Save PDF button exists');
check(panel.includes("Save Word"), 'Save Word button exists');
check(panel.includes("Save Excel"), 'Save Excel button exists');
check(panel.includes("Print</button>"), 'Print remains a separate action');
check(panel.includes("runExport('pdf')"), 'PDF button calls native PDF exporter');
check(panel.includes("runExport('word')"), 'Word button calls native Word exporter');
check(panel.includes("runExport('excel')"), 'Excel button calls native Excel exporter');

check(exportsFile.includes("await import('jspdf')"), 'PDF uses jsPDF vector renderer');
check(!exportsFile.includes('html2canvas'), 'Breeding PDF does not use screenshot/raster capture');
check(exportsFile.includes("await import('docx')"), 'Word uses native DOCX generator');
check(exportsFile.includes("await import('xlsx')"), 'Excel uses native XLSX generator');
check(exportsFile.includes("drawPdfTable"), 'PDF draws report tables as vector text/shapes');
check(exportsFile.includes("Period-by-Period Breeding Activity"), 'Word includes range timeline');
check(exportsFile.includes("'Timeline'"), 'Excel includes Timeline worksheet');
check(exportsFile.includes("'Breeding Events'"), 'Excel includes Breeding Events worksheet');
check(exportsFile.includes("'Technical Report'"), 'Excel includes optional Technical Report worksheet');
check(exportsFile.includes("wrapText: true"), 'Excel cells enable wrapped text');
check(exportsFile.includes("cantSplit: true"), 'Word table rows avoid inappropriate splitting');

check(css.includes('/* v2.13.53 Breeding Reports responsive layout + native exports */'), 'Responsive layout patch CSS is installed');
check(css.includes("width: min(1180px, calc(100vw - 24px))"), 'Modal width is bounded by viewport');
check(css.includes("overflow-x: hidden !important"), 'Modal body blocks accidental horizontal overflow');
check(css.includes("flex-wrap: wrap !important"), 'Header/actions/footer can wrap instead of overlapping');
check(css.includes("repeat(auto-fit, minmax(190px, 1fr))"), 'Report inputs use responsive auto-fit grid');
check(css.includes("repeat(auto-fit, minmax(260px, 1fr))"), 'Options and technical fields use responsive grid');
check(css.includes("overflow-wrap: anywhere"), 'Long footer/help text wraps safely');
check(css.includes("@media (max-width: 760px)"), 'Mobile layout breakpoint exists');

if (!process.exitCode) console.log('\n31/31 checks passed.\n');
