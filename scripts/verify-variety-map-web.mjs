import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildVarietyMapCatalog } from '../src/lib/varietyMap.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));
const app = read('src/App.jsx');
const modal = read('src/components/VarietyMapModal.jsx');
const styles = read('src/styles.css');
const source = JSON.parse(read('seed/characterization.json'));
const catalog = buildVarietyMapCatalog(source.records || []);
const withLocation = catalog.filter((entry) => entry.location).length;
const mapped = catalog.filter((entry) => entry.coords).length;

const checks = [
  ['Variety map modal component exists', exists('src/components/VarietyMapModal.jsx')],
  ['Location resolver exists', exists('src/lib/varietyMap.js')],
  ['Website toolbar contains Map action', app.includes('data-web-tool="map"') && app.includes('<MapPin size={21} /><span>Map</span>')],
  ['Mobile tools menu contains Map action', app.includes('<strong>Map</strong><small>Explore varieties by recorded location</small>')],
  ['Website renders VarietyMapModal', app.includes('<VarietyMapModal') && app.includes('showMap && !desktopMode')],
  ['Variety search can focus map entries', modal.includes('focusEntry(entry)') && modal.includes('smoothFocusMap') && modal.includes('map.flyTo')],
  ['OpenStreetMap tile layer is configured', modal.includes('tile.openstreetmap.org')],
  ['Map CSS is present', styles.includes('.variety-map-modal') && styles.includes('.canesprout-map-pin')],
  ['Bundled registry has usable mapped locations', mapped > 0 && withLocation > 0]
];

console.log('\nCaneSprout v2.13.38 Website Variety Map Verification\n');
let passed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (ok) passed += 1;
}
console.log(`\nBundled unique varieties: ${catalog.length}`);
console.log(`With recorded location: ${withLocation}`);
console.log(`Mapped without online geocoding: ${mapped}`);
console.log(`\n${passed}/${checks.length} checks passed.`);
if (passed !== checks.length) process.exitCode = 1;
