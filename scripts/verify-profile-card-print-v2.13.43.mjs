import fs from 'node:fs';

function read(rel) { return fs.readFileSync(rel, 'utf8'); }
function pass(label, ok) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) process.exitCode = 1;
  return ok;
}

const pkg = JSON.parse(read('package.json'));
const app = read('src/App.jsx');
const css = read('src/styles.css');
const printer = read('src/lib/profilePrint.js');

console.log('\nCaneSprout v2.13.49 Collection Card Print Verification\n');

const checks = [
  ['Version is 2.13.49', pkg.version === '2.13.49'],
  ['Card print verifier npm script exists', pkg.scripts?.['verify:profile-card-print'] === 'node scripts/verify-profile-card-print-v2.13.43.mjs'],
  ['RecordCard remains present', app.includes('function RecordCard(')],
  ['Printer icon is imported into App', /\bPrinter\b/.test(app.match(/import\s*\{[\s\S]*?\}\s*from\s*['"]lucide-react['"]/ )?.[0] || '')],
  ['Printable profile helper is imported into App', app.includes("import { printVarietyProfile } from './lib/profilePrint.js';")],
  ['Every card has a Print trigger', app.includes('germplasm-card-print-trigger')],
  ['Card print menu exists', app.includes('germplasm-card-print-menu')],
  ['Core Information card option exists', app.includes("printFromCard(event, 'core')")],
  ['Complete Information card option exists', app.includes("printFromCard(event, 'complete')")],
  ['Card print fetches full record first', app.includes('const fullRecord = await getRecord(record.$id);')],
  ['Card print passes fetched record to profile printer', app.includes('printVarietyProfile(printableRecord, mode);')],
  ['Card actions stop click propagation', app.includes('className="germplasm-card-actions"') && app.includes('event.stopPropagation()')],
  ['Existing View Profile action remains', app.includes('view-profile-button') && app.includes('View Profile')],
  ['Profile print renderer still supports core mode', printer.includes("mode = 'core'") && printer.includes("normalizedMode = mode === 'complete' ? 'complete' : 'core'")],
  ['Profile print renderer still supports complete mode', printer.includes("normalizedMode === 'complete'")],
  ['Card print styling exists', css.includes('v2.13.43 PRINT ACTION DIRECTLY ON GERMLASM COLLECTION CARDS')],
  ['Mobile card print styling exists', css.includes('@media (max-width: 760px)') && css.includes('.germplasm-card-actions')]
];

let total = 0;
let passed = 0;
for (const [label, ok] of checks) { total += 1; if (pass(label, ok)) passed += 1; }
console.log(`\n${passed}/${total} checks passed.\n`);
if (passed !== total) process.exit(1);
