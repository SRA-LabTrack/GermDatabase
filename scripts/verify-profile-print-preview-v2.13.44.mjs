import fs from 'node:fs';

function read(rel) { return fs.readFileSync(rel, 'utf8'); }
function pass(label, ok) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) process.exitCode = 1;
  return ok;
}

const pkg = JSON.parse(read('package.json'));
const printer = read('src/lib/profilePrint.js');
const app = read('src/App.jsx');

console.log('\nCaneSprout v2.13.44 Profile Print Preview + Download Verification\n');

const checks = [
  ['Version is 2.13.44', pkg.version === '2.13.44'],
  ['Preview verifier npm script exists', pkg.scripts?.['verify:profile-print-preview'] === 'node scripts/verify-profile-print-preview-v2.13.44.mjs'],
  ['Core section is forced to render', printer.includes("section('Core Profile Information', 'Germplasm preview', cards, { force: true })")],
  ['Core fields show Not recorded when missing', printer.includes("showMissing ? 'Not recorded' : ''") && printer.includes('{ showMissing: true }')],
  ['Recommended location falls back to Tested Location', printer.includes('record.recommended_locations') && printer.includes('record.tested_location')],
  ['Preview toolbar exists', printer.includes('class="preview-toolbar"')],
  ['Download action exists', printer.includes('id="download-profile"') && printer.includes("anchor.download = filename")],
  ['Download uses a local Blob', printer.includes("new Blob([html], { type: 'text/html;charset=utf-8' })")],
  ['Print action exists in preview', printer.includes('id="print-profile"') && printer.includes("window.print()")],
  ['Save PDF wording is visible', printer.includes('Print / Save PDF')],
  ['Close action exists', printer.includes('id="close-profile"') && printer.includes('window.close()')],
  ['Preview controls are hidden when printing', printer.includes('.preview-toolbar { display: none !important; }')],
  ['Opening profile does not auto-trigger popup.print', !printer.includes('popup.print()')],
  ['Print helper returns preview window', printer.includes('return popup;')],
  ['Card printer merges full and preview records', app.includes('const printableRecord = { ...(preview || record || {}), ...(fullRecord || {}) };')],
  ['Card merge preserves nonblank preview core values', app.includes("String(printableRecord[key] ?? '').trim() === ''")],
  ['Existing Core card option remains', app.includes("printFromCard(event, 'core')")],
  ['Existing Complete card option remains', app.includes("printFromCard(event, 'complete')")]
];

let total = 0;
let passed = 0;
for (const [label, ok] of checks) { total += 1; if (pass(label, ok)) passed += 1; }
console.log(`\n${passed}/${total} checks passed.\n`);
if (passed !== total) process.exit(1);
