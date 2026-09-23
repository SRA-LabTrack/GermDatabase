import fs from 'node:fs';

function read(path) { return fs.readFileSync(path, 'utf8'); }

function check(condition, label) {
  if (!condition) {
    console.error(`FAIL  ${label}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS  ${label}`);
  }
}

const pkg = JSON.parse(read('package.json'));
const api = read('src/lib/combinationApi.js');
const panel = read('src/components/BreedingPartnerSuggestions.jsx');
const modal = read('src/components/CombinationRegistryModal.jsx');

console.log('\nCaneSprout v2.13.73 History-Aware Breeding Suggestions Verification\n');

check(pkg.version === '2.13.73', 'Version is 2.13.73');
check(pkg.scripts?.['verify:breeding-history-suggestions'], 'History-aware suggestion verifier exists');

check(api.includes('const BREEDING_REUSE_YEARS = 5;'), 'Five-year reuse interval is defined');
check(api.includes('const BREEDING_PEDIGREE_DEPTH = 3;'), 'Three-generation pedigree screen remains defined');
check(api.includes('function recordedCombinationDate(row)'), 'Combination history date parser exists');
check(api.includes('source_date_text'), 'Historical source date text is preferred when available');
check(api.includes('function roleAwarePairHistory(selectedKey, selectedRole)'), 'Role-aware pairing history is built');
check(api.includes("selectedRole === 'female'"), 'Female-selected role is handled separately');
check(api.includes('hasUndatedCross'), 'Undated historical crosses are tracked conservatively');
check(api.includes('if (pairHistory?.hasUndatedCross) continue;'), 'Undated prior crosses are excluded');
check(api.includes('if (pairHistory?.latestDate && pairHistory.latestDate > cutoff) continue;'), 'Crosses newer than five years are excluded');
check(api.includes('neverCombined: !pairHistory?.hasRecordedCross'), 'Never-combined pairings are explicitly recognized');
check(api.includes('sharedRecordedAncestor(selectedAncestors, candidateAncestors)'), 'Three-generation shared-ancestor screening remains active');
check(api.includes('selectedAncestors.has(candidateKey)'), 'Known direct ancestors are excluded');
check(api.includes('candidateAncestors.has(selectedKey)'), 'Known descendants are excluded');
check(!api.includes("reason: 'missing-year'"), 'Missing collection year no longer blocks suggestions');
check(!api.includes('if (!selected.collectionYear)'), 'Collection year is no longer a prerequisite');
check(api.includes('bundledCatalog(), ...registryCatalogCache.values'), 'Suggestion pool uses registered variety catalog');

check(panel.includes('Never crossed'), 'Suggestion cards identify never-crossed candidates');
check(panel.includes('last same-role cross ≥ 5 years ago'), 'UI explains role-aware five-year rule');
check(panel.includes('const INITIAL_VISIBLE = 20;'), 'Only first 20 suggestions display initially');
check(panel.includes('Show {Math.min(PAGE_SIZE, remaining)} more'), 'Additional suggestions remain optional');
check(panel.includes('not the variety&apos;s collection year'), 'UI clearly states collection year is not the five-year rule');

check(modal.includes('<BreedingPartnerSuggestions'), 'Combination form still renders suggestions');
check(modal.includes("[counterpartRole]: variety"), 'Suggestion click still fills opposite breeding role');

if (!process.exitCode) console.log('\n25/25 checks passed.\n');
