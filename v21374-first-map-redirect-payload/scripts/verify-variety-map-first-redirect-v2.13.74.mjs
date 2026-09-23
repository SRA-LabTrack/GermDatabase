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

console.log('\nCaneSprout v2.13.74 First Germplasm Map Redirect Verification\n');

check(pkg.version === '2.13.74', 'Version is 2.13.74');
check(pkg.scripts?.['verify:variety-map-first-redirect'], 'First-redirect verifier npm script exists');

check(component.includes('const firstRedirectVisualRef = useRef(true);'), 'First redirect has a per-map-open guard ref');
check(component.includes('v2.13.74 first redirect visual guard'), 'First redirect visual effect is installed');
check(component.includes("canvas.classList.add('variety-map-first-redirect')"), 'First selection activates visual guard class');
check(component.includes('firstRedirectVisualRef.current = false;'), 'Guard runs only once per map opening');
check(component.includes('const FIRST_REDIRECT_GUARD_MS = 2150;'), 'Guard covers the 1.55s fly plus destination tile settling');
check(component.includes("canvas.classList.remove('variety-map-first-redirect')"), 'Guard releases automatically');
check(component.includes('}, [selectedIdentity]);'), 'Guard starts from the first selected variety');

check(component.includes('duration: 1.55'), 'Existing relaxed long-distance fly duration remains unchanged');
check(component.includes('warmDestinationTiles(coords, Math.max(2, targetZoom - 2))'), 'Destination prewarming remains active');
check(component.includes('warmDestinationTiles(coords, targetZoom)'), 'Final destination zoom prewarming remains active');

check(css.includes('v2.13.74 FIRST GERMPLASM MAP REDIRECT GUARD'), 'First-redirect CSS is installed');
check(css.includes('.variety-map-first-redirect .leaflet-overlay-pane'), 'Accuracy/vector overlay is hidden during first redirect');
check(css.includes('.variety-map-first-redirect .leaflet-marker-pane'), 'Selected marker is hidden during first redirect');
check(css.includes('.variety-map-first-redirect .leaflet-popup-pane'), 'Popup waits visually until first redirect settles');
check(css.includes('.variety-map-first-redirect.leaflet-zoom-anim .leaflet-tile-container'), 'Scaled overview tiles are suppressed during first zoom');
check(css.includes('opacity: .10 !important'), 'Old overview tiles are strongly dimmed');
check(css.includes('.variety-map-first-redirect.leaflet-zoom-anim::after'), 'Satellite-colored transition veil is active only while zooming');
check(css.includes('z-index: 250'), 'Transition veil stays above tiles but below Leaflet controls');

if (!process.exitCode) console.log('\n20/20 checks passed.\n');
