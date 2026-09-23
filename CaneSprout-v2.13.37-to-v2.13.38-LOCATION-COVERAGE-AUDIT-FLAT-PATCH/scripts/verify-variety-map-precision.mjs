import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const component = fs.readFileSync(path.join(root,'src/components/VarietyMapModal.jsx'),'utf8');
const lib = fs.readFileSync(path.join(root,'src/lib/varietyMap.js'),'utf8');
const css = fs.readFileSync(path.join(root,'src/styles.css'),'utf8');
const checks = [
  ['Satellite imagery layer is default', component.includes('World_Imagery/MapServer') && component.includes('satellite.addTo(map)')],
  ['Street-map fallback remains available', component.includes('Streets: streets')],
  ['Satellite place-label overlay exists', component.includes('World_Boundaries_and_Places')],
  ['Metric scale control exists', component.includes('L.control.scale')],
  ['Precision-aware zoom helper exists', lib.includes('mapZoomForPrecision')],
  ['Accuracy-radius helper exists', lib.includes('mapAccuracyRadiusMeters')],
  ['Selected variety draws an accuracy area', component.includes('L.circle') && component.includes('mapAccuracyRadiusMeters')],
  ['Search uses smooth adaptive map focus', component.includes('smoothFocusMap') && component.includes('map.flyTo') && component.includes('map.setView')],
  ['Selected pin uses CaneSprout sugarcane branding', component.includes('canesprout-brand-map-pin') && css.includes('.canesprout-brand-map-pin-face svg')],
  ['Approximate locations remain visually distinct', component.includes("precision !== 'site'") && css.includes('.canesprout-brand-map-pin.approximate')],
];
let passed=0;
console.log('\nCaneSprout v2.13.38 Precise Satellite Map Verification\n');
for (const [label, ok] of checks) { console.log(`${ok?'PASS':'FAIL'}  ${label}`); if(ok) passed++; }
console.log(`\n${passed}/${checks.length} checks passed.`);
if (passed !== checks.length) process.exit(1);
