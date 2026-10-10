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
const modal = read('src/components/VarietyBrochureModal.jsx');
const nav = read('src/components/DesktopPrimaryNav.jsx');

console.log('\nCaneSprout v2.13.81 Original Brochure Size Verification\n');

check(pkg.version === '2.13.81', 'Version is 2.13.81');
check(pkg.scripts?.['verify:brochure-size-reset'], 'Brochure size reset verifier exists');

check(css.includes('v2.13.81 BROCHURE SIZE RESET'), 'Original-size reset styles are installed');
check(css.includes('width: min(1180px, calc(100vw - 32px))'), 'Brochure modal width is restored to v2.13.78');
check(css.includes('width: min(860px, 100%)'), 'Brochure sheet width is restored to v2.13.78');
check(css.includes('min-height: 540px'), 'Whole-variety photo is restored to original height');
check(css.includes('min-height: 225px'), 'Stalk photo is restored to original height');
check(css.includes('width: min(250px, 100%)'), 'Eye/Bud photo is restored to original size');
check(css.includes('min-height: 220px'), 'Brochure masthead is restored to original size');

check(modal.includes('selectedPhoto'), 'Photo click/lightbox behavior remains installed');
check(modal.includes('selectedDetail'), 'Clickable detail behavior remains installed');
check(modal.includes('Expand full details'), 'Expand Full Details remains installed');

check(css.includes('@keyframes csBrochureWindowIn'), 'Brochure opening transition remains installed');
check(css.includes('@keyframes csBrochurePhotoCardIn'), 'Photo transition remains installed');
check(css.includes('@keyframes csBrochureDetailCardIn'), 'Detail transition remains installed');

check(nav.includes('<span>Breeding Program</span>'), 'Breeding Program remains in main navigation');
check(nav.includes('cs-primary-nav--five'), 'Five-section main navigation remains installed');

if (!process.exitCode) console.log('\n17/17 checks passed.\n');
