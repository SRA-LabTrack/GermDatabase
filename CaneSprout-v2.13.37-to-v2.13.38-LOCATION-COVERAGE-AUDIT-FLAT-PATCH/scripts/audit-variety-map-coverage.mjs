import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildVarietyMapCatalog, bestLocationForRecord, explicitLocationFromOtherDetails } from '../src/lib/varietyMap.js';
import { normalizeVarietyIdentity } from '../src/lib/legacyHyv.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const seed = JSON.parse(fs.readFileSync(path.join(root, 'seed/characterization.json'), 'utf8'));
const records = Array.isArray(seed.records) ? seed.records : [];
const catalog = buildVarietyMapCatalog(records);
const mapped = catalog.filter((entry) => entry.coords);
const located = catalog.filter((entry) => entry.location);
const unmappedLocated = located.filter((entry) => !entry.coords);
const explicitDetail = catalog.filter((entry) => /Other details/i.test(entry.locationSource || ''));
const germField = catalog.filter((entry) => /Nursery \/ field/i.test(entry.locationSource || ''));

const usable = (value) => {
  const v = String(value ?? '').trim();
  return Boolean(v) && !/^(?:n\/?a|none|not recorded|not documented|unknown|not provided)$/i.test(v);
};

const sourceLocationRows = records.filter((record) => usable(record.origin) || usable(record.country));
const sourceLocationIdentities = new Set(sourceLocationRows.map((record) => normalizeVarietyIdentity(record.variety)).filter(Boolean));
const missingFromCatalog = [...sourceLocationIdentities].filter((identity) => !catalog.some((entry) => entry.identity === identity && entry.location));

const safeDetailHints = records.filter((record) => explicitLocationFromOtherDetails(record.other_details));
const placeholderOriginWithCountry = records.filter((record) => !usable(record.origin) && usable(record.country));

const report = {
  version: '2.13.38',
  bundledRecords: records.length,
  uniqueRegistryVarieties: catalog.length,
  uniqueVarietiesWithFormalCountryOrOrigin: sourceLocationIdentities.size,
  uniqueVarietiesWithAnyMapLocation: located.length,
  uniqueVarietiesMappedWithoutOnlineGeocoding: mapped.length,
  locatedButNotMapped: unmappedLocated.map((entry) => ({ variety: entry.variety, location: entry.location, source: entry.locationSource })),
  sourceLocatedVarietiesMissingFromCatalog: missingFromCatalog,
  safeOtherDetailsPrecisionHints: safeDetailHints.length,
  currentlyChosenOtherDetailsHints: explicitDetail.length,
  cachedOrLiveGermLocationEntriesChosen: germField.length,
  placeholderOriginWithUsableCountry: placeholderOriginWithCountry.length,
  note: 'The bundled audit is local/read-only. Live/manual records already cached on a device are handled by the same resolver, including germ_location and country fallbacks.'
};

fs.mkdirSync(path.join(root, 'reports'), { recursive: true });
fs.writeFileSync(path.join(root, 'reports/variety-map-coverage-v2.13.38.json'), JSON.stringify(report, null, 2));

console.log('\nCaneSprout v2.13.38 Variety Map Coverage Audit\n');
console.log(`Bundled records:                         ${report.bundledRecords}`);
console.log(`Unique registry varieties:               ${report.uniqueRegistryVarieties}`);
console.log(`Unique formal Country/Origin varieties:  ${report.uniqueVarietiesWithFormalCountryOrOrigin}`);
console.log(`Unique varieties with map location:      ${report.uniqueVarietiesWithAnyMapLocation}`);
console.log(`Mapped without online geocoding:         ${report.uniqueVarietiesMappedWithoutOnlineGeocoding}`);
console.log(`Located but not mapped:                  ${report.locatedButNotMapped.length}`);
console.log(`Source-located varieties missing:        ${report.sourceLocatedVarietiesMissingFromCatalog.length}`);
console.log(`Safe Other-details precision upgrades:   ${report.safeOtherDetailsPrecisionHints}`);
console.log(`Live/cache germ_location chosen now:     ${report.cachedOrLiveGermLocationEntriesChosen}`);
console.log(`Origin placeholder + usable country:     ${report.placeholderOriginWithUsableCountry}`);
console.log(`\nReport written to reports/variety-map-coverage-v2.13.38.json`);

const ok = report.locatedButNotMapped.length === 0 && report.sourceLocatedVarietiesMissingFromCatalog.length === 0;
console.log(`\n${ok ? 'PASS' : 'FAIL'}  Every bundled variety with a usable recorded location is represented by the map catalog.`);
if (!ok) process.exitCode = 1;
