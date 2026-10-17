// Usage: SHOT_URL=<url> electron tools/dev/screenshot.js <out.png> [width] [height]
// Renders the running Códex UI at full resolution (used for docs/screenshot.png).
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const args = process.argv.slice(1);
const url = process.env.SHOT_URL; // (a URL on the command line makes Electron open it instead of running this script)
const out = args.find(a => /\.png$/i.test(a));
const [w = 1400, h = 860] = args.filter(a => /^\d+$/.test(a)).map(Number);
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: w, height: h, show: false, webPreferences: { offscreen: true } });
  await win.loadURL(url);
  await new Promise(r => setTimeout(r, 3000));
  fs.writeFileSync(out, (await win.webContents.capturePage()).toPNG());
  app.quit();
});
