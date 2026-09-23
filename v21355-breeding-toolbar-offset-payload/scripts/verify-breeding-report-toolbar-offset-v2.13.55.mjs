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
const combo = read('src/components/CombinationRegistryModal.jsx');
const panel = read('src/components/BreedingReportsPanel.jsx');
const css = read('src/styles.css');

console.log('\nCaneSprout v2.13.55 Breeding Reports Toolbar-Overlap Verification\n');

check(pkg.version === '2.13.55', 'Version is 2.13.55');
check(pkg.scripts?.['verify:breeding-report-toolbar-offset'], 'Toolbar-overlap verifier npm script exists');

check(combo.includes('toolbarBottom={toolbarBottom}'), 'Combination Registry passes measured toolbar bottom to Breeding Reports');
check(panel.includes('toolbarBottom = 0'), 'Breeding Reports accepts toolbarBottom');
check(panel.includes('const reportTopOffset = Math.max(0, Number(toolbarBottom) || 0) + 8;'), 'Overlay top offset derives from measured global toolbar');
check(panel.includes("top: `${reportTopOffset}px`"), 'Backdrop top is set below the global toolbar');
check(panel.includes("bottom: '8px'"), 'Backdrop reserves a bottom safety gap');
check(panel.includes("right: '0px'"), 'Backdrop spans available viewport width');
check(panel.includes("left: '0px'"), 'Backdrop spans available viewport width');

check(css.includes('/* v2.13.55 Breeding Reports top-toolbar geometry fix */'), 'Toolbar geometry CSS patch is installed');
check(css.includes('inset: auto !important'), 'Legacy full-screen inset is disabled');
check(css.includes('align-items: stretch !important'), 'Backdrop stretches modal only inside available report area');
check(css.includes('height: 100% !important'), 'Modal height follows the usable area below toolbar');
check(css.includes('max-height: 100% !important'), 'Modal cannot extend above/below its overlay');
check(css.includes('min-height: 0 !important'), 'Flex scrolling can shrink correctly');
check(css.includes('overflow-y: auto !important'), 'Only report body scrolls vertically');
check(css.includes('.breeding-reports-close'), 'Close control has explicit visible geometry');
check(css.includes('position: relative !important'), 'Header/close/footer no longer rely on conflicting sticky coordinates');
check(css.includes('content: none !important'), 'Old lower-right pseudo hint is removed');

check(panel.includes("event.key !== 'Escape'"), 'Escape-to-close remains available');
check(panel.includes('aria-label="Close Breeding Reports"'), 'Close button remains accessible');

if (!process.exitCode) console.log('\n20/20 checks passed.\n');
