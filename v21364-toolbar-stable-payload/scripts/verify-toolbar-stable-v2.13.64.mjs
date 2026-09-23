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
const tools = read('src/components/ToolbarToolsMenu.jsx');

console.log('\nCaneSprout v2.13.64 Stable Desktop Toolbar Verification\n');

check(pkg.version === '2.13.64', 'Version is 2.13.64');
check(pkg.scripts?.['verify:toolbar-stable'], 'Stable toolbar verifier npm script exists');

check(app.includes('toolbar-primary-actions'), 'Primary toolbar wrapper exists');
check(app.includes('<ToolbarToolsMenu'), 'Portal Tools component remains rendered');
check(tools.includes('createPortal'), 'Tools dropdown still uses body-level portal');

check(css.includes('v2.13.64 STABLE DESKTOP TOOLBAR LAYOUT'), 'Stable toolbar CSS is installed');
check(css.includes('@media (min-width: 761px)'), 'Desktop layout uses media query instead of :has detection');
check(!css.slice(css.indexOf('v2.13.64 STABLE DESKTOP TOOLBAR LAYOUT')).includes(':has(.mobile-toolbar-toggle)'), 'New toolbar rules do not depend on mobile-toggle DOM absence');
check(css.includes('flex: 1 1 0 !important'), 'Navigation consumes all remaining width');
check(css.includes('width: 25% !important'), 'Each navigation cell uses one quarter');
check(css.includes('.toolbar-primary-actions > .toolbar-tools-drawer'), 'Tools receives the same quarter treatment');
check(css.includes('min-width: 420px !important'), 'Desktop navigation has safe minimum width');
check(css.includes('flex: 0 0 140px !important'), 'Online card is bounded');
check(css.includes('flex: 0 1 300px !important'), 'Account card is bounded');
check(css.includes('z-index: 100000 !important'), 'Portal dropdown remains above page content');
check(css.includes('@media (min-width: 761px) and (max-width: 1120px)'), 'Narrow-desktop collision safeguard exists');

if (!process.exitCode) console.log('\n16/16 checks passed.\n');
