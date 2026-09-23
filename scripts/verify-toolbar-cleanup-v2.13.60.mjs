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
const app = read('src/App.jsx');
const css = read('src/styles.css');

console.log('\nCaneSprout v2.13.60 Clean Collapsible Toolbar Verification\n');

check(pkg.version === '2.13.60', 'Version is 2.13.60');
check(pkg.scripts?.['verify:toolbar-cleanup'], 'Toolbar cleanup verifier npm script exists');
check(app.includes('toolbar-primary-actions'), 'Desktop toolbar has primary-navigation group');
check(app.includes('toolbar-tools-drawer'), 'Collapsible Tools group exists');
check(app.includes('<span>Tools</span>'), 'Tools group has a clear label');
check(app.includes('<strong>Excel Tools</strong>'), 'Excel Tools moved into Tools group');
check(app.includes('<strong>Add record</strong>'), 'Add record moved into Tools group');
check(app.includes('<strong>Combination Registry</strong>'), 'Combination Registry moved into Tools group');
check(app.includes('<strong>Admin Center</strong>'), 'Admin Center is available in Tools group for admins');
check(app.includes('<SugarcaneIcon size={22} /><span>Germplasm</span>'), 'Germplasm remains primary');
check(app.includes('<GitBranch size={21} /><span>Pedigree</span>'), 'Pedigree remains primary');
check(app.includes('<MapPin size={21} /><span>Map</span>'), 'Map remains primary');

check(css.includes('v2.13.60 CLEAN + COLLAPSIBLE DESKTOP TOOLBAR'), 'Toolbar cleanup CSS is installed');
check(css.includes('grid-template-columns: minmax(255px, 330px) minmax(430px, 1fr) auto minmax(220px, 300px)'), 'Desktop toolbar uses balanced grid columns');
check(css.includes('.toolbar-tools-menu'), 'Collapsible Tools menu is styled');
check(css.includes('width: min(340px, calc(100vw - 28px))'), 'Tools menu is viewport-safe');
check(css.includes('.toolbar-status-card span small'), 'Connection card secondary text is compacted');
check(css.includes('@media (max-width: 1120px) and (min-width: 761px)'), 'Narrow-desktop fallback exists');

if (!process.exitCode) console.log('\n18/18 checks passed.\n');
