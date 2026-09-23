import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const payloadRoot = path.join(root, 'v21352-breeding-range-payload');
const allowedBases = new Set(['2.13.51', '2.13.52']);
const targetVersion = '2.13.52';

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
  throw new Error(`This patch expects CaneSprout 2.13.51. Current package version is ${current || 'unknown'}. Apply the Breeding Reports patch first.`);
}

copyPayload('src/lib/breedingReports.js');
copyPayload('src/components/BreedingReportsPanel.jsx');

let styles = read('src/styles.css');
const marker = '/* v2.13.52 Multi-year Breeding Report Time Ranges */';
if (!styles.includes(marker)) {
  const extra = fs.readFileSync(path.join(payloadRoot, 'styles-v2.13.52.css'), 'utf8');
  styles = `${styles.trimEnd()}\n\n${extra.trim()}\n`;
  write('src/styles.css', styles);
}

copyPayload('scripts/verify-breeding-report-ranges-v2.13.52.mjs');

pkg.version = targetVersion;
pkg.scripts = pkg.scripts || {};
pkg.scripts['verify:breeding-report-ranges'] = 'node scripts/verify-breeding-report-ranges-v2.13.52.mjs';
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

if (fs.existsSync(path.join(root, 'public/version.json'))) {
  const version = JSON.parse(read('public/version.json'));
  version.version = targetVersion;
  version.channel = version.channel || 'stable';
  version.notes = 'Adds multi-year breeding report time ranges with weekly, monthly, quarterly, or annual breakdowns, including zero-activity intervals.';
  version.updated = '2026-09-20';
  write('public/version.json', `${JSON.stringify(version, null, 2)}\n`);
}

if (fs.existsSync(path.join(root, 'public/sw.js'))) {
  let sw = read('public/sw.js');
  sw = sw.replace(/2\.13\.51/g, '2.13.52');
  sw = sw.replace(/canesprout-(?:static|shell|cache)-v[\w.-]+/g, (match) => {
    const prefix = match.replace(/v[\w.-]+$/, '');
    return `${prefix}v2.13.52`;
  });
  write('public/sw.js', sw);
}

console.log('');
console.log('CaneSprout v2.13.52 multi-year Breeding Report ranges installed.');
console.log('Example: Time period range 2026–2027 + Weekly will list every week across the full range.');
console.log('');
console.log('Next run:');
console.log('  npm.cmd run verify:breeding-report-ranges');
console.log('  npm.cmd run verify:breeding-reports');
console.log('  npm.cmd run build');
console.log('');
