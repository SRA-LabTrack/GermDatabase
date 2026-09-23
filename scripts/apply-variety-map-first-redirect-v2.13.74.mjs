import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const payloadRoot = path.join(root, 'v21374-first-map-redirect-payload');
const TARGET_VERSION = '2.13.74';
const ALLOWED_BASES = new Set(['2.13.73', TARGET_VERSION]);

function file(relative) { return path.join(root, relative); }
function exists(relative) { return fs.existsSync(file(relative)); }
function read(relative) { return fs.readFileSync(file(relative), 'utf8'); }

function write(relative, content) {
  const full = file(relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

function patchVersionConstant(relative, constantName) {
  if (!exists(relative)) return;
  let source = read(relative);
  const re = new RegExp(`const\\s+${constantName}\\s*=\\s*['"][^'"]+['"]\\s*;`);
  if (!re.test(source)) return;
  source = source.replace(re, `const ${constantName} = '${TARGET_VERSION}';`);
  write(relative, source);
}

for (const required of [
  'package.json',
  'src/components/VarietyMapModal.jsx',
  'src/styles.css'
]) {
  if (!exists(required)) throw new Error(`Required project file is missing: ${required}`);
}

const pkg = JSON.parse(read('package.json'));
const current = String(pkg.version || '');

if (!ALLOWED_BASES.has(current)) {
  throw new Error(
    `This patch expects CaneSprout 2.13.73. Current package version is ${current || 'unknown'}. ` +
    'Apply the latest breeding-history suggestions patch first.'
  );
}

let component = read('src/components/VarietyMapModal.jsx');

/* ------------------------------------------------------------------
   Add a one-shot ref. It resets naturally whenever the map modal unmounts
   and opens again.
   ------------------------------------------------------------------ */
if (!component.includes('const firstRedirectVisualRef = useRef(true);')) {
  const preferredAnchor = 'const initialMapFitDoneRef = useRef(false);';
  const fallbackAnchor = 'const selectedOverlayRef = useRef(null);';

  if (component.includes(preferredAnchor)) {
    component = component.replace(
      preferredAnchor,
      `${preferredAnchor}\n  const firstRedirectVisualRef = useRef(true);`
    );
  } else if (component.includes(fallbackAnchor)) {
    component = component.replace(
      fallbackAnchor,
      `${fallbackAnchor}\n  const firstRedirectVisualRef = useRef(true);`
    );
  } else {
    throw new Error(
      'Could not locate a stable VarietyMapModal ref insertion point. ' +
      'The local map component differs from the expected CaneSprout version.'
    );
  }
}

/* ------------------------------------------------------------------
   Add a first-selection visual guard immediately before focusEntry().
   This deliberately does NOT modify smoothFocusMap/flyTo timings.
   ------------------------------------------------------------------ */
const guardMarker = 'v2.13.74 first redirect visual guard';

if (!component.includes(guardMarker)) {
  const focusAnchor = 'function focusEntry(entry)';

  if (!component.includes(focusAnchor)) {
    throw new Error(
      'Could not locate function focusEntry(entry) in VarietyMapModal.jsx.'
    );
  }

  const effect = `  // ${guardMarker}
  useEffect(() => {
    if (!selectedIdentity || !firstRedirectVisualRef.current) return undefined;

    const canvas = document.querySelector('.variety-map-canvas');
    if (!canvas) return undefined;

    // Mark immediately so rapid subsequent selections cannot start another
    // "first" transition. The class itself remains until imagery has had time
    // to settle after the existing 1.55 second fly animation.
    firstRedirectVisualRef.current = false;
    canvas.classList.add('variety-map-first-redirect');

    const FIRST_REDIRECT_GUARD_MS = 2150;
    const timer = window.setTimeout(() => {
      canvas.classList.remove('variety-map-first-redirect');
    }, FIRST_REDIRECT_GUARD_MS);

    return () => {
      window.clearTimeout(timer);
      canvas.classList.remove('variety-map-first-redirect');
    };
  }, [selectedIdentity]);

`;

  component = component.replace(
    focusAnchor,
    `${effect}  ${focusAnchor}`
  );
}

write('src/components/VarietyMapModal.jsx', component);

/* ------------------------------------------------------------------
   Add visual masking styles. These only activate on the one-shot class.
   ------------------------------------------------------------------ */
let styles = read('src/styles.css');
const cssMarker = 'v2.13.74 FIRST GERMPLASM MAP REDIRECT GUARD';

if (!styles.includes(cssMarker)) {
  const extra = fs.readFileSync(
    path.join(payloadRoot, 'styles-v2.13.74.css'),
    'utf8'
  );
  styles = `${styles.trimEnd()}\n\n${extra.trim()}\n`;
  write('src/styles.css', styles);
}

/* ------------------------------------------------------------------
   Version + verification.
   ------------------------------------------------------------------ */
pkg.version = TARGET_VERSION;
pkg.scripts ||= {};
pkg.scripts['verify:variety-map-first-redirect'] =
  'node scripts/verify-variety-map-first-redirect-v2.13.74.mjs';

write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

if (exists('package-lock.json')) {
  const lock = JSON.parse(read('package-lock.json'));
  lock.version = TARGET_VERSION;
  if (lock.packages?.['']) lock.packages[''].version = TARGET_VERSION;
  write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
}

write(
  'scripts/verify-variety-map-first-redirect-v2.13.74.mjs',
  fs.readFileSync(
    path.join(payloadRoot, 'scripts/verify-variety-map-first-redirect-v2.13.74.mjs'),
    'utf8'
  )
);

patchVersionConstant('src/App.jsx', 'APP_VERSION');
patchVersionConstant('src/lib/offlineApp.js', 'OFFLINE_VERSION');

/* Keep the older smooth-map verifier useful at the current package version. */
if (exists('scripts/verify-variety-map-smooth-redirect-v2.13.59.mjs')) {
  let oldVerifier = read('scripts/verify-variety-map-smooth-redirect-v2.13.59.mjs');
  oldVerifier = oldVerifier
    .replaceAll("pkg.version === '2.13.59'", "pkg.version === '2.13.74'")
    .replaceAll('Version is 2.13.59', 'Version is 2.13.74')
    .replaceAll(
      'CaneSprout v2.13.59 Smooth Germplasm Map Redirect Verification',
      'CaneSprout v2.13.74 Smooth Germplasm Map Redirect Verification'
    );
  write('scripts/verify-variety-map-smooth-redirect-v2.13.59.mjs', oldVerifier);
}

if (exists('public/version.json')) {
  const info = JSON.parse(read('public/version.json'));
  info.version = TARGET_VERSION;
  info.notes =
    'Fixes the first Germplasm Map world-to-variety redirect by temporarily masking accuracy, marker, popup, and stretched overview layers until the existing smooth fly animation and destination imagery settle.';
  info.updated = '2026-09-20';
  write('public/version.json', `${JSON.stringify(info, null, 2)}\n`);
}

if (exists('public/sw.js')) {
  let sw = read('public/sw.js');
  sw = sw.replace(/2\.13\.73/g, TARGET_VERSION);
  write('public/sw.js', sw);
}

console.log('');
console.log('CaneSprout v2.13.74 first Germplasm Map redirect guard installed.');
console.log('  - First world-to-variety redirect hides the oversized accuracy-circle animation');
console.log('  - Stretched overview tiles are dimmed only during the first zoom animation');
console.log('  - Popup / selected pin reveal after the destination has had time to settle');
console.log('  - Later redirects keep the existing v2.13.59 smooth behavior');
console.log('');
console.log('Next run:');
console.log('  npm.cmd run verify:variety-map-first-redirect');
console.log('  npm.cmd run verify:variety-map-smooth-redirect');
console.log('  npm.cmd run build');
console.log('');
