import fs from 'node:fs';

function read(path) {
  if (!fs.existsSync(path)) {
    console.error(`FAIL  Missing ${path}`);
    process.exit(1);
  }
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
const lock = JSON.parse(read('package-lock.json'));
const versionInfo = JSON.parse(read('public/version.json'));
const modal = read('src/components/BreedingProgramModal.jsx');
const css = read('src/styles.css');

console.log('\nCaneSprout v2.13.89 Breeding Program Two-Section Verification\n');

check(pkg.version === '2.13.89', 'package.json version is 2.13.89');
check(lock.version === '2.13.89', 'package-lock top-level version is 2.13.89');
check(lock.packages?.['']?.version === '2.13.89', 'package-lock root package version is 2.13.89');
check(versionInfo.version === '2.13.89', 'public/version.json is 2.13.89');
check(
  pkg.scripts?.['verify:breeding-program-two-sections'] ===
    'node scripts/verify-breeding-program-two-sections-v2.13.89.mjs',
  'verification command is registered'
);

check(modal.includes("tab === 'protocols'"), 'SOP & Protocols section remains available');
check(modal.includes("tab === 'research'"), 'Research Archive section remains available');
check(!modal.includes("tab === 'brochure'"), 'Variety Brochure navigation tab is removed');
check(!modal.includes('function BrochurePanel()'), 'Breeding Program brochure panel is removed');
check(!modal.includes('openVarietyBrochure'), 'Breeding Program no longer imports brochure behavior');
check(!modal.includes("from './SugarcaneIcon.jsx'"), 'Unused brochure-only SugarcaneIcon import is removed');
check(!modal.includes('fileViewUrl, getRecord, listRecords'), 'Unused brochure-only registry imports are removed');
check(
  modal.includes('Germplasm and breeding SOPs and the station research archive in one focused workspace.'),
  'Breeding Program description now matches the two-section layout'
);

const tabBlocks = [...css.matchAll(/\.breeding-program-tabs\s*\{[^{}]*\}/g)].map((m) => m[0]);
check(
  tabBlocks.some((block) => /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/.test(block)),
  'Desktop Breeding Program navigation uses two equal columns'
);
check(
  !tabBlocks.some((block) => /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/.test(block)),
  'No three-column Breeding Program navigation remains'
);

check(fs.existsSync('src/lib/varietyBrochure.js'), 'Existing global variety brochure utility remains untouched');

if (!process.exitCode) {
  console.log('\n16/16 checks passed.\n');
}
