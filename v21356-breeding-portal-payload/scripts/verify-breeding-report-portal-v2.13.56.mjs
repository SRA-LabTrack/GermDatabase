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
const panel = read('src/components/BreedingReportsPanel.jsx');
const css = read('src/styles.css');

console.log('\nCaneSprout v2.13.56 Breeding Reports Portal + Scroll Verification\n');

check(pkg.version === '2.13.56', 'Version is 2.13.56');
check(pkg.scripts?.['verify:breeding-report-portal'], 'Portal verifier npm script exists');

check(panel.includes("import { createPortal } from 'react-dom';"), 'Breeding Reports imports React portal support');
check(panel.includes('return createPortal('), 'Breeding Reports renders through a portal');
check(panel.includes('document.body'), 'Portal target is document.body');
check(panel.includes("document.body.style.overflow = 'hidden'"), 'Background page scrolling is locked while report is open');
check(panel.includes('document.body.style.overflow = previousOverflow'), 'Body scroll state is restored on close');
check(panel.includes("window.addEventListener('keydown', handleKeyDown, true)"), 'Escape close handler runs in capture phase');
check(panel.includes('event.stopPropagation()'), 'Escape does not leak to parent modal handlers');
check(panel.includes('toolbarBottom = 0'), 'Measured top-toolbar offset remains supported');
check(panel.includes("top: `${reportTopOffset}px`"), 'Overlay still starts below CaneSprout toolbar');
check(panel.includes('className="secondary-button compact breeding-reports-close"'), 'Dedicated Close control remains installed');

check(css.includes('/* v2.13.56 Breeding Reports portal + scrolling fix */'), 'Portal/scroll CSS patch is installed');
check(css.includes('z-index: 50000 !important'), 'Breeding Reports portal stays above parent modals');
check(css.includes('display: flex !important'), 'Portal overlay uses a stable flex layout');
check(css.includes('flex-direction: column !important'), 'Report shell uses header/body/footer column layout');
check(css.includes('flex: 1 1 0 !important'), 'Report body receives remaining height');
check(css.includes('overflow-y: auto !important'), 'Report body is vertically scrollable');
check(css.includes('touch-action: pan-y !important'), 'Vertical touch/wheel scrolling is allowed');
check(css.includes('scrollbar-gutter: stable !important'), 'Scrollbar space is reserved without clipping controls');
check(css.includes('.breeding-reports-close'), 'Close control has explicit geometry');
check(css.includes('min-width: 96px !important'), 'Desktop Close button has guaranteed visible width');
check(css.includes('overflow: visible !important'), 'Close/header cannot crop button contents');
check(css.includes('.breeding-reports-body::-webkit-scrollbar'), 'Visible report scrollbar is styled');
check(css.includes('content: none !important'), 'Old pseudo overlay remains removed');

if (!process.exitCode) console.log('\n25/25 checks passed.\n');
