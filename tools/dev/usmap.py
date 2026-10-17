import struct,sys
d=open(sys.argv[1],'rb').read()
ver=d[2]; o=3
if ver>=1:
    hv=struct.unpack_from('<i',d,o)[0]; o+=4
    if hv: raise SystemExit('versioning not handled')
comp=d[o]; o+=1; cs,us=struct.unpack_from('<II',d,o); o+=8
assert comp==0
def u8():
    global o; v=d[o]; o+=1; return v
def u16():
    global o; v=struct.unpack_from('<H',d,o)[0]; o+=2; return v
def u32():
    global o; v=struct.unpack_from('<I',d,o)[0]; o+=4; return v
n=u32(); names=[]
for i in range(n):
    l=u16(); names.append(d[o:o+l].decode('utf-8','replace')); o+=l
ne=u32(); enums={}
for i in range(ne):
    nm=names[u32()]; c=u16(); vals=[]
    for j in range(c):
        v=struct.unpack_from('<Q',d,o)[0]; o+=8; vals.append((v,names[u32()]))
    enums[nm]=vals
T=['Byte','Bool','Int','Float','Object','Name','Delegate','Double','Array','Struct','Str','Text','Interface','MCDelegate','WeakObject','LazyObject','AssetObject','SoftObject','UInt64','UInt32','UInt16','Int64','Int16','Int8','Map','Set','Enum','FieldPath','Optional','Utf8Str','AnsiStr']
def ptype():
    t=T[u8()]
    if t=='Enum': inner=ptype(); return f'Enum<{names[u32()]}>'
    if t=='Struct': return f'Struct<{names[u32()]}>'
    if t in('Array','Set','Optional'): return f'{t}<{ptype()}>'
    if t=='Map': k=ptype(); v=ptype(); return f'Map<{k},{v}>'
    return t
ns=u32(); structs={}
for i in range(ns):
    nm=names[u32()]; sup=u32(); sup=None if sup==0xFFFFFFFF else names[sup]
    pc=u16(); spc=u16(); props=[]
    for j in range(spc):
        idx=u16(); arr=u8(); pn=names[u32()]; props.append((pn,ptype(),arr))
    structs[nm]=(sup,props)
for q in sys.argv[2:]:
    for k,(sup,props) in structs.items():
        if q.lower() in k.lower():
            print(f'== {k} : {sup}')
            for p in props: print('   ',p[0],p[1],'' if p[2]==1 else f'[{p[2]}]')

if len(sys.argv)>2 and sys.argv[2]=='--subclasses':
    base=sys.argv[3]
    def isa(k):
        seen=0
        while k and seen<50:
            if k==base: return True
            k=structs.get(k,(None,))[0]; seen+=1
        return False
    print(sorted(k for k in structs if isa(k)))

if len(sys.argv)>2 and sys.argv[2]=='--uses':
    t=sys.argv[3]
    for k,(sup,props) in structs.items():
        for p in props:
            if t in p[1]: print(k, ':', p[0], p[1])
