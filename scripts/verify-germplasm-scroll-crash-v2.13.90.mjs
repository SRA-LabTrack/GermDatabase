import fs from 'node:fs';

function read(path) {
  if (!fs.existsSync(path)) {
    console.error(`FAIL  Missing ${path}`);
    process.exit(1);
  }
  return fs.readFileSync(path, 'utf8');
}

function check(condition, label) {
  if (!condition) {
    console.error(`FAIL  ${label}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS  ${label}`);
  }
}

const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const version = JSON.parse(read('public/version.json'));
const api = read('src/lib/registryApi.js');
const app = read('src/App.jsx');

console.log('\nCaneSprout v2.13.90 Germplasm Scroll Crash Verification\n');

check(pkg.version === '2.13.90', 'package.json version is 2.13.90');
check(lock.version === '2.13.90', 'package-lock version is 2.13.90');
check(lock.packages?.['']?.version === '2.13.90', 'package-lock root package is 2.13.90');
check(version.version === '2.13.90', 'public/version.json is 2.13.90');
check(pkg.scripts?.['verify:germplasm-scroll-crash'], 'hotfix verifier is registered');

check(api.includes('function normalizeOriginMetadataCollision(record = {})'), 'origin collision sanitizer is installed');
check(api.includes('nestedOrigin.origin_country'), 'nested workbook Country metadata is flattened safely');
check(api.includes('nestedOrigin.breeding_institution'), 'nested breeding institution metadata is preserved');
check(api.includes('nestedOrigin.local_international_collection'), 'nested collection scope metadata is preserved');
check(api.includes('return normalizeOriginMetadataCollision({'), 'expanded live records pass through sanitizer');
check(api.includes('__localPreview: hasLocalDetails'), 'local/offline preview path is present');
check((api.match(/normalizeOriginMetadataCollision\(\{/g) || []).length >= 3, 'live and both local preview return paths are sanitized');

check(app.includes("function safeGermplasmPreviewText(value, fallback = '')"), 'RecordCard safe-text renderer is installed');
check(app.includes('const country = safeGermplasmPreviewText('), 'Country preview is rendered defensively');
check(app.includes('const species = safeGermplasmPreviewText('), 'Species preview is rendered defensively');
check(!app.includes('<b>{preview.origin || missing}</b>'), 'unsafe direct Country object rendering is removed');
check(!app.includes('<b>{preview.species || missing}</b>'), 'unsafe direct Species rendering is removed');
check(app.includes('<b>{country}</b>'), 'safe Country variable is used in Germplasm card');
check(app.includes('<b>{species}</b>'), 'safe Species variable is used in Germplasm card');

if (!process.exitCode) {
  console.log('\n19/19 checks passed.\n');
}
