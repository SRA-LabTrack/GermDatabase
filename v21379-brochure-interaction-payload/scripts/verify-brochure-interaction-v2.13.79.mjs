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
const modal = read('src/components/VarietyBrochureModal.jsx');
const css = read('src/styles.css');

console.log('\nCaneSprout v2.13.79 Larger Interactive Brochure Verification\n');

check(pkg.version === '2.13.79', 'Version is 2.13.79');
check(pkg.scripts?.['verify:brochure-interaction'], 'Brochure interaction verifier npm script exists');

check(modal.includes('const [selectedPhoto, setSelectedPhoto] = useState(null);'), 'Photo lightbox state exists');
check(modal.includes('const [selectedDetail, setSelectedDetail] = useState(null);'), 'Detail focus state exists');
check(modal.includes('onClick={() => onOpen?.({ url, label })}'), 'Uploaded brochure photos are clickable');
check(modal.includes('Click photos or details to enlarge'), 'Brochure exposes interaction hint');
check(modal.includes('collection-brochure-photo-lightbox'), 'Full-size photo viewer is rendered');
check(modal.includes('collection-brochure-detail-viewer'), 'Focused detail viewer is rendered');
check(modal.includes('onClick={() => openDetail(label, value)}'), 'Characteristic rows are clickable');
check(modal.includes("openDetail('Parentage', parentals)"), 'Parentage is clickable');
check(modal.includes('if (selectedPhoto)'), 'Escape closes nested photo viewer first');
check(modal.includes('if (selectedDetail)'), 'Escape closes nested detail viewer first');

check(css.includes('v2.13.79 LARGER + CLICKABLE VARIETY BROCHURE'), 'v2.13.79 brochure styles are installed');
check(css.includes('width: min(1500px, calc(100vw - 16px))'), 'Brochure modal is wider');
check(css.includes('width: min(1100px, 100%)'), 'Brochure sheet is larger');
check(css.includes('min-height: 680px'), 'Main brochure image is larger');
check(css.includes('.collection-brochure-photo-button:hover'), 'Clickable photo hover state exists');
check(css.includes('.collection-brochure-characteristic-row:hover'), 'Clickable detail hover state exists');
check(css.includes('.collection-brochure-photo-lightbox-image'), 'Photo lightbox image layout exists');
check(css.includes('.collection-brochure-detail-value'), 'Focused detail value layout exists');

if (!process.exitCode) console.log('\n20/20 checks passed.\n');
