import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const payloadRoot = path.join(root, 'v21359-smooth-map-redirect-payload');
const TARGET_VERSION = '2.13.59';
const ALLOWED_BASES = new Set(['2.13.58', TARGET_VERSION]);

function file(relative) { return path.join(root, relative); }
function exists(relative) { return fs.existsSync(file(relative)); }
function read(relative) { return fs.readFileSync(file(relative), 'utf8'); }
function write(relative, content) {
  const full = file(relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}
function requireFile(relative) {
  if (!exists(relative)) throw new Error(`Required project file is missing: ${relative}`);
}
function replaceRequired(source, pattern, replacement, label) {
  if (typeof pattern === 'string') {
    if (!source.includes(pattern)) throw new Error(`Could not find ${label}. The local map file differs from the expected CaneSprout version.`);
    return source.replace(pattern, replacement);
  }
  if (!pattern.test(source)) throw new Error(`Could not find ${label}. The local map file differs from the expected CaneSprout version.`);
  return source.replace(pattern, replacement);
}

function patchVersionConstant(relative, name) {
  if (!exists(relative)) return;
  let source = read(relative);
  const expression = new RegExp(`const\\s+${name}\\s*=\\s*['"][^'"]+['"]\\s*;`);
  if (!expression.test(source)) return;
  source = source.replace(expression, `const ${name} = '${TARGET_VERSION}';`);
  write(relative, source);
}

function patchPackage() {
  const pkg = JSON.parse(read('package.json'));
  const current = String(pkg.version || '');
  if (!ALLOWED_BASES.has(current)) {
    throw new Error(`This patch expects CaneSprout 2.13.58. Current package version is ${current || 'unknown'}. Apply the latest Breeding Reports month/year patch first.`);
  }
  pkg.version = TARGET_VERSION;
  pkg.scripts ||= {};
  pkg.scripts['verify:variety-map-smooth-redirect'] = 'node scripts/verify-variety-map-smooth-redirect-v2.13.59.mjs';
  write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

  if (exists('package-lock.json')) {
    const lock = JSON.parse(read('package-lock.json'));
    lock.version = TARGET_VERSION;
    if (lock.packages?.['']) lock.packages[''].version = TARGET_VERSION;
    write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
  }
}

function patchMapComponent() {
  const relative = 'src/components/VarietyMapModal.jsx';
  let source = read(relative);

  if (!source.includes('duration: .72') && !source.includes('duration: 0.72')) {
    if (source.includes('duration: .36')) source = source.replaceAll('duration: .36', 'duration: .72');
    else if (source.includes('duration: 0.36')) source = source.replaceAll('duration: 0.36', 'duration: 0.72');
    else throw new Error('Could not find the existing nearby redirect duration (.36) in VarietyMapModal.jsx.');
  }

  if (!source.includes('duration: 1.55')) {
    if (source.includes('duration: .68')) source = source.replaceAll('duration: .68', 'duration: 1.55');
    else if (source.includes('duration: 0.68')) source = source.replaceAll('duration: 0.68', 'duration: 1.55');
    else throw new Error('Could not find the existing long redirect duration (.68) in VarietyMapModal.jsx.');
  }

  if (!source.includes('keepBuffer: 6')) {
    source = replaceRequired(source, 'keepBuffer: 4', 'keepBuffer: 6', 'satellite keepBuffer: 4');
  }

  const warmMarker = 'v2.13.59 multi-level destination prewarm';
  if (!source.includes(warmMarker)) {
    const oldWarm = 'warmDestinationTiles(coords, targetZoom);';
    const newWarm = `// ${warmMarker}\n    warmDestinationTiles(coords, Math.max(2, targetZoom - 2));\n    warmDestinationTiles(coords, Math.max(2, targetZoom - 1));\n    warmDestinationTiles(coords, targetZoom);`;
    source = replaceRequired(source, oldWarm, newWarm, 'destination tile warmer call');
  }

  write(relative, source);
}

function patchStyles() {
  const relative = 'src/styles.css';
  let source = read(relative);
  const marker = 'v2.13.59 SMOOTHER GERMPLASM MAP REDIRECT';
  if (!source.includes(marker)) {
    source = `${source.trimEnd()}\n\n${String.raw`
/* ================================================================
   v2.13.59 SMOOTHER GERMPLASM MAP REDIRECT
   ================================================================ */
.variety-map-canvas .leaflet-map-pane,
.variety-map-canvas .leaflet-zoom-animated,
.variety-map-canvas .leaflet-tile-pane {
  will-change: transform;
}

.variety-map-canvas .leaflet-tile {
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  transform: translateZ(0);
  transition: opacity .24s linear;
}

.variety-map-canvas .leaflet-tile-container {
  will-change: transform, opacity;
}
`.trim()}\n`;
  }
  write(relative, source);
}

function patchLegacyVerifier(relative, edits) {
  if (!exists(relative)) return;
  let source = read(relative);
  for (const [from, to] of edits) source = source.replaceAll(from, to);
  write(relative, source);
}

function patchPublicVersion() {
  if (!exists('public/version.json')) return;
  const info = JSON.parse(read('public/version.json'));
  info.version = TARGET_VERSION;
  info.notes = 'Slows Germplasm Map redirection, pre-warms additional satellite zoom levels, and increases tile buffering for smoother long-distance variety transitions.';
  info.updated = '2026-09-20';
  write('public/version.json', `${JSON.stringify(info, null, 2)}\n`);
}

function patchServiceWorker() {
  if (!exists('public/sw.js')) return;
  let source = read('public/sw.js');
  source = source.replace(/2\.13\.58/g, TARGET_VERSION);
  source = source.replace(/canesprout-(?:static|shell|cache|offline)-v[\w.-]+/g, (match) => {
    const prefix = match.replace(/v[\w.-]+$/, '');
    return `${prefix}v${TARGET_VERSION}`;
  });
  write('public/sw.js', source);
}

for (const relative of [
  'package.json',
  'src/components/VarietyMapModal.jsx',
  'src/styles.css'
]) requireFile(relative);

patchPackage();
patchMapComponent();
patchStyles();
patchVersionConstant('src/App.jsx', 'APP_VERSION');
patchVersionConstant('src/lib/offlineApp.js', 'OFFLINE_VERSION');
patchPublicVersion();
patchServiceWorker();

patchLegacyVerifier('scripts/verify-variety-map-performance.mjs', [
  ['Nearby redirects use short animated setView', 'Nearby redirects use relaxed animated setView'],
  ['Long redirects use short flyTo animation', 'Long redirects use relaxed flyTo animation'],
  ['duration: .36', 'duration: .72'],
  ['duration: .68', 'duration: 1.55']
]);

patchLegacyVerifier('scripts/verify-variety-map-transition.mjs', [
  ['Destination keeps a larger tile buffer', 'Destination keeps an expanded tile buffer'],
  ['keepBuffer: 4', 'keepBuffer: 6'],
  ['Long redirects use a short fly animation', 'Long redirects use a slower smooth fly animation'],
  ['duration: .68', 'duration: 1.55']
]);

const verifierSource = fs.readFileSync(path.join(payloadRoot, 'scripts/verify-variety-map-smooth-redirect-v2.13.59.mjs'), 'utf8');
write('scripts/verify-variety-map-smooth-redirect-v2.13.59.mjs', verifierSource);

console.log('');
console.log('CaneSprout v2.13.59 smoother Germplasm Map redirect patch applied.');
console.log('  Nearby redirect duration: 0.72 seconds');
console.log('  Long-distance fly duration: 1.55 seconds');
console.log('  Destination imagery warms at target zoom and two lower zoom levels');
console.log('  Satellite tile keepBuffer increased from 4 to 6');
console.log('');
console.log('Next run:');
console.log('  npm.cmd run verify:variety-map-smooth-redirect');
console.log('  npm.cmd run verify:variety-map-performance');
console.log('  npm.cmd run verify:variety-map-transition');
console.log('  npm.cmd run build');
console.log('');
