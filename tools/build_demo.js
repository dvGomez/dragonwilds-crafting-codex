// Builds the static web demo in docs/demo from the real app UI + a small slice of app/data/db.json.
// Only the item/station icons used by the demo are copied; the game fonts/frames are replaced with web equivalents.
// Usage: node tools/build_demo.js
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const UI = path.join(ROOT, 'app', 'ui');
const OUT = path.join(ROOT, 'docs', 'demo');
const db = JSON.parse(fs.readFileSync(path.join(ROOT, 'app', 'data', 'db.json'), 'utf8'));

// Items you can explore in the demo (English names), with their whole crafting trees.
const TARGETS = ['Bronze Pickaxe', 'Iron Pickaxe', 'Steel Sword', 'Staff of Light', 'Bronze Bar', 'Steel Bar', 'Leather'];
// Made-up inventory: [English name, count, source]
const SAMPLE = [
  ['Copper Ore', 14, 'inventory'], ['Tin Ore', 6, 'inventory'], ['Oak Logs', 43, 'storage'], ['Ash Logs', 60, 'storage'],
  ['Animal Hide Scraps', 3, 'inventory'], ['Iron Ore', 12, 'storage'], ['Coal', 9, 'storage'], ['Bronze Bar', 2, 'storage'],
  ['Vault Shard', 43, 'storage'], ['Vault Core', 3, 'storage'], ['Pragadeira', 0, ''], ['Stone', 120, 'inventory'],
];

const byEn = (n) => Object.values(db.items).find(i => i.name.en.toLowerCase() === n.toLowerCase() && !i.junk && i.type !== 'Building')
  || Object.values(db.items).find(i => i.name.en.toLowerCase() === n.toLowerCase());
const vendorOnly = (r) => r.stations.length > 0 && r.stations.every(s => s.startsWith('vendor:'));

// 1) closure over the default recipe of every target
const keep = new Set();
const visit = (id) => {
  if (keep.has(id)) return;
  keep.add(id);
  const rid = (db.items[id].recipes || []).find(r => !vendorOnly(db.recipes[r]));
  if (rid) for (const i of db.recipes[rid].in) visit(i.item);
};
for (const n of TARGETS) { const it = byEn(n); if (it) visit(it.id); else console.warn('demo target not found:', n); }

// 2) keep every non-vendor recipe whose inputs/outputs are all in the slice (so alternatives still show)
const recipes = {};
for (const r of Object.values(db.recipes)) {
  if (vendorOnly(r) || r.junk) continue;
  if (r.out.some(o => keep.has(o.item)) && [...r.in, ...r.out].every(s => keep.has(s.item))) recipes[r.id] = r;
}
const items = {};
for (const id of keep) {
  const it = db.items[id];
  items[id] = { ...it, recipes: (it.recipes || []).filter(r => recipes[r]), used: (it.used || []).filter(u => keep.has(u)) };
}
const usedStations = new Set(Object.values(recipes).flatMap(r => r.stations));
const stations = Object.fromEntries(Object.entries(db.stations).filter(([k]) => usedStations.has(k)).map(([k, v]) => [k, { ...v }]));
const guidToItem = Object.fromEntries(Object.entries(db.guidToItem).filter(([, v]) => keep.has(v)));
const demoDb = { actorToItem: {}, items, recipes, stations, guidToItem };

// 3) sample inventory
const sources = { inventory: [], storage: [] };
for (const [n, count, src] of SAMPLE) {
  const it = Object.values(items).find(i => i.name.en.toLowerCase() === n.toLowerCase() || i.name.pt.toLowerCase() === n.toLowerCase());
  if (it && count && sources[src]) sources[src].push({ path: it.id, count });
}
const state = {
  mode: 'demo',
  sources: [
    { id: 'bag', kind: 'inventory', items: sources.inventory },
    { id: 'chest', kind: 'storage', cls: 'Demo', label: 'Baú', items: sources.storage },
  ],
};

// 4) UI files: same app, static config + web fonts instead of the game's assets
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'db.json'), JSON.stringify(demoDb));
fs.writeFileSync(path.join(OUT, 'state.json'), JSON.stringify(state));
fs.copyFileSync(path.join(UI, 'app.js'), path.join(OUT, 'app.js'));
fs.writeFileSync(path.join(OUT, 'config.js'), "window.CODEX_CONFIG = { db: 'db.json', state: 'state.json', events: null, icons: 'icons/' };\n");
const iconDir = path.join(OUT, 'icons');
fs.rmSync(iconDir, { recursive: true, force: true });
fs.mkdirSync(iconDir, { recursive: true });
const icons = new Set([...Object.values(items), ...Object.values(stations)].map(x => x.icon).filter(Boolean));
for (const n of icons) fs.copyFileSync(path.join(ROOT, 'app', 'data', 'icons', n + '.png'), path.join(iconDir, n + '.png'));

const css = fs.readFileSync(path.join(UI, 'style.css'), 'utf8')
  .replace(/^@font-face[^\n]*\n/gm, '')
  .replace(/"BonaNova"/g, '"Bona Nova SC"')
  .replace(/"Noto"/g, '"Noto Sans"');
fs.writeFileSync(path.join(OUT, 'style.css'), css + `
/* ---- web demo: no game art, CSS stand-ins ---- */
body.browser { background: radial-gradient(ellipse at 50% 0%, #1d160c, #050403 70%); }
.frame {
  border-image: none; border-color: transparent;
  background: linear-gradient(var(--bg), var(--bg)) padding-box, linear-gradient(180deg, #221a0f, #0b0907 120px) border-box;
  box-shadow: inset 0 0 0 1px rgba(214, 179, 106, 0.7), inset 0 0 0 4px #0b0907, inset 0 0 0 5px rgba(214, 179, 106, 0.25);
}
.titlebar { border-bottom: 1px solid rgba(214, 179, 106, 0.3); }
.slot { background: linear-gradient(145deg, #1f1b15, #0d0b09); border: 1px solid #33291b; box-shadow: inset 0 0 8px rgba(0, 0, 0, 0.9); }
.search-icon, .brand-mark {
  background: none; border: 2px solid var(--gold); border-radius: 50%; width: 14px; height: 14px; opacity: 0.8;
}
.search-icon { left: 16px; }
.brand-mark { position: relative; }
`);

const html = fs.readFileSync(path.join(UI, 'index.html'), 'utf8')
  .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/,
    `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; img-src 'self' data:">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bona+Nova+SC&family=Noto+Sans:wght@400;600&display=swap">`)
  .replace('<title>Códex de Criação</title>', '<title>Códex de Criação · Demo</title>')
  .replace('<script src="app.js"></script>', '<script src="config.js"></script>\n  <script src="app.js"></script>');
fs.writeFileSync(path.join(OUT, 'index.html'), html);

console.log(`demo: items=${Object.keys(items).length} recipes=${Object.keys(recipes).length} stations=${Object.keys(stations).length} icons=${icons.size}`);
console.log('sample inventory:', [...sources.inventory, ...sources.storage].map(s => `${items[s.path].name.pt} x${s.count}`).join(', '));
