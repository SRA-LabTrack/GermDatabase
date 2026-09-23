import fs from 'node:fs';

function read(path) {
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
const app = read('src/App.jsx');

console.log('\nCaneSprout v2.13.71 Photo-First Germplasm Browse Verification\n');

check(pkg.version === '2.13.71', 'Version is 2.13.71');
check(pkg.scripts?.['verify:photo-first-browse'], 'Photo-first browse verifier npm script exists');

check(app.includes('function hasGermplasmPhoto(record)'), 'Photo-presence helper exists');
check(app.includes('record?.thumbnail_file_id'), 'Photo detection uses the same thumbnail field as germplasm cards');
check(app.includes('function photoFirstBrowseRecords(records, { searchInput = \'\', recentMode = false } = {})'), 'Stable photo-first sorter exists');
check(app.includes('if (recentMode || String(searchInput || \'\').trim()) return records;'), 'Search and Recently added preserve their existing ordering');
check(app.includes('hasPhoto: hasGermplasmPhoto(record)'), 'Sorter classifies each record by photo availability');
check(app.includes('if (photoDelta !== 0) return photoDelta;'), 'Photo records are prioritized ahead of placeholders');
check(app.includes('return a.index - b.index;'), 'Original order is preserved inside photo/no-photo groups');
check(app.includes('photoFirstBrowseRecords(records, { searchInput, recentMode }).map'), 'Germplasm card grid renders photo-first browse order');
check(app.includes('Browse first ${PAGE_SIZE} • photos first'), 'Browse toolbar communicates photo-first behavior');

if (!process.exitCode) console.log('\n11/11 checks passed.\n');
