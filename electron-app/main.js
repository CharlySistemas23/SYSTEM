/**
 * Opal & Co - Electron Main Process
 *
 * Flujo:
 *  1. Levanta un servidor HTTP local sirviendo los archivos del frontend (carpeta ../Sistema)
 *  2. Abre una ventana nativa de Electron apuntando a http://127.0.0.1:PORT
 *  3. El frontend habla con el backend en Railway (https://backend-production-6260.up.railway.app)
 *  4. Al cerrar la ventana, apaga el servidor y termina el proceso
 */

const { app, BrowserWindow, shell, dialog, session, ipcMain } = require('electron');
const path  = require('path');
const http  = require('http');
const https = require('https');
const fs    = require('fs');
const urlMod = require('url');
const { autoUpdater } = require('electron-updater');

const RAILWAY_URL = 'https://backend-production-6260.up.railway.app';

// ─── Rutas ────────────────────────────────────────────────────────────────────
// En producción (app empaquetada) el frontend queda en resources/frontend/
// En desarrollo queda en ../Sistema relativo a este archivo
const FRONTEND_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'frontend')
  : path.join(__dirname, '..', 'Sistema');

const PORT = 19200; // puerto poco común para evitar conflictos

// ─── MIME types ───────────────────────────────────────────────────────────────
const MIME = {
  '.html' : 'text/html; charset=utf-8',
  '.js'   : 'application/javascript; charset=utf-8',
  '.css'  : 'text/css; charset=utf-8',
  '.json' : 'application/json',
  '.png'  : 'image/png',
  '.jpg'  : 'image/jpeg',
  '.jpeg' : 'image/jpeg',
  '.svg'  : 'image/svg+xml',
  '.ico'  : 'image/x-icon',
  '.woff' : 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf'  : 'font/ttf',
  '.map'  : 'application/json',
};

// ─── Servidor estático local ───────────────────────────────────────────────────
let server;

function proxyToRailway(req, res, pathname) {
  const targetPath = pathname.replace(/^\/proxy/, '') || '/';
  const targetUrl = new URL(RAILWAY_URL);

  const headers = { ...req.headers };
  delete headers.host;
  delete headers.origin;
  delete headers.Origin;
  delete headers.referer;
  delete headers.Referer;

  const options = {
    protocol: targetUrl.protocol,
    hostname: targetUrl.hostname,
    port: targetUrl.port || 443,
    method: req.method,
    path: targetPath + (urlMod.parse(req.url).search || ''),
    headers,
  };

  const proxyReq = https.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', () => {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'No se pudo conectar con Railway' }));
  });

  req.pipe(proxyReq);
}

function startServer() {
  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      // Solo escuchar en loopback — nunca exponer al exterior
      const parsed = urlMod.parse(req.url);
      let filePath = parsed.pathname;

      // Proxy local para evitar CORS en Electron
      if (filePath.startsWith('/proxy/')) {
        proxyToRailway(req, res, filePath);
        return;
      }

      if (filePath === '/' || filePath === '') filePath = '/index.html';

      // Sanitizar path para evitar path traversal
      const safePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, '');
      const fullPath = path.join(FRONTEND_PATH, safePath);

      // Verificar que el archivo queda dentro del FRONTEND_PATH
      if (!fullPath.startsWith(FRONTEND_PATH)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      fs.readFile(fullPath, (err, data) => {
        if (err) {
          // Para SPAs que manejan rutas internamente, servir index.html
          const indexPath = path.join(FRONTEND_PATH, 'index.html');
          fs.readFile(indexPath, (err2, indexData) => {
            if (err2) { res.writeHead(404); res.end('Not found'); return; }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(indexData);
          });
          return;
        }
        const ext      = path.extname(fullPath).toLowerCase();
        const mimeType = MIME[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': mimeType });
        res.end(data);
      });
    });

    server.listen(PORT, '127.0.0.1', resolve);
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`El puerto ${PORT} está ocupado. Cierra la otra instancia de Opal & Co.`));
      } else {
        reject(err);
      }
    });
  });
}

// ─── Ventana principal ────────────────────────────────────────────────────────
let mainWindow;

function createWindow() {
  const iconPath = path.join(__dirname, 'assets', 'icon.ico');
  const iconOpts = fs.existsSync(iconPath) ? { icon: iconPath } : {};

  mainWindow = new BrowserWindow({
    width : 1400,
    height: 900,
    minWidth : 1024,
    minHeight: 700,
    ...iconOpts,
    title: 'Opal & Co',
    show : false,           // mostrar solo cuando esté listo
    webPreferences: {
      contextIsolation : true,
      nodeIntegration  : false,
      webSecurity      : true,
      spellcheck       : false,  // evita lag de teclado
    },
  });

  // Ocultar menú por defecto (la app no lo necesita)
  mainWindow.setMenuBarVisibility(false);

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Eliminar backdrop-filter en escritorio — causa input lag severo en Electron/Windows
  // porque el blur full-screen obliga a re-compositar en cada keystroke.
  // El fondo ya es opaco/oscuro, visualmente no hay diferencia.
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.insertCSS(
      '* { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }'
    );
  });

  mainWindow.loadURL(`http://127.0.0.1:${PORT}`);

  // Las URLs externas (Railway, etc.) se abren en el navegador del sistema
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(`http://127.0.0.1:${PORT}`)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
}

// ─── Auto-actualización ───────────────────────────────────────────────────────
function setupAutoUpdater() {
  // No verificar en desarrollo (solo en la app empaquetada)
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;          // descargar en segundo plano
  autoUpdater.autoInstallOnAppQuit = true;  // instalar al cerrar la app

  // Cuando hay una actualización disponible, notificar al usuario
  autoUpdater.on('update-available', (info) => {
    if (mainWindow) {
      mainWindow.webContents.executeJavaScript(`
        if (typeof Utils !== 'undefined') {
          Utils.showNotification('🔄 Actualización disponible (v${info.version}). Descargando en segundo plano...', 'info', 6000);
        }
      `).catch(() => {});
    }
  });

  // Cuando se descargó la actualización, ofrecer instalar
  autoUpdater.on('update-downloaded', (info) => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Actualización lista',
      message: `La versión ${info.version} está lista para instalar.`,
      detail: 'La app se reiniciará para aplicar la actualización.',
      buttons: ['Reiniciar ahora', 'Más tarde'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('Error en auto-updater:', err.message);
  });

  // Revisar una vez al abrir la app (con 10s de delay para que cargue primero)
  setTimeout(() => { autoUpdater.checkForUpdates().catch(() => {}); }, 10000);

  // Revisar cada 6 horas mientras la app esté abierta
  setInterval(() => { autoUpdater.checkForUpdates().catch(() => {}); }, 6 * 60 * 60 * 1000);
}

// ─── Ciclo de vida ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  try {
    // Habilitar Web Serial API para impresora térmica (ESC/POS)
    session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
      if (permission === 'serial') return true;
      return null;
    });
    session.defaultSession.setDevicePermissionHandler((details) => {
      if (details.deviceType === 'serial') return true;
      return false;
    });

    await startServer();
    createWindow();
    setupAutoUpdater();
  } catch (err) {
    dialog.showErrorBox('Error al iniciar Opal & Co', err.message);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (server) server.close();
  app.quit();
});

// macOS: recrear ventana si se hace clic en el ícono del dock
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
