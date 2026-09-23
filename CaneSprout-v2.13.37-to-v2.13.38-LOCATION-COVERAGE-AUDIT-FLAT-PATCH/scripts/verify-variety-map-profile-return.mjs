import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const app = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');
const map = fs.readFileSync(path.join(root, 'src', 'components', 'VarietyMapModal.jsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const checks = [
  ['Version is 2.13.38', pkg.version === '2.13.38'],
  ['Map stays mounted when View profile is opened', app.includes('onOpenProfile={(recordId) => { setDetailId(recordId); }}')],
  ['Map profile open no longer calls setShowMap(false)', !/onOpenProfile=\{\(recordId\) => \{ setShowMap\(false\); setDetailId\(recordId\); \}\}/.test(app)],
  ['Selected branded marker is interactive', /selectedPinIcon\(L, \{ approximate \}\)[\s\S]*?interactive: true/.test(map)],
  ['Selected branded marker reopens base popup', /selectedOverlayRef\.current\.on\('click'[\s\S]*?marker\?\.openPopup\?\.\(\)/.test(map)],
  ['Keyboard can reopen selected popup', /selectedOverlayRef\.current\.on\('keypress'/.test(map)],
  ['Popup close stays isolated from map close', /className="variety-map-canvas-wrap"[^>]+onMouseDown=\{\(event\) => event\.stopPropagation\(\)\}/.test(map)],
  ['Profile backdrop remains above map', /detail-profile-backdrop[\s\S]*?z-index:\s*2147483400/.test(css)],
];

console.log('\nCaneSprout v2.13.38 Map/Profile Return Verification\n');
let pass = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (ok) pass += 1;
}
console.log(`\n${pass}/${checks.length} checks passed.`);
if (pass !== checks.length) process.exit(1);
