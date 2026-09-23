import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TARGET_VERSION = '2.13.41';
const EXPECTED_BASE = '2.13.40';

function file(rel) { return path.join(ROOT, rel); }
function read(rel) { return fs.readFileSync(file(rel), 'utf8'); }
function write(rel, content) { fs.mkdirSync(path.dirname(file(rel)), { recursive: true }); fs.writeFileSync(file(rel), content, 'utf8'); }
function exists(rel) { return fs.existsSync(file(rel)); }
function assertFile(rel) { if (!exists(rel)) throw new Error(`Required project file is missing: ${rel}`); }

function patchVersionConstant(rel, constantName) {
  if (!exists(rel)) return;
  let source = read(rel);
  const re = new RegExp(`const\\s+${constantName}\\s*=\\s*['\"]([^'\"]+)['\"]\\s*;`);
  if (!re.test(source)) return;
  source = source.replace(re, `const ${constantName} = '${TARGET_VERSION}';`);
  write(rel, source);
}

function patchPackage() {
  const pkg = JSON.parse(read('package.json'));
  const current = String(pkg.version || '');
  if (current !== EXPECTED_BASE && current !== TARGET_VERSION) {
    throw new Error(`This patch expects CaneSprout ${EXPECTED_BASE}. Current package version is ${current || 'unknown'}. Apply v2.13.40 first.`);
  }
  pkg.version = TARGET_VERSION;
  pkg.scripts ||= {};
  pkg.scripts['verify:origin-attribute-coordinates'] = 'node scripts/verify-origin-attribute-coordinates-v2.13.41.mjs';
  write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

  if (exists('package-lock.json')) {
    const lock = JSON.parse(read('package-lock.json'));
    lock.version = TARGET_VERSION;
    if (lock.packages?.['']) lock.packages[''].version = TARGET_VERSION;
    write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
  }
}

function patchPublicVersion() {
  const info = JSON.parse(read('public/version.json'));
  info.version = TARGET_VERSION;
  info.notes = 'Adds an optional latitude/longitude pair to every Origin & Other Attributes field. The Germplasm Map uses the most relevant valid exact pair before any approximate place-name location.';
  info.updated = '2026-09-20';
  write('public/version.json', `${JSON.stringify(info, null, 2)}\n`);
}

function patchServiceWorker() {
  let source = read('public/sw.js');
  source = source.replace(/canesprout-offline-v\d+\.\d+\.\d+/g, `canesprout-offline-v${TARGET_VERSION}`);
  write('public/sw.js', source);
}

const COORDINATE_DEFS = [
  { after: 'origin', prefix: 'origin', label: 'Country', source: 'Country / origin' },
  { after: 'breeding_institution_developer_breeder', prefix: 'breeder', label: 'Breeding Institution', source: 'Breeding Institution/Developer/Breeder' },
  { after: 'collection_scope', prefix: 'collection', label: 'Collection', source: 'Local/International Collection' },
  { after: 'species', prefix: 'species', label: 'Species', source: 'Species' },
  { after: 'genetic_background', prefix: 'genetic_background', label: 'Genetic Background', source: 'Type/Genetic Background' },
  { after: 'other_details', prefix: 'other_details', label: 'Other Details', source: 'Other details' },
  { after: 'lot_planted_station', prefix: 'lot_planted', label: 'Lot Planted', source: 'Lot planted in the station' }
];

function coordinateFieldLine(indent, key, label, min, max, placeholder, coordinateFor) {
  return `${indent}{ "key": "${key}", "label": "${label}", "type": "number", "min": ${min}, "max": ${max}, "step": "any", "placeholder": "${placeholder}", "newTrait": true, "coordinateFor": "${coordinateFor}" },`;
}

function patchCharacterizationFields() {
  const rel = 'src/lib/characterizationFields.js';
  let source = read(rel);

  // v2.13.40 had one generic pair. It remains supported by the map as a
  // backwards-compatibility fallback, but it is no longer shown as a form field.
  source = source
    .split('\n')
    .filter((line) => !/"key"\s*:\s*"(?:latitude|longitude)"/.test(line))
    .join('\n');

  let lines = source.split('\n');
  for (const def of COORDINATE_DEFS) {
    const latKey = `${def.prefix}_latitude`;
    const lngKey = `${def.prefix}_longitude`;
    if (lines.some((line) => line.includes(`"key": "${latKey}"`))) continue;

    const index = lines.findIndex((line) => line.includes(`"key": "${def.after}"`));
    if (index < 0) throw new Error(`Could not find Origin & Other Attributes field: ${def.after}`);

    if (!lines[index].trimEnd().endsWith(',')) lines[index] = `${lines[index]},`;
    const indent = lines[index].match(/^\s*/)?.[0] || '      ';
    lines.splice(index + 1, 0,
      coordinateFieldLine(indent, latKey, `${def.label} Latitude (decimal degrees)`, -90, 90, 'e.g. 10.123456', def.after),
      coordinateFieldLine(indent, lngKey, `${def.label} Longitude (decimal degrees)`, -180, 180, 'e.g. 122.987654', def.after)
    );
  }

  write(rel, `${lines.join('\n').replace(/\n+$/, '')}\n`);
}

function patchRecordForm() {
  const rel = 'src/components/RecordFormModal.jsx';
  let source = read(rel);

  // Give coordinate controls a distinct but restrained form treatment and a more
  // descriptive optional label.
  if (!source.includes("field.coordinateFor ? 'coordinate-location-field'")) {
    source = source.replace(
      "${field.newTrait ? 'new-trait-field' : ''}`}",
      "${field.newTrait ? 'new-trait-field' : ''} ${field.coordinateFor ? 'coordinate-location-field' : ''}`}");
  }
  source = source.replace(
    "<span>{field.label}<i>{required ? 'Required' : 'Optional'}</i></span>",
    "<span>{field.label}<i>{required ? 'Required' : field.coordinateFor ? 'Optional exact location' : 'Optional'}</i></span>"
  );

  // If a v2.13.40 record already has the old general coordinates, show them in
  // the new Country/Origin pair when editing so they are not lost on save.
  if (!source.includes('function migrateLegacyOriginCoordinates')) {
    const anchor = "function readDraft(key) {";
    if (!source.includes(anchor)) throw new Error('Could not find RecordFormModal draft helper insertion point.');
    const helper = `function migrateLegacyOriginCoordinates(value = {}) {\n  const next = { ...value };\n  if (!String(next.origin_latitude ?? '').trim() && String(next.latitude ?? '').trim()) next.origin_latitude = next.latitude;\n  if (!String(next.origin_longitude ?? '').trim() && String(next.longitude ?? '').trim()) next.origin_longitude = next.longitude;\n  return next;\n}\n\n`;
    source = source.replace(anchor, `${helper}${anchor}`);
  }

  const oldInit = "const [form, setForm] = useState(() => ({ ...emptyForm(), ...(initial || {}), ...(storedDraft?.form || {}) }));";
  const newInit = "const [form, setForm] = useState(() => migrateLegacyOriginCoordinates({ ...emptyForm(), ...(initial || {}), ...(storedDraft?.form || {}) }));";
  if (source.includes(oldInit)) source = source.replace(oldInit, newInit);

  write(rel, source);
}

function patchVarietyMap() {
  const rel = 'src/lib/varietyMap.js';
  let source = read(rel);

  const replacement = `const EXACT_COORDINATE_SOURCES = [\n  { source: 'Lot planted in the station coordinates', latKey: 'lot_planted_latitude', lngKey: 'lot_planted_longitude', contextKey: 'lot_planted_station' },\n  { source: 'Other details coordinates', latKey: 'other_details_latitude', lngKey: 'other_details_longitude', contextKey: 'other_details' },\n  { source: 'Country / origin coordinates', latKey: 'origin_latitude', lngKey: 'origin_longitude', contextKey: 'origin' },\n  { source: 'Breeding institution coordinates', latKey: 'breeder_latitude', lngKey: 'breeder_longitude', contextKey: 'breeding_institution_developer_breeder' },\n  { source: 'Collection coordinates', latKey: 'collection_latitude', lngKey: 'collection_longitude', contextKey: 'collection_scope' },\n  { source: 'Species coordinates', latKey: 'species_latitude', lngKey: 'species_longitude', contextKey: 'species' },\n  { source: 'Genetic background coordinates', latKey: 'genetic_background_latitude', lngKey: 'genetic_background_longitude', contextKey: 'genetic_background' },\n  // Backward compatibility for the single v2.13.40 coordinate pair.\n  { source: 'Legacy general exact coordinates', latKey: 'latitude', lngKey: 'longitude', aliases: true }\n];\n\nexport function explicitCoordinatesForRecord(record = {}) {\n  for (const definition of EXACT_COORDINATE_SOURCES) {\n    const rawLat = definition.aliases\n      ? (record[definition.latKey] ?? record.lat ?? record.gps_latitude)\n      : record[definition.latKey];\n    const rawLng = definition.aliases\n      ? (record[definition.lngKey] ?? record.lng ?? record.lon ?? record.gps_longitude)\n      : record[definition.lngKey];\n    const lat = parseCoordinate(rawLat, -90, 90);\n    const lng = parseCoordinate(rawLng, -180, 180);\n    if (lat == null || lng == null) continue;\n    const coordinateLabel = \`${'${lat.toFixed(6)}, ${lng.toFixed(6)}'}\`;\n    const context = definition.contextKey ? usable(record[definition.contextKey]) : '';\n    return {\n      lat,\n      lng,\n      zoom: mapZoomForPrecision('coordinate'),\n      label: context ? \`${'${context} · ${coordinateLabel}'}\` : coordinateLabel,\n      coordinateLabel,\n      context,\n      source: definition.source,\n      precision: 'coordinate',\n      approximate: false,\n      exact: true\n    };\n  }\n  return null;\n}\n\n`;

  const functionRe = /(?:const EXACT_COORDINATE_SOURCES = \[[\s\S]*?\n\];\n\n)?export function explicitCoordinatesForRecord\(record = \{\}\) \{[\s\S]*?\n\}\n\n(?=export function explicitLocationFromOtherDetails)/;
  if (!functionRe.test(source)) throw new Error('Could not locate explicitCoordinatesForRecord in varietyMap.js. Apply v2.13.40 first.');
  source = source.replace(functionRe, replacement);

  source = source.replace(
    /location:\s*info\.location\s*\|\|\s*\(exactCoordinates\s*\?\s*exactCoordinates\.label\s*:\s*''\),/,
    "location: exactCoordinates ? exactCoordinates.label : info.location,"
  );
  source = source.replace(
    /locationSource:\s*exactCoordinates\s*\?\s*'Latitude \/ Longitude \(exact coordinates\)'\s*:\s*info\.source,/,
    "locationSource: exactCoordinates ? exactCoordinates.source : info.source,"
  );

  // If an earlier local patch already changed these lines, normalize them too.
  source = source.replace(
    /location:\s*exactCoordinates\s*\?\s*exactCoordinates\.label\s*:\s*info\.location,/,
    "location: exactCoordinates ? exactCoordinates.label : info.location,"
  );
  source = source.replace(
    /locationSource:\s*exactCoordinates\s*\?\s*exactCoordinates\.source\s*:\s*info\.source,/,
    "locationSource: exactCoordinates ? exactCoordinates.source : info.source,"
  );

  write(rel, source);
}

const CSS_MARKER = 'v2.13.41 PER-ATTRIBUTE OPTIONAL COORDINATES';
const CSS_BLOCK = `\n\n/* ================================================================\n   ${CSS_MARKER}\n   ================================================================ */\n.coordinate-location-field > span {\n  color: #476f50;\n}\n.coordinate-location-field > span i {\n  color: #829083;\n  font-size: 7px;\n  letter-spacing: .02em;\n}\n.coordinate-location-field input {\n  background: linear-gradient(180deg, rgba(250,253,248,.96), rgba(244,249,240,.92));\n  border-color: rgba(77, 127, 82, .20);\n}\n.coordinate-location-field input:focus {\n  border-color: #76a66c;\n  box-shadow: 0 0 0 3px rgba(117, 168, 95, .13);\n}\n`;

function patchStyles() {
  let source = read('src/styles.css');
  if (!source.includes(CSS_MARKER)) source += CSS_BLOCK;
  write('src/styles.css', source);
}

function patchVerifierVersion(rel) {
  if (!exists(rel)) return;
  let source = read(rel);
  source = source.replace(/Version is 2\.13\.\d+/g, `Version is ${TARGET_VERSION}`);
  source = source.replace(/pkg\.version === '2\.13\.\d+'/g, `pkg.version === '${TARGET_VERSION}'`);
  source = source.replace(/CaneSprout v2\.13\.\d+/g, `CaneSprout v${TARGET_VERSION}`);
  write(rel, source);
}

for (const rel of [
  'package.json',
  'src/App.jsx',
  'src/styles.css',
  'src/components/RecordFormModal.jsx',
  'src/lib/characterizationFields.js',
  'src/lib/varietyMap.js',
  'public/version.json',
  'public/sw.js'
]) assertFile(rel);

patchPackage();
patchVersionConstant('src/App.jsx', 'APP_VERSION');
patchVersionConstant('src/lib/offlineApp.js', 'OFFLINE_VERSION');
patchPublicVersion();
patchServiceWorker();
patchCharacterizationFields();
patchRecordForm();
patchVarietyMap();
patchStyles();
patchVerifierVersion('scripts/verify-profile-trait-visuals.mjs');
patchVerifierVersion('scripts/verify-profile-map-exact-v2.13.40.mjs');
patchVerifierVersion('scripts/verify-variety-map-profile-return.mjs');

console.log(`\nCaneSprout ${TARGET_VERSION} Origin attribute coordinate patch applied.`);
console.log('  - Every Origin & Other Attributes field has its own optional latitude/longitude pair');
console.log('  - Exact coordinate pairs are stored as normal optional characterization traits');
console.log('  - v2.13.40 general coordinates migrate into Country/Origin coordinates when editing');
console.log('  - Map uses the most relevant valid exact coordinate pair before approximate geocoding');
console.log('  - Old v2.13.40 latitude/longitude records remain map-compatible');
console.log('\nNext: npm.cmd run verify:origin-attribute-coordinates && npm.cmd run build\n');
