"""Print the structure of a GLB: meshes, morph targets, materials, skin joints, scale."""
import json
import struct
import sys

path = sys.argv[1]
with open(path, 'rb') as f:
    data = f.read()
magic, ver, length = struct.unpack('<III', data[:12])
clen, ctype = struct.unpack('<II', data[12:20])
g = json.loads(data[20:20 + clen])

print('scene nodes:', len(g['nodes']), ' meshes:', len(g.get('meshes', [])), ' skins:', len(g.get('skins', [])),
      ' materials:', len(g.get('materials', [])), ' images:', len(g.get('images', [])), ' animations:', len(g.get('animations', [])))
for i, m in enumerate(g.get('meshes', [])):
    names = m.get('extras', {}).get('targetNames', [])
    prims = m['primitives']
    nt = len(prims[0].get('targets', []))
    print(f'mesh {i} {m.get("name")!r}: {len(prims)} primitive(s), materials {[p.get("material") for p in prims]}, {nt} morph targets')
    if names:
        print('   targets:', ', '.join(names))
for i, mt in enumerate(g.get('materials', [])):
    print(f'material {i}: {mt.get("name")!r} alphaMode={mt.get("alphaMode")} keys={list(mt.keys())}')
for i, s in enumerate(g.get('skins', [])):
    print(f'skin {i}: {len(s["joints"])} joints')
names = [n.get('name', '') for n in g['nodes']]
print('\nnodes:')
for i, n in enumerate(g['nodes']):
    extra = []
    if 'mesh' in n:
        extra.append(f'mesh={n["mesh"]}')
    if 'skin' in n:
        extra.append(f'skin={n["skin"]}')
    t = n.get('translation')
    if t:
        extra.append('t=' + ','.join(f'{x:.3f}' for x in t))
    if n.get('scale'):
        extra.append('s=' + ','.join(f'{x:.3f}' for x in n['scale']))
    print(f'  {i:3} {n.get("name", "")!r} children={n.get("children", [])} {" ".join(extra)}')
