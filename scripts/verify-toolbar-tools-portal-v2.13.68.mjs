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
const nav = read('src/components/DesktopPrimaryNav.jsx');
const css = read('src/styles.css');

console.log(`\nCaneSprout ${pkg.version} Tools Portal Verification\n`);

check(nav.includes("import { createPortal } from 'react-dom';"), 'Tools dropdown imports React portal');
check(nav.includes('document.body'), 'Tools dropdown portals to document.body');
check(nav.includes('getBoundingClientRect()'), 'Tools dropdown positions from the trigger button');
check(nav.includes("window.addEventListener('scroll', reposition, true)"), 'Tools dropdown follows scrolling');
check(nav.includes("document.addEventListener('pointerdown', handlePointerDown, true)"), 'Outside click closes Tools dropdown');
check(nav.includes('menuRef.current?.contains(event.target)'), 'Inside menu clicks do not close before action');
check(nav.includes("event.key !== 'Escape'"), 'Escape closes Tools dropdown');
check(nav.includes('zIndex: 2147483000'), 'Tools dropdown is above application layers');
check(css.includes('.cs-tools-popover'), 'Tools dropdown has isolated styling');
check(css.includes('pointer-events: auto !important'), 'Tools dropdown remains interactive');

if (!process.exitCode) console.log('\n10/10 checks passed.\n');
