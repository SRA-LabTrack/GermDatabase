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

console.log('\nCaneSprout v2.13.61 Toolbar Menu + Proportion Verification\n');

check(pkg.version === '2.13.61', 'Version is 2.13.61');
check(pkg.scripts?.['verify:toolbar-menu-fix'], 'Toolbar menu verifier npm script exists');

check(app.includes('const toolbarToolsRef = useRef(null);'), 'Toolbar Tools has a dedicated ref');
check(app.includes('const [toolbarToolsOpen, setToolbarToolsOpen] = useState(false);'), 'Toolbar Tools has controlled open state');
check(app.includes("setToolbarToolsOpen((open) => !open)"), 'Tools button toggles React state');
check(app.includes('aria-expanded={toolbarToolsOpen}'), 'Tools button exposes open state accessibly');
check(app.includes('{toolbarToolsOpen && ('), 'Tools menu renders from controlled state');
check(app.includes("document.addEventListener('pointerdown', handleToolbarToolsPointerDown, true)"), 'Clicking outside closes Tools menu');
check(app.includes("event.key === 'Escape'"), 'Escape closes Tools menu');
check(app.includes('ref={toolbarToolsRef}'), 'Tools menu is anchored to its own ref');
check(!app.includes('<details\n            className={`toolbar-tools-drawer'), 'Native details-based Tools menu is removed');

check(css.includes('v2.13.61 TOOLBAR PROPORTION + CONTROLLED TOOLS MENU FIX'), 'Toolbar fix CSS is installed');
check(css.includes('display: flex !important'), 'Desktop toolbar uses flex proportions');
check(css.includes('grid-template-columns: none !important'), 'Old over-wide desktop grid is disabled');
check(css.includes('flex: 0 0 138px !important'), 'Online card has bounded width');
check(css.includes('flex: 0 1 290px !important'), 'Account card has bounded width');
check(css.includes('z-index: 60000 !important'), 'Tools dropdown stays above page content');
check(css.includes('max-height: min(460px, calc(100vh - 130px))'), 'Tools dropdown remains viewport-safe');
check(css.includes('@media (max-width: 1180px) and (min-width: 761px)'), 'Narrow desktop fallback remains available');

if (!process.exitCode) console.log('\n18/18 checks passed.\n');
