import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const component = fs.readFileSync(path.join(root,'src/components/VarietyMapModal.jsx'),'utf8');
const css = fs.readFileSync(path.join(root,'src/styles.css'),'utf8');
const checks = [
  ['Bulk markers use Canvas circle markers', component.includes('L.circleMarker') && component.includes('preferCanvas: true')],
  ['Marker layer is not rebuilt from selectedIdentity styling', !component.includes('icon: markerIcon')],
  ['Satellite tiles stream during pan but stay light during zoom', component.includes('updateWhenZooming: false') && component.includes('updateWhenIdle: false')],
  ['Map animation stops before a new redirect', component.includes('map.stop()')],
  ['Nearby redirects use relaxed animated setView', component.includes("duration: .72")],
  ['Long redirects use relaxed flyTo animation', component.includes("duration: 1.55")],
  ['Popup opens from moveend instead of fixed long delay', component.includes("once('moveend'")],
  ['Popup click propagation is disabled', component.includes('disableClickPropagation')],
  ['Backdrop cannot close map from popup interaction', component.includes('<div className="modal-backdrop variety-map-backdrop">')],
  ['Only one branded HTML pin is used for selected variety', component.includes('selectedOverlayRef') && css.includes('.canesprout-brand-map-pin')],
];
let passed=0;
console.log('\nCaneSprout v2.13.38 Smooth Map Interaction Verification\n');
for (const [label, ok] of checks) { console.log(`${ok?'PASS':'FAIL'}  ${label}`); if(ok) passed++; }
console.log(`\n${passed}/${checks.length} checks passed.`);
if (passed !== checks.length) process.exit(1);
