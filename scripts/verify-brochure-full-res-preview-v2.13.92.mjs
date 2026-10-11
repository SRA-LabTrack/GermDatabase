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
const sw = read('public/sw.js');
const app = read('src/App.jsx');
const brochure = read('src/components/VarietyBrochureModal.jsx');

console.log('\nCaneSprout v2.13.92 Brochure Full-Resolution Preview Verification\n');

check(pkg.version === '2.13.92', 'package.json version is 2.13.92');
check(lock.version === '2.13.92', 'package-lock version is 2.13.92');
check(lock.packages?.['']?.version === '2.13.92', 'package-lock root package is 2.13.92');
check(version.version === '2.13.92', 'public/version.json is 2.13.92');
check(sw.includes("canesprout-offline-v2.13.92"), 'PWA cache version is 2.13.92');
check(app.includes("const APP_VERSION = '2.13.92';"), 'visible app version is 2.13.92');
check(pkg.scripts?.['verify:brochure-full-res-preview'], 'verifier command is registered');

check(brochure.includes('const displayId = fileId || thumbId;'), 'brochure prefers original full-resolution image');
check(!brochure.includes('const displayId = thumbId || fileId;'), 'thumbnail-first brochure behavior is removed');
check(brochure.includes('fallbackFileId={thumbId}'), 'thumbnail remains as recovery fallback');
check(brochure.includes("fetchPriority={className.includes('main') ? 'high' : 'auto'}"), 'main brochure image receives high fetch priority');
check(brochure.includes('selectedPhoto.fileId'), 'enlarge/lightbox still uses full-resolution image identity');

if (!process.exitCode) {
  console.log('\n12/12 checks passed.\n');
}
