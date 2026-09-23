import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const TARGET_VERSION = '2.13.49';
const checks = [];
function pass(name, condition, detail = '') { checks.push({ name, ok: Boolean(condition), detail }); }

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const fieldsSource = fs.readFileSync(path.join(ROOT, 'src/lib/characterizationFields.js'), 'utf8');
const formSource = fs.readFileSync(path.join(ROOT, 'src/components/RecordFormModal.jsx'), 'utf8');
const mapSource = fs.readFileSync(path.join(ROOT, 'src/lib/varietyMap.js'), 'utf8');
const styles = fs.readFileSync(path.join(ROOT, 'src/styles.css'), 'utf8');

const coordinatePrefixes = ['origin', 'breeder', 'collection', 'species', 'genetic_background', 'other_details', 'lot_planted'];
const expectedKeys = coordinatePrefixes.flatMap((prefix) => [`${prefix}_latitude`, `${prefix}_longitude`]);

pass(`Version is ${TARGET_VERSION}`, pkg.version === TARGET_VERSION, pkg.version);
pass('Verifier npm script exists', pkg.scripts?.['verify:origin-attribute-coordinates']?.includes('verify-origin-attribute-coordinates-v2.13.41.mjs'));
pass('All 14 per-attribute coordinate fields exist', expectedKeys.every((key) => fieldsSource.includes(`"key": "${key}"`)));
pass('Old generic form latitude field is no longer shown', !fieldsSource.includes('"key": "latitude"'));
pass('Old generic form longitude field is no longer shown', !fieldsSource.includes('"key": "longitude"'));
pass('Coordinate inputs remain optional exact-location controls', formSource.includes('Optional exact location'));
pass('Legacy v2.13.40 coordinates migrate into Country/Origin when editing', formSource.includes('migrateLegacyOriginCoordinates'));
pass('Coordinate form styling is present', styles.includes('v2.13.41 PER-ATTRIBUTE OPTIONAL COORDINATES'));
pass('Map supports per-attribute exact coordinate sources', mapSource.includes('EXACT_COORDINATE_SOURCES'));
pass('Map retains legacy general coordinate fallback', mapSource.includes('Legacy general exact coordinates'));

const moduleUrl = `${pathToFileURL(path.join(ROOT, 'src/lib/varietyMap.js')).href}?verify=${Date.now()}`;
const map = await import(moduleUrl);

const origin = map.explicitCoordinatesForRecord({
  origin: 'Philippines', origin_latitude: '10.123456', origin_longitude: '122.987654'
});
pass('Country/Origin exact coordinates resolve', origin?.lat === 10.123456 && origin?.lng === 122.987654 && /Country \/ origin/.test(origin?.source || ''));

const priority = map.explicitCoordinatesForRecord({
  origin: 'Philippines', origin_latitude: '10.1', origin_longitude: '122.1',
  lot_planted_station: 'Station A', lot_planted_latitude: '10.9', lot_planted_longitude: '123.9'
});
pass('Lot-planted exact coordinates outrank origin coordinates', priority?.lat === 10.9 && priority?.lng === 123.9 && /Lot planted/.test(priority?.source || ''));

const nextValid = map.explicitCoordinatesForRecord({
  lot_planted_latitude: '999', lot_planted_longitude: '123.9',
  origin_latitude: '10.2', origin_longitude: '122.2'
});
pass('Invalid higher-priority coordinates fall through to next valid pair', nextValid?.lat === 10.2 && nextValid?.lng === 122.2);

const legacy = map.explicitCoordinatesForRecord({ latitude: '10.3', longitude: '122.3' });
pass('Legacy v2.13.40 coordinate pair remains compatible', legacy?.lat === 10.3 && legacy?.lng === 122.3 && /Legacy/.test(legacy?.source || ''));

const partial = map.explicitCoordinatesForRecord({ origin_latitude: '10.3' });
pass('Incomplete coordinate pair is ignored safely', partial === null);

const catalog = map.buildVarietyMapCatalog([{ variety: 'TEST 1', origin: 'Philippines', origin_latitude: '10.55', origin_longitude: '122.77' }]);
pass('Germplasm catalog uses exact coordinate point', catalog[0]?.coords?.lat === 10.55 && catalog[0]?.coords?.lng === 122.77 && catalog[0]?.precision === 'coordinate');
pass('Catalog reports coordinate source instead of approximate origin source', /coordinates/.test(catalog[0]?.locationSource || ''));

console.log(`\nCaneSprout v${TARGET_VERSION} Origin Attribute Coordinates Verification\n`);
for (const check of checks) console.log(`${check.ok ? 'PASS' : 'FAIL'}  ${check.name}${check.detail && !check.ok ? ` (${check.detail})` : ''}`);
const passed = checks.filter((check) => check.ok).length;
console.log(`\n${passed}/${checks.length} checks passed.\n`);
if (passed !== checks.length) process.exitCode = 1;
