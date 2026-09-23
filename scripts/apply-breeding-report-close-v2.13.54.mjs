import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const payloadRoot = path.join(root, 'v21354-breeding-close-payload');
const allowedBases = new Set(['2.13.53', '2.13.54']);
const targetVersion = '2.13.54';

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
  throw new Error(`This patch expects CaneSprout 2.13.53. Current package version is ${current || 'unknown'}. Apply the Breeding Report layout/export patch first.`);
}

copyPayload('src/components/BreedingReportsPanel.jsx');
copyPayload('scripts/verify-breeding-report-close-v2.13.54.mjs');

let styles = read('src/styles.css');
const marker = '/* v2.13.54 Breeding Reports persistent close control */';
if (!styles.includes(marker)) {
  const extra = fs.readFileSync(path.join(payloadRoot, 'styles-v2.13.54.css'), 'utf8');
  styles = `${styles.trimEnd()}\n\n${extra.trim()}\n`;
  write('src/styles.css', styles);
}

pkg.version = targetVersion;
pkg.scripts = pkg.scripts || {};
pkg.scripts['verify:breeding-report-close'] = 'node scripts/verify-breeding-report-close-v2.13.54.mjs';
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

if (fs.existsSync(path.join(root, 'public/version.json'))) {
  const version = JSON.parse(read('public/version.json'));
  version.version = targetVersion;
  version.channel = version.channel || 'stable';
  version.notes = 'Keeps the Breeding Reports header and Close control visible while scrolling long generated reports.';
  version.updated = '2026-09-20';
  write('public/version.json', `${JSON.stringify(version, null, 2)}\n`);
}

if (fs.existsSync(path.join(root, 'public/sw.js'))) {
  let sw = read('public/sw.js');
  sw = sw.replace(/2\.13\.53/g, '2.13.54');
  sw = sw.replace(/canesprout-(?:static|shell|cache)-v[\w.-]+/g, (match) => {
    const prefix = match.replace(/v[\w.-]+$/, '');
    return `${prefix}v2.13.54`;
  });
  write('public/sw.js', sw);
}

console.log('');
console.log('CaneSprout v2.13.54 persistent Breeding Reports close control installed.');
console.log('');
console.log('Next run:');
console.log('  npm.cmd run verify:breeding-report-close');
console.log('  npm.cmd run verify:breeding-report-exports');
console.log('  npm.cmd run build');
console.log('');
