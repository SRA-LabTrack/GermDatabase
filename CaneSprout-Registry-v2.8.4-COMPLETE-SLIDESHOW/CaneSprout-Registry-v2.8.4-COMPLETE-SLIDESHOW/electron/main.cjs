const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { autoUpdater } = require('electron-updater');

let win;
let localServer;
let localServerUrl;

function resolveWindowIcon() {
  return app.isPackaged
    ? path.join(__dirname, '..', 'dist', 'icon.png')
    : path.join(__dirname, '..', 'public', 'icon.png');
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
        // Vite is a single-page app. Unknown routes should return index.html.
        filePath = path.join(distRoot, 'index.html');
      }

      const ext = path.extname(filePath).toLowerCase();
      res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
      res.setHeader('Cache-Control', ext === '.html' ? 'no-store' : 'public, max-age=31536000, immutable');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      fs.createReadStream(filePath)
        .on('error', () => res.writeHead(500).end('Could not read application file'))
        .pipe(res);
    } catch (error) {
      res.writeHead(500).end('Local application server error');
    }
  });

  return new Promise((resolve, reject) => {
    localServer.once('error', reject);
    // IMPORTANT: use localhost instead of file:// so Appwrite Web CORS/auth
    // sees the same supported hostname used during development.
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

async function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 860,
    minHeight: 620,
    backgroundColor: '#f4f7f0',
    frame: true,
    autoHideMenuBar: true,
    icon: resolveWindowIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  });

  const devUrl = process.env.GERM_DEV_URL;
  if (devUrl) {
    await win.loadURL(devUrl);
  } else {
    const appUrl = await startLocalAppServer();
    await win.loadURL(appUrl);
  }

  win.on('closed', () => { win = null; });

  if (app.isPackaged) {
    setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 2500);
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
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => {
  if (localServer) {
    try { localServer.close(); } catch {}
  }
});

ipcMain.handle('window:minimize', () => win?.minimize());
ipcMain.handle('window:toggle-fullscreen', () => {
  if (!win) return false;
  win.setFullScreen(!win.isFullScreen());
  return win.isFullScreen();
});
ipcMain.handle('window:is-fullscreen', () => Boolean(win?.isFullScreen()));
ipcMain.handle('window:close', () => win?.close());
ipcMain.handle('updates:check', async () => {
  if (!app.isPackaged) return { dev: true };
  return autoUpdater.checkForUpdates();
});
ipcMain.handle('updates:install', () => autoUpdater.quitAndInstall());
ipcMain.handle('app:version', () => app.getVersion());
