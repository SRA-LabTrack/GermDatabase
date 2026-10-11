import fs from 'node:fs';

const BASE_VERSION = '2.13.91';
const TARGET_VERSION = '2.13.92';

const paths = {
  brochure: 'src/components/VarietyBrochureModal.jsx',
  app: 'src/App.jsx',
  pkg: 'package.json',
  lock: 'package-lock.json',
  version: 'public/version.json',
  sw: 'public/sw.js',
  gitignore: '.gitignore'
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

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) fail(`Could not locate ${label}.`);
  return source.replace(before, after);
}

console.log(`
============================================================
CaneSprout ${BASE_VERSION} -> ${TARGET_VERSION}
Brochure Full-Resolution Preview Fix
============================================================
`);

const pkg = JSON.parse(read(paths.pkg));
if (![BASE_VERSION, TARGET_VERSION].includes(pkg.version)) {
  fail(`Expected package version ${BASE_VERSION} or ${TARGET_VERSION}, found ${pkg.version}.`);
}

for (const path of [paths.brochure, paths.app, paths.pkg, paths.lock, paths.version, paths.sw]) {
  if (fs.existsSync(path)) backup(path);
}

let brochure = read(paths.brochure);
let app = read(paths.app);
let sw = read(paths.sw);

// v2.13.91 deliberately preferred the small thumbnail for the inline brochure
// preview. That made the large Whole Variety panel soft/blurry even though the
// lightbox used the original full-resolution image. Prefer the original file in
// the brochure itself and retain the thumbnail only as a fallback.
brochure = replaceRequired(
  brochure,
  `  const displayId = thumbId || fileId;`,
  `  const displayId = fileId || thumbId;`,
  'brochure display image priority'
);

brochure = replaceRequired(
  brochure,
  `<StorageImage fileId={displayId} fallbackFileId={fileId} alt={\`${"${record?.variety || 'Sugarcane'}"} ${"${label}"}\`} loading="eager" decoding="async" />`,
  `<StorageImage fileId={displayId} fallbackFileId={thumbId} alt={\`${"${record?.variety || 'Sugarcane'}"} ${"${label}"}\`} loading="eager" decoding="async" fetchPriority={className.includes('main') ? 'high' : 'auto'} />`,
  'brochure full-resolution image renderer'
);

// Keep the visible footer/app version synchronized.
app = app.replace(
  /const APP_VERSION = '[^']+';/,
  `const APP_VERSION = '${TARGET_VERSION}';`
);

pkg.version = TARGET_VERSION;
pkg.scripts = pkg.scripts || {};
pkg.scripts['verify:brochure-full-res-preview'] =
  'node scripts/verify-brochure-full-res-preview-v2.13.92.mjs';

const lock = JSON.parse(read(paths.lock));
lock.version = TARGET_VERSION;
if (lock.packages?.['']) lock.packages[''].version = TARGET_VERSION;

const versionInfo = JSON.parse(read(paths.version));
versionInfo.version = TARGET_VERSION;
versionInfo.channel = versionInfo.channel || 'stable';
versionInfo.notes =
  'Uses original full-resolution germplasm photos in the on-screen Variety Brochure preview. Thumbnail files remain as fallback only, so the large Whole Variety panel stays sharp while preserving recovery behavior.';
versionInfo.updated = '2026-10-11';
versionInfo.updatedAt = new Date().toISOString();

sw = sw.replace(
  /const CACHE_VERSION = 'canesprout-offline-v[^']+';/,
  `const CACHE_VERSION = 'canesprout-offline-v${TARGET_VERSION}';`
);

write(paths.brochure, brochure);
write(paths.app, app);
write(paths.pkg, JSON.stringify(pkg, null, 2) + '\n');
write(paths.lock, JSON.stringify(lock, null, 2) + '\n');
write(paths.version, JSON.stringify(versionInfo, null, 2) + '\n');
write(paths.sw, sw);

let gitignore = fs.existsSync(paths.gitignore) ? fs.readFileSync(paths.gitignore, 'utf8') : '';
if (!gitignore.split(/\r?\n/).includes('*.v*-backup')) {
  if (gitignore && !gitignore.endsWith('\n')) gitignore += '\n';
  gitignore += '*.v*-backup\n';
  write(paths.gitignore, gitignore);
}

console.log('Fixed:');
console.log('  - Variety Brochure preview now prefers the original full-resolution photo.');
console.log('  - Thumbnail remains available only as a fallback if the original cannot load.');
console.log('  - The large Whole Variety preview receives high fetch priority when the brochure opens.');
console.log('  - Enlarge/lightbox behavior remains full resolution.');
console.log('  - No Appwrite records or images were modified.');
console.log(`  - Version moved to ${TARGET_VERSION}.`);
console.log('  - Added npm verifier: verify:brochure-full-res-preview');
console.log('\nPATCH APPLIED SUCCESSFULLY.\n');
