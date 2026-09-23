import fs from 'node:fs';

function read(rel) { return fs.readFileSync(rel, 'utf8'); }
function pass(label, ok) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) process.exitCode = 1;
  return ok;
}

const pkg = JSON.parse(read('package.json'));
const printer = read('src/lib/profilePrint.js');

console.log('\nCaneSprout v2.13.49 Sharp Vector PDF + Pagination Verification\n');

const checks = [
  ['Version is 2.13.49', pkg.version === '2.13.49'],
  ['Quality verifier npm script exists', pkg.scripts?.['verify:profile-pdf-quality'] === 'node scripts/verify-profile-pdf-quality-v2.13.46.mjs'],
  ['Print action verifier points to current quality verifier', pkg.scripts?.['verify:profile-print-actions'] === 'node scripts/verify-profile-pdf-quality-v2.13.46.mjs'],
  ['jsPDF dependency remains available', Boolean(pkg.dependencies?.jspdf)],
  ['Save PDF uses vector PDF renderer', printer.includes('saveVectorProfilePdf(record, normalizedMode, filenames.pdf)')],
  ['PDF dynamically loads jsPDF', printer.includes("import('jspdf')")],
  ['PDF no longer imports html2canvas', !printer.includes("import('html2canvas')")],
  ['PDF no longer converts preview to JPEG', !printer.includes("toDataURL('image/jpeg'") && !printer.includes("pdf.addImage(dataUrl, 'JPEG'")],
  ['PDF draws vector text directly', printer.includes("pdf.text(section.title") && printer.includes("pdf.text(lines")],
  ['PDF draws vector field cards directly', printer.includes('pdf.roundedRect(x, y, width, height')],
  ['PDF draws RHS swatches as vector rectangles', printer.includes('card.colors.forEach') && printer.includes('setFillColorHex(pdf, color.hex)')],
  ['Section pagination is row-aware', printer.includes('rowHeightPdf') && printer.includes('if (y + rowHeight > PDF.bottomY)')],
  ['Continued sections repeat their heading', printer.includes("renderSectionHeadingPdf(pdf, section, y, true)")],
  ['Continuation pages identify the variety', printer.includes('renderContinuationHeaderPdf')],
  ['PDF has page-number footers', printer.includes('Page ${pageNo} of ${totalPages}')],
  ['Preview header metadata uses separate lines', printer.includes('<span>Generated ${escapeHtml(generated)}</span>')],
  ['Browser print avoids splitting individual field cards', printer.includes('page-break-inside: avoid')],
  ['Browser print keeps section heading with following content', printer.includes('page-break-after: avoid')],
  ['Download HTML remains separate', printer.includes('id="download-profile"') && printer.includes('Download HTML')],
  ['Print remains separate', printer.includes('id="print-profile"') && printer.includes('>Print</button>')],
  ['Save PDF remains separate', printer.includes('id="save-pdf-profile"') && printer.includes('>Save PDF</button>')]
];

let passed = 0;
for (const [label, ok] of checks) if (pass(label, ok)) passed += 1;
console.log(`\n${passed}/${checks.length} checks passed.\n`);
if (passed !== checks.length) process.exit(1);
