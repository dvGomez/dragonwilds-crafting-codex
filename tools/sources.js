// Works out where every item comes from (besides crafting/vendors, which are recipes):
// resource nodes (mining, trees, plants), creature drops, loot chests, fishing, farming and quest rewards.
// Input is data/extract/refs.json (extractor "refs" mode). Output: { [itemId]: [source, ...] } where
//   source = { k: kind, from: {en, pt}, min?, max?, p? (0..1) }
'use strict';

const KIND_ORDER = ['mine', 'tree', 'gather', 'break', 'salvage', 'farm', 'fish', 'drop', 'chest', 'agility', 'quest'];

function buildSources({ refs, text, items, locres }) {
  const pkg = (p) => (p ? p.slice(0, p.lastIndexOf('.') >= 0 ? p.lastIndexOf('.') : p.length) : null);
  const itemOf = (o) => {
    const p = o && (o.AssetPathName || o.ObjectPath);
    const id = p && pkg(p);
    return id && items[id] ? id : null;
  };
  const pretty = (s) => s.replace(/^(BP_|QF_|FNRD_|FPD_|DT_|CFSD_)/, '').replace(/_C$/, '')
    .replace(/(?<=[a-z])(?=[A-Z0-9])/g, ' ').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  const same = (s) => ({ en: s, pt: s });
  const out = {};
  const add = (itemId, src) => {
    if (!itemId) return;
    const list = (out[itemId] ||= []);
    const key = src.k + '|' + src.from.en;
    const prev = list.find(s => s.k + '|' + s.from.en === key);
    if (!prev) { list.push(src); return; }
    // same source seen again (variants of a node): widen the range, keep the best chance
    if (src.min != null) prev.min = Math.min(prev.min ?? src.min, src.min);
    if (src.max != null) prev.max = Math.max(prev.max ?? src.max, src.max);
    if (src.p != null) prev.p = Math.max(prev.p ?? 0, src.p);
  };
  const byPath = new Map(refs.map(r => [r.path, r]));
  const pkgOfFile = (path) => '/' + path.replace(/^RSDragonwilds\/Content\//, 'Game/').replace(/^RSDragonwilds\/Plugins\/GameFeatures\/([^/]+)\/Content\//, '$1/').replace(/\.uasset$/, '');

  // ---- localized names for creatures (ST_AI_Names*). Loot rows and name keys use the same words in a
  // different order/format ("Melee_Vault_Guardian" vs "VaultGuardianMelee"), so match by word sets.
  const words = (s) => s.split(/_|(?<=[a-z])(?=[A-Z])|(?<=[A-Za-z])(?=\d)/).map(w => w.toLowerCase()).filter(Boolean);
  const aiKeys = [];
  for (const ns of Object.keys(locres.en)) {
    if (!ns.startsWith('ST_AI_Names')) continue;
    for (const k of Object.keys(locres.en[ns])) aiKeys.push({ k, ns, w: new Set(words(k)) });
  }
  const aiName = (row) => {
    const rw = new Set(words(row));
    let best = null;
    for (const c of aiKeys) {
      const inRow = [...c.w].every(w => rw.has(w));
      if (!inRow) continue;
      const exact = c.w.size === rw.size;
      if (!best || exact && !best.exact || (exact === best.exact && c.w.size > best.c.w.size)) best = { c, exact };
    }
    if (!best) {
      // variants like "SW_Raid_Garou_Mage" / "Knight_Black_2H": best partial overlap (at least 2 words)
      let top = null;
      for (const c of aiKeys) {
        const common = [...c.w].filter(w => rw.has(w)).length;
        if (common >= 2 && common / c.w.size >= 0.6 && (!top || common > top.common || (common === top.common && c.w.size < top.c.w.size))) top = { c, common };
      }
      if (top) best = { c: top.c };
    }
    if (!best) return same(pretty(row));
    const { k, ns } = best.c;
    return { en: locres.en[ns][k], pt: locres.pt[ns]?.[k] || locres.en[ns][k] };
  };
  const SKIP = /\/(Test|Tests|Debug|Deprecated|Prototypes?|Cheats?)\/|_TEST|TEST_|Debug/i;

  // ---- 1) resource nodes: blueprints with ItemDropComponent
  const bpInfo = new Map(); // class package -> { name, super }
  for (const r of refs) {
    const exps = r.exports || [];
    const bgc = exps.find(e => e.Type === 'BlueprintGeneratedClass');
    if (!bgc) continue;
    const cdo = exps.find(e => (e.Name || '').startsWith('Default__'));
    const props = (cdo && cdo.Properties) || {};
    bpInfo.set(pkgOfFile(r.path), { name: text(props.DisplayName), stump: text(props.StumpDisplayName), super: bgc.Super ? pkg(bgc.Super.ObjectPath) : null });
  }
  const nameOf = (cls, depth = 0) => {
    const i = bpInfo.get(cls);
    if (!i || depth > 8) return null;
    return i.name || nameOf(i.super, depth + 1);
  };
  const kindOfPath = (p) => /\/Mining\//.test(p) ? 'mine' : /\/Trees\//.test(p) ? 'tree' : /\/Obstacles\//.test(p) ? 'break'
    : /Salvage/i.test(p) ? 'salvage' : 'gather';
  for (const r of refs) {
    const exps = r.exports || [];
    const drops = exps.filter(e => e.Type === 'ItemDropComponent');
    if (!drops.length || /\/Quests\/|\/Character\/|\/UtilityMagic\/|\/Blueprints\//.test(r.path) || SKIP.test(r.path)) continue;
    const cls = pkgOfFile(r.path);
    const fileName = r.path.split('/').pop().replace('.uasset', '');
    const k = kindOfPath(r.path);
    const from = nameOf(cls) || (k === 'break' ? { en: 'Breakable wall (dungeons)', pt: 'Parede quebrável (masmorras)' } : same(pretty(fileName)));
    for (const d of drops) {
      for (const it of (d.Properties || {}).ItemsToDrop || []) {
        add(itemOf(it.ItemDataClass), { k, from, min: it.MinToDrop ?? 1, max: it.MaxToDrop ?? it.MinToDrop ?? 1, p: it.ProbabilityOfDrop ?? 1 });
      }
    }
  }

  // ---- 2) loot tables
  const tables = refs.filter(r => (r.exports || []).some(e => e.Type === 'DataTable'));
  const sets = new Map(); // "DT_Name|Row" -> [{item,min,max,p}]
  for (const r of tables) {
    const dt = (r.exports || []).find(e => e.Type === 'DataTable');
    const struct = ((dt.Properties || {}).RowStruct || {}).ObjectName || '';
    for (const [row, data] of Object.entries(dt.Rows || {})) {
      if (struct.includes("'LootItemSet'")) {
        sets.set(dt.Name + '|' + row, (data.SpawnableItems || []).map(s => ({ item: itemOf(s.SpawnedItemData), min: s.MinimumDropAmount, max: s.MaximumDropAmount, p: (s.DropChance ?? 100) / 100 })));
      } else if (struct.includes("'LootDropTableRow'")) {
        if (SKIP.test(row) || /test/i.test(row)) continue;
        const rowP = (data.DropChance ?? 100) / 100;
        const from = aiName(row);
        for (const s of data.Resources || []) {
          add(itemOf(s.SpawnedItemData), { k: 'drop', from, min: s.MinimumDropAmount, max: s.MaximumDropAmount, p: rowP * (s.DropChance ?? 100) / 100 });
        }
      }
    }
  }
  const chestLabel = (row) => {
    const t = row.match(/Tier\s*_?(\d+)/i);
    const base = pretty(row.replace(/Tier\s*_?\d+\+?/i, '')).replace(/\bWorld\b|\bChest\b|\bPrefab\b/gi, '').replace(/\s+/g, ' ').trim();
    const tier = t ? ` T${t[1]}` : '';
    return { en: `Loot chest${tier}${base ? ' (' + base + ')' : ''}`, pt: `Baú de saque${tier}${base ? ' (' + base + ')' : ''}` };
  };
  for (const r of tables) {
    const dt = (r.exports || []).find(e => e.Type === 'DataTable');
    const struct = ((dt.Properties || {}).RowStruct || {}).ObjectName || '';
    if (!struct.includes("'LootItemSetRoll'")) continue;
    for (const [row, data] of Object.entries(dt.Rows || {})) {
      const from = chestLabel(row);
      const fromSet = (h, setP) => {
        const s = h && sets.get((h.DataTable?.ObjectName || '').split("'")[1] + '|' + h.RowName);
        for (const it of s || []) add(it.item, { k: 'chest', from, min: it.min, max: it.max, p: setP * it.p });
      };
      for (const h of data.GuaranteedItemSets || []) fromSet(h, 1);
      for (const a of data.AdditionalItemSets || []) fromSet(a.LootItemSetHandle, (a.DropChance ?? 100) / 100);
      for (const s of data.GuaranteedStandaloneItems || []) add(itemOf(s.SpawnedItemData || s.ItemData), { k: 'chest', from, min: s.MinimumDropAmount, max: s.MaximumDropAmount, p: 1 });
    }
  }

  // ---- 3) fishing: FNRD_<Rod|NetFishing>_<Region> -> species (CFSD) + junk
  const speciesItems = (objPath) => {
    const r = byPath.get([...byPath.keys()].find(k => pkgOfFile(k) === pkg(objPath)));
    if (!r) return [];
    const found = [];
    const walk = (o, pristine) => {
      if (Array.isArray(o)) return o.forEach(v => walk(v, pristine));
      if (!o || typeof o !== 'object') return;
      for (const [k, v] of Object.entries(o)) {
        if (k === 'ItemDataClass' || k === 'ItemData') {
          const id = itemOf(v);
          if (id && !/FishBait|FishingRod/.test(id)) found.push({ id, pristine: pristine || /Pristine/.test(id) });
        } else walk(v, pristine || /Pristine/i.test(k));
      }
    };
    walk(r.exports, false);
    return found;
  };
  for (const r of refs.filter(r => /\/FNRD_/.test(r.path))) {
    const name = r.path.split('/').pop().replace('.uasset', '');
    const m = name.match(/^FNRD_(Rod|NetFishing|Net)_(.+)$/i);
    const region = m ? pretty(m[2]).replace('Downdun', 'Dowdun') : pretty(name);
    const net = m && /net/i.test(m[1]);
    const from = { en: `${net ? 'Net' : 'Rod'} fishing — ${region}`, pt: `Pesca com ${net ? 'rede' : 'vara'} — ${region}` };
    const props = ((r.exports || [])[0] || {}).Properties || {};
    for (const sp of props.CatchableSpecies || []) {
      for (const f of speciesItems(sp.ObjectPath)) add(f.id, { k: 'fish', from, p: f.pristine ? null : undefined });
    }
    const total = props.SumOfJunkProbabilityWeights || 1;
    for (const j of props.CatchableJunk || []) add(itemOf(j.ItemData), { k: 'fish', from, p: (j.ProbabilityWeight ?? 0) / total });
  }

  // ---- 4) farming: plant data -> produce
  for (const r of refs.filter(r => (r.exports || []).some(e => e.Type === 'FarmPlantDataAsset'))) {
    const e = (r.exports || []).find(x => x.Type === 'FarmPlantDataAsset');
    const plant = text((e.Properties || {}).DisplayName) || same(pretty(r.path.split('/').pop().replace('.uasset', '')));
    const ids = r.refs.map(x => Object.keys(items).find(k => k.endsWith(x))).filter(Boolean);
    const seed = ids.find(id => /Seed/i.test(id));
    for (const id of ids) {
      if (id === seed) continue;
      const via = seed ? items[seed].name : null;
      add(id, { k: 'farm', from: via ? { en: `${plant.en} (plant ${via.en})`, pt: `${plant.pt} (plantar ${via.pt})` } : plant });
    }
  }

  // ---- 5) quest rewards
  for (const r of refs.filter(r => r.types.includes('QFT_GiveItemToPlayer_C'))) {
    const q = r.path.split('/').pop().replace('.uasset', '').replace(/^QF_/, '').replace(/^(FH|DR|UmS|UMS|SW|FTUE|MQ)_/i, '');
    const from = { en: `Quest: ${pretty(q)}`, pt: `Missão: ${pretty(q)}` };
    for (const e of (r.exports || []).filter(x => x.Type === 'QFT_GiveItemToPlayer_C')) add(itemOf((e.Properties || {}).ItemData), { k: 'quest', from });
  }

  // ---- 6) agility course rewards (medals, capes, reward packs)
  for (const r of refs.filter(r => /\/CourseData\//.test(r.path))) {
    const e = (r.exports || [])[0] || {};
    const nm = text((e.Properties || {}).CourseName || (e.Properties || {}).DisplayName);
    const from = nm ? { en: `Agility course: ${nm.en}`, pt: `Percurso de agilidade: ${nm.pt}` }
      : { en: 'Agility course', pt: 'Percurso de agilidade' };
    for (const x of r.refs) {
      const id = Object.keys(items).find(k => k.endsWith(x));
      if (id) add(id, { k: 'agility', from });
    }
  }

  // sort: by kind, then most likely first; cap noisy lists
  for (const id of Object.keys(out)) {
    out[id].sort((a, b) => KIND_ORDER.indexOf(a.k) - KIND_ORDER.indexOf(b.k) || (b.p ?? 1) - (a.p ?? 1));
    out[id] = out[id].slice(0, 24).map(s => {
      const o = { k: s.k, from: s.from };
      if (s.min != null) o.min = s.min;
      if (s.max != null && s.max !== s.min) o.max = s.max;
      if (s.p != null && s.p < 0.999) o.p = Math.round(s.p * 1000) / 1000;
      return o;
    });
  }
  return out;
}

module.exports = { buildSources };
