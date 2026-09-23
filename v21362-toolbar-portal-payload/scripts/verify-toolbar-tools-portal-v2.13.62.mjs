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
const component = read('src/components/ToolbarToolsMenu.jsx');
const css = read('src/styles.css');

console.log('\nCaneSprout v2.13.62 Toolbar Portal Menu Verification\n');

check(pkg.version === '2.13.62', 'Version is 2.13.62');
check(pkg.scripts?.['verify:toolbar-tools-portal'], 'Toolbar portal verifier npm script exists');

check(app.includes("import ToolbarToolsMenu from './components/ToolbarToolsMenu.jsx';"), 'App imports dedicated ToolbarToolsMenu');
check(app.includes('<ToolbarToolsMenu'), 'Desktop navigation renders ToolbarToolsMenu');
check(!app.includes('ref={toolbarToolsRef}'), 'Old trapped toolbar menu anchor is removed');
check(!app.includes('toolbarToolsOpen'), 'Old App-level Tools state is removed');

check(component.includes("import { createPortal } from 'react-dom';"), 'Tools menu uses React portal');
check(component.includes('document.body'), 'Tools menu portal targets document.body');
check(component.includes('anchor.getBoundingClientRect()'), 'Dropdown position is measured from Tools button');
check(component.includes("window.addEventListener('scroll', reposition, true)"), 'Portal repositions during scroll');
check(component.includes("document.addEventListener('pointerdown', handlePointerDown, true)"), 'Outside click closes portal');
check(component.includes("event.key !== 'Escape'"), 'Escape closes portal');
check(component.includes('menuRef.current?.contains(event.target)'), 'Menu clicks are not mistaken for outside clicks');
check(component.includes('<strong>Excel Tools</strong>'), 'Excel Tools option is rendered');
check(component.includes('<strong>Add record</strong>'), 'Add record option is rendered');
check(component.includes('<strong>Combination Registry</strong>'), 'Combination Registry option is rendered');
check(component.includes('<strong>Admin Center</strong>'), 'Admin Center option is rendered for admins');

check(css.includes('v2.13.62 TOOLBAR PORTAL MENU + FULL-SPACE PROPORTION FIX'), 'Toolbar portal CSS is installed');
check(css.includes('flex: 1 1 0 !important'), 'Primary navigation expands into available space');
check(css.includes('.toolbar-tools-menu.toolbar-tools-menu-portal'), 'Portal dropdown has dedicated styles');
check(css.includes('position: fixed !important'), 'Portal dropdown is fixed to viewport');
check(css.includes('z-index: 100000 !important'), 'Portal dropdown stays above page content');
check(css.includes('top: var(--toolbar-tools-top) !important'), 'Portal top position cannot be overridden');
check(css.includes('left: var(--toolbar-tools-left) !important'), 'Portal left position cannot be overridden');
check(css.includes('width: var(--toolbar-tools-width) !important'), 'Portal width uses measured safe width');
check(css.includes('max-height: var(--toolbar-tools-max-height) !important'), 'Portal remains inside viewport height');
check(css.includes('flex: 0 0 138px !important'), 'Online utility has bounded width');
check(css.includes('flex: 0 1 290px !important'), 'Account utility has bounded width');

if (!process.exitCode) console.log('\n28/28 checks passed.\n');
