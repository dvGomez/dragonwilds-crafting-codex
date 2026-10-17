// Reads RuneScape: Dragonwilds save files:
//  - SaveCharacters/<name>.json  -> character inventory + equipped loadout
//  - SaveGames/<world>.sav       -> SPUD binary; player-built (spawned) actors carry
//                                   their inventories as embedded JSON strings.
const fs = require('fs');
const path = require('path');
const os = require('os');

const SAVE_ROOT = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'RSDragonwilds', 'Saved');

function listFiles(dir, ext) {
  try {
    return fs.readdirSync(dir)
      .filter(f => f.toLowerCase().endsWith(ext))
      .map(f => {
        const full = path.join(dir, f);
        return { name: f.slice(0, -ext.length), file: full, mtime: fs.statSync(full).mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
  } catch {
    return [];
  }
}

const listCharacters = () => listFiles(path.join(SAVE_ROOT, 'SaveCharacters'), '.json');
const listWorlds = () => listFiles(path.join(SAVE_ROOT, 'SaveGames'), '.sav').filter(w => w.name !== 'EnhancedInputUserSettings');

// Inventory JSON: { "0": {ItemData, Count?}, "1": {...}, MaxSlotIndex } -> [{guid, count}]
function inventoryItems(inv) {
  const out = [];
  if (!inv || typeof inv !== 'object') return out;
  for (const [k, v] of Object.entries(inv)) {
    if (k === 'MaxSlotIndex' || !v || typeof v !== 'object' || !v.ItemData) continue;
    out.push({ guid: v.ItemData, count: typeof v.Count === 'number' ? v.Count : 1 });
  }
  return out;
}

function readCharacter(file) {
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  const gp = d.GameProgress || {};
  return {
    name: d.meta_data?.char_name,
    sources: [
      { id: 'inventory', kind: 'inventory', label: 'inventory', items: inventoryItems(gp.Inventory) },
      { id: 'personal', kind: 'inventory', label: 'personal', items: inventoryItems(gp.PersonalInventory) },
      { id: 'equipped', kind: 'equipped', label: 'equipped', items: inventoryItems(gp.Loadout) },
    ],
  };
}

// ---------------------------------------------------------------- SPUD world save
function readWorld(file) {
  const b = fs.readFileSync(file);
  const isId = (o) => {
    for (let i = 0; i < 4; i++) {
      const c = b[o + i];
      if (!((c >= 65 && c <= 90) || c === 32)) return false;
    }
    return true;
  };
  function* chunks(o, end) {
    while (o + 8 <= end) {
      if (!isId(o)) return;
      const len = b.readUInt32LE(o + 4);
      if (o + 8 + len > end) return;
      yield { id: b.toString('latin1', o, o + 4), o, len, body: o + 8, end: o + 8 + len };
      o += 8 + len;
    }
  }
  const fstr = (o) => {
    const n = b.readInt32LE(o);
    if (n <= 0) return { s: '', next: o + 4 };
    return { s: b.toString('utf8', o + 4, o + 4 + n - 1), next: o + 4 + n };
  };
  // Embedded JSON blobs are FStrings starting with '{\r\n\t"Version"'
  const jsonsIn = (start, end) => {
    const res = [];
    const needle = Buffer.from('{\r\n\t"Version"');
    let i = b.indexOf(needle, start);
    while (i !== -1 && i < end) {
      const len = b.readInt32LE(i - 4);
      if (len > 0 && i + len <= end + 1) {
        try { res.push(JSON.parse(b.toString('utf8', i, i + len - 1))); } catch { /* not a full blob */ }
      }
      i = b.indexOf(needle, i + 1);
    }
    return res;
  };

  const sources = [];
  const [save] = [...chunks(0, b.length)];
  if (!save || save.id !== 'SAVE') throw new Error('Not a SPUD save');
  for (const top of chunks(save.body, save.end)) {
    if (top.id !== 'LVLS') continue;
    for (const lvl of chunks(top.body, top.end)) {
      let p = lvl.body;
      const lvlName = fstr(p); p = lvlName.next + 8;
      let classNames = [];
      for (const c of chunks(p, lvl.end)) {
        if (c.id === 'META') {
          for (const m of chunks(c.body, c.end)) {
            if (m.id !== 'CNIX') continue;
            let q = m.body; const n = b.readUInt32LE(q); q += 4;
            classNames = [];
            for (let i = 0; i < n; i++) { const r = fstr(q); classNames.push(r.s); q = r.next; }
          }
        }
        // SATS = actors spawned at runtime, i.e. things the player built.
        if (c.id !== 'SATS') continue;
        for (const s of chunks(c.body, c.end)) {
          if (s.id !== 'SPWN') continue;
          const cls = classNames[b.readUInt32LE(s.body)] || '?';
          const items = [];
          for (const j of jsonsIn(s.body, s.end)) items.push(...inventoryItems(j));
          if (items.length) {
            sources.push({ id: `${lvlName.s}:${s.o}`, kind: 'storage', cls, label: cls.split('.').pop().replace(/_C$/, ''), items });
          }
        }
      }
    }
  }
  return { sources };
}

function readAll(opts = {}) {
  const chars = listCharacters();
  const worlds = listWorlds();
  const ch = chars.find(c => c.name === opts.character) || chars[0];
  const wd = worlds.find(w => w.name === opts.world) || worlds[0];
  const result = {
    saveRoot: SAVE_ROOT,
    characters: chars.map(c => ({ name: c.name, mtime: c.mtime })),
    worlds: worlds.map(w => ({ name: w.name, mtime: w.mtime })),
    character: ch ? ch.name : null,
    world: wd ? wd.name : null,
    sources: [],
    errors: [],
  };
  if (ch) {
    try { result.sources.push(...readCharacter(ch.file).sources); } catch (e) { result.errors.push(`character: ${e.message}`); }
  }
  if (wd) {
    try { result.sources.push(...readWorld(wd.file).sources); } catch (e) { result.errors.push(`world: ${e.message}`); }
  }
  return result;
}

module.exports = { readAll, listCharacters, listWorlds, SAVE_ROOT };

if (require.main === module) {
  const r = readAll();
  for (const s of r.sources) console.log(s.kind, s.label, s.items.length, s.items.reduce((a, i) => a + i.count, 0));
  console.log(r.character, r.world, r.errors);
}
