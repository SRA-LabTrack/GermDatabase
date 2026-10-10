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
const app = read('src/App.jsx');
const photo = read('src/lib/photoSections.js');
const brochure = read('src/lib/varietyBrochure.js');
const modal = read('src/components/VarietyBrochureModal.jsx');
const styles = read('src/styles.css');

console.log('\nCaneSprout v2.13.78 Brochure-First Germplasm Verification\n');

check(pkg.version === '2.13.78', 'Version is 2.13.78');
check(pkg.scripts?.['verify:brochure-first'], 'Brochure-first verifier npm script exists');

check(app.includes("const VarietyBrochureModal = lazy(() => import('./components/VarietyBrochureModal.jsx'));"), 'VarietyBrochureModal is lazy-loaded');
check(app.includes("const [brochureId, setBrochureId] = useState('');"), 'Brochure selection state exists');
check(app.includes('onOpen={setBrochureId}'), 'Germplasm cards open brochures first');
check(app.includes('{brochureId && <VarietyBrochureModal'), 'Brochure modal is rendered');
check(app.includes('onExpandDetails={(recordId) => setDetailId(recordId)}'), 'Brochure can expand to full details');
check(app.includes('View Brochure'), 'Card action says View Brochure');
check(app.includes('Open ${record.variety || \'unnamed variety\'} brochure'), 'Card accessibility label references brochure');

check(photo.includes("key: 'stalk'"), 'Stalk upload category exists');
check(photo.includes("key: 'bud_eye'"), 'Eye / bud upload category exists');
check(photo.includes("key: 'leaf'"), 'Leaf / sheath upload category exists');
check(photo.includes('photoIndexForPart'), 'Part-specific photo resolver exists');
check(photo.includes("category === 'characteristics'"), 'Legacy characteristic photos remain supported');
check(photo.includes('brochurePhotoSlots'), 'Brochure photo slots are exported');

check(modal.includes('Whole Variety'), 'Brochure includes whole-variety photo slot');
check(modal.includes('label="Stalk"'), 'Brochure includes stalk photo slot');
check(modal.includes('label="Eye / Bud"'), 'Brochure includes eye/bud photo slot');
check(modal.includes('N/A'), 'Missing photo slot uses N/A');
check(modal.includes('AGRONOMIC-MORPHOLOGICAL CHARACTERISTICS'), 'Reference-style characteristics heading exists');
check(modal.includes('Expand full details'), 'Full-details expansion action exists');

check(brochure.includes('Whole variety'), 'Printable brochure includes whole-variety photo');
check(brochure.includes('Eye / Bud'), 'Printable brochure includes eye/bud photo');
check(brochure.includes('Missing part photos display N/A'), 'Printable brochure explicitly preserves N/A behavior');
check(brochure.includes('brochureCharacteristics'), 'Printable brochure builds recorded agronomic-morphological characteristics');
check(brochure.includes('Potential Yield'), 'Printable brochure includes yield');
check(brochure.includes('Recommended in'), 'Printable brochure includes recommendations');

check(styles.includes('v2.13.78 BROCHURE-FIRST GERMPLASM COLLECTION'), 'Brochure-first styles are installed');
check(styles.includes('.collection-brochure-photo-eye'), 'Circular eye/bud visual is installed');
check(styles.includes('.collection-brochure-characteristic-row'), 'Characteristics table visual is installed');

if (!process.exitCode) console.log('\n28/28 checks passed.\n');
