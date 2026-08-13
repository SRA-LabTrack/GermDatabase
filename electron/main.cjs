const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { autoUpdater } = require('electron-updater');
const offlineVault = require('./offline-vault.cjs');

let win;
let localServer;
let localServerUrl;

function resolveWindowIcon() {
  const candidates = app.isPackaged
    ? [path.join(__dirname, '..', 'dist', 'icon.png'), path.join(__dirname, '..', 'build', 'icon.png')]
    : [path.join(__dirname, '..', 'public', 'icon.png'), path.join(__dirname, '..', 'build', 'icon.png')];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function startLocalAppServer() {
  if (localServerUrl) return Promise.resolve(localServerUrl);

  const distRoot = path.resolve(__dirname, '..', 'dist');
  localServer = http.createServer((req, res) => {
    try {
      const requestUrl = new URL(req.url || '/', 'http://localhost');
      let relativePath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, '');
      if (!relativePath) relativePath = 'index.html';

      let filePath = path.resolve(distRoot, relativePath);
      if (!filePath.startsWith(distRoot + path.sep) && filePath !== distRoot) {
        res.writeHead(403).end('Forbidden');
        return;
      }

      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(distRoot, 'index.html');
      }

      const ext = path.extname(filePath).toLowerCase();
      res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
      res.setHeader('Cache-Control', ext === '.html' ? 'no-store' : 'public, max-age=31536000, immutable');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      fs.createReadStream(filePath)
        .on('error', () => res.writeHead(500).end('Could not read application file'))
        .pipe(res);
    } catch {
      res.writeHead(500).end('Local application server error');
    }
  });

  return new Promise((resolve, reject) => {
    localServer.once('error', reject);
    // Localhost gives the Appwrite web SDK a normal secure browser origin while
    // every CaneSprout JS/CSS/JSON asset still comes from the installed PC.
    localServer.listen(0, 'localhost', () => {
      const address = localServer.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      localServerUrl = `http://localhost:${port}`;
      resolve(localServerUrl);
    });
  });
}

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

function sendUpdateStatus(status, detail = '') {
  if (win && !win.isDestroyed()) win.webContents.send('updates:status', { status, detail });
}

autoUpdater.on('checking-for-update', () => sendUpdateStatus('checking'));
autoUpdater.on('update-available', (info) => sendUpdateStatus('available', info.version));
autoUpdater.on('update-not-available', () => sendUpdateStatus('current'));
autoUpdater.on('download-progress', (progress) => sendUpdateStatus('downloading', `${Math.round(progress.percent)}%`));
autoUpdater.on('update-downloaded', (info) => sendUpdateStatus('downloaded', info.version));
autoUpdater.on('error', (error) => sendUpdateStatus('error', error.message));

function allowedRendererOrigin() {
  const devUrl = process.env.GERM_DEV_URL;
  try {
    if (devUrl) return new URL(devUrl).origin;
    if (localServerUrl) return new URL(localServerUrl).origin;
  } catch {}
  return '';
}

function assertTrustedIpc(event) {
  const senderUrl = event?.senderFrame?.url || event?.sender?.getURL?.() || '';
  const allowed = allowedRendererOrigin();
  if (!allowed || !senderUrl.startsWith(`${allowed}/`) && senderUrl !== allowed) {
    throw new Error('Blocked an IPC request from an untrusted renderer.');
  }
}

async function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 940,
    minHeight: 660,
    backgroundColor: '#f4f7f0',
    frame: true,
    autoHideMenuBar: true,
    icon: resolveWindowIcon(),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false
    }
  });

  win.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    const allowed = allowedRendererOrigin();
    if (allowed && !String(url || '').startsWith(allowed)) event.preventDefault();
  });

  const devUrl = process.env.GERM_DEV_URL;
  if (devUrl) {
    await win.loadURL(devUrl);
  } else {
    const appUrl = await startLocalAppServer();
    await win.loadURL(appUrl);
  }

  win.once('ready-to-show', () => win?.show());
  win.on('closed', () => { win = null; });

  if (app.isPackaged) {
    setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 4500);
  }
}

app.whenReady().then(() => {
  createWindow().catch((error) => {
    console.error('Could not start CaneSprout Registry window:', error);
    app.quit();
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow().catch(() => {});
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  try { win?.webContents?.session?.flushStorageData?.(); } catch {}
  if (localServer) {
    try { localServer.close(); } catch {}
  }
});

ipcMain.handle('window:minimize', (event) => { assertTrustedIpc(event); return win?.minimize(); });
ipcMain.handle('window:toggle-fullscreen', (event) => {
  assertTrustedIpc(event);
  if (!win) return false;
  win.setFullScreen(!win.isFullScreen());
  return win.isFullScreen();
});
ipcMain.handle('window:is-fullscreen', (event) => { assertTrustedIpc(event); return Boolean(win?.isFullScreen()); });
ipcMain.handle('window:close', (event) => { assertTrustedIpc(event); return win?.close(); });

ipcMain.handle('updates:check', async (event) => {
  assertTrustedIpc(event);
  if (!app.isPackaged) return { dev: true };
  return autoUpdater.checkForUpdates();
});
ipcMain.handle('updates:install', (event) => { assertTrustedIpc(event); return autoUpdater.quitAndInstall(); });
ipcMain.handle('app:version', (event) => { assertTrustedIpc(event); return app.getVersion(); });
ipcMain.handle('app:data-path', (event) => { assertTrustedIpc(event); return app.getPath('userData'); });
ipcMain.handle('app:flush-storage', async (event) => {
  assertTrustedIpc(event);
  try {
    await event.sender.session.flushStorageData();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error?.message || String(error) };
  }
});

ipcMain.handle('offline-auth:status', (event) => {
  assertTrustedIpc(event);
  return offlineVault.status();
});
ipcMain.handle('offline-auth:remember', async (event, payload) => {
  assertTrustedIpc(event);
  return offlineVault.rememberOfflineLogin(payload || {});
});
ipcMain.handle('offline-auth:unlock', async (event, payload) => {
  assertTrustedIpc(event);
  return offlineVault.unlockOffline(payload || {});
});
ipcMain.handle('offline-auth:forget', (event) => {
  assertTrustedIpc(event);
  return offlineVault.forget();
});
ipcMain.handle('offline-auth:restore-online-session', async (event, payload) => {
  assertTrustedIpc(event);
  return offlineVault.restoreAppwriteSession(event.sender.session, payload || {});
});
