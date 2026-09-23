import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const payloadRoot = path.join(root, 'v21372-breeding-suggestions-payload');
const TARGET_VERSION = '2.13.72';
const ALLOWED_BASES = new Set(['2.13.71', TARGET_VERSION]);

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
  'src/components/CombinationRegistryModal.jsx',
  'src/lib/combinationApi.js',
  'src/styles.css'
]) {
  if (!exists(required)) throw new Error(`Required project file is missing: ${required}`);
}

const pkg = JSON.parse(read('package.json'));
const current = String(pkg.version || '');

if (!ALLOWED_BASES.has(current)) {
  throw new Error(
    `This patch expects CaneSprout 2.13.71. Current package version is ${current || 'unknown'}. ` +
    'Apply the photo-first Germplasm browse patch first.'
  );
}

/* ------------------------------------------------------------------
   1. Install suggestion panel component.
   ------------------------------------------------------------------ */
write(
  'src/components/BreedingPartnerSuggestions.jsx',
  fs.readFileSync(
    path.join(payloadRoot, 'src/components/BreedingPartnerSuggestions.jsx'),
    'utf8'
  )
);

/* ------------------------------------------------------------------
   2. Add pedigree/year suggestion engine to combinationApi.js.
   ------------------------------------------------------------------ */
let api = read('src/lib/combinationApi.js');

if (!api.includes("import bundledCharacterization from '../../seed/characterization.json';")) {
  const importAnchor = "import bundledCombinationData from '../../seed/combination_runtime.json';";
  if (!api.includes(importAnchor)) {
    throw new Error('Could not locate combination_runtime import in src/lib/combinationApi.js.');
  }
  api = api.replace(
    importAnchor,
    `${importAnchor}\nimport bundledCharacterization from '../../seed/characterization.json';`
  );
}

const apiMarker = 'const BREEDING_MIN_YEAR_GAP = 5;';

if (!api.includes(apiMarker)) {
  const insertAnchor = 'async function listLiveDocuments(attribute, keyVariants) {';

  if (!api.includes(insertAnchor)) {
    throw new Error('Could not locate listLiveDocuments in src/lib/combinationApi.js.');
  }

  const engine = String.raw`
const BREEDING_MIN_YEAR_GAP = 5;
const BREEDING_PEDIGREE_DEPTH = 3;

let breedingPedigreeIndexCache = null;

function recordedYear(value) {
  const match = text(value).match(/\b(?:18|19|20)\d{2}\b/);
  if (!match) return 0;
  const year = Number(match[0]);
  return year >= 1800 && year <= 2100 ? year : 0;
}

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
    (recordedYear(record?.collection_year) ? 4 : 0) +
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
      collectionYear: recordedYear(record?.collection_year),
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
      total: 0,
      reason: ''
    };
  }

  const index = breedingPedigreeIndex();
  const selectedKey = combinationVarietyKey(query);
  const selected = index.get(selectedKey);

  if (!selected) {
    return {
      query,
      selectedKey,
      selectedVariety: query,
      selectedRole: role,
      counterpartRole,
      suggestions: [],
      total: 0,
      reason: 'missing-record'
    };
  }

  if (!selected.collectionYear) {
    return {
      query,
      selectedKey,
      selectedVariety: selected.variety,
      selectedRole: role,
      counterpartRole,
      selectedYear: 0,
      suggestions: [],
      total: 0,
      reason: 'missing-year'
    };
  }

  const selectedAncestors = recordedAncestors(index, selectedKey);
  const suggestions = [];

  for (const candidate of index.values()) {
    const candidateKey = candidate.key;
    if (!candidateKey || candidateKey === selectedKey) continue;
    if (!candidate.collectionYear) continue;

    const yearGap = Math.abs(candidate.collectionYear - selected.collectionYear);
    if (yearGap < BREEDING_MIN_YEAR_GAP) continue;

    const candidateAncestors = recordedAncestors(index, candidateKey);

    // Candidate is a recorded ancestor of the selected variety.
    if (selectedAncestors.has(candidateKey)) continue;

    // Selected variety is a recorded ancestor of the candidate.
    if (candidateAncestors.has(selectedKey)) continue;

    // Siblings, first cousins, second cousins, and other lines that share a
    // recorded parent/grandparent/great-grandparent are excluded.
    if (sharedRecordedAncestor(selectedAncestors, candidateAncestors)) continue;

    suggestions.push({
      key: candidateKey,
      variety: candidate.variety,
      collectionYear: candidate.collectionYear,
      yearGap,
      recordedAncestorCount: candidateAncestors.size,
      recordedPedigreeDepth: candidateAncestors.size
        ? Math.max(...[...candidateAncestors.values()].map((item) => item.depth))
        : 0
    });
  }

  suggestions.sort((a, b) => {
    const byEvidence = b.recordedAncestorCount - a.recordedAncestorCount;
    if (byEvidence) return byEvidence;

    const byDepth = b.recordedPedigreeDepth - a.recordedPedigreeDepth;
    if (byDepth) return byDepth;

    const byGap = b.yearGap - a.yearGap;
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
    selectedVariety: selected.variety,
    selectedRole: role,
    counterpartRole,
    selectedYear: selected.collectionYear,
    minYearGap: BREEDING_MIN_YEAR_GAP,
    pedigreeDepth: BREEDING_PEDIGREE_DEPTH,
    selectedRecordedAncestorCount: selectedAncestors.size,
    suggestions,
    total: suggestions.length,
    reason: ''
  };
}

`;

  api = api.replace(insertAnchor, `${engine}\n${insertAnchor}`);
}

write('src/lib/combinationApi.js', api);

/* ------------------------------------------------------------------
   3. Wire the suggestion engine into CombinationRegistryModal.
   ------------------------------------------------------------------ */
let combo = read('src/components/CombinationRegistryModal.jsx');

const suggestionImport = "import BreedingPartnerSuggestions from './BreedingPartnerSuggestions.jsx';";

if (!combo.includes(suggestionImport)) {
  const importAnchor = "import SugarcaneIcon from './SugarcaneIcon.jsx';";
  if (!combo.includes(importAnchor)) {
    throw new Error('Could not locate SugarcaneIcon import in CombinationRegistryModal.jsx.');
  }
  combo = combo.replace(importAnchor, `${importAnchor}\n${suggestionImport}`);
}

if (!combo.includes('  breedingPartnerSuggestions,')) {
  const apiImportAnchor = '  buildCombinationSearchResults,';
  if (!combo.includes(apiImportAnchor)) {
    throw new Error('Could not locate combinationApi import list.');
  }
  combo = combo.replace(
    apiImportAnchor,
    `${apiImportAnchor}\n  breedingPartnerSuggestions,`
  );
}

if (!combo.includes("const [suggestionAnchorRole, setSuggestionAnchorRole] = useState('male');")) {
  const stateAnchor = "  const [createForm, setCreateForm] = useState({ male: '', female: '', date: today(), notes: '' });";
  if (!combo.includes(stateAnchor)) {
    throw new Error('Could not locate createForm state in CombinationRegistryModal.jsx.');
  }
  combo = combo.replace(
    stateAnchor,
    `${stateAnchor}\n  const [suggestionAnchorRole, setSuggestionAnchorRole] = useState('male');`
  );
}

if (!combo.includes('const breedingSuggestionResult = useMemo(')) {
  const memoAnchor = '  const sourceSummary = useMemo(() => combinationSourceSummary(), []);';
  if (!combo.includes(memoAnchor)) {
    throw new Error('Could not locate Combination Registry sourceSummary memo.');
  }

  const memoBlock = `  const suggestionAnchorVariety = suggestionAnchorRole === 'female' ? createForm.female : createForm.male;
  const breedingSuggestionResult = useMemo(
    () => breedingPartnerSuggestions(suggestionAnchorVariety, suggestionAnchorRole),
    [suggestionAnchorVariety, suggestionAnchorRole]
  );`;

  combo = combo.replace(memoAnchor, `${memoAnchor}\n${memoBlock}`);
}

const oldMale = `<VarietyAutocomplete catalog={catalog} value={createForm.male} onChange={(male) => setCreateForm((current) => ({ ...current, male }))} placeholder="Type at least 2 characters" ariaLabel="Male variety" disabled={catalogLoading} required />`;
const newMale = `<VarietyAutocomplete catalog={catalog} value={createForm.male} onChange={(male) => { setCreateForm((current) => ({ ...current, male })); setSuggestionAnchorRole('male'); }} placeholder="Type at least 2 characters" ariaLabel="Male variety" disabled={catalogLoading} required />`;

if (!combo.includes("setSuggestionAnchorRole('male')")) {
  if (!combo.includes(oldMale)) {
    throw new Error('Could not locate the Male variety autocomplete.');
  }
  combo = combo.replace(oldMale, newMale);
}

const oldFemale = `<VarietyAutocomplete catalog={catalog} value={createForm.female} onChange={(female) => setCreateForm((current) => ({ ...current, female }))} placeholder="Type at least 2 characters" ariaLabel="Female variety" disabled={catalogLoading} required />`;
const newFemale = `<VarietyAutocomplete catalog={catalog} value={createForm.female} onChange={(female) => { setCreateForm((current) => ({ ...current, female })); setSuggestionAnchorRole('female'); }} placeholder="Type at least 2 characters" ariaLabel="Female variety" disabled={catalogLoading} required />`;

if (!combo.includes("setSuggestionAnchorRole('female')")) {
  if (!combo.includes(oldFemale)) {
    throw new Error('Could not locate the Female variety autocomplete.');
  }
  combo = combo.replace(oldFemale, newFemale);
}

if (!combo.includes('<BreedingPartnerSuggestions')) {
  const createGridClose = `                <button className="primary-button" type="submit" disabled={createBusy || catalogLoading}>{createBusy ? <><LoaderCircle className="spin" size={17} /> Recording…</> : <><CheckCircle2 size={17} /> Save combination</>}</button>
              </div>
            </form>`;

  const replacement = `                <button className="primary-button" type="submit" disabled={createBusy || catalogLoading}>{createBusy ? <><LoaderCircle className="spin" size={17} /> Recording…</> : <><CheckCircle2 size={17} /> Save combination</>}</button>
              </div>

              <BreedingPartnerSuggestions
                result={breedingSuggestionResult}
                onSelect={(variety, counterpartRole) => {
                  setCreateForm((current) => ({ ...current, [counterpartRole]: variety }));
                }}
              />
            </form>`;

  if (!combo.includes(createGridClose)) {
    throw new Error('Could not locate the end of the Record combination grid.');
  }

  combo = combo.replace(createGridClose, replacement);
}

write('src/components/CombinationRegistryModal.jsx', combo);

/* ------------------------------------------------------------------
   4. Add styles.
   ------------------------------------------------------------------ */
let styles = read('src/styles.css');
const cssMarker = 'v2.13.72 ROLE-AWARE BREEDING PARTNER SUGGESTIONS';

if (!styles.includes(cssMarker)) {
  const extra = fs.readFileSync(
    path.join(payloadRoot, 'styles-v2.13.72.css'),
    'utf8'
  );
  styles = `${styles.trimEnd()}\n\n${extra.trim()}\n`;
  write('src/styles.css', styles);
}

/* ------------------------------------------------------------------
   5. Version + verifier.
   ------------------------------------------------------------------ */
pkg.version = TARGET_VERSION;
pkg.scripts ||= {};
pkg.scripts['verify:breeding-suggestions'] =
  'node scripts/verify-breeding-suggestions-v2.13.72.mjs';

write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

if (exists('package-lock.json')) {
  const lock = JSON.parse(read('package-lock.json'));
  lock.version = TARGET_VERSION;
  if (lock.packages?.['']) lock.packages[''].version = TARGET_VERSION;
  write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
}

write(
  'scripts/verify-breeding-suggestions-v2.13.72.mjs',
  fs.readFileSync(
    path.join(payloadRoot, 'scripts/verify-breeding-suggestions-v2.13.72.mjs'),
    'utf8'
  )
);

if (exists('public/version.json')) {
  const info = JSON.parse(read('public/version.json'));
  info.version = TARGET_VERSION;
  info.notes =
    'Adds role-aware breeding partner suggestions screened for a 5-year collection gap and recorded parentage conflicts through three generations.';
  info.updated = '2026-09-20';
  write('public/version.json', `${JSON.stringify(info, null, 2)}\n`);
}

if (exists('public/sw.js')) {
  let sw = read('public/sw.js');
  sw = sw.replace(/2\.13\.71/g, TARGET_VERSION);
  write('public/sw.js', sw);
}

console.log('');
console.log('CaneSprout v2.13.72 role-aware breeding suggestions installed.');
console.log('Rules: >=5-year collection gap and no recorded shared ancestry through 3 generations.');
console.log('The first 20 eligible suggestions are shown; additional candidates are optional.');
console.log('');
console.log('Next run:');
console.log('  npm.cmd run verify:breeding-suggestions');
console.log('  npm.cmd run build');
console.log('');
