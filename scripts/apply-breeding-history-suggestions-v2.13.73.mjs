import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const payloadRoot = path.join(root, 'v21373-history-aware-suggestions-payload');
const TARGET_VERSION = '2.13.73';
const ALLOWED_BASES = new Set(['2.13.72', TARGET_VERSION]);

function file(relative) { return path.join(root, relative); }
function exists(relative) { return fs.existsSync(file(relative)); }
function read(relative) { return fs.readFileSync(file(relative), 'utf8'); }

function write(relative, content) {
  const full = file(relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

for (const required of [
  'package.json',
  'src/lib/combinationApi.js',
  'src/components/CombinationRegistryModal.jsx',
  'src/components/BreedingPartnerSuggestions.jsx'
]) {
  if (!exists(required)) throw new Error(`Required project file is missing: ${required}`);
}

const pkg = JSON.parse(read('package.json'));
const current = String(pkg.version || '');

if (!ALLOWED_BASES.has(current)) {
  throw new Error(
    `This patch expects CaneSprout 2.13.72. Current package version is ${current || 'unknown'}. ` +
    'Apply the role-aware breeding suggestions patch first.'
  );
}

/* ------------------------------------------------------------------
   Replace the v2.13.72 suggestion engine.
   ------------------------------------------------------------------ */
let api = read('src/lib/combinationApi.js');

const engineStart = api.indexOf('const BREEDING_MIN_YEAR_GAP = 5;');
const engineEnd = api.indexOf('async function listLiveDocuments(attribute, keyVariants)', engineStart);

if (engineStart < 0 || engineEnd < 0) {
  throw new Error(
    'Could not locate the v2.13.72 breeding suggestion engine in src/lib/combinationApi.js.'
  );
}

const engine = String.raw`const BREEDING_REUSE_YEARS = 5;
const BREEDING_PEDIGREE_DEPTH = 3;

let breedingPedigreeIndexCache = null;

function recordedParent(value) {
  const raw = text(value);
  if (!raw) return '';

  const normalized = raw
    .toLocaleLowerCase()
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (
    !normalized ||
    normalized === 'unknown' ||
    normalized === 'not recorded' ||
    normalized === 'not available' ||
    normalized === 'n/a' ||
    normalized === 'na' ||
    normalized === 'none' ||
    normalized === 'nil' ||
    normalized === '?' ||
    normalized === '0'
  ) return '';

  return raw;
}

function pedigreeRecordScore(record) {
  return (
    (recordedParent(record?.parentage_female) ? 2 : 0) +
    (recordedParent(record?.parentage_male) ? 2 : 0)
  );
}

function breedingPedigreeIndex() {
  if (breedingPedigreeIndexCache) return breedingPedigreeIndexCache;

  const index = new Map();
  const records = Array.isArray(bundledCharacterization?.records)
    ? bundledCharacterization.records
    : [];

  for (const record of records) {
    const variety = text(record?.variety);
    const key = combinationVarietyKey(variety);
    if (!key || !variety) continue;

    const candidate = {
      key,
      variety,
      femaleParent: recordedParent(record?.parentage_female),
      maleParent: recordedParent(record?.parentage_male),
      score: pedigreeRecordScore(record)
    };

    const current = index.get(key);
    if (!current || candidate.score > current.score) index.set(key, candidate);
  }

  breedingPedigreeIndexCache = index;
  return index;
}

function recordedAncestors(index, startKey, maxDepth = BREEDING_PEDIGREE_DEPTH) {
  const ancestors = new Map();
  const queue = [{ key: startKey, depth: 0 }];
  const expandedDepth = new Map();

  while (queue.length) {
    const current = queue.shift();
    if (!current?.key || current.depth >= maxDepth) continue;

    const previousExpandedDepth = expandedDepth.get(current.key);
    if (previousExpandedDepth != null && previousExpandedDepth <= current.depth) continue;
    expandedDepth.set(current.key, current.depth);

    const record = index.get(current.key);
    if (!record) continue;

    for (const parentLabel of [record.femaleParent, record.maleParent]) {
      const label = recordedParent(parentLabel);
      const parentKey = combinationVarietyKey(label);
      if (!parentKey || parentKey === current.key) continue;

      const depth = current.depth + 1;
      const known = ancestors.get(parentKey);

      if (!known || depth < known.depth) {
        ancestors.set(parentKey, {
          key: parentKey,
          variety: label,
          depth
        });
      }

      if (depth < maxDepth) queue.push({ key: parentKey, depth });
    }
  }

  return ancestors;
}

function sharedRecordedAncestor(left, right) {
  for (const [key, leftMeta] of left.entries()) {
    const rightMeta = right.get(key);
    if (!rightMeta) continue;

    return {
      key,
      leftDepth: leftMeta.depth,
      rightDepth: rightMeta.depth
    };
  }

  return null;
}

function validDateParts(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);

  if (!Number.isInteger(y) || y < 1800 || y > 2100) return null;
  if (!Number.isInteger(m) || m < 1 || m > 12) return null;
  if (!Number.isInteger(d) || d < 1 || d > 31) return null;

  const value = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  if (
    value.getUTCFullYear() !== y ||
    value.getUTCMonth() !== m - 1 ||
    value.getUTCDate() !== d
  ) return null;

  return value;
}

function sourceTextDate(value) {
  const raw = text(value);
  if (!raw) return null;

  const normalized = raw
    .replace(/\./g, '')
    .replace(/(\d),(\d)/g, '$1, $2')
    .replace(/\s+/g, ' ')
    .trim();

  const parsed = Date.parse(normalized);
  if (Number.isFinite(parsed)) {
    const value = new Date(parsed);
    if (
      Number.isFinite(value.getTime()) &&
      value.getUTCFullYear() >= 1800 &&
      value.getUTCFullYear() <= 2100
    ) {
      return value;
    }
  }

  const numeric = normalized.match(/\b((?:18|19|20)\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (numeric) return validDateParts(numeric[1], numeric[2], numeric[3]);

  const yearOnly = normalized.match(/\b((?:18|19|20)\d{2})\b/);
  if (yearOnly) {
    // Conservative fallback: an imprecise year is treated as Dec 31 so the
    // system does not declare the full 5-year interval complete too early.
    return new Date(Date.UTC(Number(yearOnly[1]), 11, 31, 12, 0, 0));
  }

  return null;
}

function recordedCombinationDate(row) {
  // Workbook source text is preferred because historical imports may have a
  // normalized combination_date that does not preserve the original year.
  const sourceDate = sourceTextDate(row?.source_date_text);
  if (sourceDate) return sourceDate;

  const iso = text(row?.combination_date);
  const match = iso.match(/^((?:18|19|20)\d{2})-(\d{2})-(\d{2})$/);
  if (match) return validDateParts(match[1], match[2], match[3]);

  return sourceTextDate(iso);
}

function roleAwarePairHistory(selectedKey, selectedRole) {
  const role = selectedRole === 'female' ? 'female' : 'male';
  const pairs = new Map();

  const sourceRows = sourceSeedRows();
  const localRows = readLocalManualRecords()
    .filter((row) => !row.deleted_local && row.sync_state !== 'delete_pending');

  for (const row of [...sourceRows, ...localRows]) {
    const maleKey = text(row?.male_key) || combinationVarietyKey(row?.male_variety);
    const femaleKey = text(row?.female_key) || combinationVarietyKey(row?.female_variety);

    let counterpartKey = '';

    if (role === 'male' && maleKey === selectedKey) counterpartKey = femaleKey;
    if (role === 'female' && femaleKey === selectedKey) counterpartKey = maleKey;

    if (!counterpartKey || counterpartKey === selectedKey) continue;

    const current = pairs.get(counterpartKey) || {
      hasRecordedCross: false,
      hasUndatedCross: false,
      latestDate: null
    };

    current.hasRecordedCross = true;

    const date = recordedCombinationDate(row);
    if (!date) {
      current.hasUndatedCross = true;
    } else if (!current.latestDate || date > current.latestDate) {
      current.latestDate = date;
    }

    pairs.set(counterpartKey, current);
  }

  return pairs;
}

function subtractCalendarYears(date, years) {
  const value = new Date(date.getTime());
  const originalMonth = value.getUTCMonth();

  value.setUTCFullYear(value.getUTCFullYear() - years);

  // Feb 29 -> Feb 28 when the target year is not leap.
  if (value.getUTCMonth() !== originalMonth) {
    value.setUTCDate(0);
  }

  return value;
}

function fullYearsSince(earlier, later = new Date()) {
  if (!(earlier instanceof Date) || !Number.isFinite(earlier.getTime())) return 0;

  let years = later.getUTCFullYear() - earlier.getUTCFullYear();
  const anniversary = new Date(earlier.getTime());
  anniversary.setUTCFullYear(later.getUTCFullYear());

  if (anniversary > later) years -= 1;
  return Math.max(0, years);
}

function shortCombinationDate(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return '';

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  });
}

export function breedingPartnerSuggestions(selectedVariety, selectedRole = 'male') {
  const query = text(selectedVariety);
  const role = selectedRole === 'female' ? 'female' : 'male';
  const counterpartRole = role === 'male' ? 'female' : 'male';

  if (!query) {
    return {
      query: '',
      selectedRole: role,
      counterpartRole,
      suggestions: [],
      total: 0
    };
  }

  const selectedKey = combinationVarietyKey(query);
  const catalogMap = new Map();

  for (const variety of [...bundledCatalog(), ...registryCatalogCache.values]) {
    const label = text(variety);
    const key = combinationVarietyKey(label);
    if (label && key && !catalogMap.has(key)) catalogMap.set(key, label);
  }

  const selectedLabel = catalogMap.get(selectedKey) || query;
  const pedigreeIndex = breedingPedigreeIndex();
  const selectedAncestors = recordedAncestors(pedigreeIndex, selectedKey);
  const pairHistoryByCandidate = roleAwarePairHistory(selectedKey, role);

  const now = new Date();
  const cutoff = subtractCalendarYears(now, BREEDING_REUSE_YEARS);
  const suggestions = [];

  for (const [candidateKey, candidateLabel] of catalogMap.entries()) {
    if (!candidateKey || candidateKey === selectedKey) continue;

    const candidateAncestors = recordedAncestors(pedigreeIndex, candidateKey);

    // Exclude every known direct relationship that can be traced in the
    // current registry through three generations.
    if (selectedAncestors.has(candidateKey)) continue;
    if (candidateAncestors.has(selectedKey)) continue;
    if (sharedRecordedAncestor(selectedAncestors, candidateAncestors)) continue;

    const pairHistory = pairHistoryByCandidate.get(candidateKey);

    // A recorded cross with no verifiable date cannot prove the requested
    // five-year gap, so it is conservatively excluded.
    if (pairHistory?.hasUndatedCross) continue;

    // Exact same role pairing must be at least five calendar years old.
    if (pairHistory?.latestDate && pairHistory.latestDate > cutoff) continue;

    const neverCombined = !pairHistory?.hasRecordedCross;
    const yearsSinceCross = pairHistory?.latestDate
      ? fullYearsSince(pairHistory.latestDate, now)
      : 0;

    const pedigreeEvidenceCount =
      selectedAncestors.size + candidateAncestors.size;

    suggestions.push({
      key: candidateKey,
      variety: candidateLabel,
      neverCombined,
      lastCrossDate: pairHistory?.latestDate
        ? pairHistory.latestDate.toISOString().slice(0, 10)
        : '',
      lastCrossLabel: pairHistory?.latestDate
        ? shortCombinationDate(pairHistory.latestDate)
        : '',
      yearsSinceCross,
      pedigreeEvidence:
        selectedAncestors.size > 0 && candidateAncestors.size > 0
          ? 'recorded'
          : 'limited',
      pedigreeEvidenceCount
    });
  }

  suggestions.sort((a, b) => {
    // Prefer combinations that have never been recorded in this role.
    if (a.neverCombined !== b.neverCombined) return a.neverCombined ? -1 : 1;

    // Then prefer candidates with more recorded pedigree evidence.
    const byPedigree = b.pedigreeEvidenceCount - a.pedigreeEvidenceCount;
    if (byPedigree) return byPedigree;

    // For previously used pairings, older last crosses come first.
    const byGap = b.yearsSinceCross - a.yearsSinceCross;
    if (byGap) return byGap;

    return a.variety.localeCompare(
      b.variety,
      undefined,
      { sensitivity: 'base', numeric: true }
    );
  });

  return {
    query,
    selectedKey,
    selectedVariety: selectedLabel,
    selectedRole: role,
    counterpartRole,
    reuseYears: BREEDING_REUSE_YEARS,
    pedigreeDepth: BREEDING_PEDIGREE_DEPTH,
    suggestions,
    total: suggestions.length
  };
}

`;

api = api.slice(0, engineStart) + engine + '\n' + api.slice(engineEnd);
write('src/lib/combinationApi.js', api);

/* Replace only the presentation component. */
write(
  'src/components/BreedingPartnerSuggestions.jsx',
  fs.readFileSync(
    path.join(payloadRoot, 'src/components/BreedingPartnerSuggestions.jsx'),
    'utf8'
  )
);

/* Version + verifier. */
pkg.version = TARGET_VERSION;
pkg.scripts ||= {};
pkg.scripts['verify:breeding-history-suggestions'] =
  'node scripts/verify-breeding-history-suggestions-v2.13.73.mjs';

write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

if (exists('package-lock.json')) {
  const lock = JSON.parse(read('package-lock.json'));
  lock.version = TARGET_VERSION;
  if (lock.packages?.['']) lock.packages[''].version = TARGET_VERSION;
  write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
}

write(
  'scripts/verify-breeding-history-suggestions-v2.13.73.mjs',
  fs.readFileSync(
    path.join(payloadRoot, 'scripts/verify-breeding-history-suggestions-v2.13.73.mjs'),
    'utf8'
  )
);

if (exists('public/version.json')) {
  const info = JSON.parse(read('public/version.json'));
  info.version = TARGET_VERSION;
  info.notes =
    'Changes breeding suggestions to use role-specific combination history: never-crossed pairings or pairings whose most recent recorded cross is at least five years old, while preserving three-generation known-pedigree exclusions.';
  info.updated = '2026-09-20';
  write('public/version.json', `${JSON.stringify(info, null, 2)}\n`);
}

if (exists('public/sw.js')) {
  let sw = read('public/sw.js');
  sw = sw.replace(/2\.13\.72/g, TARGET_VERSION);
  write('public/sw.js', sw);
}

console.log('');
console.log('CaneSprout v2.13.73 history-aware breeding suggestions installed.');
console.log('The 5-year rule now uses the same-role combination history, not collection year.');
console.log('Never-combined pairings and pairings last used >=5 years ago are eligible.');
console.log('');
console.log('Next run:');
console.log('  npm.cmd run verify:breeding-history-suggestions');
console.log('  npm.cmd run build');
console.log('');
