import fs from 'node:fs';
import path from 'node:path';

function read(pathname) {
  return fs.readFileSync(pathname, 'utf8');
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(jsx|tsx|js|ts|css|html)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

function check(condition, label) {
  if (!condition) {
    console.error(`FAIL  ${label}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS  ${label}`);
  }
}

const pkg = JSON.parse(read('package.json'));
const sourceFiles = walk('src');
const contents = sourceFiles.map((file) => read(file)).join('\n');

console.log('\nCaneSprout v2.13.76 Germplasm Pedigree Title Verification\n');

check(pkg.version === '2.13.76', 'Version is 2.13.76');
check(pkg.scripts?.['verify:germplasm-pedigree-title'], 'Pedigree title verifier npm script exists');
check(contents.includes('Germplasm Pedigree'), 'New Germplasm Pedigree title exists');
check(!contents.includes('Three-Generation Pedigree'), 'Old Three-Generation Pedigree title is removed');

if (!process.exitCode) console.log('\n4/4 checks passed.\n');
