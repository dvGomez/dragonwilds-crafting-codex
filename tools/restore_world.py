"""Rebuild a captured world (e.g. a friend's console world) into a PC world save.

Usage:
  python tools/restore_world.py <template.sav> <out.sav> [capture_dir]

template.sav : a FRESH world created on PC (new world, loaded once, saved) - it is copied, not modified.
capture_dir  : folder with capture_*.json written by the CraftCodex mod
               (default %LOCALAPPDATA%/RSDragonwilds/Saved/CraftCodex/capture)

What is restored: every building piece (type, position, rotation, health, stability).
Building actors (chests, stations, beds...) are spawned by the game from their pieces;
container contents are written to a separate report for now.
"""
import glob
import json
import math
import os
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import worldsave as ws

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NEIGHBOR_RADIUS = 505.0  # cm; covers every real snap link seen in real saves (extra links only add support)


def load_game_data():
    assets = json.load(open(os.path.join(ROOT, 'data', 'extract', 'assets.json'), encoding='utf-8'))
    item_pid = {a['Package']: a['Properties'].get('PersistenceID') for a in assets
                if a['Type'] not in ('RecipeData', 'RuneRecipeData', 'BuildingPieceData') and a.get('Properties')}
    pieces = [a for a in assets if a['Type'] == 'BuildingPieceData'
              and a.get('Properties', {}).get('PersistenceID') and 'DEPRECATED_Prayer' not in a['__path']]
    # BuildingPieceDataIndex (what clients receive) = position in the piece list sorted by PersistenceID, case-insensitive
    index = sorted(pieces, key=lambda a: a['Properties']['PersistenceID'].lower())
    cost = {}
    for a in index:
        reqs = []
        for r in a['Properties'].get('Requirements') or []:
            pkg = (r.get('ItemData') or {}).get('ObjectPath', '').rsplit('.', 1)[0]
            pid = item_pid.get(pkg)
            if pid:
                reqs.append({'item': pid, 'need': r.get('Amount', 1), 'have': r.get('Amount', 1)})
        cost[a['Properties']['PersistenceID']] = reqs
    return [a['Properties']['PersistenceID'] for a in index], cost, {a['Properties']['PersistenceID']: a['Name'] for a in index}


def merge_captures(folder):
    files = sorted(glob.glob(os.path.join(folder, 'capture_*.json')))
    if not files:
        raise SystemExit(f'no capture_*.json in {folder}')
    pieces, actors, invs = {}, {}, {}
    for f in files:  # later captures win
        d = json.load(open(f, encoding='utf-8'))
        if not d['pieces']:  # taken outside the captured world (menu, another world)
            continue
        for p in d['pieces']:
            pieces[p['id']] = p
        for a in d['actors']:
            actors[a['name']] = a
        for i in d['inventories']:
            invs[(i['ownerName'], i['compName'])] = i
    return files, pieces, actors, invs


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    template, out = sys.argv[1], sys.argv[2]
    folder = sys.argv[3] if len(sys.argv) > 3 else os.path.expandvars(r'%LOCALAPPDATA%\RSDragonwilds\Saved\CraftCodex\capture')
    index, cost, names = load_game_data()
    files, cap, actors, invs = merge_captures(folder)
    print(f'{len(files)} captures -> {len(cap)} pieces, {len(actors)} building actors, {len(invs)} inventories')

    # most stable piece of each type is treated as anchored (bForceMaxStability)
    best = {}
    for p in cap.values():
        best[p['idx']] = max(best.get(p['idx'], 0), p['stab'])

    plist = sorted(cap.values(), key=lambda p: p['id'])
    pieces = []
    for p in plist:
        pid = index[p['idx']]
        pieces.append({
            'id': p['id'], 'pid': pid, 'loc': p['loc'], 'yaw': p['yaw'], 'stab': p['stab'], 'hp': p['hp'],
            'cost': [dict(c) for c in cost[pid]], 'flag': 1 if p['stab'] >= best[p['idx']] else 0, 'neighbors': [],
        })
    # neighbors by proximity (server-only data, not replicated to clients)
    for i, a in enumerate(pieces):
        for b_ in pieces[i + 1:]:
            if math.dist(a['loc'], b_['loc']) <= NEIGHBOR_RADIUS:
                a['neighbors'].append(b_['id'])
                b_['neighbors'].append(a['id'])

    b = open(template, 'rb').read()
    ko, cust, cl = ws.find_building_block(b)
    head, secs = ws.parse_sections(b[cust + 8:cust + 8 + cl])
    old = ws.parse_pieces(dict(secs)['Pces'])
    if old:
        print(f'warning: template already has {len(old)} pieces, they will be replaced')
    secs = [(t, ws.write_pieces(pieces) if t == 'Pces' else d) for t, d in secs]
    nb = bytearray(ws.replace_cust(b, ws.build_sections(head, secs)))
    gpo = ws.generated_piece_id_offset(nb, ws.find_building_block(nb)[0])
    struct.pack_into('<I', nb, gpo, max(p['id'] for p in pieces))
    open(out, 'wb').write(nb)

    # sanity: re-parse what we wrote
    ko2, cust2, cl2 = ws.find_building_block(nb)
    check = ws.parse_pieces(dict(ws.parse_sections(nb[cust2 + 8:cust2 + 8 + cl2])[1])['Pces'])
    assert len(check) == len(pieces)
    print(f'wrote {out}: {len(pieces)} pieces, GeneratedPieceID={ws.u32(nb, gpo)}, size {len(b)} -> {len(nb)} bytes')

    report = os.path.splitext(out)[0] + '.containers.json'
    json.dump({'actors': list(actors.values()), 'inventories': list(invs.values())}, open(report, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    # refill plan for the CraftCodex mod (restore.lua): only containers that belong to building actors
    building_names = {a['name'] for a in actors.values()}
    lua = ['return { containers = {']
    n_items = 0
    for inv in invs.values():
        if inv['ownerName'] not in building_names or not inv['loc']:
            continue
        rows = []
        for it in inv['items']:
            pct = it['dur'] / it['maxDur'] if it.get('maxDur') and it['maxDur'] > 0 and it.get('dur') is not None and it['dur'] >= 0 else 1.0
            rows.append('{slot=%d,path=%s,count=%d,pct=%.4f}' % (it['slot'] - 1, json.dumps(it['path']), it['count'], min(1.0, max(0.0, pct))))
        n_items += len(rows)
        lua.append('  {cls=%s,loc={%.2f,%.2f,%.2f},comp=%s,compName=%s,items={%s}},' % (
            json.dumps(inv['owner']), *inv['loc'], json.dumps(inv['comp']), json.dumps(inv['compName']), ','.join(rows)))
    lua.append('} }')
    plan = os.path.splitext(out)[0] + '.plan.lua'
    open(plan, 'w', encoding='utf-8').write('\n'.join(lua) + '\n')
    print(f'refill plan: {len(lua) - 2} containers, {n_items} item stacks -> {plan}')


if __name__ == '__main__':
    main()
