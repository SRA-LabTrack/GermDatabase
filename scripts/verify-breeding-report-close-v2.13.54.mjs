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
const panel = read('src/components/BreedingReportsPanel.jsx');
const css = read('src/styles.css');

console.log('\nCaneSprout v2.13.54 Breeding Reports Persistent Close Verification\n');

check(pkg.version === '2.13.54', 'Version is 2.13.54');
check(pkg.scripts?.['verify:breeding-report-close'], 'Persistent-close verifier npm script exists');

check(panel.includes("useEffect"), 'Breeding Reports imports useEffect');
check(panel.includes("event.key !== 'Escape'"), 'Escape-key close handler exists');
check(panel.includes("window.addEventListener('keydown', handleKeyDown)"), 'Escape handler is registered');
check(panel.includes("window.removeEventListener('keydown', handleKeyDown)"), 'Escape handler is cleaned up');
check(panel.includes('className="secondary-button compact breeding-reports-close"'), 'Close button has dedicated class');
check(panel.includes('aria-label="Close Breeding Reports"'), 'Close button remains accessible');
check(panel.includes('title="Close Breeding Reports (Esc)"'), 'Close button advertises Escape shortcut');

check(css.includes('/* v2.13.54 Breeding Reports persistent close control */'), 'Persistent-close CSS patch is installed');
check(css.includes('position: sticky !important'), 'Sticky positioning is enabled');
check(css.includes('.breeding-reports-header'), 'Breeding Reports header receives sticky treatment');
check(css.includes('z-index: 80 !important'), 'Sticky header stays above report content');
check(css.includes('.breeding-reports-header > button:last-child'), 'Close control gets persistent positioning');
check(css.includes('z-index: 100 !important'), 'Close control stays above header/content');
check(css.includes('.breeding-reports-footer'), 'Footer is also kept reachable');
check(css.includes('bottom: 0 !important'), 'Footer remains pinned while scrolling');
check(css.includes('Esc to close'), 'Visible Escape-close hint is present');

if (!process.exitCode) console.log('\n18/18 checks passed.\n');
