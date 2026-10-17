'use strict';
// Códex de Criação — crafting tree + inventory check for RuneScape: Dragonwilds.

const I18N = {
  pt: {
    title: 'Códex de Criação', searchPh: 'Buscar item (português ou inglês)...', tabCraft: 'Criação', tabInv: 'Inventário',
    emptyTitle: 'Busque qualquer item do jogo', emptySub: 'Em português ou inglês. Mostro a árvore inteira de criação, quantidades e o que você já tem.',
    missingTitle: 'Falta coletar', stepsTitle: 'Etapas de criação', sourcesTitle: 'Considerar itens de', filterPh: 'Filtrar...',
    howTo: 'Como obter', usedIn: 'Usado em', noSources: 'Sem fonte conhecida (pode vir de eventos, NPCs ou recompensas especiais).',
    live: 'Sessão ao vivo', demo: 'Demonstração · inventário de exemplo',
    srcNoteDemo: 'Demonstração com alguns itens e um inventário fictício. Instale o Códex para usar todos os itens do jogo com o seu inventário de verdade.', liveNoPlayer: 'Jogo aberto (no menu)', saveMode: 'Save', ago: 'há', noData: 'Nenhum dado do jogo encontrado',
    have: 'tem', need: 'precisa', missing: 'faltam', craft: 'criar', crafts: 'criações', ready: 'Você já tem tudo para criar!',
    canCraftNow: 'Pode criar agora', notReady: 'Ainda faltam materiais', allCollected: 'Nada para coletar, você já tem tudo.',
    noSteps: 'Nenhuma etapa necessária.', youHave: 'Você tem', inBag: 'na bolsa', makes: 'faz', perCraft: 'por criação',
    gather: 'Coletar / obter', buy: 'Comprar', recipe: 'Receita', locked: 'não aprendida', cycle: 'ciclo, ignorado',
    k_inventory: 'Bolsa', k_equipped: 'Equipado', k_personal: 'Baú pessoal', k_storage: 'Baús e estações construídos', k_world: 'Baús do mundo / NPCs',
    srcNoteLive: 'Itens lidos ao vivo da sessão atual (seu mundo ou de um amigo). Baús distantes podem não estar carregados.',
    srcNoteSave: 'Mod ao vivo não detectado: usando o último save em disco do seu mundo. Para sessões de amigos, instale o mod CraftCodex.',
    noResults: 'Nada encontrado', total: 'itens', containers: 'recipientes', from: 'de', build: 'Construção', surplus: 'sobra',
    types: { Building: 'Construção', WearableEquipmentData: 'Armadura', HeldEquipmentData: 'Ferramenta / Arma', ShieldData: 'Escudo',
      RangedAmmoData: 'Munição', MagicAmmoData: 'Runa', FoodItemData: 'Comida', DrinkItemData: 'Bebida', PotionItemData: 'Poção',
      BP_Consumables_Food_C: 'Comida', BP_Consumables_Potion_C: 'Poção', BP_Consumables_Drink_C: 'Bebida', BP_Consumables_Plan_Base_C: 'Planta',
      BP_Consumables_RecipeUnlocker2_C: 'Receita', TrinketItemData: 'Bugiganga', FuelItemData: 'Combustível', ItemData: 'Material' },
  },
  en: {
    title: 'Crafting Codex', searchPh: 'Search item (English or Portuguese)...', tabCraft: 'Crafting', tabInv: 'Inventory',
    emptyTitle: 'Search any item in the game', emptySub: 'In English or Portuguese. Shows the whole crafting tree, quantities and what you already have.',
    missingTitle: 'Still to gather', stepsTitle: 'Crafting steps', sourcesTitle: 'Count items from', filterPh: 'Filter...',
    howTo: 'How to get', usedIn: 'Used in', noSources: 'No known source (may come from events, NPCs or special rewards).',
    live: 'Live session', demo: 'Demo · sample inventory',
    srcNoteDemo: 'Demo with a few items and a made-up inventory. Install the Codex to use every item in the game with your real inventory.', liveNoPlayer: 'Game open (in menu)', saveMode: 'Save', ago: '', noData: 'No game data found',
    have: 'have', need: 'need', missing: 'missing', craft: 'craft', crafts: 'crafts', ready: 'You have everything to craft it!',
    canCraftNow: 'Ready to craft', notReady: 'Materials still missing', allCollected: 'Nothing to gather, you have it all.',
    noSteps: 'No steps needed.', youHave: 'You have', inBag: 'in bag', makes: 'makes', perCraft: 'per craft',
    gather: 'Gather / obtain', buy: 'Buy', recipe: 'Recipe', locked: 'not learned', cycle: 'cycle, skipped',
    k_inventory: 'Backpack', k_equipped: 'Equipped', k_personal: 'Personal chest', k_storage: 'Built chests & stations', k_world: 'World chests / NPCs',
    srcNoteLive: 'Items read live from the current session (your world or a friend\'s). Far away chests may not be loaded.',
    srcNoteSave: 'Live mod not detected: using your world\'s last save on disk. For friends\' sessions install the CraftCodex mod.',
    noResults: 'Nothing found', total: 'items', containers: 'containers', from: 'from', build: 'Building', surplus: 'leftover',
    types: { Building: 'Building', WearableEquipmentData: 'Armour', HeldEquipmentData: 'Tool / Weapon', ShieldData: 'Shield',
      RangedAmmoData: 'Ammo', MagicAmmoData: 'Rune', FoodItemData: 'Food', DrinkItemData: 'Drink', PotionItemData: 'Potion',
      BP_Consumables_Food_C: 'Food', BP_Consumables_Potion_C: 'Potion', BP_Consumables_Drink_C: 'Drink', BP_Consumables_Plan_Base_C: 'Plan',
      BP_Consumables_RecipeUnlocker2_C: 'Recipe', TrinketItemData: 'Trinket', FuelItemData: 'Fuel', ItemData: 'Material' },
  },
};

const LS = {
  get(k, d) { try { const v = localStorage.getItem('codex.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('codex.' + k, JSON.stringify(v)); } catch { /* ignore */ } },
};

const S = {
  db: null,
  inv: null,
  lang: LS.get('lang', 'pt'),
  target: LS.get('target', null),
  qty: LS.get('qty', 1),
  choice: LS.get('choice', {}),
  howtoOpen: LS.get('howtoOpen', true),          // itemId -> recipeId | 'gather'
  kindsOff: new Set(LS.get('kindsOff', ['world'])),
  closed: new Set(),
  pool: new Map(),
  searchIndex: [],
};

const $ = (s) => document.querySelector(s);
const t = (k) => I18N[S.lang][k] ?? I18N.pt[k] ?? k;
const nm = (item) => item ? (item.name[S.lang] || item.name.en) : '?';
const alt = (item) => item ? (item.name[S.lang === 'pt' ? 'en' : 'pt'] || '') : '';
const fmt = (n) => n.toLocaleString(S.lang === 'pt' ? 'pt-BR' : 'en-US');
const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').trim();
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Data endpoints; the static demo (docs/demo) overrides these through window.CODEX_CONFIG.
const CFG = Object.assign({ db: '/api/db', state: '/api/state', events: '/api/events', icons: '/icons/' }, window.CODEX_CONFIG || {});
const iconUrl = (item) => item && item.icon && CFG.icons ? `${CFG.icons}${encodeURIComponent(item.icon)}.png` : null;
const isElectron = !!window.codex;

function slot(item, cls = '', qty = null) {
  const u = iconUrl(item);
  // no icon (e.g. the web demo): show initials of the first and last word, "Picareta de Bronze" -> "PB"
  const words = item ? nm(item).split(/\s+/).filter(w => w.length > 2) : [];
  const mono = words.length ? (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')) : '';
  return `<div class="slot ${cls}" data-tip="${esc(item?.id)}">${u ? `<img src="${u}" alt="" loading="lazy">` : `<span class="mono">${esc(mono)}</span>`}${qty != null ? `<span class="qty">${esc(qty)}</span>` : ''}</div>`;
}

function stationLabel(sid) {
  const st = S.db.stations[sid];
  if (!st) return '';
  const icon = st.icon && CFG.icons ? `<img src="${CFG.icons}${encodeURIComponent(st.icon)}.png" alt="">` : '';
  return `<span class="station">${icon}${esc(st.name[S.lang] || st.name.en)}</span>`;
}

function typeLabel(item) {
  if (item.type === 'Building' && /Decoration/i.test(item.id)) return S.lang === 'pt' ? 'Decoração' : 'Decoration';
  return t('types')[item.type] || '';
}

// ------------------------------------------------------------------ how to get (sources) / used in
const SRC_KIND = {
  craft: { i: '⚒', pt: 'Criar', en: 'Craft' },
  vendor: { i: '🪙', pt: 'Comprar', en: 'Buy' },
  mine: { i: '⛏', pt: 'Minerar', en: 'Mine' },
  tree: { i: '🪓', pt: 'Cortar', en: 'Chop' },
  gather: { i: '🌿', pt: 'Coletar', en: 'Gather' },
  break: { i: '🔨', pt: 'Quebrar', en: 'Break' },
  salvage: { i: '🏺', pt: 'Escavar', en: 'Salvage' },
  farm: { i: '🌱', pt: 'Plantar', en: 'Farm' },
  fish: { i: '🎣', pt: 'Pescar', en: 'Fish' },
  drop: { i: '⚔', pt: 'Derrotar', en: 'Defeat' },
  chest: { i: '🧰', pt: 'Baús', en: 'Chests' },
  agility: { i: '🏅', pt: 'Agilidade', en: 'Agility' },
  quest: { i: '📜', pt: 'Missões', en: 'Quests' },
};
const kindLabel = (k) => SRC_KIND[k] ? `${SRC_KIND[k].i} ${SRC_KIND[k][S.lang]}` : k;
function srcDetail(s) {
  const parts = [];
  if (s.min != null) parts.push(s.max != null ? `${s.min}–${s.max}` : `${s.min}`);
  if (s.p != null) parts.push(`${s.p < 0.01 ? '<1' : Math.round(s.p * 100)}%`);
  return parts.join(' · ');
}
// All ways to get an item, grouped by kind: crafting, vendors, then world sources.
function howToGet(item) {
  const groups = [];
  const rec = (item.recipes || []).map(r => S.db.recipes[r]);
  const crafts = rec.filter(r => !isVendorOnly(r));
  const buys = rec.filter(r => isVendorOnly(r));
  const ing = (r) => r.in.map(x => `${x.n} ${nm(S.db.items[x.item])}`).join(', ');
  const stName = (r) => r.stations[0] ? (S.db.stations[r.stations[0]]?.name[S.lang] || '') : '';
  if (crafts.length) groups.push({ k: 'craft', list: crafts.map(r => ({ name: stName(r) || t('build'), detail: ing(r) })) });
  if (buys.length) groups.push({ k: 'vendor', list: buys.map(r => ({ name: stName(r), detail: ing(r) })) });
  for (const s of item.src || []) {
    let g = groups.find(x => x.k === s.k);
    if (!g) groups.push(g = { k: s.k, list: [] });
    g.list.push({ name: s.from[S.lang] || s.from.en, detail: srcDetail(s) });
  }
  return groups;
}
// One-line hint for raw materials: "⛏ Rochedo (10–16)"
function srcHint(item, max = 2) {
  const list = (item.src || []).slice(0, max);
  if (!list.length) {
    const buy = (item.recipes || []).map(r => S.db.recipes[r]).find(isVendorOnly);
    return buy ? `${SRC_KIND.vendor.i} ${S.db.stations[buy.stations[0]]?.name[S.lang] || ''}` : '';
  }
  return list.map(s => `${SRC_KIND[s.k]?.i || ''} ${s.from[S.lang] || s.from.en}${s.min != null || s.p != null ? ` (${srcDetail(s)})` : ''}`).join(' · ');
}

function renderHowTo(item) {
  const el = $('#howto');
  if (!el) return;
  const groups = howToGet(item);
  const used = (item.used || []).filter(id => S.db.items[id]);
  const open = S.howtoOpen ?? true;
  const rows = groups.map(g => `
    <div class="howto-group">
      <div class="howto-kind">${esc(kindLabel(g.k))}</div>
      <div class="howto-list">${g.list.slice(0, S.howtoAll ? 99 : 6).map(x =>
        `<span class="howto-chip"><b>${esc(x.name)}</b>${x.detail ? ` <span class="muted">${esc(x.detail)}</span>` : ''}</span>`).join('')}
        ${g.list.length > 6 && !S.howtoAll ? `<button class="link-btn" data-howto-all>+${g.list.length - 6}</button>` : ''}</div>
    </div>`).join('');
  const usedHtml = used.length ? `
    <div class="howto-group">
      <div class="howto-kind">🔁 ${esc(t('usedIn'))} <span class="muted">(${used.length}${used.length >= 60 ? '+' : ''})</span></div>
      <div class="howto-list used">${used.slice(0, S.usedAll ? 60 : 14).map(id => `<span class="used-chip" data-goto="${esc(id)}">${slot(S.db.items[id], 'xs')}${esc(nm(S.db.items[id]))}</span>`).join('')}
        ${used.length > 14 && !S.usedAll ? `<button class="link-btn" data-used-all>+${used.length - 14}</button>` : ''}</div>
    </div>` : '';
  el.innerHTML = `
    <button class="howto-head" data-howto-toggle>${open ? '▾' : '▸'} ${esc(t('howTo'))}</button>
    ${open ? `<div class="howto-body">${rows || `<div class="empty-note">${esc(t('noSources'))}</div>`}${usedHtml}</div>` : ''}`;
}

// ------------------------------------------------------------------ inventory pool
function rebuildPool() {
  S.pool = new Map();
  if (!S.inv) return;
  for (const src of S.inv.sources) {
    if (S.kindsOff.has(src.kind)) continue;
    for (const it of src.items) {
      const id = itemIdOf(it);
      if (id) S.pool.set(id, (S.pool.get(id) || 0) + it.count);
    }
  }
}
const haveOf = (id) => S.pool.get(id) || 0;
// live mod sends the ItemData asset path; saves send the PersistenceID
function itemIdOf(it) { return S.db.guidToItem[it.guid] || (it.path && S.db.items[it.path] ? it.path : null); }

function recipesFor(id) { return S.db.items[id]?.recipes || []; }
function chosenRecipe(id) {
  const c = S.choice[id];
  if (c === 'gather') return null;
  const list = recipesFor(id);
  if (c && list.includes(c)) return S.db.recipes[c];
  // default: first real crafting recipe; items only sold by merchants default to "gather"
  const rid = list.find(r => !isVendorOnly(S.db.recipes[r]));
  return rid ? S.db.recipes[rid] : null;
}
function isVendorOnly(r) { return r.stations.length > 0 && r.stations.every(s => s.startsWith('vendor:')); }
function isUnlocked(r) {
  const u = S.inv?.unlocks;
  if (!u || !r?.guid) return true;
  return r.stations.includes('build') ? u.buildings.includes(r.guid) : u.recipes.includes(r.guid);
}

// ------------------------------------------------------------------ planner
// Tree: greedy allocation from a shared copy of the pool, depth-first.
function buildTree(rootId, qty) {
  const pool = new Map(S.pool);
  const expand = (id, need, path, isRoot) => {
    const avail = isRoot ? 0 : (pool.get(id) || 0);
    const use = Math.min(avail, need);
    if (!isRoot) pool.set(id, avail - use);
    const rem = need - use;
    const node = { id, need, have: haveOf(id), use, rem, children: [], recipe: null, crafts: 0 };
    const r = chosenRecipe(id);
    if (rem > 0 && r) {
      if (path.has(id) || path.size > 20) { node.cycle = true; return node; }
      const out = r.out.find(o => o.item === id)?.n || 1;
      node.recipe = r;
      node.crafts = Math.ceil(rem / out);
      node.surplus = node.crafts * out - rem;
      const p2 = new Set(path).add(id);
      node.children = r.in.map(i => expand(i.item, i.n * node.crafts, p2, false));
    }
    node.ok = rem === 0 || (node.recipe && node.children.every(c => c.ok));
    return node;
  };
  return expand(rootId, qty, new Set(), true);
}

// Summary: exact totals, aggregating demand per item before crafting (topological order).
function buildPlan(rootId, qty) {
  const order = [];
  const seen = new Set();
  const onStack = new Set();
  const visit = (id) => {
    if (seen.has(id)) return;
    seen.add(id); onStack.add(id);
    const r = chosenRecipe(id);
    if (r) for (const i of r.in) if (!onStack.has(i.item)) visit(i.item);
    onStack.delete(id);
    order.push(id);
  };
  visit(rootId);
  order.reverse(); // parents before children
  const need = new Map([[rootId, qty]]);
  const steps = [];
  const gather = [];
  const pool = new Map(S.pool);
  for (const id of order) {
    const n = need.get(id) || 0;
    if (!n) continue;
    const avail = id === rootId ? 0 : (pool.get(id) || 0);
    const use = Math.min(avail, n);
    const rem = n - use;
    const r = chosenRecipe(id);
    if (rem > 0 && r) {
      const out = r.out.find(o => o.item === id)?.n || 1;
      const crafts = Math.ceil(rem / out);
      steps.push({ id, recipe: r, crafts, makes: crafts * out });
      for (const i of r.in) need.set(i.item, (need.get(i.item) || 0) + i.n * crafts);
    } else if (rem > 0) {
      gather.push({ id, n: rem, have: avail });
    }
  }
  steps.reverse(); // leaves first
  return { steps, gather };
}

// ------------------------------------------------------------------ rendering: target + tree
function render() {
  document.documentElement.lang = S.lang === 'pt' ? 'pt-BR' : 'en';
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  document.title = t('title');
  $('#langBtn').textContent = S.lang.toUpperCase();
  renderStatus();
  renderSources();
  renderCraft();
  if (!$('#view-inv').hidden) renderInventory();
}

function renderCraft() {
  const item = S.target && S.db.items[S.target];
  const targetEl = $('#target');
  if (!item) {
    targetEl.className = 'target empty';
    targetEl.innerHTML = `<div class="placeholder"><div class="placeholder-title">${esc(t('emptyTitle'))}</div><div class="placeholder-sub">${esc(t('emptySub'))}</div></div>`;
    $('#tree').innerHTML = '';
    $('#howto').innerHTML = '';
    $('#missing').innerHTML = '';
    $('#steps').innerHTML = '';
    return;
  }
  const tree = buildTree(item.id, S.qty);
  const plan = buildPlan(item.id, S.qty);
  const direct = tree.children.every(c => c.rem === 0);
  const verdict = !tree.recipe ? '' : direct
    ? `<div class="verdict ok">✔ ${esc(t('canCraftNow'))}</div>`
    : tree.ok ? `<div class="verdict ok">✔ ${esc(t('ready'))}</div>` : `<div class="verdict bad">✖ ${esc(t('notReady'))}</div>`;
  targetEl.className = 'target';
  targetEl.innerHTML = `
    ${slot(item, 'lg')}
    <div class="target-info">
      <div class="target-name">${esc(nm(item))}</div>
      <div class="target-sub">${esc(alt(item))}${typeLabel(item) ? ' · ' + esc(typeLabel(item)) : ''} · ${esc(t('youHave'))}: ${fmt(haveOf(item.id))}</div>
      ${item.desc ? `<div class="target-desc">${esc(item.desc[S.lang] || item.desc.en)}</div>` : ''}
      ${verdict}
    </div>
    <div class="qty-box">
      <button data-q="-1">−</button><input id="qty" type="number" min="1" value="${S.qty}"><button data-q="1">+</button>
    </div>`;
  renderHowTo(item);
  $('#tree').innerHTML = tree.recipe || tree.cycle ? renderNode(tree, true, '0') : '';

  $('#missing').innerHTML = plan.gather.length
    ? plan.gather.map(g => {
      const it = S.db.items[g.id];
      const hint = srcHint(it, 1);
      return `<div class="mat" data-goto="${esc(g.id)}">${slot(it, 'sm')}<div><div class="mat-name">${esc(nm(it))}</div><div class="mat-n">${fmt(g.n)}${g.have ? ` <span class="muted">(${esc(t('have'))} ${fmt(g.have)})</span>` : ''}</div>${hint ? `<div class="mat-src">${esc(hint)}</div>` : ''}</div></div>`;
    }).join('')
    : `<div class="empty-note">${esc(t('allCollected'))}</div>`;

  $('#steps').innerHTML = plan.steps.length
    ? plan.steps.map(s => {
      const it = S.db.items[s.id];
      const st = s.recipe.stations[0];
      return `<li>${slot(it, 'sm')}<div class="st-main"><div>${esc(t('craft'))} <b>${fmt(s.makes)}×</b> ${esc(nm(it))}</div><div class="st-sub">${s.crafts}× ${st ? stationLabel(st) : ''}</div></div></li>`;
    }).join('')
    : `<li class="empty-note" style="counter-increment:none">${esc(t('noSteps'))}</li>`;
}

function renderNode(n, isRoot, key) {
  const item = S.db.items[n.id];
  const hasKids = n.children.length > 0;
  const closed = S.closed.has(key);
  const r = n.recipe;
  const list = recipesFor(n.id);
  let meta = '';
  if (r) {
    const out = r.out.find(o => o.item === n.id)?.n || 1;
    meta += r.stations.length ? r.stations.slice(0, 2).map(stationLabel).join(' / ') : '';
    meta += ` · ${n.crafts}× ${esc(t('craft'))}${out > 1 ? ` (${esc(t('makes'))} ${out})` : ''}`;
    if (n.surplus) meta += ` · ${esc(t('surplus'))} ${n.surplus}`;
    if (!isUnlocked(r)) meta += ` · <span class="locked">🔒 ${esc(t('locked'))}</span>`;
  }
  if (isRoot ? list.length > 1 : list.length > 0) {
    const cur = r ? r.id : 'gather';
    const opts = list.map((rid, i) => {
      const rr = S.db.recipes[rid];
      const ins = rr.in.map(x => `${x.n} ${nm(S.db.items[x.item])}`).join(', ');
      const st = rr.stations[0] ? (S.db.stations[rr.stations[0]]?.name[S.lang] || '') : '';
      const label = isVendorOnly(rr) ? `${t('buy')} (${st}): ${ins}` : `${t('recipe')} ${i + 1}: ${ins}${st ? ' — ' + st : ''}`;
      return `<option value="${esc(rid)}" ${rid === cur ? 'selected' : ''}>${esc(label)}</option>`;
    });
    if (!isRoot) opts.push(`<option value="gather" ${cur === 'gather' ? 'selected' : ''}>${esc(t('gather'))}</option>`);
    meta += ` <select class="recipe-pick" data-item="${esc(n.id)}">${opts.join('')}</select>`;
  }
  if (n.cycle) meta += ` <span class="cycle">(${esc(t('cycle'))})</span>`;
  if (!r && !isRoot) {
    const hint = srcHint(item, 2);
    if (hint) meta += `<span class="src-hint">${esc(hint)}</span>`;
  }

  let haveTxt = '';
  let haveCls = 'none';
  if (!isRoot) {
    haveCls = n.use >= n.need ? 'ok' : n.use > 0 ? 'part' : 'none';
    haveTxt = `${esc(t('have'))} ${fmt(n.have)}`;
    if (n.rem > 0 && !r) haveTxt += ` · ${esc(t('missing'))} ${fmt(n.rem)}`;
  }
  const check = isRoot ? '' : `<span class="check ${n.ok ? 'ok' : 'bad'}">${n.ok ? '✔' : '✖'}</span>`;
  const row = `
    <div class="node-row">
      <button class="toggle ${hasKids ? '' : 'leaf'} ${closed ? 'closed' : ''}" data-key="${key}">▼</button>
      ${check}
      ${slot(item)}
      <div class="node-main">
        <div class="node-name" data-goto="${esc(n.id)}">${esc(nm(item))}</div>
        <div class="node-meta">${meta}</div>
      </div>
      <div class="count"><div class="need">${fmt(n.need)}</div>${haveTxt ? `<div class="have ${haveCls}">${haveTxt}</div>` : ''}</div>
    </div>`;
  const kids = hasKids && !closed ? `<div class="children">${n.children.map((c, i) => renderNode(c, false, key + '.' + i)).join('')}</div>` : '';
  return `<div class="node">${row}${kids}</div>`;
}

// ------------------------------------------------------------------ status / sources
function ago(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  const v = s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.round(s / 3600)} h`;
  return S.lang === 'pt' ? `há ${v}` : `${v} ago`;
}

function renderStatus() {
  const el = $('#status');
  const inv = S.inv;
  if (!inv) { el.className = 'status'; el.innerHTML = `<span class="dot"></span>${esc(t('noData'))}`; return; }
  if (inv.mode === 'demo') {
    el.className = 'status live';
    el.innerHTML = `<span class="dot"></span>${esc(t('demo'))}`;
  } else if (inv.mode === 'live') {
    el.className = 'status live';
    el.innerHTML = `<span class="dot"></span>${esc(inv.hasPlayer ? t('live') : t('liveNoPlayer'))}`;
    el.title = '';
  } else {
    el.className = 'status save';
    el.innerHTML = `<span class="dot"></span>${esc(t('saveMode'))}: ${esc(inv.world || '?')} · ${esc(ago(inv.updated))}`;
    el.title = t('srcNoteSave');
  }
}

function renderSources() {
  const inv = S.inv;
  const el = $('#sources');
  if (!inv) { el.innerHTML = ''; return; }
  const kinds = ['inventory', 'equipped', 'personal', 'storage', 'world'];
  const rows = [];
  for (const k of kinds) {
    const srcs = inv.sources.filter(s => s.kind === k);
    if (!srcs.length && k !== 'inventory' && k !== 'storage') continue;
    const n = srcs.reduce((a, s) => a + s.items.reduce((b, i) => b + i.count, 0), 0);
    const sub = k === 'storage' || k === 'world' ? ` <span class="muted">(${srcs.length} ${esc(t('containers'))})</span>` : '';
    rows.push(`<label class="src"><input type="checkbox" data-kind="${k}" ${S.kindsOff.has(k) ? '' : 'checked'}>${esc(t('k_' + k))}${sub}<span class="src-n">${fmt(n)}</span></label>`);
  }
  if (inv.mode === 'save' && inv.worlds?.length > 1) {
    const opts = inv.worlds.map(w => `<option ${w.name === inv.world ? 'selected' : ''}>${esc(w.name)}</option>`).join('');
    rows.push(`<label class="src">${S.lang === 'pt' ? 'Mundo' : 'World'}: <select id="worldPick" class="recipe-pick">${opts}</select></label>`);
  }
  rows.push(`<div class="src-note">${esc(t({ live: 'srcNoteLive', demo: 'srcNoteDemo' }[inv.mode] || 'srcNoteSave'))}</div>`);
  el.innerHTML = rows.join('');
}

// ------------------------------------------------------------------ inventory tab
function containerName(src) {
  if (src.kind !== 'storage' && src.kind !== 'world') return t('k_' + src.kind);
  const it = src.item && S.db.items[src.item];
  const base = it ? nm(it) : (src.cls || src.label || '?').replace(/^BP_/, '').replace(/_C$/, '').replace(/_/g, ' ');
  return src.dist ? `${base} · ${Math.round(src.dist)} m` : base;
}

function renderInventory() {
  const inv = S.inv;
  const f = norm($('#invFilter').value);
  if (!inv) { $('#invGrid').innerHTML = ''; return; }
  let total = 0;
  const groups = inv.sources
    .filter(s => !S.kindsOff.has(s.kind))
    .slice().sort((a, b) => ['inventory', 'equipped', 'personal', 'storage', 'world'].indexOf(a.kind) - ['inventory', 'equipped', 'personal', 'storage', 'world'].indexOf(b.kind) || (a.dist || 0) - (b.dist || 0))
    .map(src => {
      const merged = new Map();
      for (const it of src.items) {
        const id = itemIdOf(it);
        if (!id) continue;
        merged.set(id, (merged.get(id) || 0) + it.count);
      }
      const cells = [...merged].filter(([id]) => !f || norm(S.db.items[id].name.pt + ' ' + S.db.items[id].name.en).includes(f))
        .map(([id, n]) => { total += n; return slot(S.db.items[id], '', n > 1 ? fmt(n) : null).replace('class="slot', `data-goto="${esc(id)}" class="slot`); });
      if (!cells.length) return '';
      return `<div class="inv-group"><h3>${esc(containerName(src))}<span class="muted">${cells.length}</span></h3><div class="grid">${cells.join('')}</div></div>`;
    }).join('');
  $('#invGrid').innerHTML = groups || `<div class="empty-note">${esc(t('noResults'))}</div>`;
  $('#invSummary').textContent = `${fmt(total)} ${t('total')}`;
}

// ------------------------------------------------------------------ search
function buildSearchIndex() {
  S.searchIndex = Object.values(S.db.items).map(it => ({ it, pt: norm(it.name.pt), en: norm(it.name.en) }));
}

function search(q) {
  const nq = norm(q);
  if (!nq) return [];
  const words = nq.split(' ');
  const res = [];
  for (const e of S.searchIndex) {
    let best = 99;
    for (const s of [e.pt, e.en]) {
      if (!words.every(w => s.includes(w))) continue;
      const sc = s === nq ? 0 : s.startsWith(nq) ? 1 : s.split(' ').some(w => w.startsWith(words[0])) ? 2 : 3;
      best = Math.min(best, sc);
    }
    if (best === 99) continue;
    const it = e.it;
    const score = best * 10 + (it.recipes?.length ? 0 : 4) + (it.junk ? 50 : 0) + (it.type === 'Building' && /Decoration/i.test(it.id) ? 3 : 0) + nm(it).length / 100;
    res.push({ it, score });
  }
  res.sort((a, b) => a.score - b.score);
  // collapse exact duplicates (same name + icon + type)
  const seen = new Set();
  return res.filter(r => { const k = r.it.name.en + '|' + r.it.type + '|' + r.it.icon; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 40).map(r => r.it);
}

let resultSel = 0;
function renderResults() {
  const q = $('#search').value;
  const list = search(q);
  const el = $('#results');
  if (!q.trim()) { el.hidden = true; return; }
  el.hidden = false;
  resultSel = Math.min(resultSel, Math.max(0, list.length - 1));
  el.innerHTML = list.length ? list.map((it, i) => {
    const have = haveOf(it.id);
    const r0 = chosenRecipe(it.id);
    const where = r0 ? (r0.stations[0] ? S.db.stations[r0.stations[0]]?.name[S.lang] || '' : '') : srcHint(it, 1);
    return `<div class="result ${i === resultSel ? 'sel' : ''}" data-id="${esc(it.id)}">
      ${slot(it, 'sm')}
      <div class="names"><div class="n1">${esc(nm(it))}</div><div class="n2">${esc(alt(it))}${where ? ' · ' + esc(where) : ''}</div></div>
      ${have ? `<span class="badge have-badge">${esc(t('have'))} ${fmt(have)}</span>` : ''}
      ${typeLabel(it) ? `<span class="badge">${esc(typeLabel(it))}</span>` : ''}
    </div>`;
  }).join('') : `<div class="empty-note" style="padding:12px">${esc(t('noResults'))}</div>`;
}

function selectTarget(id) {
  S.target = id;
  S.howtoAll = false;
  S.usedAll = false;
  S.qty = 1;
  S.closed.clear();
  LS.set('target', id); LS.set('qty', 1);
  $('#search').value = '';
  $('#results').hidden = true;
  showTab('craft');
  renderCraft();
  $('#tree').parentElement.scrollTop = 0;
}

function showTab(tab) {
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $('#view-craft').hidden = tab !== 'craft';
  $('#view-inv').hidden = tab !== 'inv';
  if (tab === 'inv') renderInventory();
}

// ------------------------------------------------------------------ tooltip
function showTip(el, ev) {
  const id = el.dataset.tip;
  const it = id && S.db.items[id];
  const tip = $('#tooltip');
  if (!it) { tip.hidden = true; return; }
  tip.innerHTML = `<div class="tt-name">${esc(nm(it))}</div><div class="tt-alt">${esc(alt(it))}${typeLabel(it) ? ' · ' + esc(typeLabel(it)) : ''}</div>
    ${it.desc ? `<div class="tt-desc">${esc(it.desc[S.lang] || it.desc.en)}</div>` : ''}
    <div class="tt-have">${esc(t('youHave'))}: <b>${fmt(haveOf(it.id))}</b></div>
    ${(it.src || []).length ? `<div class="tt-src">${(it.src || []).slice(0, 3).map(x => `<div>${esc(SRC_KIND[x.k]?.i || '')} ${esc(x.from[S.lang] || x.from.en)} <span class="muted">${esc(srcDetail(x))}</span></div>`).join('')}</div>` : ''}`;
  tip.hidden = false;
  const r = tip.getBoundingClientRect();
  let x = ev.clientX + 16, y = ev.clientY + 16;
  if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - 12;
  if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - 12;
  tip.style.left = x + 'px'; tip.style.top = y + 'px';
}

// ------------------------------------------------------------------ data loading
async function loadState() {
  const world = LS.get('world', '');
  try {
    const r = await fetch(CFG.state + (world && CFG.events ? `?world=${encodeURIComponent(world)}` : ''));
    S.inv = await r.json();
  } catch {
    S.inv = null;
  }
  rebuildPool();
  render();
  if ($('#search').value) renderResults();
}

async function init() {
  if (!isElectron) document.body.classList.add('browser');
  S.db = await (await fetch(CFG.db)).json();
  buildSearchIndex();
  if (S.target && !S.db.items[S.target]) S.target = null;
  // deep link: ?item=Bronze%20Pickaxe (or the Portuguese name)
  const wanted = norm(new URLSearchParams(location.search).get('item') || '');
  if (wanted) {
    const hit = S.searchIndex.find(e => (e.en === wanted || e.pt === wanted) && e.it.recipes?.length) || search(wanted)[0];
    if (hit) { S.target = (hit.it || hit).id; S.qty = 1; }
  }
  await loadState();
  if (CFG.events) {
    try {
      const es = new EventSource(CFG.events);
      es.addEventListener('changed', () => loadState());
    } catch { setInterval(loadState, 10000); }
  }
  setInterval(renderStatus, 5000);
  $('#search').focus();
}

// ------------------------------------------------------------------ events
document.addEventListener('input', (e) => {
  if (e.target.id === 'search') { resultSel = 0; renderResults(); }
  if (e.target.id === 'invFilter') renderInventory();
  if (e.target.id === 'qty') {
    const v = Math.max(1, Math.min(99999, parseInt(e.target.value, 10) || 1));
    S.qty = v; LS.set('qty', v);
    clearTimeout(S._qt); S._qt = setTimeout(() => { renderCraft(); const q = $('#qty'); q.focus(); q.setSelectionRange?.(99, 99); }, 250);
  }
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.classList.contains('recipe-pick') && el.dataset.item) {
    S.choice[el.dataset.item] = el.value; LS.set('choice', S.choice);
    renderCraft();
  }
  if (el.dataset.kind) {
    if (el.checked) S.kindsOff.delete(el.dataset.kind); else S.kindsOff.add(el.dataset.kind);
    LS.set('kindsOff', [...S.kindsOff]);
    rebuildPool(); render();
  }
  if (el.id === 'worldPick') { LS.set('world', el.value); loadState(); }
});

document.addEventListener('click', (e) => {
  const res = e.target.closest('.result');
  if (res) return selectTarget(res.dataset.id);
  const q = e.target.closest('[data-q]');
  if (q) { S.qty = Math.max(1, S.qty + Number(q.dataset.q)); LS.set('qty', S.qty); return renderCraft(); }
  const tg = e.target.closest('.toggle:not(.leaf)');
  if (tg) { const k = tg.dataset.key; S.closed.has(k) ? S.closed.delete(k) : S.closed.add(k); return renderCraft(); }
  if (e.target.closest('[data-howto-toggle]')) { S.howtoOpen = !(S.howtoOpen ?? true); LS.set('howtoOpen', S.howtoOpen); return renderHowTo(S.db.items[S.target]); }
  if (e.target.closest('[data-howto-all]')) { S.howtoAll = true; return renderHowTo(S.db.items[S.target]); }
  if (e.target.closest('[data-used-all]')) { S.usedAll = true; return renderHowTo(S.db.items[S.target]); }
  const go = e.target.closest('[data-goto]');
  if (go) return selectTarget(go.dataset.goto);
  const tab = e.target.closest('.tab');
  if (tab) return showTab(tab.dataset.tab);
  if (e.target.id === 'langBtn') { S.lang = S.lang === 'pt' ? 'en' : 'pt'; LS.set('lang', S.lang); render(); if ($('#search').value) renderResults(); return; }
  if (e.target.id === 'hideBtn') return window.codex?.hide();
  if (e.target.id === 'quitBtn') return window.codex?.hide(); // fully quit only from the tray menu
  if (!e.target.closest('.search-wrap')) $('#results').hidden = true;
});

document.addEventListener('keydown', (e) => {
  const el = $('#results');
  if (document.activeElement?.id === 'search' && !el.hidden) {
    const items = el.querySelectorAll('.result');
    if (e.key === 'ArrowDown') { resultSel = Math.min(items.length - 1, resultSel + 1); renderResults(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { resultSel = Math.max(0, resultSel - 1); renderResults(); e.preventDefault(); }
    if (e.key === 'Enter' && items[resultSel]) selectTarget(items[resultSel].dataset.id);
  }
  if (e.key === 'Escape') {
    if (!el.hidden) { el.hidden = true; return; }
    window.codex?.hide();
  }
  if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') { e.preventDefault(); $('#search').focus(); }
});

document.addEventListener('mouseover', (e) => {
  const s = e.target.closest('[data-tip]');
  if (s) showTip(s, e); else $('#tooltip').hidden = true;
});
document.addEventListener('mousemove', (e) => { if (!$('#tooltip').hidden && e.target.closest('[data-tip]')) showTip(e.target.closest('[data-tip]'), e); });

if (window.codex) {
  window.codex.hotkey().then(k => { $('#hideBtn').title = (S.lang === 'pt' ? 'Esconder' : 'Hide') + ` (${k} / Esc)`; });
}
window.codex?.onShow?.(() => { $('#search').focus(); $('#search').select(); loadState(); });

init();
