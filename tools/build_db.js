// Builds app/data/db.json (+ icons and UI assets) from the raw extractor output in data/extract.
// Usage: node tools/build_db.js [-v]
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'data', 'extract');
const OUT = path.join(ROOT, 'app', 'data');
const UI_ASSETS = path.join(ROOT, 'app', 'ui', 'assets');
const LANGS = ['en', 'pt'];
// game UI files used by app/ui/style.css
const UI_FILES = ['BonaNovaSC-Regular.ttf', 'NotoSans-Regular.ttf', 'NotoSans-Medium.ttf', 'T_Menu_Bg_Combined.png',
  'T_Common_ItemSlotsBackground.png', 'T_Craft_InfoBackground.png', 'T_Search_Button_Icon_1.png'];
const APP_ICON = 'T_Icon_Station_Crafting_Bench';

const load = (name) => JSON.parse(fs.readFileSync(path.join(SRC, name), 'utf8'));
const assets = load('assets.json');
const tables = Object.fromEntries(load('tables.json').map(t => [t.__path.split('/').pop().replace('.uasset', ''), t]));
const stationsRaw = load('stations.json');
const stringtables = load('stringtables.json');
const locres = { en: load('locres.en.json'), pt: load('locres.pt-BR.json') };

const loc = (lang, ns, key) => (locres[lang][ns] || {})[key];

/** FText json -> {en, pt} or null */
function text(ft) {
  if (!ft || typeof ft !== 'object') return null;
  let src = ft.SourceString || ft.LocalizedString || ft.CultureInvariantString;
  const key = ft.Key;
  let ns;
  if ('TableId' in ft) {
    const st = (stringtables[ft.TableId] || {}).StringTable || {};
    ns = st.TableNamespace || ft.TableId.split('.').pop();
    src = (st.KeysToEntries || {})[key] ?? src;
    if (!src && !LANGS.some(l => loc(l, ns, key))) return null;
    src = src || loc('en', ns, key);
  } else {
    ns = ft.Namespace || '';
  }
  if (!src) return null;
  const out = {};
  for (const lang of LANGS) out[lang] = ((key ? loc(lang, ns, key) : null) || src).trim();
  return out;
}

const pkg = (p) => (p ? p.slice(0, p.lastIndexOf('.') >= 0 ? p.lastIndexOf('.') : p.length) : null);
function softName(sp) {
  if (!sp) return null;
  const p = typeof sp === 'object' ? sp.AssetPathName : sp;
  return p && p !== 'None' ? p.split('.').pop() : null;
}

const JUNK = /\/(Deprecated|Deleted|Debug|Test|Cheats?|Prototypes?|PROTOTYPES)\/|_DEPRECATED|DEPRECATED_|_Test\b|_DEBUG/i;
const iconDir = path.join(SRC, 'icons');
const iconsAvailable = new Set(fs.readdirSync(iconDir).filter(f => f.endsWith('.png')).map(f => f.slice(0, -4)));
const usedIcons = new Set();
function icon(sp) {
  const n = softName(sp);
  if (n && iconsAvailable.has(n)) { usedIcons.add(n); return n; }
  return null;
}
function pretty(assetName) {
  const n = assetName.replace(/^(ITEM|DA|BP)_/, '').replace(/^(Consumables?|Resources?|Jewellery|Equipment)_/i, '')
    .replace(/(?<=[a-z])(?=[A-Z])/g, ' ').replace(/_/g, ' ').trim();
  return { en: n, pt: n };
}

// ------------------------------------------------------------------ items
let items = {};
const recipesRaw = [];
const piecesRaw = [];
for (const a of assets) {
  const t = a.Type;
  if (t === 'RecipeData' || t === 'RuneRecipeData') { recipesRaw.push(a); continue; }
  if (t === 'BuildingPieceData') { piecesRaw.push(a); continue; }
  const p = a.Properties || {};
  let name = text(p.Name);
  if (!name || /^[0-9A-F]{32}$/.test(name.en)) name = pretty(a.Name);
  items[a.Package] = {
    id: a.Package,
    guid: p.PersistenceID ?? null,
    name,
    desc: text(p.FlavourText),
    icon: icon(p.Icon),
    stack: p.MaxStackSize ?? 1,
    weight: p.Weight ?? null,
    type: t,
    cat: (p.Category || {}).TagName ?? null,
    tags: [...new Set([...(p.__Tags || []), ...(p.ItemFilterTags || []), (p.Category || {}).TagName].filter(x => x && /^(ItemFilter\.Type\.Equipment|DamageType)/.test(x)))],
    junk: JUNK.test(a.__path),
  };
}

// ------------------------------------------------------------------ stations
// row name -> display name, from the blueprint components that reference each row
const stationNames = new Map();
const stationBp = new Map();
for (const c of stationsRaw) {
  const pr = c.Properties || {};
  const handle = pr.CraftingDataRowHandle || pr.ProcessingStationRowHandle;
  if (!handle) continue;
  const table = handle.DataTable.ObjectName.split("'")[1];
  const key = `${table}|${handle.RowName}`;
  const nm = text(pr.DisplayName || pr.StationName);
  if (nm && !stationNames.has(key)) stationNames.set(key, nm);
  if (!stationBp.has(key)) stationBp.set(key, pkg(c.Outer.ObjectPath));
}

// building pieces that place each station blueprint -> icon + fallback name
const bpPiece = new Map();
for (const a of piecesRaw) {
  const act = ((a.Properties || {}).BuildableActor || {}).AssetPathName || '';
  bpPiece.set(pkg(act), a);
}

const KIND = { DT_CraftingStationsDataTable: 'craft', DT_ProcessingStationDataTable: 'process', DT_VendorDataTable: 'vendor' };
const stations = {};
const recipeStations = {};
const recipeLabel = {}; // recipe -> crafting-bench tab label ("Staves", "Shortbows"...)
for (const [tname, kind] of Object.entries(KIND)) {
  for (const [row, data] of Object.entries(tables[tname].Rows)) {
    if (row.startsWith('Test') || row === 'OnlyCatalyst') continue;
    const sid = `${kind}:${row}`;
    const piece = bpPiece.get(stationBp.get(`${tname}|${row}`));
    let name = stationNames.get(`${tname}|${row}`);
    if (piece && !name) name = text((piece.Properties || {}).DisplayName);
    if (!name) name = { en: row, pt: row };
    stations[sid] = { id: sid, kind, name, icon: piece ? icon((piece.Properties || {}).DisplayIcon) : null };
    const refs = (data.Recipes || []).map(r => r.ObjectPath);
    for (const lab of data.LabeledRecipes || []) {
      const label = text(lab.Label);
      for (const r of lab.Collection || []) {
        refs.push(r.AssetPathName);
        if (label && kind === 'craft' && !recipeLabel[pkg(r.AssetPathName)]) recipeLabel[pkg(r.AssetPathName)] = label;
      }
    }
    for (const r of refs) {
      const list = (recipeStations[pkg(r)] ||= []);
      if (!list.includes(sid)) list.push(sid);
    }
  }
}
stations.build = { id: 'build', kind: 'build', name: { en: 'Build Menu', pt: 'Menu de Construção' }, icon: null };

// ------------------------------------------------------------------ recipes
function stacks(list) {
  const out = [];
  for (const e of list || []) {
    const ref = pkg((e.ItemData || {}).ObjectPath);
    const n = e.Count ?? e.Amount ?? 1;
    if (ref && items[ref] && n) out.push({ item: ref, n });
  }
  return out;
}

const recipes = {};
for (const a of recipesRaw) {
  const p = a.Properties || {};
  const ins = stacks(p.ItemsConsumed);
  const outs = stacks(p.ItemsCreated);
  if (!outs.length) continue;
  const skill = (p.SkillUsedToCraft || {}).ObjectName || '';
  recipes[a.Package] = {
    id: a.Package,
    guid: p.PersistenceID ?? null,
    in: ins,
    out: outs,
    stations: recipeStations[a.Package] || [],
    skill: skill.includes("'") ? skill.split("'")[1].replace('SKILL_', '') : null,
    time: p.CraftTime || p.MinProcessingTime || null,
    junk: JUNK.test(a.__path),
  };
}

// building pieces become craftable "items" with a build-menu recipe
for (const a of piecesRaw) {
  const p = a.Properties || {};
  const name = text(p.DisplayName);
  const reqs = stacks(p.Requirements);
  if (!name || !reqs.length) continue;
  const iid = a.Package;
  const junk = JUNK.test(a.__path);
  items[iid] = {
    id: iid, guid: p.PersistenceID ?? null, name, desc: text(p.Description), icon: icon(p.DisplayIcon),
    stack: 1, weight: null, type: 'Building', cat: (p.PieceTag || {}).TagName ?? null, junk,
  };
  recipes[iid + '#build'] = {
    id: iid + '#build', guid: p.PersistenceID ?? null, in: reqs, out: [{ item: iid, n: 1 }],
    stations: ['build'], skill: 'Construction', time: null, junk,
  };
}

// index: item -> recipes that produce it, best first
// (not junk, has a station, not a vendor purchase, not an alternative/salvage recipe, fewest inputs)
const producedBy = {};
for (const r of Object.values(recipes)) for (const o of r.out) (producedBy[o.item] ||= []).push(r.id);
const score = (rid) => {
  const r = recipes[rid];
  const vendor = r.stations.length ? r.stations.every(s => s.startsWith('vendor:')) : false;
  const alt = /Salvage|From_Leaf|Vendor|Deprecated|_Old|Legacy/i.test(rid);
  return [r.junk, !r.stations.length, vendor, alt, r.in.length].map(Number);
};
for (const [iid, rids] of Object.entries(producedBy)) {
  rids.sort((a, b) => { const x = score(a), y = score(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; });
  items[iid].recipes = rids;
}

// drop junk items nobody uses
const used = new Set();
for (const r of Object.values(recipes)) for (const s of [...r.in, ...r.out]) used.add(s.item);
items = Object.fromEntries(Object.entries(items).filter(([k, v]) => !v.junk || used.has(k)));

// placed actor class (e.g. BP_BaseBuilding_Crate_C) -> building piece, to name chests/stations
const actorToItem = {};
for (const a of piecesRaw) {
  const act = ((a.Properties || {}).BuildableActor || {}).AssetPathName || '';
  const cls = act.split('.').pop();
  if (act && items[a.Package] && !(cls in actorToItem)) actorToItem[cls] = a.Package;
}

// where each item comes from (nodes, drops, chests, fishing, farming, quests) - needs the extractor "refs" pass
const refsFile = path.join(SRC, 'refs.json');
if (fs.existsSync(refsFile)) {
  const { buildSources } = require('./sources');
  const sources = buildSources({ refs: JSON.parse(fs.readFileSync(refsFile, 'utf8')), text, items, locres });
  for (const [id, list] of Object.entries(sources)) if (items[id]) items[id].src = list;
}
// reverse index: what each item is used to make
for (const r of Object.values(recipes)) {
  if (r.junk) continue;
  for (const i of r.in) {
    const it = items[i.item];
    if (!it) continue;
    const used = (it.used ||= []);
    for (const o of r.out) if (!used.includes(o.item) && used.length < 60) used.push(o.item);
  }
}

// ---- combat class + category for equipment ("Classes" tab)
const L = (en, pt) => ({ en, pt });
const CATEGORIES = {
  staff: L('Staves', 'Cajados'), wand: L('Wands', 'Varinhas'), runes: L('Runes', 'Runas'),
  shortbow: L('Shortbows', 'Arcos Curtos'), longbow: L('Longbows', 'Arcos Longos'), crossbow: L('Crossbows', 'Balestras'),
  arrows: L('Arrows', 'Flechas'), bolts: L('Bolts', 'Setas'),
  onehand: L('One-handed weapons', 'Armas de Uma Mão'), twohand: L('Two-handed weapons', 'Armas de Duas Mãos'), shield: L('Shields', 'Escudos'),
  head: L('Head', 'Cabeça'), body: L('Body', 'Corpo'), legs: L('Legs', 'Pernas'),
  throwable: L('Throwables', 'Arremessáveis'), masterwork: L('Masterworks', 'Magistrais'), ring: L('Rings', 'Anéis'), amulet: L('Amulets', 'Amuletos'), trinket: L('Trinkets', 'Bugigangas'),
  cape: L('Capes', 'Capas'), backpack: L('Backpacks', 'Mochilas'), special: L('Special', 'Especiais'),
  pickaxe: L('Pickaxes', 'Picaretas'), axe: L('Logging axes', 'Machados de Lenha'), shovel: L('Shovels', 'Pás'), fishing: L('Fishing', 'Pesca'), tool: L('Other tools', 'Outras ferramentas'),
};
const CLASSES = { magic: L('Mage', 'Mago'), ranged: L('Ranger', 'Arqueiro'), melee: L('Warrior', 'Guerreiro'), general: L('General', 'Geral'), tools: L('Tools', 'Ferramentas') };
const EQUIP = new Set(['WearableEquipmentData', 'HeldEquipmentData', 'ShieldData', 'RangedAmmoData', 'MagicAmmoData', 'TrinketItemData', 'JewelleryData', 'EquipmentData',
  'HarvestToolEquipmentData', 'SpadeToolEquipmentData', 'FishingRodHeldEquipmentData', 'FishingBaitAmmoData']);
const MATERIALS = ['stone', 'bone', 'wood', 'ash', 'copper', 'bronze', 'oak', 'iron', 'willow', 'steel', 'maple', 'mithril', 'yew', 'adamant', 'magic', 'runite', 'rune', 'dragon'];
const LABEL_CAT = [[/Stave/i, 'staff'], [/^Bows$/i, 'shortbow'], [/Wand/i, 'wand'], [/Shortbow/i, 'shortbow'], [/Longbow/i, 'longbow'], [/Crossbow/i, 'crossbow'], [/Arrow/i, 'arrows'],
  [/Bolt/i, 'bolts'], [/^Runes$/i, 'runes'], [/One Handed/i, 'onehand'], [/Two Handed/i, 'twohand'], [/Shield/i, 'shield'], [/^Rings$/i, 'ring'], [/Amulet/i, 'amulet'],
  [/Masterwork/i, 'masterwork'], [/Cape/i, 'cape'], [/Backpack/i, 'backpack'], [/Head/i, 'head'], [/Body/i, 'body'], [/Leg/i, 'legs']];

// official tier per recipe: DT_Progression_* rows are named "T6_..." and list the recipes they unlock
const recipeTier = {};
for (const [tname, t] of Object.entries(tables)) {
  if (!/Progression/.test(tname)) continue;
  for (const [row, data] of Object.entries(t.Rows || {})) {
    const m = row.match(/^T(\d+)_/);
    if (!m) continue;
    for (const ref of JSON.stringify(data).match(/\/[A-Za-z0-9_/]+\/(RECIPE_|DA_Recipe)[A-Za-z0-9_]+/g) || []) {
      if (recipeTier[ref] == null || +m[1] < recipeTier[ref]) recipeTier[ref] = +m[1];
    }
  }
}

function classify(it) {
  if (!EQUIP.has(it.type) || it.junk) return null;
  const tags = it.tags || [];
  const has = (t) => tags.some(x => x.startsWith(t));
  const id = it.id.split('/').pop();
  const craft = (it.recipes || []).map(r => recipes[r]).find(r => r && !r.junk && recipeLabel[r.id]);
  const label = craft ? recipeLabel[craft.id].en : '';
  // category: crafting-bench tab first, then tags / asset name
  let cat = (LABEL_CAT.find(([re]) => re.test(label)) || [])[1];
  if (!cat) {
    if (has('ItemFilter.Type.Equipment.Tool.Pickaxe')) cat = 'pickaxe';
    else if (has('ItemFilter.Type.Equipment.Tool.LoggingAxe')) cat = 'axe';
    else if (has('ItemFilter.Type.Equipment.Tool.Shovel')) cat = 'shovel';
    else if (has('ItemFilter.Type.Equipment.Tool.Fishing')) cat = 'fishing';
    else if (has('ItemFilter.Type.Equipment.Tool') || /Spade|Bucket|WateringCan|Torch|Secateurs/i.test(id)) cat = 'tool';
    else if (has('ItemFilter.Type.Equipment.Ammo.Rune')) cat = 'runes';
    else if (has('ItemFilter.Type.Equipment.Ammo.Arrow')) cat = 'arrows';
    else if (has('ItemFilter.Type.Equipment.Ammo.Bolt')) cat = 'bolts';
    else if (has('ItemFilter.Type.Equipment.Shield')) cat = 'shield';
    else if (has('ItemFilter.Type.Equipment.Cape') || /Cape/i.test(id)) cat = 'cape';
    else if (has('ItemFilter.Type.Equipment.Weapon.Magic')) cat = /Wand/i.test(id) ? 'wand' : 'staff';
    else if (has('ItemFilter.Type.Equipment.Weapon.Ranged')) cat = /Crossbow/i.test(id) ? 'crossbow' : /Longbow/i.test(id) ? 'longbow' : /Bow/i.test(id) ? 'shortbow' : 'throwable';
    else if (has('ItemFilter.Type.Equipment.Weapon.Melee')) cat = /Great|Maul|Battle|Hammer|Halberd|2H|TwoHand|Scythe/i.test(id) ? 'twohand' : 'onehand';
    else if (/Head|Helm|Hat|Hood|Mask|Coif/i.test(id)) cat = 'head';
    else if (/Body|Chest|Robe|Top|Platebody|Torso/i.test(id)) cat = 'body';
    else if (/Legs|Pants|Skirt|Chaps/i.test(id)) cat = 'legs';
    else if (/Ring/i.test(id)) cat = 'ring';
    else if (/Amulet|Necklace|Pendant/i.test(id)) cat = 'amulet';
    else if (it.type === 'TrinketItemData' || it.type === 'JewelleryData') cat = 'trinket';
    else if (has('ItemFilter.Type.Equipment.Armour')) cat = 'special';
    else return null;
  }
  // class
  let cls = null;
  if (['pickaxe', 'axe', 'shovel', 'fishing', 'tool'].includes(cat)) cls = 'tools';
  else if (has('ItemFilter.Type.Equipment.Armour.Light') || has('ItemFilter.Type.Equipment.Weapon.Magic') || has('ItemFilter.Type.Equipment.Ammo.Rune') || /^Magic /.test(label) || ['staff', 'wand', 'runes'].includes(cat)) cls = 'magic';
  else if (has('ItemFilter.Type.Equipment.Armour.Medium') || has('ItemFilter.Type.Equipment.Weapon.Ranged') || has('ItemFilter.Type.Equipment.Ammo.Arrow') || has('ItemFilter.Type.Equipment.Ammo.Bolt') || /^Ranged /.test(label) || ['shortbow', 'longbow', 'crossbow', 'arrows', 'bolts'].includes(cat)) cls = 'ranged';
  else if (has('ItemFilter.Type.Equipment.Armour.Heavy') || has('ItemFilter.Type.Equipment.Weapon.Melee') || has('ItemFilter.Type.Equipment.Shield') || /^Melee /.test(label) || ['onehand', 'twohand', 'shield'].includes(cat)) cls = 'melee';
  else {
    const n = `${id} ${it.name.en}`;
    cls = /Magic|Mage|Wizard|Arcan|Sorcer|Rune\b/i.test(n) ? 'magic' : /Ranged|Ranger|Archer|Bow|Hunter/i.test(n) ? 'ranged'
      : /Attack|Melee|Strength|Warrior|Defen|Fighter|Berserk/i.test(n) ? 'melee' : 'general';
  }
  // generic bench tabs ("One Handed Weapons" on the Crafting Table) -> class-specific category
  if (cat === 'shortbow' && /Longbow/i.test(id)) cat = 'longbow';
  if (cls === 'magic' && (cat === 'onehand' || cat === 'twohand')) cat = /Wand/i.test(id) ? 'wand' : 'staff';
  if (cls === 'ranged' && (cat === 'onehand' || cat === 'twohand')) cat = /Bow/i.test(id) ? 'shortbow' : 'throwable';
  const tiers = (it.recipes || []).map(r => recipeTier[r]).filter(x => x != null);
  const tm = id.match(/_T(\d+)_/i);
  const mat = cat === 'runes' ? -1 : MATERIALS.findIndex(m => new RegExp(`(^|_)${m}(_|$)`, 'i').test(id));
  const tier = tiers.length ? Math.min(...tiers) : tm ? +tm[1] : mat >= 0 ? Math.round(mat / 2) : 0;
  return { cls, cat, tier };
}
for (const it of Object.values(items)) {
  const role = classify(it);
  if (role) it.role = role;
}

const guidToItem = {};
for (const [k, v] of Object.entries(items)) if (v.guid) guidToItem[v.guid] = k;

// ------------------------------------------------------------------ write
fs.mkdirSync(path.join(OUT, 'icons'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'db.json'), JSON.stringify({ actorToItem, items, recipes, stations, guidToItem, classes: CLASSES, categories: CATEGORIES }));
for (const n of usedIcons) {
  const dst = path.join(OUT, 'icons', n + '.png');
  if (!fs.existsSync(dst)) fs.copyFileSync(path.join(iconDir, n + '.png'), dst);
}

// UI assets (fonts, frames) + app icon
fs.mkdirSync(UI_ASSETS, { recursive: true });
const missingUi = [];
for (const f of UI_FILES) {
  const src = path.join(SRC, 'ui', f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(UI_ASSETS, f)); else missingUi.push(f);
}
const appIcon = path.join(iconDir, APP_ICON + '.png');
if (fs.existsSync(appIcon)) {
  const png = fs.readFileSync(appIcon);
  fs.writeFileSync(path.join(UI_ASSETS, 'icon.png'), png);
  // .ico with a single embedded PNG (supported since Windows Vista)
  const h = Buffer.alloc(22);
  h.writeUInt16LE(0, 0); h.writeUInt16LE(1, 2); h.writeUInt16LE(1, 4);
  h.writeUInt16LE(1, 10); h.writeUInt16LE(32, 12); h.writeUInt32LE(png.length, 14); h.writeUInt32LE(22, 18);
  fs.writeFileSync(path.join(UI_ASSETS, 'icon.ico'), Buffer.concat([h, png]));
}

const rs = Object.values(recipes);
console.log(`items=${Object.keys(items).length} recipes=${rs.length} stations=${Object.keys(stations).length} icons=${usedIcons.size}`);
console.log('recipes without station:', rs.filter(r => !r.stations.length && !r.junk).length);
if (missingUi.length) console.log('missing UI assets:', missingUi.join(', '));
if (process.argv.includes('-v')) for (const s of Object.values(stations)) console.log(' ', s.id, s.name.pt, s.icon);
