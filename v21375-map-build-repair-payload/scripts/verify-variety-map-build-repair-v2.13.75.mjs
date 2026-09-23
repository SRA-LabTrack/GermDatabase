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
const component = read('src/components/VarietyMapModal.jsx');
const css = read('src/styles.css');

console.log('\nCaneSprout v2.13.75 Germplasm Map Build Repair Verification\n');

check(pkg.version === '2.13.75', 'Version is 2.13.75');
check(pkg.scripts?.['verify:variety-map-build-repair'], 'Build repair verifier npm script exists');

check(component.includes('const firstRedirectVisualRef = useRef(true);'), 'First redirect guard ref remains installed');
check(component.includes('v2.13.74 first redirect visual guard'), 'First redirect visual effect remains installed');
check(component.includes("canvas.classList.add('variety-map-first-redirect')"), 'First redirect guard activation remains installed');
check(component.includes('const FIRST_REDIRECT_GUARD_MS = 2150;'), 'First redirect guard timing is preserved');

check(/async\s+function\s+focusEntry\s*\(\s*entry\s*\)/.test(component), 'focusEntry is async again');
check(!/async\s+\/\/\s*v2\.13\.74 first redirect visual guard/.test(component), 'No stray async token remains before first-redirect effect');
check(component.includes('await geocodeLocation(entry.location)'), 'focusEntry geocoding await remains present');
check(component.includes('duration: 1.55'), 'Long-distance smooth fly remains 1.55 seconds');
check(component.includes('duration: 0.72'), 'Nearby smooth redirect remains 0.72 seconds');

check(css.includes('.variety-map-first-redirect .leaflet-overlay-pane'), 'First redirect overlay masking remains installed');
check(css.includes('.variety-map-first-redirect.leaflet-zoom-anim .leaflet-tile-container'), 'First redirect stretched-tile suppression remains installed');

check(css.includes('.variety-map-canvas .leaflet-tile'), 'Current satellite tile smoothness rule exists');
check(css.includes('will-change: transform'), 'Current map compositing hint exists');
check(css.includes('backface-visibility: hidden'), 'Current tile compositing flicker protection exists');

if (!process.exitCode) console.log('\n16/16 checks passed.\n');
