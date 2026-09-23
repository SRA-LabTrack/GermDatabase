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

console.log('\nCaneSprout v2.13.74 Smooth Germplasm Map Redirect Verification\n');

check(pkg.version === '2.13.74', 'Version is 2.13.74');
check(pkg.scripts?.['verify:variety-map-smooth-redirect'], 'Smooth redirect verifier npm script exists');

check(component.includes('map.stop()'), 'A new redirect stops any previous map animation');
check(component.includes('duration: .72') || component.includes('duration: 0.72'), 'Nearby redirects use slower 0.72s movement');
check(component.includes('duration: 1.55'), 'Long-distance redirects use slower 1.55s fly animation');
check(component.includes('keepBuffer: 6'), 'Satellite tile layers keep a larger six-tile buffer');

check(component.includes('warmDestinationTiles(coords, Math.max(2, targetZoom - 2))'), 'Destination zoom minus two is pre-warmed');
check(component.includes('warmDestinationTiles(coords, Math.max(2, targetZoom - 1))'), 'Destination zoom minus one is pre-warmed');
check(component.includes('warmDestinationTiles(coords, targetZoom)'), 'Final destination zoom is pre-warmed');

check(component.includes("once('moveend'") || component.includes("map.once('moveend'"), 'Popup waits for movement to finish');
check(component.includes("map.off('moveend', popupMoveEndRef.current)"), 'Stale movement popup callbacks are cancelled');
check(component.includes('updateWhenIdle: false'), 'Tiles continue loading during movement');
check(component.includes('updateWhenZooming: false'), 'Heavy tile refreshes stay disabled during zoom animation');
check(component.includes('preferCanvas: true'), 'Map remains Canvas optimized');

check(css.includes('/* v2.13.59 SMOOTHER GERMPLASM MAP REDIRECT */'), 'Smooth redirect CSS tuning is installed');
check(css.includes('.variety-map-canvas .leaflet-tile'), 'Satellite tile rendering receives smoothness tuning');
check(css.includes('backface-visibility: hidden'), 'Tile compositing reduces transition flicker');
check(css.includes('will-change: transform'), 'Animated Leaflet layers get transform compositing hint');

if (!process.exitCode) console.log('\n17/17 checks passed.\n');
