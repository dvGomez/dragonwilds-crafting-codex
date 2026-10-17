// Local HTTP server: serves the UI, the game database and the current inventory state.
// State comes from the CraftCodex UE4SS mod (live session) when it is running,
// otherwise from the save files on disk.
const http = require('http');
const fs = require('fs');
const path = require('path');
const save = require('./save');

const APP_DIR = path.join(__dirname, '..');
const UI_DIR = path.join(APP_DIR, 'ui');
const DATA_DIR = path.join(APP_DIR, 'data');
const LIVE_DIR = path.join(save.SAVE_ROOT, 'CraftCodex');
const LIVE_FILE = path.join(LIVE_DIR, 'live.json');
const LIVE_MAX_AGE_MS = 30000;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const db = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'db.json'), 'utf8'));

function readUnlocks(characterName) {
  const ch = save.listCharacters().find(c => c.name === characterName) || save.listCharacters()[0];
  if (!ch) return null;
  try {
    const p = JSON.parse(fs.readFileSync(ch.file, 'utf8')).GameProgress?.Progress || {};
    return { recipes: p.RecipesUnlocked || [], buildings: p.BuildingsUnlocked || [] };
  } catch {
    return null;
  }
}

function readLive() {
  try {
    const st = fs.statSync(LIVE_FILE);
    const age = Date.now() - st.mtimeMs;
    if (age > LIVE_MAX_AGE_MS) return { stale: true, age };
    const live = JSON.parse(fs.readFileSync(LIVE_FILE, 'utf8'));
    for (const s of live.sources) {
      if (s.kind === 'world' && db.actorToItem[s.cls]) {
        s.kind = 'storage';
        s.item = db.actorToItem[s.cls];
      }
    }
    return { live, age };
  } catch {
    return null;
  }
}

function getState(opts = {}) {
  const live = readLive();
  if (live && live.live) {
    const chars = save.listCharacters();
    return {
      mode: 'live',
      updated: Date.now() - live.age,
      hasPlayer: live.live.hasPlayer,
      character: chars[0]?.name || null,
      sources: live.live.sources,
      unlocks: readUnlocks(opts.character),
      modInstalled: true,
    };
  }
  const s = save.readAll(opts);
  for (const src of s.sources) {
    const short = (src.cls || '').split('.').pop();
    if (src.kind === 'storage' && db.actorToItem[short]) src.item = db.actorToItem[short];
  }
  return {
    mode: 'save',
    liveStale: !!(live && live.stale),
    modInstalled: fs.existsSync(LIVE_DIR) && !!live,
    updated: Math.max(...save.listWorlds().map(w => w.mtime), ...save.listCharacters().map(c => c.mtime), 0),
    character: s.character,
    world: s.world,
    worlds: s.worlds,
    characters: s.characters,
    sources: s.sources,
    errors: s.errors,
    unlocks: readUnlocks(s.character),
  };
}

// ---------------------------------------------------------------- change notifications (SSE)
const clients = new Set();
let debounce = null;
function notify() {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    for (const res of clients) res.write('event: changed\ndata: {}\n\n');
  }, 400);
}
function watch(dir) {
  try { fs.watch(dir, notify); } catch { /* folder may not exist yet */ }
}

function sendFile(res, file) {
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

function safeJoin(root, rel) {
  const p = path.normalize(path.join(root, rel));
  return p.startsWith(root) ? p : null;
}

function start(port = 7777) {
  fs.mkdirSync(LIVE_DIR, { recursive: true });
  watch(LIVE_DIR);
  watch(path.join(save.SAVE_ROOT, 'SaveGames'));
  watch(path.join(save.SAVE_ROOT, 'SaveCharacters'));
  setInterval(notify, 15000); // also refresh periodically so "live" age is accurate

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const p = decodeURIComponent(url.pathname);
    if (p === '/api/db') return sendFile(res, path.join(DATA_DIR, 'db.json'));
    if (p === '/api/state') {
      const state = getState({ world: url.searchParams.get('world') || undefined, character: url.searchParams.get('character') || undefined });
      res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-cache' });
      return res.end(JSON.stringify(state));
    }
    if (p === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write('retry: 3000\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (p.startsWith('/icons/')) {
      const f = safeJoin(path.join(DATA_DIR, 'icons'), p.slice(7));
      return f ? sendFile(res, f) : (res.writeHead(400), res.end());
    }
    const f = safeJoin(UI_DIR, p === '/' ? 'index.html' : p.slice(1));
    return f ? sendFile(res, f) : (res.writeHead(400), res.end());
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

module.exports = { start, getState };

if (require.main === module) {
  start().then(() => console.log('Crafting Codex: http://127.0.0.1:7777'));
}
