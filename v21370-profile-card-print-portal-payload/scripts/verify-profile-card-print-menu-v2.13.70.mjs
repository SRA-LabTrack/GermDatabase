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
const menu = read('src/components/ProfileCardPrintMenu.jsx');
const css = read('src/styles.css');

console.log('\nCaneSprout v2.13.70 Profile Card Print Menu Portal Verification\n');

check(pkg.version === '2.13.70', 'Version is 2.13.70');
check(pkg.scripts?.['verify:profile-card-print-menu'], 'Profile-card print menu verifier exists');

check(app.includes("import ProfileCardPrintMenu from './components/ProfileCardPrintMenu.jsx';"), 'App imports ProfileCardPrintMenu');
check(app.includes('const cardPrintTriggerRef = useRef(null);'), 'RecordCard has dedicated Print trigger ref');
check(app.includes('ref={cardPrintTriggerRef}'), 'Print button is anchored to trigger ref');
check(app.includes('<ProfileCardPrintMenu'), 'RecordCard renders portal Print menu');
check(!app.includes('<div className="germplasm-card-print-menu"'), 'Old inline print menu markup is removed');

check(menu.includes("import { createPortal } from 'react-dom';"), 'Print menu uses React portal');
check(menu.includes('document.body'), 'Print menu portals to document.body');
check(menu.includes('getBoundingClientRect()'), 'Menu position is measured from Print button');
check(menu.includes('viewportWidth - width - 12'), 'Menu is clamped inside viewport horizontally');
check(menu.includes('canOpenAbove'), 'Menu can flip above or below trigger');
check(menu.includes("window.addEventListener('scroll', reposition, true)"), 'Menu tracks scrolling');
check(menu.includes("document.addEventListener('pointerdown', handlePointerDown, true)"), 'Outside click closes menu');
check(menu.includes("event.key !== 'Escape'"), 'Escape closes menu');
check(menu.includes('zIndex: 2147483000'), 'Menu stays above card/page layers');

check(css.includes('v2.13.70 PROFILE CARD PRINT MENU PORTAL'), 'Portal menu CSS is installed');
check(css.includes('.profile-card-print-popover'), 'Portal popover has dedicated styles');
check(css.includes('max-width: calc(100vw - 24px)'), 'Popover cannot overflow viewport');
check(css.includes('pointer-events: auto !important'), 'Popover remains clickable');

if (!process.exitCode) console.log('\n20/20 checks passed.\n');
