import fs from 'node:fs';

function read(path) {
  if (!fs.existsSync(path)) {
    console.error(`FAIL  Missing ${path}`);
    process.exit(1);
  }
  return fs.readFileSync(path, 'utf8');
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
const lock = JSON.parse(read('package-lock.json'));
const version = JSON.parse(read('public/version.json'));
const sw = read('public/sw.js');
const app = read('src/App.jsx');
const storage = read('src/lib/storageImage.js');
const image = read('src/components/StorageImage.jsx');
const brochure = read('src/components/VarietyBrochureModal.jsx');
const detail = read('src/components/DetailModal.jsx');
const form = read('src/components/RecordFormModal.jsx');
const printable = read('src/lib/varietyBrochure.js');

console.log('\nCaneSprout v2.13.91 Germplasm / Registry Image Verification\n');

check(pkg.version === '2.13.91', 'package.json version is 2.13.91');
check(lock.version === '2.13.91', 'package-lock version is 2.13.91');
check(lock.packages?.['']?.version === '2.13.91', 'package-lock root package is 2.13.91');
check(version.version === '2.13.91', 'public/version.json is 2.13.91');
check(sw.includes("canesprout-offline-v2.13.91"), 'PWA shell cache is versioned to 2.13.91');
check(pkg.scripts?.['verify:germplasm-images'], 'image verifier command is registered');

check(storage.includes('account.createJWT()'), 'private-file JWT recovery is installed');
check(storage.includes("'X-Appwrite-JWT': jwt"), 'authenticated Storage request sends Appwrite JWT');
check(storage.includes('authenticatedStorageObjectUrl'), 'authenticated blob URL recovery is available');
check(storage.includes('authenticatedStorageDataUrl'), 'printable brochure data URL recovery is available');
check(image.includes('fallbackFileId'), 'StorageImage supports thumbnail/full-image fallback');
check(image.includes('authenticatedStorageObjectUrl'), 'StorageImage retries failed direct URLs securely');

check(app.includes("import StorageImage from './components/StorageImage.jsx';"), 'Registry cards use StorageImage');
check(app.includes('imageFallbackId'), 'Registry cards recover from thumbnail to full photo');
check(app.includes('<StorageImage fileId={imageFileId || imageFallbackId}'), 'Germplasm collection image renderer is fixed');
check(app.includes("const APP_VERSION = '2.13.91';"), 'visible app version is current');

check(brochure.includes("import StorageImage from './StorageImage.jsx';"), 'Variety Brochure uses StorageImage');
check(brochure.includes('fallbackFileId={fileId}'), 'Brochure uses thumbnail/full fallback');
check(brochure.includes('selectedPhoto.fileId'), 'Brochure lightbox uses resilient file IDs');

check(detail.includes("import StorageImage from './StorageImage.jsx';"), 'Full Germplasm detail uses StorageImage');
check(detail.includes('fallbackFileId={id}'), 'Detail thumbnails fall back to full files');
check(detail.includes('photos[photoViewIndex]'), 'Detail lightbox keeps full-resolution photo');

check(form.includes("import StorageImage from './StorageImage.jsx';"), 'Registry edit previews use StorageImage');
check(form.includes('fallbackFileId={id}'), 'Registry edit previews recover from thumbnail failures');

check(printable.includes('authenticatedStorageDataUrl'), 'Printable brochure resolves private images');
check(printable.includes('const resolvedHtml = printablePhotoOverrides(record)'), 'Printable preview waits for resolved images');

if (!process.exitCode) {
  console.log('\n26/26 checks passed.\n');
}
