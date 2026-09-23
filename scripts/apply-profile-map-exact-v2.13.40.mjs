import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TARGET_VERSION = '2.13.40';
const EXPECTED_BASE = '2.13.39';

function file(rel) { return path.join(ROOT, rel); }
function read(rel) { return fs.readFileSync(file(rel), 'utf8'); }
function write(rel, content) { fs.mkdirSync(path.dirname(file(rel)), { recursive: true }); fs.writeFileSync(file(rel), content, 'utf8'); }
function exists(rel) { return fs.existsSync(file(rel)); }
function assertFile(rel) { if (!exists(rel)) throw new Error(`Required project file is missing: ${rel}`); }

function patchVersionConstant(rel, constantName) {
  if (!exists(rel)) return;
  let source = read(rel);
  const re = new RegExp(`const\\s+${constantName}\\s*=\\s*['\"]([^'\"]+)['\"]\\s*;`);
  if (!re.test(source)) throw new Error(`Could not find ${constantName} in ${rel}.`);
  source = source.replace(re, `const ${constantName} = '${TARGET_VERSION}';`);
  write(rel, source);
}

function patchPackage() {
  const pkg = JSON.parse(read('package.json'));
  const current = String(pkg.version || '');
  if (current !== EXPECTED_BASE && current !== TARGET_VERSION) {
    throw new Error(`This patch expects CaneSprout ${EXPECTED_BASE}. Current package version is ${current || 'unknown'}. Apply the v2.13.39 patch first.`);
  }
  pkg.version = TARGET_VERSION;
  pkg.scripts ||= {};
  pkg.scripts['verify:profile-map-exact'] = 'node scripts/verify-profile-map-exact-v2.13.40.mjs';
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
  info.notes = 'Adds clickable RHS color preview mode and optional latitude/longitude inputs that override approximate Germplasm Map locations with exact satellite-coordinate positioning.';
  info.updated = '2026-09-20';
  write('public/version.json', `${JSON.stringify(info, null, 2)}\n`);
}

function patchServiceWorker() {
  let source = read('public/sw.js');
  source = source.replace(/canesprout-offline-v\d+\.\d+\.\d+/g, `canesprout-offline-v${TARGET_VERSION}`);
  write('public/sw.js', source);
}

function patchCharacterizationFields() {
  const rel = 'src/lib/characterizationFields.js';
  let source = read(rel);
  if (source.includes('"key": "latitude"') || source.includes("'key': 'latitude'")) {
    write(rel, source);
    return;
  }

  const anchor = '{ "key": "lot_planted_station", "label": "Lot Planted in the station", "type": "text", "newTrait": true }';
  if (!source.includes(anchor)) throw new Error('Could not find Lot Planted in the station in characterizationFields.js.');
  const replacement = `${anchor},\n      { "key": "latitude", "label": "Latitude (decimal degrees)", "type": "number", "min": -90, "max": 90, "step": "any", "placeholder": "e.g. 10.123456", "newTrait": true },\n      { "key": "longitude", "label": "Longitude (decimal degrees)", "type": "number", "min": -180, "max": 180, "step": "any", "placeholder": "e.g. 122.987654", "newTrait": true }`;
  source = source.replace(anchor, replacement);
  write(rel, source);
}

function patchRecordForm() {
  const rel = 'src/components/RecordFormModal.jsx';
  let source = read(rel);
  if (source.includes('min={field.min ??') && source.includes('max={field.max') && source.includes('step={field.step')) return;

  const oldInput = `<input {...common} type={field.type || 'text'} min={field.type === 'number' ? 0 : undefined} step={field.type === 'number' ? 'any' : undefined} placeholder={required ? 'Required' : 'Optional'} />`;
  const newInput = `<input\n          {...common}\n          type={field.type || 'text'}\n          min={field.min ?? (field.type === 'number' ? 0 : undefined)}\n          max={field.max}\n          step={field.step ?? (field.type === 'number' ? 'any' : undefined)}\n          placeholder={field.placeholder || (required ? 'Required' : 'Optional')}\n        />`;
  if (!source.includes(oldInput)) throw new Error('RecordFormModal input renderer did not match the expected structure.');
  source = source.replace(oldInput, newInput);
  write(rel, source);
}

function patchVarietyMap() {
  const rel = 'src/lib/varietyMap.js';
  let source = read(rel);

  if (!source.includes("if (precision === 'coordinate') return 19;")) {
    source = source.replace(
      "export function mapZoomForPrecision(precision = 'country') {\n  if (precision === 'site') return 17;",
      "export function mapZoomForPrecision(precision = 'country') {\n  if (precision === 'coordinate') return 19;\n  if (precision === 'site') return 17;"
    );
  }

  if (!source.includes("if (precision === 'coordinate') return 10;")) {
    source = source.replace(
      "export function mapAccuracyRadiusMeters(precision = 'country') {\n  if (precision === 'site') return 140;",
      "export function mapAccuracyRadiusMeters(precision = 'country') {\n  if (precision === 'coordinate') return 10;\n  if (precision === 'site') return 140;"
    );
  }

  if (!source.includes('export function explicitCoordinatesForRecord')) {
    const anchor = "export function explicitLocationFromOtherDetails(value = '') {";
    if (!source.includes(anchor)) throw new Error('Could not locate coordinate-helper insertion point in varietyMap.js.');
    const helper = `function parseCoordinate(value, min, max) {\n  const raw = text(value);\n  if (!raw) return null;\n  const number = Number(raw);\n  if (!Number.isFinite(number) || number < min || number > max) return null;\n  return number;\n}\n\nexport function explicitCoordinatesForRecord(record = {}) {\n  const lat = parseCoordinate(record.latitude ?? record.lat ?? record.gps_latitude, -90, 90);\n  const lng = parseCoordinate(record.longitude ?? record.lng ?? record.lon ?? record.gps_longitude, -180, 180);\n  if (lat == null || lng == null) return null;\n  return {\n    lat,\n    lng,\n    zoom: mapZoomForPrecision('coordinate'),\n    label: \`\${lat.toFixed(6)}, \${lng.toFixed(6)}\`,\n    precision: 'coordinate',\n    approximate: false,\n    exact: true\n  };\n}\n\n`;
    source = source.replace(anchor, `${helper}${anchor}`);
  }

  if (!source.includes('if (explicitCoordinatesForRecord(record)) score += 50;')) {
    source = source.replace(
      'function richness(record = {}) {\n  let score = 0;',
      'function richness(record = {}) {\n  let score = 0;\n  if (explicitCoordinatesForRecord(record)) score += 50;'
    );
  }

  if (!source.includes('const exactCoordinates = explicitCoordinatesForRecord(record);')) {
    source = source.replace(
      'return [...bestByIdentity.entries()].map(([identity, record]) => {\n    const info = bestLocationForRecord(record);',
      'return [...bestByIdentity.entries()].map(([identity, record]) => {\n    const exactCoordinates = explicitCoordinatesForRecord(record);\n    const info = bestLocationForRecord(record);'
    );
  }

  source = source.replace(
    'const sourcePrecision = info.precision || precisionForSource(info.source);',
    "const sourcePrecision = exactCoordinates ? 'coordinate' : (info.precision || precisionForSource(info.source));"
  );
  source = source.replace(
    'const knownBase = info.location ? resolveKnownLocation(info.location) : null;',
    'const knownBase = exactCoordinates || (info.location ? resolveKnownLocation(info.location) : null);'
  );
  source = source.replace(
    "approximate: precision !== 'site'",
    "approximate: precision !== 'site' && precision !== 'coordinate'"
  );
  source = source.replace(
    'location: info.location,\n      locationSource: info.source,',
    "location: info.location || (exactCoordinates ? exactCoordinates.label : ''),\n      locationSource: exactCoordinates ? 'Latitude / Longitude (exact coordinates)' : info.source,"
  );

  if (!source.includes('explicitCoordinatesForRecord(record)')) throw new Error('Exact coordinate map logic was not installed.');
  write(rel, source);
}

const CSS_MARKER = 'v2.13.40 CLICKABLE COLOR PREVIEW + EXACT GPS MAP';
const CSS_BLOCK = `\n\n/* ================================================================\n   ${CSS_MARKER}\n   ================================================================ */\n.trait-color-preview {\n  appearance: none;\n  font: inherit;\n  color: inherit;\n  text-align: left;\n  cursor: pointer;\n  transition: transform .16s ease, border-color .16s ease, box-shadow .16s ease;\n}\n.trait-color-preview:hover {\n  transform: translateY(-1px);\n  border-color: rgba(62, 112, 72, .34);\n  box-shadow: 0 7px 18px rgba(37,75,45,.10), inset 0 1px 0 rgba(255,255,255,.82);\n}\n.trait-color-preview:focus-visible {\n  outline: 3px solid rgba(113, 164, 91, .28);\n  outline-offset: 2px;\n}\n.trait-color-dialog-backdrop {\n  position: fixed;\n  inset: 0;\n  z-index: 2147483645;\n  display: grid;\n  place-items: center;\n  padding: 22px;\n  background: rgba(11, 28, 15, .68);\n  backdrop-filter: blur(12px);\n}\n.trait-color-dialog {\n  width: min(760px, 96vw);\n  max-height: min(820px, 92vh);\n  overflow: auto;\n  border-radius: 24px;\n  border: 1px solid rgba(255,255,255,.72);\n  background: #f8fbf5;\n  box-shadow: 0 32px 90px rgba(7, 25, 12, .34);\n}\n.trait-color-dialog-header {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 18px;\n  padding: 18px 20px;\n  border-bottom: 1px solid rgba(46, 88, 54, .10);\n}\n.trait-color-dialog-header small {\n  display: block;\n  color: #7e8e82;\n  font-size: 8px;\n  font-weight: 800;\n  letter-spacing: .13em;\n  text-transform: uppercase;\n}\n.trait-color-dialog-header h3 {\n  margin: 3px 0 0;\n  color: #244b31;\n  font: 500 25px/1.1 Georgia, 'Times New Roman', serif;\n}\n.trait-color-dialog-close {\n  width: 38px;\n  height: 38px;\n  border: 1px solid rgba(46, 88, 54, .14);\n  border-radius: 50%;\n  background: rgba(255,255,255,.82);\n  color: #31583b;\n  font-size: 25px;\n  line-height: 1;\n  cursor: pointer;\n}\n.trait-color-dialog-canvas {\n  display: grid;\n  grid-template-columns: 1fr;\n  min-height: 360px;\n  margin: 18px;\n  overflow: hidden;\n  border-radius: 20px;\n  border: 1px solid rgba(20, 40, 24, .18);\n  box-shadow: inset 0 0 0 1px rgba(255,255,255,.20), 0 18px 38px rgba(32, 54, 36, .12);\n}\n.trait-color-dialog-canvas.is-multi { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }\n.trait-color-dialog-panel {\n  position: relative;\n  display: flex;\n  align-items: flex-end;\n  min-height: 300px;\n  padding: 22px;\n}\n.trait-color-dialog-code {\n  display: inline-grid;\n  gap: 3px;\n  padding: 10px 12px;\n  border-radius: 12px;\n  background: rgba(0,0,0,.18);\n  backdrop-filter: blur(8px);\n  box-shadow: inset 0 1px 0 rgba(255,255,255,.18);\n}\n.trait-color-dialog-code strong { font-size: 18px; letter-spacing: .03em; }\n.trait-color-dialog-code span { font-size: 10px; font-weight: 800; letter-spacing: .08em; }\n.trait-color-dialog-details {\n  display: grid;\n  gap: 8px;\n  padding: 0 18px 4px;\n}\n.trait-color-dialog-details > div {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  padding: 10px 12px;\n  border-radius: 13px;\n  background: rgba(236, 244, 232, .80);\n}\n.trait-color-dialog-dot {\n  width: 26px;\n  height: 26px;\n  flex: 0 0 26px;\n  border-radius: 8px;\n  border: 1px solid rgba(27, 47, 31, .18);\n}\n.trait-color-dialog-details span:last-child { display: grid; gap: 1px; }\n.trait-color-dialog-details strong { color: #31563b; font-size: 11px; }\n.trait-color-dialog-details small { color: #7c8b80; font-size: 8px; }\n.trait-color-dialog-note {\n  margin: 12px 18px 20px;\n  color: #76867a;\n  font-size: 9px;\n  line-height: 1.5;\n}\n@media (max-width: 620px) {\n  .trait-color-dialog-backdrop { padding: 10px; }\n  .trait-color-dialog { border-radius: 18px; }\n  .trait-color-dialog-canvas { min-height: 300px; margin: 12px; }\n  .trait-color-dialog-panel { min-height: 250px; padding: 16px; }\n  .trait-color-dialog-details { padding-inline: 12px; }\n  .trait-color-dialog-note { margin-inline: 12px; }\n}\n`;

function patchStyles() {
  let source = read('src/styles.css');
  if (!source.includes(CSS_MARKER)) source += CSS_BLOCK;
  write('src/styles.css', source);
}

function patchProfileTraitVerifier() {
  const rel = 'scripts/verify-profile-trait-visuals.mjs';
  if (!exists(rel)) return;
  let source = read(rel);
  source = source.replace(/Version is 2\.13\.\d+/g, `Version is ${TARGET_VERSION}`);
  source = source.replace(/pkg\.version === '2\.13\.\d+'/g, `pkg.version === '${TARGET_VERSION}'`);
  source = source.replace(/CaneSprout v2\.13\.\d+ Profile Trait Visualization Verification/g, `CaneSprout v${TARGET_VERSION} Profile Trait Visualization Verification`);
  write(rel, source);
}

function patchProfileReturnVerifier() {
  const rel = 'scripts/verify-variety-map-profile-return.mjs';
  if (!exists(rel)) return;
  let source = read(rel);
  source = source.replace(/Version is 2\.13\.\d+/g, `Version is ${TARGET_VERSION}`);
  source = source.replace(/pkg\.version === '2\.13\.\d+'/g, `pkg.version === '${TARGET_VERSION}'`);
  source = source.replace(/CaneSprout v2\.13\.\d+ Map\/Profile Return Verification/g, `CaneSprout v${TARGET_VERSION} Map/Profile Return Verification`);
  write(rel, source);
}

for (const rel of [
  'package.json',
  'src/App.jsx',
  'src/styles.css',
  'src/components/TraitValue.jsx',
  'src/components/RecordFormModal.jsx',
  'src/lib/characterizationFields.js',
  'src/lib/varietyMap.js',
  'src/lib/traitVisuals.js',
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
patchProfileTraitVerifier();
patchProfileReturnVerifier();

console.log(`\nCaneSprout ${TARGET_VERSION} clickable color + exact GPS map patch applied.`);
console.log('  - Color swatches now open a large preview dialog');
console.log('  - Latitude/longitude fields added as optional decimal-degree inputs');
console.log('  - Valid coordinate pairs override approximate place-name coordinates');
console.log('  - Exact coordinate pins use coordinate precision, satellite-level zoom, and a ~10 m accuracy visualization');
console.log('  - Invalid/incomplete coordinates safely fall back to the existing location resolver');
console.log('\nNext: npm.cmd run verify:profile-map-exact && npm.cmd run build\n');
