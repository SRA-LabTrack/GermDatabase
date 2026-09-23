import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const payloadRoot = path.join(root, 'v21353-breeding-export-payload');
const allowedBases = new Set(['2.13.52', '2.13.53']);
const targetVersion = '2.13.53';

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
  throw new Error(`This patch expects CaneSprout 2.13.52. Current package version is ${current || 'unknown'}. Apply the multi-year Breeding Report patch first.`);
}

copyPayload('src/lib/breedingReportExports.js');
copyPayload('src/components/BreedingReportsPanel.jsx');
copyPayload('scripts/verify-breeding-report-exports-v2.13.53.mjs');

let styles = read('src/styles.css');
const marker = '/* v2.13.53 Breeding Reports responsive layout + native exports */';
if (!styles.includes(marker)) {
  const extra = fs.readFileSync(path.join(payloadRoot, 'styles-v2.13.53.css'), 'utf8');
  styles = `${styles.trimEnd()}\n\n${extra.trim()}\n`;
  write('src/styles.css', styles);
}

pkg.version = targetVersion;
pkg.scripts = pkg.scripts || {};
pkg.scripts['verify:breeding-report-exports'] = 'node scripts/verify-breeding-report-exports-v2.13.53.mjs';

pkg.dependencies = pkg.dependencies || {};
if (!pkg.dependencies.jspdf) pkg.dependencies.jspdf = '^2.5.2';
if (!pkg.dependencies.docx) pkg.dependencies.docx = '^9.7.1';
if (!pkg.dependencies.xlsx) pkg.dependencies.xlsx = '^0.18.5';

write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

if (fs.existsSync(path.join(root, 'public/version.json'))) {
  const version = JSON.parse(read('public/version.json'));
  version.version = targetVersion;
  version.channel = version.channel || 'stable';
  version.notes = 'Fixes Breeding Reports responsive layout and adds sharp native PDF, editable Word, and Excel exports.';
  version.updated = '2026-09-20';
  write('public/version.json', `${JSON.stringify(version, null, 2)}\n`);
}

if (fs.existsSync(path.join(root, 'public/sw.js'))) {
  let sw = read('public/sw.js');
  sw = sw.replace(/2\.13\.52/g, '2.13.53');
  sw = sw.replace(/canesprout-(?:static|shell|cache)-v[\w.-]+/g, (match) => {
    const prefix = match.replace(/v[\w.-]+$/, '');
    return `${prefix}v2.13.53`;
  });
  write('public/sw.js', sw);
}

console.log('');
console.log('CaneSprout v2.13.53 Breeding Report layout + native exports installed.');
console.log('');
console.log('Next run:');
console.log('  npm.cmd install');
console.log('  npm.cmd run verify:breeding-report-exports');
console.log('  npm.cmd run verify:breeding-report-ranges');
console.log('  npm.cmd run verify:breeding-reports');
console.log('  npm.cmd run build');
console.log('');
