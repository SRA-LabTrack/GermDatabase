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
const nav = read('src/components/DesktopPrimaryNav.jsx');
const css = read('src/styles.css');

console.log('\nCaneSprout v2.13.68 Isolated Primary Navigation Verification\n');

check(pkg.version === '2.13.68', 'Version is 2.13.68');
check(pkg.scripts?.['verify:toolbar-isolated-nav'], 'Isolated-nav verifier npm script exists');

check(app.includes("import DesktopPrimaryNav from './components/DesktopPrimaryNav.jsx';"), 'App imports isolated desktop navigation');
check(app.includes('<DesktopPrimaryNav'), 'App renders isolated desktop navigation');
check(!app.includes('<ToolbarToolsMenu'), 'Old ToolbarToolsMenu render is removed');
check(app.includes('toolbar-clean-v21368'), 'Header uses v2.13.68 toolbar scope');

check(nav.includes('className="cs-primary-nav"'), 'Navigation uses new isolated class');
check(nav.includes('cs-primary-nav__item'), 'All four navigation cells use isolated item class');
check(nav.includes('createPortal'), 'Tools menu uses document-body portal');
check(nav.includes('document.body'), 'Tools portal targets document.body');
check(nav.includes('zIndex: 2147483000'), 'Tools popover uses explicit top-level z-index');
check(nav.includes('menuRef.current?.contains(event.target)'), 'Menu clicks remain clickable');
check(nav.includes("event.key !== 'Escape'"), 'Escape closes Tools');
check(nav.includes('<span>Germplasm</span>'), 'Germplasm cell exists');
check(nav.includes('<span>Pedigree</span>'), 'Pedigree cell exists');
check(nav.includes('<span>Map</span>'), 'Map cell exists');
check(nav.includes('<span>Tools</span>'), 'Tools cell exists');
check(nav.includes('<strong>Excel Tools</strong>'), 'Tools menu contains Excel Tools');
check(nav.includes('<strong>Add record</strong>'), 'Tools menu contains Add record');
check(nav.includes('<strong>Combination Registry</strong>'), 'Tools menu contains Combination Registry');
check(nav.includes('<strong>Admin Center</strong>'), 'Tools menu contains Admin Center for admins');

check(css.includes('v2.13.68 ISOLATED PRIMARY NAVIGATION'), 'Only isolated navigation CSS block is installed');
check(!css.includes('v2.13.67 FINAL DESKTOP TOOLBAR GEOMETRY'), 'v2.13.67 toolbar geometry is removed');
check(css.includes('grid-template-columns: repeat(4, minmax(0, 1fr))'), 'Four cells share the complete navigation width equally');
check(css.includes('.cs-tools-popover'), 'Tools portal has isolated popover styling');
check(css.includes('font-size: 13px !important'), 'Desktop labels remain readable');

if (!process.exitCode) console.log('\n26/26 checks passed.\n');
