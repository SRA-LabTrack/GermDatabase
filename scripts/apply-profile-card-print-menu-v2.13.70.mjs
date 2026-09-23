import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const payloadRoot = path.join(root, 'v21370-profile-card-print-portal-payload');
const TARGET_VERSION = '2.13.70';
const ALLOWED_BASES = new Set(['2.13.69', TARGET_VERSION]);

function file(relative) { return path.join(root, relative); }
function exists(relative) { return fs.existsSync(file(relative)); }
function read(relative) { return fs.readFileSync(file(relative), 'utf8'); }
function write(relative, content) {
  const full = file(relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

for (const required of ['package.json', 'src/App.jsx', 'src/styles.css']) {
  if (!exists(required)) throw new Error(`Required project file is missing: ${required}`);
}

const pkg = JSON.parse(read('package.json'));
const current = String(pkg.version || '');

if (!ALLOWED_BASES.has(current)) {
  throw new Error(`This patch expects CaneSprout 2.13.69. Current package version is ${current || 'unknown'}. Apply the Excel Tools Collapse patch first.`);
}

/* Install portal component. */
write(
  'src/components/ProfileCardPrintMenu.jsx',
  fs.readFileSync(path.join(payloadRoot, 'src/components/ProfileCardPrintMenu.jsx'), 'utf8')
);

let app = read('src/App.jsx');

const importLine = "import ProfileCardPrintMenu from './components/ProfileCardPrintMenu.jsx';";
if (!app.includes(importLine)) {
  const anchor = "import SugarcaneIcon from './components/SugarcaneIcon.jsx';";
  if (!app.includes(anchor)) throw new Error('Could not locate SugarcaneIcon import in src/App.jsx.');
  app = app.replace(anchor, `${anchor}\n${importLine}`);
}

/* Add a stable button anchor inside RecordCard. */
if (!app.includes('const cardPrintTriggerRef = useRef(null);')) {
  const stateAnchor = "  const [cardPrintBusy, setCardPrintBusy] = useState('');";
  if (!app.includes(stateAnchor)) throw new Error('Could not locate RecordCard print state.');
  app = app.replace(stateAnchor, `${stateAnchor}\n  const cardPrintTriggerRef = useRef(null);`);
}

/* Attach ref to the existing Print trigger. */
if (!app.includes('ref={cardPrintTriggerRef}')) {
  const buttonAnchor = `              <button
                type="button"
                className={\`secondary-button germplasm-card-print-trigger \${cardPrintMenuOpen ? 'active' : ''}\`}`;
  if (!app.includes(buttonAnchor)) throw new Error('Could not locate the profile-card Print trigger.');
  app = app.replace(
    buttonAnchor,
    `              <button
                ref={cardPrintTriggerRef}
                type="button"
                className={\`secondary-button germplasm-card-print-trigger \${cardPrintMenuOpen ? 'active' : ''}\`}`
  );
}

/* Replace the inline absolute-positioned menu with the portal component. */
const oldMenu = `              {cardPrintMenuOpen && (
                <div className="germplasm-card-print-menu" role="menu" aria-label={\`Print \${record.variety || 'variety'}\`}>
                  <button type="button" role="menuitem" disabled={Boolean(cardPrintBusy)} onClick={(event) => printFromCard(event, 'core')}>
                    <strong>Core Information</strong>
                    <span>Preview core identity, parentage, yield, locations and disease reaction.</span>
                  </button>
                  <button type="button" role="menuitem" disabled={Boolean(cardPrintBusy)} onClick={(event) => printFromCard(event, 'complete')}>
                    <strong>Complete Information</strong>
                    <span>Preview core information plus every recorded additional trait and germination field.</span>
                  </button>
                </div>
              )}`;

const newMenu = `              <ProfileCardPrintMenu
                open={cardPrintMenuOpen}
                triggerRef={cardPrintTriggerRef}
                variety={record.variety || 'variety'}
                busy={Boolean(cardPrintBusy)}
                onClose={() => setCardPrintMenuOpen(false)}
                onCore={(event) => printFromCard(event, 'core')}
                onComplete={(event) => printFromCard(event, 'complete')}
              />`;

if (!app.includes('<ProfileCardPrintMenu')) {
  if (!app.includes(oldMenu)) {
    throw new Error('Could not locate the existing inline profile-card Print menu.');
  }
  app = app.replace(oldMenu, newMenu);
}

app = app.replace(/const APP_VERSION = ['"][^'"]+['"];/, `const APP_VERSION = '${TARGET_VERSION}';`);
write('src/App.jsx', app);

/* Add isolated popover styling. */
let styles = read('src/styles.css');
const marker = 'v2.13.70 PROFILE CARD PRINT MENU PORTAL';
if (!styles.includes(marker)) {
  const extra = fs.readFileSync(path.join(payloadRoot, 'styles-v2.13.70.css'), 'utf8');
  styles = `${styles.trimEnd()}\n\n${extra.trim()}\n`;
  write('src/styles.css', styles);
}

pkg.version = TARGET_VERSION;
pkg.scripts ||= {};
pkg.scripts['verify:profile-card-print-menu'] = 'node scripts/verify-profile-card-print-menu-v2.13.70.mjs';
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

if (exists('package-lock.json')) {
  const lock = JSON.parse(read('package-lock.json'));
  lock.version = TARGET_VERSION;
  if (lock.packages?.['']) lock.packages[''].version = TARGET_VERSION;
  write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
}

write(
  'scripts/verify-profile-card-print-menu-v2.13.70.mjs',
  fs.readFileSync(path.join(payloadRoot, 'scripts/verify-profile-card-print-menu-v2.13.70.mjs'), 'utf8')
);

if (exists('public/version.json')) {
  const info = JSON.parse(read('public/version.json'));
  info.version = TARGET_VERSION;
  info.notes = 'Moves the collection-card Print menu into a viewport-safe body portal so it cannot be clipped or displaced by profile-card containers.';
  info.updated = '2026-09-20';
  write('public/version.json', `${JSON.stringify(info, null, 2)}\n`);
}

if (exists('public/sw.js')) {
  let sw = read('public/sw.js');
  sw = sw.replace(/2\.13\.69/g, TARGET_VERSION);
  write('public/sw.js', sw);
}

console.log('');
console.log('CaneSprout v2.13.70 profile-card Print menu portal installed.');
console.log('The Print options now render outside the collection card and are clamped to the viewport.');
console.log('');
console.log('Next run:');
console.log('  npm.cmd run verify:profile-card-print-menu');
console.log('  npm.cmd run build');
console.log('');
