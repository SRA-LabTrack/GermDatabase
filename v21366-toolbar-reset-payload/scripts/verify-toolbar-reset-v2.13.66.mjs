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
const tools = read('src/components/ToolbarToolsMenu.jsx');

console.log('\nCaneSprout v2.13.66 Clean Toolbar Reset Verification\n');

check(pkg.version === '2.13.66', 'Version is 2.13.66');
check(pkg.scripts?.['verify:toolbar-reset'], 'Toolbar reset verifier npm script exists');

check(app.includes('toolbar-clean-v21366'), 'Header has clean-toolbar scope class');
check(app.includes('toolbar-nav-v21366'), 'Primary navigation has clean-nav scope class');
check(app.includes('<ToolbarToolsMenu'), 'Portal-based Tools component remains rendered');
check(tools.includes('createPortal'), 'Tools still renders through document.body');

check(css.includes('v2.13.66 CLEAN TOOLBAR RESET'), 'Single clean toolbar stylesheet is installed');
check(!css.includes('v2.13.60 CLEAN + COLLAPSIBLE DESKTOP TOOLBAR'), 'v2.13.60 toolbar CSS was removed');
check(!css.includes('v2.13.61 TOOLBAR PROPORTION + CONTROLLED TOOLS MENU FIX'), 'v2.13.61 toolbar CSS was removed');
check(!css.includes('v2.13.62 TOOLBAR PORTAL MENU + FULL-SPACE PROPORTION FIX'), 'v2.13.62 toolbar CSS was removed');
check(!css.includes('v2.13.63 EQUAL FOUR-WAY DESKTOP NAVIGATION'), 'v2.13.63 toolbar CSS was removed');
check(!css.includes('v2.13.64 STABLE DESKTOP TOOLBAR LAYOUT'), 'v2.13.64 toolbar CSS was removed');
check(!css.includes('v2.13.65 CLASSIC-PROPORTION UPDATED TOOLBAR'), 'v2.13.65 toolbar CSS was removed');

check(css.includes('grid-template-columns: repeat(4, minmax(0, 1fr))'), 'Four navigation cells are equal');
check(css.includes('font-size: 11px !important'), 'Desktop navigation labels are explicitly visible/readable');
check(css.includes('visibility: visible !important'), 'Navigation labels cannot remain invisibly collapsed');
check(css.includes('grid-column: 3 !important'), 'Online occupies its own toolbar column');
check(css.includes('grid-column: 4 !important'), 'Account occupies its own toolbar column');
check(css.includes('z-index: 100000 !important'), 'Tools portal stays above page content');

if (!process.exitCode) console.log('\n19/19 checks passed.\n');
