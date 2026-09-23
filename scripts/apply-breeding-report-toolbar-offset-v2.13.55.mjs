import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const payloadRoot = path.join(root, 'v21355-breeding-toolbar-offset-payload');
const allowedBases = new Set(['2.13.54', '2.13.55']);
const targetVersion = '2.13.55';

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}
function write(relative, content) {
  const full = path.join(root, relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}
function copyPayload(relative) {
  const source = path.join(payloadRoot, relative);
  if (!fs.existsSync(source)) throw new Error(`Patch payload is missing ${relative}. Re-extract the ZIP into the CaneSprout project root.`);
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

const pkg = JSON.parse(read('package.json'));
const current = String(pkg.version || '');
if (!allowedBases.has(current)) {
  throw new Error(`This patch expects CaneSprout 2.13.54. Current package version is ${current || 'unknown'}. Apply the persistent Breeding Reports close patch first.`);
}

copyPayload('src/components/BreedingReportsPanel.jsx');
copyPayload('scripts/verify-breeding-report-toolbar-offset-v2.13.55.mjs');

let combo = read('src/components/CombinationRegistryModal.jsx');
const oldRender = '<BreedingReportsPanel actor={actor} isAdmin={isAdmin} online={navigator.onLine} onClose={() => setShowBreedingReports(false)} />';
const newRender = '<BreedingReportsPanel actor={actor} isAdmin={isAdmin} online={navigator.onLine} toolbarBottom={toolbarBottom} onClose={() => setShowBreedingReports(false)} />';
if (!combo.includes('toolbarBottom={toolbarBottom}')) {
  if (!combo.includes(oldRender)) {
    throw new Error('Could not find the BreedingReportsPanel render in CombinationRegistryModal.jsx. The local file differs from the expected v2.13.54 layout.');
  }
  combo = combo.replace(oldRender, newRender);
  write('src/components/CombinationRegistryModal.jsx', combo);
}

let styles = read('src/styles.css');
const marker = '/* v2.13.55 Breeding Reports top-toolbar geometry fix */';
if (!styles.includes(marker)) {
  const extra = fs.readFileSync(path.join(payloadRoot, 'styles-v2.13.55.css'), 'utf8');
  styles = `${styles.trimEnd()}\n\n${extra.trim()}\n`;
  write('src/styles.css', styles);
}

pkg.version = targetVersion;
pkg.scripts = pkg.scripts || {};
pkg.scripts['verify:breeding-report-toolbar-offset'] = 'node scripts/verify-breeding-report-toolbar-offset-v2.13.55.mjs';
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

if (fs.existsSync(path.join(root, 'public/version.json'))) {
  const version = JSON.parse(read('public/version.json'));
  version.version = targetVersion;
  version.channel = version.channel || 'stable';
  version.notes = 'Positions Breeding Reports below the measured CaneSprout toolbar so its title and Close control never start underneath the global navigation.';
  version.updated = '2026-09-20';
  write('public/version.json', `${JSON.stringify(version, null, 2)}\n`);
}

if (fs.existsSync(path.join(root, 'public/sw.js'))) {
  let sw = read('public/sw.js');
  sw = sw.replace(/2\.13\.54/g, '2.13.55');
  sw = sw.replace(/canesprout-(?:static|shell|cache)-v[\w.-]+/g, (match) => {
    const prefix = match.replace(/v[\w.-]+$/, '');
    return `${prefix}v2.13.55`;
  });
  write('public/sw.js', sw);
}

console.log('');
console.log('CaneSprout v2.13.55 Breeding Reports toolbar-overlap fix installed.');
console.log("The report overlay now starts below CaneSprout\'s measured top toolbar.");
console.log('');
console.log('Next run:');
console.log('  npm.cmd run verify:breeding-report-toolbar-offset');
console.log('  npm.cmd run verify:breeding-report-close');
console.log('  npm.cmd run verify:breeding-report-exports');
console.log('  npm.cmd run build');
console.log('');
