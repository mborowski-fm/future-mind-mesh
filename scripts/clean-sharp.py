# FM symbol, first cleaning (kept as it was): the original's big faces as planes, every bevel
# and the rounded bend gone, the diagonal one straight 45 degree beam.
# Writes public/models/future-mind-symbol-clean-sharp.obj.
import collections, os, sys

L, R, E = -370.518, -207.5, 381.103
Y0, BAR, BOX, TOP = 0.0, 92.284, 310.472, 444.132
Z0, Z1, Z2 = -62.0, 93.167, 505.212
CU = R + BOX
CL = CU - 172.0
XU = CU - BAR
XL = CL - Y0
YL = CL - R

V, F = [], []
def v(x, y, z):
    p = (round(x, 3), round(y, 3), round(z, 3))
    if p not in V: V.append(p)
    return V.index(p)
def face(*pts): F.append([v(*p) for p in pts])

low = [(L, Y0), (R, Y0), (R, YL), (XL, Y0), (E, Y0), (E, BAR), (XU, BAR), (R, BOX), (L, BOX)]
face(*[(x, y, Z0) for x, y in reversed(low[:-1] + [(R, TOP), (L, TOP)])])
face(*[(x, y, Z1) for x, y in low])
for (ax, ay), (bx, by) in zip(low, low[1:] + low[:1]):
    if (ax, ay) == (R, BOX) or (ax, ay) == (L, BOX): continue
    if ax == bx == L: continue
    face((ax, ay, Z0), (bx, by, Z0), (bx, by, Z1), (ax, ay, Z1))
face((L, Y0, Z0), (L, Y0, Z1), (L, BOX, Z1), (L, BOX, Z2), (L, TOP, Z2), (L, TOP, Z0))
face((R, BOX, Z0), (R, TOP, Z0), (R, TOP, Z2), (R, BOX, Z2), (R, BOX, Z1))
face((L, TOP, Z0), (L, TOP, Z2), (R, TOP, Z2), (R, TOP, Z0))
face((L, BOX, Z1), (R, BOX, Z1), (R, BOX, Z2), (L, BOX, Z2))
face((L, BOX, Z2), (R, BOX, Z2), (R, TOP, Z2), (L, TOP, Z2))

de = collections.Counter((f[i], f[(i + 1) % len(f)]) for f in F for i in range(len(f)))
bad = [e for e in de if de[e] != 1 or de[(e[1], e[0])] != 1]
print(f'{len(V)} vertices, {len(F)} faces, bad edges {len(bad)}')
if bad: sys.exit(1)
out = os.path.join(os.path.dirname(__file__), '..', 'public', 'models', 'future-mind-symbol-clean-sharp.obj')
with open(out, 'w') as o:
    o.write('# FM symbol, first cleaning: no bevels, sharp corners, straight 45 degree diagonal\no future_mind_symbol_clean_sharp\n')
    for p in V: o.write('v %.3f %.3f %.3f\n' % p)
    for f in F: o.write('f ' + ' '.join(str(i + 1) for i in f) + '\n')
print('wrote', os.path.normpath(out))
