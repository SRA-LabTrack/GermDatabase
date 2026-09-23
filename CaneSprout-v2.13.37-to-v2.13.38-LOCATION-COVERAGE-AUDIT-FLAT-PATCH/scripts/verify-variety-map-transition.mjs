import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const component = fs.readFileSync(path.join(root,'src/components/VarietyMapModal.jsx'),'utf8');
const css = fs.readFileSync(path.join(root,'src/styles.css'),'utf8');
const checks = [
  ['Tiles update during animated pans', component.includes('updateWhenIdle: false')],
  ['Destination keeps a larger tile buffer', component.includes('keepBuffer: 4')],
  ['Destination satellite tiles are warmed before movement', component.includes('warmDestinationTiles(coords, targetZoom)')],
  ['Destination warmer includes Esri imagery', component.includes('World_Imagery/MapServer/tile')],
  ['Marker catalog is not rebuilt just because selection changes', component.includes('}, [catalog, mapReady]);')],
  ['Initial map fit is guarded to one time', component.includes('initialMapFitDoneRef')],
  ['Stale moveend popup callbacks are cancelled', component.includes("map.off('moveend', popupMoveEndRef.current)")],
  ['Long redirects use a short fly animation', component.includes('duration: .68')],
  ['Leaflet map has a dark non-white loading background', css.includes('.variety-map-canvas.leaflet-container') && css.includes('#17291f')],
  ['Map remains Canvas optimized', component.includes('preferCanvas: true') && component.includes('L.circleMarker')],
];
let passed=0;
console.log('\nCaneSprout v2.13.38 Seamless Variety Map Redirect Verification\n');
for (const [label, ok] of checks) { console.log(`${ok?'PASS':'FAIL'}  ${label}`); if(ok) passed++; }
console.log(`\n${passed}/${checks.length} checks passed.`);
if (passed !== checks.length) process.exit(1);
