import fs from 'node:fs';

const checks = [];
function check(label, pass) { checks.push({ label, pass: Boolean(pass) }); }
function read(path) { return fs.readFileSync(path, 'utf8'); }

const pkg = JSON.parse(read('package.json'));
const app = read('src/App.jsx');
const index = read('index.html');
const sw = read('public/sw.js');
const offline = read('src/lib/offlineApp.js');
const manifest = JSON.parse(read('public/manifest.webmanifest'));
const installLib = read('src/lib/pwaInstall.js');

check('Version is 2.13.50', pkg.version === '2.13.50');
check('PWA verifier npm script exists', pkg.scripts?.['verify:pwa-install'] === 'node scripts/verify-installable-pwa-v2.13.50.mjs');
check('Web manifest is linked from index.html', index.includes('rel="manifest" href="/manifest.webmanifest"'));
check('Apple touch icon is linked', index.includes('rel="apple-touch-icon" href="/pwa-192.png"'));
check('Mobile web app capability metadata exists', index.includes('mobile-web-app-capable'));
check('Manifest launches at the website root', manifest.start_url === '/' && manifest.scope === '/');
check('Manifest uses standalone display', manifest.display === 'standalone');
check('Manifest has 192px icon', manifest.icons?.some((icon) => icon.sizes === '192x192'));
check('Manifest has 512px icon', manifest.icons?.some((icon) => icon.sizes === '512x512'));
check('192px PNG icon exists', fs.existsSync('public/pwa-192.png') && fs.statSync('public/pwa-192.png').size > 1000);
check('512px PNG icon exists', fs.existsSync('public/pwa-512.png') && fs.statSync('public/pwa-512.png').size > 1000);
check('Install hook captures beforeinstallprompt', installLib.includes('beforeinstallprompt'));
check('Install hook calls browser prompt', installLib.includes('installPrompt.prompt()'));
check('Install hook detects standalone mode', installLib.includes("display-mode: standalone"));
check('App imports PWA install hook', app.includes("usePwaInstall } from './lib/pwaInstall.js'"));
check('Desktop More menu has Install CaneSprout', app.includes('data-pwa-install') && app.includes('Install CaneSprout'));
check('Mobile menu has install action', app.includes("Add the website as an app on this device"));
check('App handles installed status', app.includes('CaneSprout is already installed on this device.'));
check('Offline version is 2.13.50', offline.includes("const OFFLINE_VERSION = '2.13.50';"));
check('Service worker cache is v2.13.50', sw.includes("canesprout-offline-v2.13.50"));
check('Service worker caches PWA manifest', sw.includes("'/manifest.webmanifest'"));
check('Service worker caches PWA icons', sw.includes("'/pwa-192.png'") && sw.includes("'/pwa-512.png'"));

console.log('\nCaneSprout v2.13.50 Installable Website / PWA Verification\n');
for (const item of checks) console.log(`${item.pass ? 'PASS' : 'FAIL'}  ${item.label}`);
const passed = checks.filter((item) => item.pass).length;
console.log(`\n${passed}/${checks.length} checks passed.\n`);
if (passed !== checks.length) process.exit(1);
