import fs from 'node:fs';

const checks = [];
function check(label, condition) {
  const pass = Boolean(condition);
  checks.push({ label, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`);
}
function read(path) { return fs.readFileSync(path, 'utf8'); }

const pkg = JSON.parse(read('package.json'));
const printer = read('src/lib/profilePrint.js');
const app = read('src/App.jsx');

console.log('\nCaneSprout v2.13.49 Native Profile Document Export Verification\n');

check('Version is 2.13.49', pkg.version === '2.13.49' && app.includes("const APP_VERSION = '2.13.49';"));
check('Dedicated document-export verifier npm script exists', pkg.scripts?.['verify:profile-document-exports'] === 'node scripts/verify-profile-document-exports-v2.13.47.mjs');
check('jsPDF dependency remains available', Boolean(pkg.dependencies?.jspdf));
check('XLSX dependency is available', Boolean(pkg.dependencies?.xlsx));
check('DOCX dependency is available', Boolean(pkg.dependencies?.docx));
check('Preview has a separate Save PDF button', printer.includes('id="save-pdf-profile"') && printer.includes('>Save PDF</button>'));
check('Preview has a separate Save Word button', printer.includes('id="save-word-profile"') && printer.includes('>Save Word</button>'));
check('Preview has a separate Save Excel button', printer.includes('id="save-excel-profile"') && printer.includes('>Save Excel</button>'));
check('Word filenames use .docx', printer.includes("-Profile.docx`"));
check('Excel filenames use .xlsx', printer.includes("-Profile.xlsx`"));
check('Word export uses the native DOCX package', printer.includes("await import('docx')") && printer.includes('Packer.toBlob(doc)'));
check('Word export uses editable tables, not screenshots', printer.includes('new Table({') && printer.includes('new TableRow({') && printer.includes('new TableCell({'));
check('Word output controls paragraph spacing', printer.includes('spacing: { before: 55, after: 55 }') && printer.includes('line: 250'));
check('Excel export uses native XLSX cells', printer.includes("await import('xlsx')") && printer.includes('xlsxModule.default || xlsxModule') && printer.includes('XLSX.utils.aoa_to_sheet(rows)'));
check('Excel output controls column widths', printer.includes("{ wch: 36 }") && printer.includes("{ wch: 72 }"));
check('Excel output enables wrapped cell values', printer.includes("wrapText: true"));
check('Excel output records RHS code and HEX without rasterization', printer.includes("'RHS Screen Color'") && printer.includes("'Color HEX'"));
check('PDF exporter remains vector-based', printer.includes("new jsPDF({") && printer.includes('renderCardPdf(pdf') && printer.includes('pdf.text('));
check('PDF exporter does not use html2canvas', !printer.includes("import('html2canvas')") && !printer.includes('toDataURL('));
check('PDF exporter does not add JPEG page screenshots', !printer.includes("addImage(") && !printer.includes("'JPEG'"));
check('Preview sends independent PDF, Word, and Excel actions', printer.includes("savePdfButton.addEventListener('click'") && printer.includes("saveWordButton.addEventListener('click'") && printer.includes("saveExcelButton.addEventListener('click'"));
check('Main window handles all three native export actions', printer.includes('saveVectorProfilePdf(record, normalizedMode, filenames.pdf)') && printer.includes('saveEditableProfileWord(record, normalizedMode, filenames.word)') && printer.includes('saveEditableProfileExcel(record, normalizedMode, filenames.excel)'));
check('Core and Complete modes share the same native export model', printer.includes("profileExportRows(record") && printer.includes("profileSectionModels(record, normalizedMode)"));

const failed = checks.filter((item) => !item.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.\n`);
if (failed.length) process.exit(1);
