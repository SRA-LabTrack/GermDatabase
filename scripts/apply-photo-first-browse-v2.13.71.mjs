import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const payloadRoot = path.join(root, 'v21371-photo-first-payload');
const TARGET_VERSION = '2.13.71';
const ALLOWED_BASES = new Set(['2.13.70', TARGET_VERSION]);

function file(relative) {
  return path.join(root, relative);
}

function exists(relative) {
  return fs.existsSync(file(relative));
}

function read(relative) {
  return fs.readFileSync(file(relative), 'utf8');
}

function write(relative, content) {
  const full = file(relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

for (const required of ['package.json', 'src/App.jsx']) {
  if (!exists(required)) throw new Error(`Required project file is missing: ${required}`);
}

const pkg = JSON.parse(read('package.json'));
const current = String(pkg.version || '');

if (!ALLOWED_BASES.has(current)) {
  throw new Error(
    `This patch expects CaneSprout 2.13.70. Current package version is ${current || 'unknown'}. ` +
    'Apply the profile-card Print menu patch first.'
  );
}

let app = read('src/App.jsx');

const helperMarker = 'function photoFirstBrowseRecords(records, { searchInput = \'\', recentMode = false } = {})';

if (!app.includes(helperMarker)) {
  const anchor = 'const STALE_NOTICE_MS = 45 * 60_000;';

  if (!app.includes(anchor)) {
    throw new Error('Could not locate the App.jsx constants section for the photo-first helper.');
  }

  const helper = `

function hasGermplasmPhoto(record) {
  return Boolean(String(record?.thumbnail_file_id || '').trim());
}

function photoFirstBrowseRecords(records, { searchInput = '', recentMode = false } = {}) {
  if (recentMode || String(searchInput || '').trim()) return records;

  return (Array.isArray(records) ? records : [])
    .map((record, index) => ({
      record,
      index,
      hasPhoto: hasGermplasmPhoto(record)
    }))
    .sort((a, b) => {
      const photoDelta = Number(b.hasPhoto) - Number(a.hasPhoto);
      if (photoDelta !== 0) return photoDelta;
      return a.index - b.index;
    })
    .map(({ record }) => record);
}
`;

  app = app.replace(anchor, `${anchor}${helper}`);
}

const oldGrid = `          {loading ? Array.from({ length: 6 }, (_, index) => <SkeletonCard key={index} />) : records.map((record, index) => <RecordCard key={record.$id} record={record} index={index} onOpen={setDetailId} />)}`;

const newGrid = `          {loading ? Array.from({ length: 6 }, (_, index) => <SkeletonCard key={index} />) : photoFirstBrowseRecords(records, { searchInput, recentMode }).map((record, index) => <RecordCard key={record.$id} record={record} index={index} onOpen={setDetailId} />)}`;

if (!app.includes(newGrid)) {
  if (!app.includes(oldGrid)) {
    throw new Error('Could not locate the Germplasm Collection record grid in src/App.jsx.');
  }
  app = app.replace(oldGrid, newGrid);
}

app = app.replace(
  ': `Browse first ${PAGE_SIZE}`',
  ': `Browse first ${PAGE_SIZE} • photos first`'
);

app = app.replace(
  /const APP_VERSION = ['"][^'"]+['"];/,
  `const APP_VERSION = '${TARGET_VERSION}';`
);

write('src/App.jsx', app);

pkg.version = TARGET_VERSION;
pkg.scripts ||= {};
pkg.scripts['verify:photo-first-browse'] =
  'node scripts/verify-photo-first-browse-v2.13.71.mjs';

write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

if (exists('package-lock.json')) {
  const lock = JSON.parse(read('package-lock.json'));
  lock.version = TARGET_VERSION;
  if (lock.packages?.['']) lock.packages[''].version = TARGET_VERSION;
  write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
}

write(
  'scripts/verify-photo-first-browse-v2.13.71.mjs',
  fs.readFileSync(
    path.join(payloadRoot, 'scripts/verify-photo-first-browse-v2.13.71.mjs'),
    'utf8'
  )
);

if (exists('public/version.json')) {
  const info = JSON.parse(read('public/version.json'));
  info.version = TARGET_VERSION;
  info.notes =
    'Prioritizes germplasm varieties with uploaded photos in the default collection browse view while preserving search relevance and Recently added ordering.';
  info.updated = '2026-09-20';
  write('public/version.json', `${JSON.stringify(info, null, 2)}\n`);
}

if (exists('public/sw.js')) {
  let sw = read('public/sw.js');
  sw = sw.replace(/2\.13\.70/g, TARGET_VERSION);
  write('public/sw.js', sw);
}

console.log('');
console.log('CaneSprout v2.13.71 photo-first Germplasm Collection browse installed.');
console.log('Default browse order: varieties with photos first, placeholders afterward.');
console.log('Search results and Recently added keep their existing ordering.');
console.log('');
console.log('Next run:');
console.log('  npm.cmd run verify:photo-first-browse');
console.log('  npm.cmd run build');
console.log('');
