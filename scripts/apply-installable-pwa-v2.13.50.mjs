import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TARGET = '2.13.50';
const ACCEPTED_BASES = new Set(['2.13.47', '2.13.48', '2.13.49', '2.13.50']);

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function write(rel, value) { fs.writeFileSync(path.join(ROOT, rel), value, 'utf8'); }
function ensureDir(rel) { fs.mkdirSync(path.join(ROOT, rel), { recursive: true }); }
function copy(rel) {
  const src = path.join(ROOT, 'patch-source', rel);
  const dst = path.join(ROOT, rel);
  ensureDir(path.dirname(rel));
  fs.copyFileSync(src, dst);
}
function replaceOnce(text, from, to, label) {
  if (text.includes(to)) return text;
  if (!text.includes(from)) throw new Error(`Could not patch ${label}. Expected source marker was not found.`);
  return text.replace(from, to);
}

function patchPackage() {
  const packagePath = path.join(ROOT, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  if (!ACCEPTED_BASES.has(pkg.version)) throw new Error(`This patch expects CaneSprout 2.13.47-2.13.50. Current version is ${pkg.version || 'unknown'}.`);
  pkg.version = TARGET;
  pkg.scripts = pkg.scripts || {};
  pkg.scripts['verify:pwa-install'] = 'node scripts/verify-installable-pwa-v2.13.50.mjs';
  fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');

  const lockPath = path.join(ROOT, 'package-lock.json');
  if (fs.existsSync(lockPath)) {
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    lock.version = TARGET;
    if (lock.packages?.['']) lock.packages[''].version = TARGET;
    fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
  }
}

function patchIndex() {
  let html = read('index.html');
  html = replaceOnce(
    html,
    '    <link rel="icon" type="image/svg+xml" href="/icon.svg" />',
    '    <link rel="icon" type="image/svg+xml" href="/icon.svg" />\n    <link rel="manifest" href="/manifest.webmanifest" />\n    <link rel="apple-touch-icon" href="/pwa-192.png" />\n    <meta name="application-name" content="CaneSprout Registry" />\n    <meta name="mobile-web-app-capable" content="yes" />\n    <meta name="apple-mobile-web-app-capable" content="yes" />\n    <meta name="apple-mobile-web-app-title" content="CaneSprout" />\n    <meta name="apple-mobile-web-app-status-bar-style" content="default" />',
    'index.html PWA metadata'
  );
  write('index.html', html);
}

function patchApp() {
  let app = read('src/App.jsx');
  app = replaceOnce(
    app,
    "import { printVarietyProfile } from './lib/profilePrint.js';",
    "import { printVarietyProfile } from './lib/profilePrint.js';\nimport { usePwaInstall } from './lib/pwaInstall.js';",
    'App PWA hook import'
  );
  app = app.replace(/const APP_VERSION = '[^']+';/, `const APP_VERSION = '${TARGET}';`);
  app = replaceOnce(
    app,
    '  const desktopMode = Boolean(window.germDesktop?.isDesktop);',
    '  const desktopMode = Boolean(window.germDesktop?.isDesktop);\n  const { canInstall, installed: pwaInstalled, installApp } = usePwaInstall();',
    'App PWA hook state'
  );
  app = replaceOnce(
    app,
    '\n\n  async function handleUpdates() {',
    `\n\n  async function handleInstallCaneSprout() {\n    const result = await installApp();\n    if (result.status === 'accepted') {\n      showCompletionNotice('CaneSprout installation started. After installation, open it from your desktop, Start menu, or taskbar.', 8000);\n      return;\n    }\n    if (result.status === 'installed') {\n      showCompletionNotice('CaneSprout is already installed on this device.', 6000);\n      return;\n    }\n    if (result.status === 'dismissed') {\n      showCompletionNotice('Installation was cancelled. You can install CaneSprout later from the More actions menu.', 6000);\n      return;\n    }\n    if (result.status === 'unavailable') {\n      showCompletionNotice('The browser install prompt is not available yet. In Brave or Chrome, open the browser menu and choose Install CaneSprout / Install app.', 9000);\n      return;\n    }\n    showCompletionNotice('CaneSprout could not start the browser installation prompt. Try the browser menu and choose Install app.', 8000);\n  }\n\n  async function handleUpdates() {`,
    'App install handler'
  );

  const mobileMarker = `              <button type="button" onClick={() => { setMobileToolbarOpen(false); handleUpdates(); }}>\n                <RefreshCw size={20} />`;
  const mobileReplacement = `              {!desktopMode && (\n                <button type="button" data-pwa-install onClick={() => { setMobileToolbarOpen(false); handleInstallCaneSprout(); }} disabled={pwaInstalled}>\n                  <Download size={20} />\n                  <span><strong>{pwaInstalled ? 'CaneSprout installed' : 'Install CaneSprout'}</strong><small>{pwaInstalled ? 'Launch it from your desktop or Start menu' : canInstall ? 'Add the website as an app on this device' : 'Install the website for one-click launching'}</small></span>\n                </button>\n              )}\n              <button type="button" onClick={() => { setMobileToolbarOpen(false); handleUpdates(); }}>\n                <RefreshCw size={20} />`;
  app = replaceOnce(app, mobileMarker, mobileReplacement, 'mobile install action');

  const moreMarker = `              <button onClick={createBackup} disabled={Boolean(backupState)}><Download size={17} /><span>{backupState || 'Backup'}</span></button>\n              <button onClick={handleUpdates}>`;
  const moreReplacement = `              <button onClick={createBackup} disabled={Boolean(backupState)}><Download size={17} /><span>{backupState || 'Backup'}</span></button>\n              {!desktopMode && <button data-pwa-install onClick={handleInstallCaneSprout} disabled={pwaInstalled}><Download size={17} /><span>{pwaInstalled ? 'CaneSprout installed' : 'Install CaneSprout'}</span></button>}\n              <button onClick={handleUpdates}>`;
  app = replaceOnce(app, moreMarker, moreReplacement, 'desktop install action');
  write('src/App.jsx', app);
}

function patchOffline() {
  let offline = read('src/lib/offlineApp.js');
  offline = offline.replace(/const OFFLINE_VERSION = '[^']+';/, `const OFFLINE_VERSION = '${TARGET}';`);
  write('src/lib/offlineApp.js', offline);

  let sw = read('public/sw.js');
  sw = sw.replace(/const CACHE_VERSION = 'canesprout-offline-v[^']+';/, `const CACHE_VERSION = 'canesprout-offline-v${TARGET}';`);
  sw = sw.replace(
    /const SMALL_SHELL_URLS = \[[^\]]*\];/,
    "const SMALL_SHELL_URLS = ['/version.json', '/icon.svg', '/manifest.webmanifest', '/pwa-192.png', '/pwa-512.png'];"
  );
  write('public/sw.js', sw);
}

function patchVersionFile() {
  const versionPath = path.join(ROOT, 'public/version.json');
  const version = fs.existsSync(versionPath) ? JSON.parse(fs.readFileSync(versionPath, 'utf8')) : {};
  Object.assign(version, {
    version: TARGET,
    channel: 'stable',
    notes: 'Makes the CaneSprout website installable as a PWA with desktop/Start-menu launching, standalone app display, cached install assets, and browser Install CaneSprout actions.',
    updated: '2026-09-20'
  });
  fs.writeFileSync(versionPath, JSON.stringify(version, null, 2) + '\n');
}

patchPackage();
copy('src/lib/pwaInstall.js');
copy('public/manifest.webmanifest');
copy('public/pwa-192.png');
copy('public/pwa-512.png');
patchIndex();
patchApp();
patchOffline();
patchVersionFile();

console.log(`CaneSprout ${TARGET} installable PWA patch applied successfully.`);
console.log('Run: npm.cmd run verify:pwa-install');
console.log('Then: npm.cmd run build');
