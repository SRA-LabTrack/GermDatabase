import fs from 'node:fs';

function read(rel) { return fs.readFileSync(rel, 'utf8'); }
function pass(label, ok) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) process.exitCode = 1;
  return ok;
}

const pkg = JSON.parse(read('package.json'));
const printer = read('src/lib/profilePrint.js');

console.log('\nCaneSprout v2.13.45 Separate Print + Save PDF Verification\n');

const checks = [
  ['Version is 2.13.45', pkg.version === '2.13.45'],
  ['Verifier npm script exists', pkg.scripts?.['verify:profile-print-actions'] === 'node scripts/verify-profile-print-actions-v2.13.45.mjs'],
  ['html2canvas dependency exists', Boolean(pkg.dependencies?.html2canvas)],
  ['jsPDF dependency exists', Boolean(pkg.dependencies?.jspdf)],
  ['Download HTML button remains', printer.includes('id="download-profile"') && printer.includes('Download HTML')],
  ['Print has its own button', printer.includes('id="print-profile"') && printer.includes('>Print</button>')],
  ['Save PDF has its own button', printer.includes('id="save-pdf-profile"') && printer.includes('>Save PDF</button>')],
  ['Combined Print / Save PDF label is removed', !printer.includes('Print / Save PDF')],
  ['Print still uses native print dialog', printer.includes("printButton?.addEventListener('click', () => window.print())")],
  ['Save PDF sends a dedicated PDF request', printer.includes("action: 'save-pdf'")],
  ['PDF export dynamically loads html2canvas', printer.includes("import('html2canvas')")],
  ['PDF export dynamically loads jsPDF', printer.includes("import('jspdf')")],
  ['PDF captures the printable sheet only', printer.includes("querySelector?.('.print-sheet')")],
  ['PDF exporter supports multiple A4 pages', printer.includes('while (offsetPx < canvas.height)') && printer.includes('pdf.addPage()')],
  ['PDF is downloaded through jsPDF save', printer.includes("pdf.save(filename || 'CaneSprout-Profile.pdf')")],
  ['Preview shows PDF progress status', printer.includes('preview-action-status') && printer.includes('Preparing PDF…')],
  ['Close button remains separate', printer.includes('id="close-profile"') && printer.includes('window.close()')],
  ['Preview does not auto-open print dialog', !printer.includes('popup.print()')]
];

let passed = 0;
for (const [label, ok] of checks) if (pass(label, ok)) passed += 1;
console.log(`\n${passed}/${checks.length} checks passed.\n`);
if (passed !== checks.length) process.exit(1);
