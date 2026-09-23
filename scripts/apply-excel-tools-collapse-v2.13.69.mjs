import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const payloadRoot = path.join(root, 'v21369-excel-collapse-payload');
const TARGET_VERSION = '2.13.69';
const ALLOWED_BASES = new Set(['2.13.68', TARGET_VERSION]);

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
  throw new Error(`This patch expects CaneSprout 2.13.68. Current package version is ${current || 'unknown'}. Apply the isolated four-cell toolbar patch first.`);
}

let app = read('src/App.jsx');

if (!app.includes('className="excel-tools-collapse-button"')) {
  const oldBlock = `          <div className="excel-tools-expansion-label">
            <FileSpreadsheet size={20} />
            <span><strong>Excel Tools</strong><small>Work with one variety or the complete registry</small></span>
          </div>`;

  const newBlock = `          <div className="excel-tools-expansion-label">
            <FileSpreadsheet size={20} />
            <span><strong>Excel Tools</strong><small>Work with one variety or the complete registry</small></span>
            <button
              type="button"
              className="excel-tools-collapse-button"
              onClick={() => setShowExcelMenu(false)}
              aria-label="Collapse Excel Tools"
              aria-controls="excel-tools-expansion"
              title="Collapse Excel Tools"
            >
              <ChevronDown className="excel-tools-collapse-chevron" size={17} />
              <span>Collapse</span>
            </button>
          </div>`;

  if (!app.includes(oldBlock)) {
    throw new Error('Could not locate the Excel Tools expansion label block in src/App.jsx.');
  }

  app = app.replace(oldBlock, newBlock);
}

app = app.replace(/const APP_VERSION = ['"][^'"]+['"];/, `const APP_VERSION = '${TARGET_VERSION}';`);
write('src/App.jsx', app);

let styles = read('src/styles.css');
const marker = 'v2.13.69 EXCEL TOOLS COLLAPSE CONTROL';
if (!styles.includes(marker)) {
  const extra = fs.readFileSync(path.join(payloadRoot, 'styles-v2.13.69.css'), 'utf8');
  styles = `${styles.trimEnd()}\n\n${extra.trim()}\n`;
  write('src/styles.css', styles);
}

pkg.version = TARGET_VERSION;
pkg.scripts ||= {};
pkg.scripts['verify:excel-tools-collapse'] = 'node scripts/verify-excel-tools-collapse-v2.13.69.mjs';
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

if (exists('package-lock.json')) {
  const lock = JSON.parse(read('package-lock.json'));
  lock.version = TARGET_VERSION;
  if (lock.packages?.['']) lock.packages[''].version = TARGET_VERSION;
  write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
}

write(
  'scripts/verify-excel-tools-collapse-v2.13.69.mjs',
  fs.readFileSync(path.join(payloadRoot, 'scripts/verify-excel-tools-collapse-v2.13.69.mjs'), 'utf8')
);

if (exists('public/version.json')) {
  const info = JSON.parse(read('public/version.json'));
  info.version = TARGET_VERSION;
  info.notes = 'Adds an explicit Collapse control to the expanded Excel Tools strip so users can close it without opening another feature.';
  info.updated = '2026-09-20';
  write('public/version.json', `${JSON.stringify(info, null, 2)}\n`);
}

if (exists('public/sw.js')) {
  let sw = read('public/sw.js');
  sw = sw.replace(/2\.13\.68/g, TARGET_VERSION);
  write('public/sw.js', sw);
}

console.log('');
console.log('CaneSprout v2.13.69 Excel Tools collapse control installed.');
console.log('The expanded Excel Tools strip now includes a visible Collapse button.');
console.log('');
console.log('Next run:');
console.log('  npm.cmd run verify:excel-tools-collapse');
console.log('  npm.cmd run verify:toolbar-isolated-nav');
console.log('  npm.cmd run verify:toolbar-tools-portal');
console.log('  npm.cmd run build');
console.log('');
