import fs from 'node:fs';

const BASE_VERSION = '2.13.89';
const TARGET_VERSION = '2.13.90';

const FILES = {
  registryApi: 'src/lib/registryApi.js',
  app: 'src/App.jsx',
  pkg: 'package.json',
  lock: 'package-lock.json',
  version: 'public/version.json',
  gitignore: '.gitignore',
};

function fail(message) {
  console.error(`\nERROR: ${message}`);
  process.exit(1);
}

function read(path) {
  if (!fs.existsSync(path)) fail(`Required file not found: ${path}`);
  return fs.readFileSync(path, 'utf8');
}

function write(path, content) {
  fs.writeFileSync(path, content, 'utf8');
}

function backup(path) {
  if (!fs.existsSync(path)) return;
  const out = `${path}.v${BASE_VERSION}-backup`;
  if (!fs.existsSync(out)) fs.copyFileSync(path, out);
}

console.log(`
============================================================
CaneSprout ${BASE_VERSION} -> ${TARGET_VERSION}
Germplasm Scroll Crash Hotfix
============================================================
`);

const pkg = JSON.parse(read(FILES.pkg));
if (![BASE_VERSION, TARGET_VERSION].includes(pkg.version)) {
  fail(`Expected package version ${BASE_VERSION} or ${TARGET_VERSION}, found ${pkg.version}.`);
}

for (const file of [FILES.registryApi, FILES.app, FILES.pkg, FILES.lock, FILES.version]) {
  if (fs.existsSync(file)) backup(file);
}

let api = read(FILES.registryApi);
let app = read(FILES.app);

const sanitizerMarker = 'function normalizeOriginMetadataCollision(record = {})';
if (!api.includes(sanitizerMarker)) {
  const parseBlock = `function parseJsonObject(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
`;

  if (!api.includes(parseBlock)) fail('Could not locate parseJsonObject() in registryApi.js.');

  const helper = `${parseBlock}
function normalizeOriginMetadataCollision(record = {}) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return record;

  const next = { ...record };
  const nestedOrigin =
    next.origin && typeof next.origin === 'object' && !Array.isArray(next.origin)
      ? next.origin
      : null;

  if (!nestedOrigin) return next;

  const firstText = (...values) => {
    for (const value of values) {
      if (value == null || typeof value === 'object') continue;
      const cleaned = String(value).trim();
      if (cleaned) return cleaned;
    }
    return '';
  };

  // v2.13.88 stored workbook provenance inside details_json.origin. Because
  // expandRecord() historically spread details_json directly onto the record,
  // that nested object could overwrite the scalar origin country field.
  // React then received an object as a card child when viewport previews loaded.
  next.origin = firstText(
    next.origin_country,
    nestedOrigin.origin_country,
    nestedOrigin.country
  );

  next.breeding_institution_developer_breeder = firstText(
    next.breeding_institution_developer_breeder,
    nestedOrigin.breeding_institution_developer_breeder,
    nestedOrigin.breeding_institution,
    nestedOrigin.breeder
  );

  next.collection_scope = firstText(
    next.collection_scope,
    nestedOrigin.collection_scope,
    nestedOrigin.local_international_collection
  );

  next.species = firstText(
    next.species,
    nestedOrigin.species
  );

  next.genetic_background = firstText(
    next.genetic_background,
    nestedOrigin.genetic_background,
    nestedOrigin.type_genetic_background
  );

  next.origin_other_details = firstText(
    next.origin_other_details,
    nestedOrigin.origin_other_details,
    nestedOrigin.other_details
  );

  next.lot_planted_in_station = firstText(
    next.lot_planted_in_station,
    nestedOrigin.lot_planted_in_station,
    nestedOrigin.lot_planted
  );

  return next;
}
`;
  api = api.replace(parseBlock, helper);
}

const oldExpand = `  return { ...OPTIONAL_TRAIT_DEFAULTS, ...baseline, ...traits, ...extra, ...(core || {}), $id: core?.$id || detail?.$id };
}`;
const newExpand = `  return normalizeOriginMetadataCollision({
    ...OPTIONAL_TRAIT_DEFAULTS,
    ...baseline,
    ...traits,
    ...extra,
    ...(core || {}),
    $id: core?.$id || detail?.$id
  });
}`;
if (api.includes(oldExpand)) {
  api = api.replace(oldExpand, newExpand);
} else if (!api.includes('return normalizeOriginMetadataCollision({')) {
  fail('Could not safely patch expandRecord() in registryApi.js.');
}

const bundledReturnOld = `    return {
      ...OPTIONAL_TRAIT_DEFAULTS,
      ...baseline,
      ...record,
      ...(snapshot || {}),
      $id: snapshot?.$id || record.$id || baseline?.$id,
      __bundledSnapshot: !snapshot,
      __offlineSnapshot: Boolean(snapshot),
      __localPreview: hasLocalDetails
    };`;

const bundledReturnNew = `    return normalizeOriginMetadataCollision({
      ...OPTIONAL_TRAIT_DEFAULTS,
      ...baseline,
      ...record,
      ...(snapshot || {}),
      $id: snapshot?.$id || record.$id || baseline?.$id,
      __bundledSnapshot: !snapshot,
      __offlineSnapshot: Boolean(snapshot),
      __localPreview: hasLocalDetails
    });`;

if (api.includes(bundledReturnOld)) {
  api = api.replace(bundledReturnOld, bundledReturnNew);
}

const liveReturnOld = `  return {
    ...OPTIONAL_TRAIT_DEFAULTS,
    ...baseline,
    ...(snapshot || {}),
    ...record,
    $id: record.$id || snapshot?.$id || baseline?.$id,
    __offlineSnapshot: Boolean(snapshot),
    __localPreview: hasLocalDetails
  };`;

const liveReturnNew = `  return normalizeOriginMetadataCollision({
    ...OPTIONAL_TRAIT_DEFAULTS,
    ...baseline,
    ...(snapshot || {}),
    ...record,
    $id: record.$id || snapshot?.$id || baseline?.$id,
    __offlineSnapshot: Boolean(snapshot),
    __localPreview: hasLocalDetails
  });`;

if (api.includes(liveReturnOld)) {
  api = api.replace(liveReturnOld, liveReturnNew);
}

if (!api.includes('return normalizeOriginMetadataCollision({') ||
    !api.includes('__localPreview: hasLocalDetails\n    });') &&
    !api.includes('__localPreview: hasLocalDetails\n  });')) {
  fail('Could not verify local preview sanitization in registryApi.js.');
}

const previewHelperMarker = 'function safeGermplasmPreviewText(value, fallback = \'\')';
if (!app.includes(previewHelperMarker)) {
  const insertAfter = `function hasGermplasmPhoto(record) {
  return Boolean(String(record?.thumbnail_file_id || '').trim());
}
`;
  if (!app.includes(insertAfter)) fail('Could not locate hasGermplasmPhoto() in App.jsx.');

  const helper = `${insertAfter}
function safeGermplasmPreviewText(value, fallback = '') {
  if (value == null) return fallback;

  if (Array.isArray(value)) {
    const joined = value
      .map((item) => safeGermplasmPreviewText(item, ''))
      .filter(Boolean)
      .join(', ');
    return joined || fallback;
  }

  if (typeof value === 'object') {
    const candidates = [
      value.origin_country,
      value.country,
      value.label,
      value.name,
      value.value
    ];
    for (const candidate of candidates) {
      if (candidate == null || typeof candidate === 'object') continue;
      const cleaned = String(candidate).trim();
      if (cleaned) return cleaned;
    }
    return fallback;
  }

  const cleaned = String(value).trim();
  return cleaned || fallback;
}
`;
  app = app.replace(insertAfter, helper);
}

const oldVars = `  const preview = profilePreview || record;
  const missing = profilePreview ? 'Not recorded' : 'Loading…';
  const parentFemale = normalizeVarietyDisplay(preview.parentage_female || '');
  const parentMale = normalizeVarietyDisplay(preview.parentage_male || '');
  const parentals = parentMale && parentFemale
    ? \`${'${parentMale}'} X ${'${parentFemale}'}\`
    : parentMale || parentFemale || missing;
  const tcHa = preview.yield_tc_ha || missing;
  const lkgTc = preview.yield_lkg_tc || missing;
  const recommended = preview.recommended_locations || preview.tested_location || missing;
  const disease = preview.disease_reaction || missing;`;

const newVars = `  const preview = profilePreview || record;
  const missing = profilePreview ? 'Not recorded' : 'Loading…';
  const parentFemale = normalizeVarietyDisplay(safeGermplasmPreviewText(preview.parentage_female, ''));
  const parentMale = normalizeVarietyDisplay(safeGermplasmPreviewText(preview.parentage_male, ''));
  const parentals = parentMale && parentFemale
    ? \`${'${parentMale}'} X ${'${parentFemale}'}\`
    : parentMale || parentFemale || missing;
  const tcHa = safeGermplasmPreviewText(preview.yield_tc_ha, missing);
  const lkgTc = safeGermplasmPreviewText(preview.yield_lkg_tc, missing);
  const country = safeGermplasmPreviewText(preview.origin, safeGermplasmPreviewText(preview.origin_country, missing));
  const species = safeGermplasmPreviewText(preview.species, missing);
  const collectionYear = safeGermplasmPreviewText(preview.collection_year, missing);
  const accessionNumber = safeGermplasmPreviewText(preview.accession_number, missing);
  const recommended = safeGermplasmPreviewText(
    preview.recommended_locations,
    safeGermplasmPreviewText(preview.tested_location, missing)
  );
  const disease = safeGermplasmPreviewText(preview.disease_reaction, missing);`;

if (app.includes(oldVars)) {
  app = app.replace(oldVars, newVars);
} else if (!app.includes('const country = safeGermplasmPreviewText(')) {
  fail('Could not safely patch RecordCard preview values in App.jsx.');
}

app = app
  .replace('<span><small>Accession Number</small><b>{preview.accession_number || missing}</b></span>',
           '<span><small>Accession Number</small><b>{accessionNumber}</b></span>')
  .replace('<span className="new-trait-preview"><small>Country</small><b>{preview.origin || missing}</b></span>',
           '<span className="new-trait-preview"><small>Country</small><b>{country}</b></span>')
  .replace('<span><small>Collection Year</small><b>{preview.collection_year || missing}</b></span>',
           '<span><small>Collection Year</small><b>{collectionYear}</b></span>')
  .replace('<span className="new-trait-preview"><small>Species</small><b>{preview.species || missing}</b></span>',
           '<span className="new-trait-preview"><small>Species</small><b>{species}</b></span>');

if (app.includes('<b>{preview.origin || missing}</b>') ||
    app.includes('<b>{preview.species || missing}</b>')) {
  fail('Unsafe direct preview rendering still remains in RecordCard.');
}

pkg.version = TARGET_VERSION;
pkg.scripts = pkg.scripts || {};
pkg.scripts['verify:germplasm-scroll-crash'] =
  'node scripts/verify-germplasm-scroll-crash-v2.13.90.mjs';

let lock = JSON.parse(read(FILES.lock));
lock.version = TARGET_VERSION;
if (lock.packages?.['']) lock.packages[''].version = TARGET_VERSION;

let versionInfo = JSON.parse(read(FILES.version));
versionInfo.version = TARGET_VERSION;
versionInfo.channel = versionInfo.channel || 'stable';
versionInfo.notes =
  'Fixes the Germplasm Collection viewport crash caused by nested v2.13.88 origin metadata overwriting the scalar Country field. Cached/offline previews are sanitized and card values render defensively.';
versionInfo.updated = '2026-10-11';
versionInfo.updatedAt = new Date().toISOString();

write(FILES.registryApi, api);
write(FILES.app, app);
write(FILES.pkg, JSON.stringify(pkg, null, 2) + '\n');
write(FILES.lock, JSON.stringify(lock, null, 2) + '\n');
write(FILES.version, JSON.stringify(versionInfo, null, 2) + '\n');

let gitignore = fs.existsSync(FILES.gitignore) ? fs.readFileSync(FILES.gitignore, 'utf8') : '';
if (!gitignore.split(/\r?\n/).includes('*.v*-backup')) {
  if (gitignore && !gitignore.endsWith('\n')) gitignore += '\n';
  gitignore += '*.v*-backup\n';
  write(FILES.gitignore, gitignore);
}

console.log('Fixed:');
console.log('  - details_json.origin can no longer overwrite the scalar Country field at render time.');
console.log('  - stale IndexedDB/offline snapshots are sanitized when Germplasm cards enter the viewport.');
console.log('  - Country, Species, Accession, Collection Year, Yield, Location and Disease preview values render only safe text.');
console.log('  - No germplasm records or Appwrite data were deleted or rewritten by this hotfix.');
console.log(`  - Version moved to ${TARGET_VERSION}.`);
console.log('  - Added npm verifier: verify:germplasm-scroll-crash');
console.log('\nHOTFIX APPLIED SUCCESSFULLY.\n');
