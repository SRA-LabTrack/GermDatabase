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
const appwrite = read('src/lib/appwrite.js');
const api = read('src/lib/breedingProgramApi.js');
const modal = read('src/components/BreedingProgramModal.jsx');
const setup = read('scripts/setup-breeding-program-v2.13.83.mjs');

console.log('\nCaneSprout v2.13.83 Shared germ-media Breeding Program Verification\n');

check(pkg.version === '2.13.83', 'Version is 2.13.83');
check(pkg.scripts?.['setup:breeding-program'] === 'node scripts/setup-breeding-program-v2.13.83.mjs', 'setup:breeding-program uses v2.13.83 verifier');
check(pkg.scripts?.['verify:breeding-storage-reuse'], 'Storage reuse verifier npm script exists');

check(appwrite.includes("export const MEDIA_BUCKET_ID = 'germ-media'"), 'Primary media bucket remains germ-media');
check(
  appwrite.includes('export const BREEDING_BUCKET_ID = MEDIA_BUCKET_ID')
  || appwrite.includes("export const BREEDING_BUCKET_ID = 'germ-media'"),
  'Breeding Program bucket aliases germ-media'
);

check(api.includes('BREEDING_BUCKET_ID'), 'Breeding Program API uses shared bucket constant');
check(!api.includes("const BREEDING_BUCKET_ID = 'breeding-program'"), 'Breeding Program API has no private second-bucket override');

check(setup.includes("const SHARED_BUCKET_ID = 'germ-media'"), 'Setup explicitly verifies germ-media');
check(!setup.includes('createBucket'), 'Setup does not create a storage bucket');
check(!setup.includes('/storage/buckets', setup.indexOf('POST')), 'Setup contains no bucket creation POST path');
check(setup.includes("const needed = ['pdf', 'doc', 'docx', 'xls', 'xlsx'];"), 'Setup verifies required document extensions');
check(setup.includes('No new Appwrite bucket is required.'), 'Setup explains shared-bucket behavior');

check(!modal.includes('.csv,application/pdf'), 'Research upload picker no longer advertises unsupported CSV');
check(modal.includes('.pdf,.doc,.docx,.xls,.xlsx,application/pdf'), 'Research upload picker matches allowed germ-media document extensions');

if (!process.exitCode) console.log('\n14/14 checks passed.\n');
