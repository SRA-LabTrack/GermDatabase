import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const pkg = JSON.parse(read('package.json'));
const trait = read('src/components/TraitValue.jsx');
const fields = read('src/lib/characterizationFields.js');
const form = read('src/components/RecordFormModal.jsx');
const mapSource = read('src/lib/varietyMap.js');
const css = read('src/styles.css');

const mapModule = await import(`${pathToFileURL(path.join(root, 'src/lib/varietyMap.js')).href}?verify=${Date.now()}`);
const exact = mapModule.explicitCoordinatesForRecord({ latitude: '10.123456', longitude: '122.987654' });
const exactCatalog = mapModule.buildVarietyMapCatalog([{
  variety: 'Coordinate Test Cane',
  origin: 'Philippines',
  latitude: '10.123456',
  longitude: '122.987654'
}]);
const fallbackCatalog = mapModule.buildVarietyMapCatalog([{
  variety: 'Fallback Test Cane',
  origin: 'Philippines',
  latitude: '999',
  longitude: '122.987654'
}]);

const exactEntry = exactCatalog[0];
const fallbackEntry = fallbackCatalog[0];
const checks = [
  ['Version is 2.13.49', pkg.version === '2.13.49'],
  ['Clickable color palette exists', trait.includes('onClick={() => setPreviewOpen(true)}') && trait.includes('aria-haspopup="dialog"')],
  ['Color preview uses a modal portal', trait.includes('createPortal') && trait.includes('trait-color-dialog')],
  ['Color preview CSS exists', css.includes('v2.13.40 CLICKABLE COLOR PREVIEW + EXACT GPS MAP') && css.includes('.trait-color-dialog-backdrop')],
  ['Latitude field exists', fields.includes('"key": "latitude"')],
  ['Longitude field exists', fields.includes('"key": "longitude"')],
  ['Coordinate inputs accept negative decimal values', form.includes('field.min ??') && form.includes('field.max') && form.includes('field.step')],
  ['Exact-coordinate resolver exists', mapSource.includes('export function explicitCoordinatesForRecord')],
  ['Exact coordinates resolve numerically', exact?.lat === 10.123456 && exact?.lng === 122.987654],
  ['Exact coordinates use coordinate precision', exact?.precision === 'coordinate' && exact?.approximate === false],
  ['Exact coordinate zoom is satellite-site level', mapModule.mapZoomForPrecision('coordinate') >= 18],
  ['Exact coordinate radius is small', mapModule.mapAccuracyRadiusMeters('coordinate') <= 20],
  ['Exact coordinates override approximate country coordinates', exactEntry?.coords?.lat === 10.123456 && exactEntry?.coords?.lng === 122.987654],
  ['Exact coordinate entry is not approximate', exactEntry?.coords?.approximate === false && exactEntry?.precision === 'coordinate'],
  ['Exact coordinate source is clearly identified', /Latitude \/ Longitude/.test(exactEntry?.locationSource || '')],
  ['Invalid coordinates fall back to normal location resolution', fallbackEntry?.precision === 'country' && fallbackEntry?.coords?.approximate === true],
];

console.log('\nCaneSprout v2.13.49 Clickable Color + Exact Coordinate Verification\n');
let pass = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (ok) pass += 1;
}
console.log(`\n${pass}/${checks.length} checks passed.`);
if (pass !== checks.length) process.exit(1);
