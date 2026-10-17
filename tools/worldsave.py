"""Read/write helpers for RuneScape: Dragonwilds world saves (SPUD .sav).

Only what the world-backup tool needs: locate the GlobalBuildingManager custom data block
and (de)serialize its "Pces" (building pieces) section.
"""
import struct

def u32(b, o): return struct.unpack_from('<I', b, o)[0]


def chunks(b, o, end):
    """SPUD chunks: 4-char uppercase id + u32 length + payload."""
    while o + 8 <= end:
        cid = b[o:o + 4]
        ln = u32(b, o + 4)
        if not all(65 <= c <= 90 or c == 32 for c in cid) or o + 8 + ln > end:
            return
        yield cid.decode(), o, ln
        o += 8 + ln


def fstr(b, o):
    n = struct.unpack_from('<i', b, o)[0]
    if n == 0:
        return '', o + 4
    return b[o + 4:o + 4 + n - 1].decode('utf-8'), o + 4 + n


def wstr(s):
    if not s:
        return struct.pack('<i', 0)
    e = s.encode('utf-8') + b'\0'
    return struct.pack('<i', len(e)) + e


def find_building_block(b, with_parents=False):
    """Returns (nobj_offset, cust_offset, cust_len) for GlobalBuildingManager in level L_World.
    with_parents=True also returns the offsets of every enclosing chunk (SAVE, LVLS, LEVL, LATS, NOBJ)."""
    save = next(chunks(b, 0, len(b)))
    for cid, o, ln in chunks(b, 8, 8 + save[2]):
        if cid != 'LVLS':
            continue
        for lc, lo, ll in chunks(b, o + 8, o + 8 + ln):
            for c, co, cl in chunks(b, lo + 8 + 4 + u32(b, lo + 8) + 8, lo + 8 + ll):
                if c != 'LATS':
                    continue
                for k, ko, kl in chunks(b, co + 8, co + 8 + cl):
                    if b'GlobalBuildingManager_' in b[ko + 8:ko + 120]:
                        cust = b.index(b'CUST', ko, ko + 8 + kl)
                        res = (ko, cust, u32(b, cust + 4))
                        return res + ([0, o, lo, co, ko],) if with_parents else res
    raise ValueError('GlobalBuildingManager not found')


def generated_piece_id_offset(b, nobj):
    """GlobalBuildingManager PROP chunk: u32 n, n u32 offsets, data. GeneratedPieceID is the 4th property."""
    prop = b.index(b'PROP', nobj)
    n = u32(b, prop + 8)
    offsets = struct.unpack_from(f'<{n}I', b, prop + 12)
    return prop + 12 + 4 * n + offsets[3]


def replace_cust(b, new_body):
    """Swap the GlobalBuildingManager CUST payload and fix the length of every enclosing chunk."""
    ko, cust, cl, parents = find_building_block(b, with_parents=True)
    delta = len(new_body) - cl
    out = bytearray(b[:cust + 8]) + new_body + b[cust + 8 + cl:]
    for off in parents + [cust]:
        struct.pack_into('<I', out, off + 4, u32(out, off + 4) + delta)
    return bytes(out)


def parse_sections(body):
    """CUST payload: u32 size, u8 version, then [4cc][u32 len][data] sections."""
    out = []
    i = 5
    while i < len(body):
        tag = body[i:i + 4].decode('latin1')
        ln = u32(body, i + 4)
        out.append((tag, body[i + 8:i + 8 + ln]))
        i += 8 + ln
    return body[:5], out


def parse_pieces(data):
    pieces = []
    o = 0
    while o < len(data):
        p = {'id': u32(data, o)}
        p['pid'], o = fstr(data, o + 4)
        p['loc'] = list(struct.unpack_from('<3d', data, o)); o += 24
        p['yaw'], p['stab'], p['hp'] = struct.unpack_from('<3f', data, o); o += 12
        n = u32(data, o); o += 4
        items = []
        for _ in range(n):
            s, o = fstr(data, o)
            items.append(s)
        amounts = []
        for _ in range(n):
            amounts.append(list(struct.unpack_from('<2i', data, o))); o += 8
        p['cost'] = [{'item': it, 'need': a[0], 'have': a[1]} for it, a in zip(items, amounts)]
        p['flag'] = data[o]; o += 1
        nn = u32(data, o); o += 4
        p['neighbors'] = list(struct.unpack_from(f'<{nn}I', data, o)); o += 4 * nn
        pieces.append(p)
    if o != len(data):
        raise ValueError(f'Pces parse ended at {o}, expected {len(data)}')
    return pieces


def write_pieces(pieces):
    out = bytearray()
    for p in pieces:
        out += struct.pack('<I', p['id']) + wstr(p['pid'])
        out += struct.pack('<3d', *p['loc']) + struct.pack('<3f', p['yaw'], p['stab'], p['hp'])
        out += struct.pack('<I', len(p['cost']))
        for c in p['cost']:
            out += wstr(c['item'])
        for c in p['cost']:
            out += struct.pack('<2i', c['need'], c['have'])
        out += bytes([p['flag']]) + struct.pack('<I', len(p['neighbors']))
        out += struct.pack(f"<{len(p['neighbors'])}I", *p['neighbors'])
    return bytes(out)


def build_sections(head, sections):
    payload = b''.join(t.encode('latin1') + struct.pack('<I', len(d)) + d for t, d in sections)
    body = bytearray(head) + payload
    struct.pack_into('<I', body, 0, len(body) - 4)
    return bytes(body)


if __name__ == '__main__':
    import sys, json
    b = open(sys.argv[1], 'rb').read()
    ko, cust, cl = find_building_block(b)
    body = b[cust + 8:cust + 8 + cl]
    head, secs = parse_sections(body)
    print('head', head.hex(), [(t, len(d)) for t, d in secs])
    pieces = parse_pieces(dict(secs)['Pces'])
    print('pieces', len(pieces), 'flags', sorted({p['flag'] for p in pieces}))
    print(json.dumps(pieces[:2], indent=1))
    assert write_pieces(pieces) == dict(secs)['Pces'], 'round-trip mismatch'
    assert build_sections(head, secs) == body, 'section round-trip mismatch'
    print('round-trip OK')
