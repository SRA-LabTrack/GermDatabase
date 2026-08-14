import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const json = (rel) => JSON.parse(read(rel));
const exists = (rel) => fs.existsSync(path.join(root, rel));

const checks = [];
const check = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail });

const pkg = json('package.json');
const app = read('src/App.jsx');
const main = read('electron/main.cjs');
const preload = read('electron/preload.cjs');
const vault = read('electron/offline-vault.cjs');
const queue = read('src/lib/offlineQueue.js');
const combination = read('src/lib/combinationApi.js');
const germ = json('seed/characterization.json');
const comboRaw = json('seed/combination_registry.json');
const comboRuntime = json('seed/combination_runtime.json');

check('Version is 2.13.22', pkg.version === '2.13.22' && app.includes("const APP_VERSION = '2.13.22'"));
check('Electron main process exists', exists('electron/main.cjs'));
check('Electron preload bridge exists', exists('electron/preload.cjs'));
check('Desktop offline vault exists', exists('electron/offline-vault.cjs'));
check('OS-protected credential storage wired', vault.includes('safeStorage.encryptString') && vault.includes('safeStorage.decryptString'));
check('Local password verifier uses PBKDF2', vault.includes('crypto.pbkdf2') && vault.includes('timingSafeEqual'));
check('Silent Appwrite reconnect wired', vault.includes('/account/sessions/email') && main.includes('offline-auth:restore-online-session'));
check('Renderer exposes offline auth bridge', preload.includes('offlineAuth') && preload.includes('restoreOnlineSession'));
check('One-login desktop boot wired', app.includes('offlineAuth.status()') && app.includes('unlockDesktopOffline') && app.includes('offlineAuth?.remember') && app.includes('restoreOnlineSession'));
check('Explicit sign out forgets local login', app.includes('offlineAuth?.forget'));
check('Registry offline mutation queue present', queue.includes('queueOfflineRecord') && queue.includes('syncOfflineQueue'));
check('Combination local-first queue present', combination.includes('syncPendingCombinations') && combination.includes('local_manual'));
check('Excel modules present', exists('src/components/ImportModal.jsx') && exists('src/components/ExportExcelModal.jsx') && exists('src/components/SpreadsheetEditorModal.jsx'));
check('950 bundled germplasm records', Array.isArray(germ.records) && germ.records.length === 950, `${germ.records?.length || 0}`);
check('2,293 raw combination audit records preserved', Array.isArray(comboRaw.records) && comboRaw.records.length === 2293, `${comboRaw.records?.length || 0}`);
check('2,285 canonical runtime combinations', Array.isArray(comboRuntime.records) && comboRuntime.records.length === 2285, `${comboRuntime.records?.length || 0}`);
check('Windows installer icon exists', exists('build/icon.ico'));
check('Runtime icon exists', exists('public/icon.png'));
check('Installer keeps local app data on uninstall', pkg.build?.nsis?.deleteAppDataOnUninstall === false);
check('Installer packages local dist and Electron code', Array.isArray(pkg.build?.files) && pkg.build.files.includes('dist/**/*') && pkg.build.files.includes('electron/**/*'));

console.log('\nCaneSprout v2.13.22 Desktop Offline Verification\n');
for (const item of checks) console.log(`${item.ok ? 'PASS' : 'FAIL'}  ${item.name}${item.detail ? ` (${item.detail})` : ''}`);

const failed = checks.filter((item) => !item.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
if (failed.length) process.exit(1);
