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
const css = read('src/styles.css');
const app = read('src/App.jsx');

console.log('\nCaneSprout v2.13.63 Equal Four-Way Toolbar Verification\n');

check(pkg.version === '2.13.63', 'Version is 2.13.63');
check(pkg.scripts?.['verify:toolbar-equal-nav'], 'Equal-navigation verifier npm script exists');

check(app.includes('<ToolbarToolsMenu'), 'Portal-based Tools menu remains installed');
check(app.includes('toolbar-primary-actions'), 'Primary navigation wrapper remains installed');

check(css.includes('v2.13.63 EQUAL FOUR-WAY DESKTOP NAVIGATION'), 'Equal-navigation CSS patch is installed');
check(css.includes('flex: 1 1 25% !important'), 'Navigation cells use equal flex basis');
check(css.includes('width: 25% !important'), 'Navigation cells explicitly use quarter widths');
check(css.includes('max-width: 25% !important'), 'No navigation cell can exceed its quarter');
check(css.includes('.toolbar-primary-actions > .toolbar-tile,'), 'Primary links participate in equal split');
check(css.includes('.toolbar-primary-actions > .toolbar-tools-drawer'), 'Tools participates in equal split');
check(css.includes('flex: 1 1 0 !important'), 'Primary navigation consumes all remaining toolbar width');
check(css.includes('width: 0 !important'), 'Flex navigation cannot preserve old intrinsic blank width');
check(css.includes('text-overflow: ellipsis !important'), 'Labels safely truncate instead of overlapping');
check(css.includes('@media (max-width: 1180px) and (min-width: 761px)'), 'Narrow desktop safeguard exists');
check(css.includes('display: none !important'), 'Narrow desktop can hide labels before overlap');

if (!process.exitCode) console.log('\n15/15 checks passed.\n');
