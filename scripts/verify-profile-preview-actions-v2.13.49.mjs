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
const styles = read('src/styles.css');
const app = read('src/App.jsx');

console.log('\nCaneSprout v2.13.49 In-App Profile Preview Verification\n');

check('Version is 2.13.49', pkg.version === '2.13.49' && app.includes("const APP_VERSION = '2.13.49';"));
check('Preview-action verifier points to v2.13.49', pkg.scripts?.['verify:profile-preview-actions'] === 'node scripts/verify-profile-preview-actions-v2.13.49.mjs');
check('about:blank popup launcher is removed', !printer.includes("window.open('', '_blank'") && !printer.includes('const popup = window.open'));
check('In-app preview overlay exists', printer.includes("overlay.className = 'cs-profile-preview-overlay'") && styles.includes('.cs-profile-preview-overlay'));
check('Preview content is isolated in an iframe', printer.includes("frame.className = 'cs-profile-preview-frame'") && printer.includes('frame.srcdoc = printableVarietyProfileHtml'));
check('Toolbar lives in main CaneSprout document', printer.includes("toolbar.className = 'cs-profile-preview-toolbar'") && printer.includes('document.body.appendChild(overlay)'));
check('Download HTML button is main-document bound', printer.includes("downloadButton.addEventListener('click'") && printer.includes('triggerBlobDownload(new Blob([html]'));
check('Print uses preview iframe print directly', printer.includes("printButton.addEventListener('click'") && printer.includes('frame.contentWindow.print();'));
check('Save PDF calls vector exporter from main app', printer.includes("savePdfButton.addEventListener('click'") && printer.includes('saveVectorProfilePdf(record, normalizedMode, filenames.pdf)'));
check('Save Word calls DOCX exporter from main app', printer.includes("saveWordButton.addEventListener('click'") && printer.includes('saveEditableProfileWord(record, normalizedMode, filenames.word)'));
check('Save Excel calls XLSX exporter from main app', printer.includes("saveExcelButton.addEventListener('click'") && printer.includes('saveEditableProfileExcel(record, normalizedMode, filenames.excel)'));
check('Close button removes in-app overlay', printer.includes("closeButton.addEventListener('click', closePreview)") && printer.includes('overlay.remove();'));
check('Escape key closes preview', printer.includes("if (event.key === 'Escape') closePreview();"));
check('Opening a second preview cleans up the previous one', printer.includes('activeProfilePreviewCleanup?.();'));
check('Body scrolling is restored after close', printer.includes('document.body.style.overflow = previousOverflow;'));
check('Exports expose status and error messages', printer.includes('setBusy(true, `Building ${label}...`)') && printer.includes('console.error(`CaneSprout ${label} export failed`'));
check('PDF remains vector based', printer.includes('new jsPDF({') && !printer.includes("import('html2canvas')"));
check('Word remains native editable DOCX', printer.includes("await import('docx')") && printer.includes('Packer.toBlob(doc)'));
check('Excel remains native XLSX', printer.includes("await import('xlsx')") && printer.includes('XLSX.writeFile('));
check('Responsive overlay styles exist', styles.includes('@media (max-width: 620px)') && styles.includes('.cs-profile-preview-toolbar-actions'));

const failed = checks.filter((item) => !item.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.\n`);
if (failed.length) process.exit(1);
