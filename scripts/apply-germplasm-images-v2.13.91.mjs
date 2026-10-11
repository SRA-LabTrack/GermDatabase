import fs from 'node:fs';

const BASE_VERSION = '2.13.90';
const TARGET_VERSION = '2.13.91';

const paths = {
  app: 'src/App.jsx',
  brochure: 'src/components/VarietyBrochureModal.jsx',
  detail: 'src/components/DetailModal.jsx',
  form: 'src/components/RecordFormModal.jsx',
  printable: 'src/lib/varietyBrochure.js',
  pkg: 'package.json',
  lock: 'package-lock.json',
  version: 'public/version.json',
  sw: 'public/sw.js',
  gitignore: '.gitignore'
};

function fail(message) {
  console.error(`\nERROR: ${message}`);
  process.exit(1);
}

function read(path) {
  if (!fs.existsSync(path)) fail(`Required file not found: ${path}`);
  return fs.readFileSync(path, 'utf8');
}

function write(path, content) {
  fs.writeFileSync(path, content, 'utf8');
}

function backup(path) {
  if (!fs.existsSync(path)) return;
  const out = `${path}.v${BASE_VERSION}-backup`;
  if (!fs.existsSync(out)) fs.copyFileSync(path, out);
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) fail(`Could not locate ${label}. No source files were finalized.`);
  return source.replace(before, after);
}

console.log(`
============================================================
CaneSprout ${BASE_VERSION} -> ${TARGET_VERSION}
Germplasm / Registry Image Access Fix
============================================================
`);

const pkg = JSON.parse(read(paths.pkg));
if (![BASE_VERSION, TARGET_VERSION].includes(pkg.version)) {
  fail(`Expected package version ${BASE_VERSION} or ${TARGET_VERSION}, found ${pkg.version}.`);
}

for (const path of Object.values(paths)) {
  if (path !== paths.gitignore && fs.existsSync(path)) backup(path);
}

let app = read(paths.app);
let brochure = read(paths.brochure);
let detail = read(paths.detail);
let form = read(paths.form);
let printable = read(paths.printable);
let sw = read(paths.sw);

// ---------------------------------------------------------------------------
// Registry / Germplasm collection cards
// ---------------------------------------------------------------------------
app = replaceRequired(
  app,
  "import ProfileCardPrintMenu from './components/ProfileCardPrintMenu.jsx';",
  "import ProfileCardPrintMenu from './components/ProfileCardPrintMenu.jsx';\nimport StorageImage from './components/StorageImage.jsx';",
  'StorageImage import in App.jsx'
);

app = app.replace(/\n\s*fileViewUrl,\n/, '\n');
app = app.replace("const APP_VERSION = '2.13.86';", `const APP_VERSION = '${TARGET_VERSION}';`);
app = app.replace(`  const image = fileViewUrl(record.thumbnail_file_id);\n`, '');

app = replaceRequired(
  app,
  `  const preview = profilePreview || record;
  const missing = profilePreview ? 'Not recorded' : 'Loading…';`,
  `  const preview = profilePreview || record;
  const imageFileId = String(
    preview?.thumbnail_file_id ||
    preview?.thumb_file_ids?.[0] ||
    record?.thumbnail_file_id ||
    ''
  ).trim();
  const imageFallbackId = String(
    preview?.primary_file_id ||
    preview?.photo_file_ids?.[0] ||
    ''
  ).trim();
  const hasImage = Boolean(imageFileId || imageFallbackId);
  const missing = profilePreview ? 'Not recorded' : 'Loading…';`,
  'registry-card image ID recovery'
);

app = app.replace(
  "className={`record-image ${image ? 'has-image' : ''}`}",
  "className={`record-image ${hasImage ? 'has-image' : ''}`}"
);

app = replaceRequired(
  app,
  `{image ? <img src={image} alt={record.variety || 'Sugarcane germplasm'} loading="lazy" decoding="async" fetchPriority="low" /> : <div className="record-placeholder"><SugarcaneIcon size={44} /><span>Germplasm photo optional</span></div>}`,
  `{hasImage ? <StorageImage fileId={imageFileId || imageFallbackId} fallbackFileId={imageFallbackId} alt={record.variety || 'Sugarcane germplasm'} loading="lazy" decoding="async" fetchPriority="low" /> : <div className="record-placeholder"><SugarcaneIcon size={44} /><span>Germplasm photo optional</span></div>}`,
  'registry-card image renderer'
);

// ---------------------------------------------------------------------------
// Variety Brochure modal
// ---------------------------------------------------------------------------
brochure = brochure.replace(
  "import { fileViewUrl, getRecord } from '../lib/registryApi';",
  "import { getRecord } from '../lib/registryApi';"
);
brochure = replaceRequired(
  brochure,
  "import { brochureCharacteristics, openVarietyBrochure } from '../lib/varietyBrochure';",
  "import { brochureCharacteristics, openVarietyBrochure } from '../lib/varietyBrochure';\nimport StorageImage from './StorageImage.jsx';",
  'StorageImage import in VarietyBrochureModal.jsx'
);

const oldPartHead = `function PartPhoto({ record, index, label, className = '', onOpen }) {
  const fileId = index >= 0 ? record?.photo_file_ids?.[index] : '';
  const url = fileId ? fileViewUrl(fileId) : '';

  if (!url) {`;
const newPartHead = `function PartPhoto({ record, index, label, className = '', onOpen }) {
  const fileId = index >= 0 ? String(record?.photo_file_ids?.[index] || '').trim() : '';
  const thumbId = index >= 0 ? String(record?.thumb_file_ids?.[index] || '').trim() : '';
  const displayId = thumbId || fileId;

  if (!displayId) {`;
brochure = replaceRequired(brochure, oldPartHead, newPartHead, 'brochure photo slot resolver');

brochure = brochure.replace(
  "onClick={() => onOpen?.({ url, label })}",
  "onClick={() => onOpen?.({ fileId: fileId || displayId, fallbackFileId: thumbId, label })}"
);

brochure = replaceRequired(
  brochure,
  `<img src={url} alt={\`${"${record?.variety || 'Sugarcane'}"} ${"${label}"}\`} loading="eager" decoding="async" />`,
  `<StorageImage fileId={displayId} fallbackFileId={fileId} alt={\`${"${record?.variety || 'Sugarcane'}"} ${"${label}"}\`} loading="eager" decoding="async" />`,
  'brochure inline image renderer'
);

brochure = replaceRequired(
  brochure,
  `<img src={selectedPhoto.url} alt={\`${"${record?.variety || 'Sugarcane'}"} ${"${selectedPhoto.label}"}\`} />`,
  `<StorageImage fileId={selectedPhoto.fileId} fallbackFileId={selectedPhoto.fallbackFileId} alt={\`${"${record?.variety || 'Sugarcane'}"} ${"${selectedPhoto.label}"}\`} />`,
  'brochure lightbox image renderer'
);

// ---------------------------------------------------------------------------
// Full Germplasm detail / registry profile
// ---------------------------------------------------------------------------
detail = detail.replace(
  "import { deleteRecord, deleteRecordByVariety, fileViewUrl, getRecord } from '../lib/registryApi';",
  "import { deleteRecord, deleteRecordByVariety, getRecord } from '../lib/registryApi';"
);
detail = replaceRequired(
  detail,
  "import { PHOTO_DOCUMENTATION_SECTIONS, normalizedPhotoCategories } from '../lib/photoSections';",
  "import { PHOTO_DOCUMENTATION_SECTIONS, normalizedPhotoCategories } from '../lib/photoSections';\nimport StorageImage from './StorageImage.jsx';",
  'StorageImage import in DetailModal.jsx'
);

detail = replaceRequired(
  detail,
  `<img src={fileViewUrl(record.thumb_file_ids?.[index] || id)} alt={record.photo_names?.[index] || section.label} loading="lazy" decoding="async" fetchPriority="low" />`,
  `<StorageImage fileId={record.thumb_file_ids?.[index] || id} fallbackFileId={id} alt={record.photo_names?.[index] || section.label} loading="lazy" decoding="async" fetchPriority="low" />`,
  'detail thumbnail renderer'
);

detail = replaceRequired(
  detail,
  `<img src={fileViewUrl(photos[photoViewIndex])} alt={record.photo_names?.[photoViewIndex] || 'Full sugarcane field photo'} decoding="async" fetchPriority="high" />`,
  `<StorageImage fileId={photos[photoViewIndex]} fallbackFileId={record.thumb_file_ids?.[photoViewIndex]} alt={record.photo_names?.[photoViewIndex] || 'Full sugarcane field photo'} decoding="async" fetchPriority="high" />`,
  'detail full-image renderer'
);

// ---------------------------------------------------------------------------
// Registry edit form existing image previews
// ---------------------------------------------------------------------------
form = form.replace(
  "import { createManualRecord, deleteStoredFiles, fileViewUrl, saveRecord, upsertRecordByVariety, uploadPreparedPhotos } from '../lib/registryApi';",
  "import { createManualRecord, deleteStoredFiles, saveRecord, upsertRecordByVariety, uploadPreparedPhotos } from '../lib/registryApi';"
);
form = replaceRequired(
  form,
  "import { PHOTO_DOCUMENTATION_SECTIONS, normalizedPhotoCategories, primaryPhotoIndex } from '../lib/photoSections';",
  "import { PHOTO_DOCUMENTATION_SECTIONS, normalizedPhotoCategories, primaryPhotoIndex } from '../lib/photoSections';\nimport StorageImage from './StorageImage.jsx';",
  'StorageImage import in RecordFormModal.jsx'
);

form = replaceRequired(
  form,
  `<img src={fileViewUrl(form.thumb_file_ids?.[index] || id)} alt={section.label} loading="lazy" decoding="async" />`,
  `<StorageImage fileId={form.thumb_file_ids?.[index] || id} fallbackFileId={id} alt={section.label} loading="lazy" decoding="async" />`,
  'edit-form image renderer'
);

// ---------------------------------------------------------------------------
// Printable brochure: resolve private Appwrite images to data URLs before use.
// ---------------------------------------------------------------------------
printable = printable.replace(
  "import { fileViewUrl } from './registryApi';",
  "import { fileViewUrl } from './registryApi';\nimport { authenticatedStorageDataUrl } from './storageImage';"
);

const helperAnchor = `function photoUrlAt(record, index) {
  const id = index >= 0 ? record?.photo_file_ids?.[index] : '';
  return id ? fileViewUrl(id) : '';
}
`;

const helperExpanded = `${helperAnchor}
async function printablePhotoOverrides(record = {}) {
  const slots = brochurePhotoSlots(record);
  const entries = [
    ['overview', slots.overview],
    ['stalk', slots.stalk],
    ['eye', slots.budEye]
  ];

  const output = {};
  await Promise.all(entries.map(async ([key, index]) => {
    const id = index >= 0 ? record?.photo_file_ids?.[index] : '';
    if (!id) return;
    try {
      output[key] = await authenticatedStorageDataUrl(id);
    } catch {
      output[key] = fileViewUrl(id);
    }
  }));

  return output;
}
`;

if (!printable.includes('async function printablePhotoOverrides')) {
  printable = replaceRequired(printable, helperAnchor, helperExpanded, 'printable brochure image resolver');
}

printable = printable.replace(
  "export function printableVarietyBrochureHtml(record = {}) {",
  "export function printableVarietyBrochureHtml(record = {}, photoOverrides = {}) {"
);
printable = printable.replace(
  "  const overviewUrl = photoUrlAt(record, slots.overview);\n  const stalkUrl = photoUrlAt(record, slots.stalk);\n  const eyeUrl = photoUrlAt(record, slots.budEye);",
  "  const overviewUrl = photoOverrides.overview || photoUrlAt(record, slots.overview);\n  const stalkUrl = photoOverrides.stalk || photoUrlAt(record, slots.stalk);\n  const eyeUrl = photoOverrides.eye || photoUrlAt(record, slots.budEye);"
);

const previewInsertAnchor = `  const frame = document.createElement('iframe');
  frame.className = 'cs-brochure-preview-frame';
  frame.title = \`${"${variety}"} variety brochure\`;
`;
const previewInsert = `${previewInsertAnchor}
  const resolvedHtml = printablePhotoOverrides(record)
    .then((photos) => printableVarietyBrochureHtml(record, photos))
    .catch(() => printableVarietyBrochureHtml(record));
`;
if (!printable.includes('const resolvedHtml = printablePhotoOverrides(record)')) {
  printable = replaceRequired(printable, previewInsertAnchor, previewInsert, 'print brochure resolved-image promise');
}

printable = printable.replace(
  `  download.addEventListener('click', () => {
    triggerDownload(
      printableVarietyBrochureHtml(record),
      \`${"${safeFilename(variety)}"}-Variety-Brochure.html\`
    );
  });`,
  `  download.addEventListener('click', async () => {
    triggerDownload(
      await resolvedHtml,
      \`${"${safeFilename(variety)}"}-Variety-Brochure.html\`
    );
  });`
);

printable = printable.replace(
  `  print.addEventListener('click', () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
  });`,
  `  print.addEventListener('click', async () => {
    const html = await resolvedHtml;
    if (frame.srcdoc !== html) {
      await new Promise((resolve) => {
        frame.onload = () => resolve();
        frame.srcdoc = html;
      });
    }
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
  });`
);

printable = printable.replace(
  `  frame.srcdoc = printableVarietyBrochureHtml(record);
  close.focus();`,
  `  frame.srcdoc = printableVarietyBrochureHtml(record);
  resolvedHtml.then((html) => {
    if (!closed && html) frame.srcdoc = html;
  }).catch(() => {});
  close.focus();`
);

// ---------------------------------------------------------------------------
// Version + PWA cache refresh
// ---------------------------------------------------------------------------
pkg.version = TARGET_VERSION;
pkg.scripts = pkg.scripts || {};
pkg.scripts['verify:germplasm-images'] =
  'node scripts/verify-germplasm-images-v2.13.91.mjs';

const lock = JSON.parse(read(paths.lock));
lock.version = TARGET_VERSION;
if (lock.packages?.['']) lock.packages[''].version = TARGET_VERSION;

const versionInfo = JSON.parse(read(paths.version));
versionInfo.version = TARGET_VERSION;
versionInfo.channel = versionInfo.channel || 'stable';
versionInfo.notes =
  'Restores germplasm and registry images across collection cards, variety brochure, full detail/photo documentation, edit previews, and printable brochures. Private Appwrite Storage files fall back to authenticated JWT-backed blob/data URLs when direct image URLs are blocked by browser privacy rules.';
versionInfo.updated = '2026-10-11';
versionInfo.updatedAt = new Date().toISOString();

sw = sw.replace(
  /const CACHE_VERSION = 'canesprout-offline-v[^']+';/,
  `const CACHE_VERSION = 'canesprout-offline-v${TARGET_VERSION}';`
);

write(paths.app, app);
write(paths.brochure, brochure);
write(paths.detail, detail);
write(paths.form, form);
write(paths.printable, printable);
write(paths.pkg, JSON.stringify(pkg, null, 2) + '\n');
write(paths.lock, JSON.stringify(lock, null, 2) + '\n');
write(paths.version, JSON.stringify(versionInfo, null, 2) + '\n');
write(paths.sw, sw);

let gitignore = fs.existsSync(paths.gitignore) ? fs.readFileSync(paths.gitignore, 'utf8') : '';
if (!gitignore.split(/\r?\n/).includes('*.v*-backup')) {
  if (gitignore && !gitignore.endsWith('\n')) gitignore += '\n';
  gitignore += '*.v*-backup\n';
  write(paths.gitignore, gitignore);
}

console.log('Updated image handling in:');
console.log('  - Germplasm / Registry collection cards');
console.log('  - Variety Brochure modal + full-size lightbox');
console.log('  - Full Germplasm detail / Photo documentation');
console.log('  - Registry edit form existing-photo previews');
console.log('  - Printable / downloadable Variety Brochure');
console.log('');
console.log('Private Appwrite images now retry through the logged-in user session JWT.');
console.log('No germplasm records, photos, file IDs, or Appwrite permissions were deleted or rewritten.');
console.log(`Version moved to ${TARGET_VERSION} and the PWA cache version was refreshed.`);
console.log('Added npm verifier: verify:germplasm-images');
console.log('\nPATCH APPLIED SUCCESSFULLY.\n');
