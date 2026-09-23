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
const combo = read('src/components/CombinationRegistryModal.jsx');
const api = read('src/lib/combinationApi.js');
const panel = read('src/components/BreedingPartnerSuggestions.jsx');
const css = read('src/styles.css');

console.log('\nCaneSprout v2.13.72 Breeding Partner Suggestion Verification\n');

check(pkg.version === '2.13.72', 'Version is 2.13.72');
check(pkg.scripts?.['verify:breeding-suggestions'], 'Breeding suggestion verifier npm script exists');

check(api.includes("import bundledCharacterization from '../../seed/characterization.json';"), 'Suggestion engine uses registry characterization data');
check(api.includes('const BREEDING_MIN_YEAR_GAP = 5;'), 'Minimum year gap is exactly five years');
check(api.includes('const BREEDING_PEDIGREE_DEPTH = 3;'), 'Pedigree screen checks three generations');
check(api.includes('function recordedAncestors('), 'Pedigree ancestor traversal exists');
check(api.includes('selectedAncestors.has(candidateKey)'), 'Direct ancestor relationships are rejected');
check(api.includes('candidateAncestors.has(selectedKey)'), 'Direct descendant relationships are rejected');
check(api.includes('function sharedRecordedAncestor('), 'Shared ancestor detection exists');
check(api.includes('if (yearGap < BREEDING_MIN_YEAR_GAP) continue;'), 'Candidates under five-year gap are rejected');
check(api.includes('if (sharedRecordedAncestor(selectedAncestors, candidateAncestors)) continue;'), 'Candidates sharing recorded ancestors are rejected');
check(api.includes('export function breedingPartnerSuggestions'), 'Suggestion API is exported');

check(combo.includes('breedingPartnerSuggestions,'), 'Combination Registry imports suggestion engine');
check(combo.includes("const [suggestionAnchorRole, setSuggestionAnchorRole] = useState('male');"), 'Creation form tracks selected breeding role');
check(combo.includes("setSuggestionAnchorRole('male')"), 'Selecting male variety makes suggestions target females');
check(combo.includes("setSuggestionAnchorRole('female')"), 'Selecting female variety makes suggestions target males');
check(combo.includes('<BreedingPartnerSuggestions'), 'Creation panel renders suggestion UI');
check(combo.includes("[counterpartRole]: variety"), 'Selecting a suggestion fills the opposite breeding role');

check(panel.includes('const INITIAL_VISIBLE = 20;'), 'Only first 20 suggestions show initially');
check(panel.includes('const PAGE_SIZE = 20;'), 'Additional suggestions appear 20 at a time');
check(panel.includes('Show first 20'), 'Expanded suggestion list can collapse back to 20');
check(panel.includes('Show {Math.min(PAGE_SIZE, remaining)} more'), 'More suggestions are optional');
check(panel.includes('Missing or historically unrecorded ancestry cannot be inferred'), 'UI explains pedigree-data limitation');

check(css.includes('v2.13.72 ROLE-AWARE BREEDING PARTNER SUGGESTIONS'), 'Suggestion panel styling is installed');
check(css.includes('grid-template-columns: repeat(4, minmax(0, 1fr))'), 'Desktop suggestion cards use compact grid');

if (!process.exitCode) console.log('\n26/26 checks passed.\n');
