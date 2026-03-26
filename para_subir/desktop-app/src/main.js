const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const log = require('electron-log');
const { autoUpdater } = require('electron-updater');

const HOST = '127.0.0.1';
const PORT = 19200;
const DEFAULT_API_TARGET = 'https://backend-production-6260.up.railway.app';

let mainWindow;
let localServer;

function resolveFrontendDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'frontend');
  }
  return path.resolve(__dirname, '../../Sistema');
}

function getApiTarget() {
  const envTarget = process.env.OPAL_API_TARGET;
  if (envTarget && envTarget.trim()) return envTarget.trim().replace(/\/+$/, '');
  return DEFAULT_API_TARGET;
}

async function startLocalServer() {
  const frontendDir = resolveFrontendDir();
  const apiTarget = getApiTarget();

  const web = express();
  web.disable('x-powered-by');

  web.use('/proxy', createProxyMiddleware({
    target: apiTarget,
    changeOrigin: true,
    secure: true,
    pathRewrite: { '^/proxy': '' },
    onError: (err, req, res) => {
      log.error('Proxy error:', err?.message || err);
      if (!res.headersSent) {
        res.status(502).json({ error: 'Proxy error', detail: String(err?.message || err) });
      }
    }
  }));

  web.use(express.static(frontendDir));
  web.get('*', (req, res) => {
    res.sendFile(path.join(frontendDir, 'index.html'));
  });

  await new Promise((resolve, reject) => {
    const server = web.listen(PORT, HOST, () => {
      localServer = server;
      log.info(`Local frontend server running at http://${HOST}:${PORT}`);
      log.info(`Proxy target: ${apiTarget}`);
      resolve();
    });
    server.on('error', reject);
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 860,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.loadURL(`http://${HOST}:${PORT}`);
}

function configureAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = log;

  autoUpdater.on('checking-for-update', () => log.info('Checking for update...'));
  autoUpdater.on('update-available', info => log.info('Update available:', info?.version));
  autoUpdater.on('update-not-available', () => log.info('No updates available'));
  autoUpdater.on('error', err => log.error('AutoUpdater error:', err));
  autoUpdater.on('download-progress', progress => log.info('Update download progress:', progress?.percent));
  autoUpdater.on('update-downloaded', async info => {
    log.info('Update downloaded:', info?.version);
    const result = await dialog.showMessageBox({
      type: 'info',
      title: 'Actualización lista',
      message: `Se descargó la versión ${info?.version || ''}.`,
      detail: 'La aplicación se reiniciará para completar la actualización.',
      buttons: ['Reiniciar ahora', 'Después'],
      defaultId: 0,
      cancelId: 1
    });

    if (result.response === 0) {
      setImmediate(() => autoUpdater.quitAndInstall());
    }
  });

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(err => log.error('checkForUpdates failed:', err));
  }, 5000);

  setInterval(() => {
    autoUpdater.checkForUpdates().catch(err => log.error('Periodic check failed:', err));
  }, 1000 * 60 * 30);
}

app.whenReady().then(async () => {
  try {
    await startLocalServer();
    createMainWindow();
    configureAutoUpdater();
  } catch (error) {
    log.error('Startup error:', error);
    dialog.showErrorBox('Error al iniciar', String(error?.message || error));
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (localServer) {
    try {
      localServer.close();
    } catch (_) {}
  }
});
