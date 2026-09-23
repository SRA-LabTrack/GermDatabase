import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const checks = [
  ['Pedigree modal component exists', 'src/components/PedigreeModal.jsx', null],
  ['Pedigree resolver exists', 'src/lib/pedigree.js', null],
  ['SRA source parentage resolver exists', 'src/lib/sourceParentage.js', null],
  ['SRA parentage data exists', 'src/data/sraParentage.js', null],
  ['Registry local pedigree loader exists', 'src/lib/registryApi.js', 'listLocalPedigreeRecords'],
  ['Toolbar contains Pedigree action', 'src/App.jsx', 'data-web-tool="pedigree"'],
  ['Toolbar opens pedigree modal', 'src/App.jsx', 'setShowPedigree(true)'],
  ['Pedigree modal is rendered on web', 'src/App.jsx', 'showPedigree && !desktopMode'],
  ['Pedigree final CSS visibility guard exists', 'src/styles.css', 'WEBSITE PEDIGREE TOOLBAR HARD FIX'],
  ['Core profile contains Pedigree shortcut', 'src/components/DetailModal.jsx', 'profile-pedigree-link'],
  ['Core profile passes selected variety to pedigree', 'src/App.jsx', 'setPedigreeInitialVariety(record?.variety'],
  ['Pedigree modal supports initial variety selection', 'src/components/PedigreeModal.jsx', 'initialVariety'],
];
let passed=0;
console.log('\nCaneSprout v2.13.32 Website Pedigree Verification\n');
for (const [label, rel, token] of checks) {
  const file=path.join(root,rel);
  const exists=fs.existsSync(file);
  const ok=exists && (!token || fs.readFileSync(file,'utf8').includes(token));
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (ok) passed++;
}
console.log(`\n${passed}/${checks.length} checks passed.`);
if (passed !== checks.length) process.exitCode=1;
