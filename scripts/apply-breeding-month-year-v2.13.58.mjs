import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const payloadRoot = path.join(root, 'v21358-month-year-payload');
const allowedBases = new Set(['2.13.57', '2.13.58']);
const targetVersion = '2.13.58';

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
  if (!fs.existsSync(source)) {
    throw new Error(`Patch payload is missing ${relative}. Re-extract the ZIP directly into the CaneSprout project root.`);
  }
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

const pkg = JSON.parse(read('package.json'));
const current = String(pkg.version || '');
if (!allowedBases.has(current)) {
  throw new Error(`This patch expects CaneSprout 2.13.57. Current package version is ${current || 'unknown'}. Apply the latest Breeding Reports portal-position patch first.`);
}

copyPayload('src/components/BreedingReportsPanel.jsx');
copyPayload('src/lib/breedingReports.js');
copyPayload('scripts/verify-breeding-month-year-v2.13.58.mjs');

let styles = read('src/styles.css');
const marker = '/* v2.13.58 Explicit monthly month + year controls */';
if (!styles.includes(marker)) {
  const extra = fs.readFileSync(path.join(payloadRoot, 'styles-v2.13.58.css'), 'utf8');
  styles = `${styles.trimEnd()}\n\n${extra.trim()}\n`;
  write('src/styles.css', styles);
}

pkg.version = targetVersion;
pkg.scripts = pkg.scripts || {};
pkg.scripts['verify:breeding-month-year'] = 'node scripts/verify-breeding-month-year-v2.13.58.mjs';
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

if (fs.existsSync(path.join(root, 'public/version.json'))) {
  const version = JSON.parse(read('public/version.json'));
  version.version = targetVersion;
  version.channel = version.channel || 'stable';
  version.notes = 'Monthly Breeding Reports now use separate Month and Year controls for direct month/year selection.';
  version.updated = '2026-09-20';
  write('public/version.json', `${JSON.stringify(version, null, 2)}\n`);
}

if (fs.existsSync(path.join(root, 'public/sw.js'))) {
  let sw = read('public/sw.js');
  sw = sw.replace(/2\.13\.57/g, '2.13.58');
  sw = sw.replace(/canesprout-(?:static|shell|cache)-v[\w.-]+/g, (match) => {
    const prefix = match.replace(/v[\w.-]+$/, '');
    return `${prefix}v2.13.58`;
  });
  write('public/sw.js', sw);
}

console.log('');
console.log('CaneSprout v2.13.58 monthly Month + Year controls installed.');
console.log('Monthly reports now let you choose the month and year independently.');
console.log('');
console.log('Next run:');
console.log('  npm.cmd run verify:breeding-month-year');
console.log('  npm.cmd run verify:breeding-report-portal-position');
console.log('  npm.cmd run build');
console.log('');
