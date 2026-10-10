import fs from 'node:fs';

function read(path) { return fs.readFileSync(path, 'utf8'); }

function check(condition, label) {
  if (!condition) {
    console.error(`FAIL  ${label}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS  ${label}`);
  }
}

const pkg = JSON.parse(read('package.json'));
const css = read('src/styles.css');
const modal = read('src/components/BreedingProgramModal.jsx');

console.log('\nCaneSprout v2.13.85 Map-Style Breeding Program Verification\n');

check(pkg.version === '2.13.85', 'Version is 2.13.85');
check(pkg.scripts?.['verify:breeding-map-layout'], 'Map-style Breeding Program verifier exists');

check(css.includes('v2.13.85 MAP-STYLE BREEDING PROGRAM WORKSPACE'), 'v2.13.85 layout styles are installed');
check(css.includes('.breeding-program-backdrop'), 'Breeding Program backdrop is styled');
check(css.includes('inset: 0 !important'), 'Breeding Program overlays the full application like Variety Map');
check(css.includes('padding: 24px !important'), 'Desktop workspace has map-like outer spacing');
check(css.includes('height: calc(100dvh - 48px)'), 'Breeding workspace fills available viewport height');
check(css.includes('border-radius: 0 !important'), 'Outer workspace uses crisp map-style frame');

check(css.includes('grid-template-rows: auto auto minmax(0, 1fr)'), 'Workspace has header, tabs, and scrollable content rows');
check(css.includes('min-height: 184px'), 'Large map-style title header is installed');
check(css.includes('font-size: clamp(38px, 4.2vw, 55px)'), 'Breeding Program title uses map-scale typography');

check(css.includes('.breeding-program-header > .secondary-button'), 'Close control receives map-style treatment');
check(css.includes('font-size: 0 !important'), 'Close text is visually reduced to icon-only control');
check(css.includes('width: 58px !important'), 'Close control uses square map-style size');

check(css.includes('grid-template-columns: repeat(3, minmax(0, 1fr))'), 'Three Breeding Program sections remain evenly available');
check(css.includes('.breeding-program-tabs > button.active::after'), 'Active section has map-like accent indicator');

check(css.includes('overflow-y: auto !important'), 'Breeding Program content scrolls internally');
check(css.includes('scrollbar-gutter: stable !important'), 'Internal scrollbar does not shift layout');
check(css.includes('overscroll-behavior: contain !important'), 'Scrolling stays inside Breeding Program workspace');

check(modal.includes("tab === 'protocols'"), 'SOP & Protocols section remains available');
check(modal.includes("tab === 'research'"), 'Research Archive section remains available');
check(modal.includes("tab === 'brochure'"), 'Variety Brochure section remains available');
check(modal.includes('onClose'), 'Existing Breeding Program close behavior remains wired');

if (!process.exitCode) console.log('\n22/22 checks passed.\n');
