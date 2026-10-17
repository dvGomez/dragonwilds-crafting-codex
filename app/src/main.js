// Electron overlay: a frameless always-on-top window over the game, toggled by a global hotkey.
const { app, BrowserWindow, globalShortcut, ipcMain, Tray, Menu, nativeImage, screen, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const server = require('./server');

const CONFIG_FILE = path.join(app.getPath('userData'), 'config.json');
const DEFAULTS = { hotkey: 'F8', port: 7777, bounds: null, pinned: false, opacity: 1 };
let config = { ...DEFAULTS };
try { config = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) }; } catch { /* first run */ }
const LOG_FILE = path.join(app.getPath('userData'), 'codex.log');
const log = (...a) => { try { fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${a.join(' ')}
`); } catch { /* ignore */ } };
process.on('uncaughtException', (e) => log('uncaught', e.stack || e));
const saveConfig = () => { try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2)); } catch { /* ignore */ } };

let win = null;
let tray = null;
const url = () => `http://127.0.0.1:${config.port}/`;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => show());
}

function createWindow() {
  const wa = screen.getPrimaryDisplay().workArea;
  const w = Math.min(1280, Math.round(wa.width * 0.7));
  const h = Math.min(900, Math.round(wa.height * 0.85));
  const b = config.bounds || { width: w, height: h, x: wa.x + Math.round((wa.width - w) / 2), y: wa.y + Math.round((wa.height - h) / 2) };
  win = new BrowserWindow({
    ...b,
    minWidth: 760,
    minHeight: 520,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    title: 'Códex de Criação',
    icon: path.join(__dirname, '..', 'ui', 'assets', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setOpacity(config.opacity);
  win.loadURL(url());
  const remember = () => { if (win && !win.isDestroyed()) { config.bounds = win.getBounds(); saveConfig(); } };
  win.on('moved', remember);
  win.on('resized', remember);
  win.on('blur', () => log('blur'));
  win.on('focus', () => log('focus'));
  win.on('close', (e) => { if (!app.isQuitting) { e.preventDefault(); win.hide(); } });
}

function show() {
  if (!win) return;
  log('show');
  if (win.isMinimized()) win.restore();
  win.setAlwaysOnTop(true, 'screen-saver');
  win.show();
  win.moveTop();
  win.focus();
  win.webContents.focus();
  win.webContents.send('codex:show');
}
function hide() { if (win) { log('hide'); win.hide(); } }
// F8 = open/close. The game grabs focus back at times (e.g. after dying), so never auto-hide on blur.
function toggle() { if (win && win.isVisible()) hide(); else show(); }

function buildTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'ui', 'assets', 'icon.png'));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 16, height: 16 }));
  tray.setToolTip(`Códex de Criação (${config.hotkey})`);
  const menu = () => Menu.buildFromTemplate([
    { label: `Mostrar / esconder  (${config.hotkey})`, click: toggle },
    { label: 'Abrir no navegador', click: () => shell.openExternal(url()) },
    { label: 'Resetar posição da janela', click: () => { config.bounds = null; saveConfig(); win.destroy(); createWindow(); show(); } },
    { type: 'separator' },
    { label: 'Sair', click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu());
  tray.on('click', toggle);
  return menu;
}

ipcMain.on('codex:hide', hide);
ipcMain.on('codex:quit', () => { app.isQuitting = true; app.quit(); });
ipcMain.handle('codex:getPinned', () => config.pinned);
ipcMain.on('codex:setPinned', (_, v) => { config.pinned = !!v; saveConfig(); });
ipcMain.handle('codex:hotkey', () => config.hotkey);

app.whenReady().then(async () => {
  try {
    await server.start(config.port);
  } catch (e) {
    // Port in use: probably a standalone server already running; just use it.
    log('server:', e.message);
  }
  createWindow();
  buildTray();
  const ok = globalShortcut.register(config.hotkey, () => { log('hotkey pressed'); toggle(); });
  log(`started; hotkey ${config.hotkey} registered=${ok}`);
  if (!process.argv.includes('--hidden')) win.once('ready-to-show', show);
});

app.on('will-quit', () => { log('quit'); globalShortcut.unregisterAll(); });
app.on('render-process-gone', (_, __, d) => log('renderer gone', JSON.stringify(d)));
app.on('child-process-gone', (_, d) => log('child gone', JSON.stringify(d)));
app.on('window-all-closed', (e) => e.preventDefault());
