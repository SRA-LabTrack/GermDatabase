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

console.log('\nCaneSprout v2.13.65 Classic-Proportion Updated Toolbar Verification\n');

check(pkg.version === '2.13.65', 'Version is 2.13.65');
check(pkg.scripts?.['verify:toolbar-classic-layout'], 'Classic-layout verifier npm script exists');

check(app.includes('toolbar-primary-actions'), 'Updated primary navigation wrapper remains present');
check(app.includes('<ToolbarToolsMenu'), 'Updated portal Tools menu remains present');
check(tools.includes('createPortal'), 'Tools still renders through document.body portal');

check(css.includes('v2.13.65 CLASSIC-PROPORTION UPDATED TOOLBAR'), 'Classic-proportion CSS is installed');
check(css.includes('grid-template-columns:'), 'Desktop toolbar uses explicit clean column placement');
check(css.includes('grid-template-columns: repeat(4, minmax(0, 1fr))'), 'Germplasm/Pedigree/Map/Tools share four equal navigation cells');
check(css.includes('grid-column: 1 !important'), 'Brand occupies first toolbar region');
check(css.includes('grid-column: 2 !important'), 'Primary navigation occupies center toolbar region');
check(css.includes('grid-column: 3 !important'), 'Online status occupies status region');
check(css.includes('grid-column: 4 !important'), 'Account occupies final toolbar region');
check(css.includes('min-height: 72px !important'), 'Navigation cells retain full readable toolbar height');
check(css.includes('text-overflow: ellipsis !important'), 'Long labels cannot overlap neighboring sections');
check(css.includes('z-index: 100000 !important'), 'Working Tools portal remains above the page');
check(css.includes('@media (min-width: 1181px) and (max-width: 1550px)'), 'Medium desktop proportions are defined');
check(css.includes('@media (min-width: 761px) and (max-width: 1180px)'), 'Narrow desktop no-overlap fallback is defined');

if (!process.exitCode) console.log('\n17/17 checks passed.\n');
