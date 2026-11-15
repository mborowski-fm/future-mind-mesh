# FM symbol, clean: the original's big faces as planes, every bevel gone, sharp corners, except
# the bend where the diagonal turns into the bottom bar: two true arcs, measured on the original.
# Writes public/models/future-mind-symbol-clean.obj, with normals so the bend shades smooth.
#   python scripts/clean.py [segments per arc, default 16]
import collections, math, os, sys

SEG = int(sys.argv[1]) if len(sys.argv) > 1 else 16

# planes measured on the original (its large faces, not the bevels)
L, R, E = -370.518, -207.5, 381.103          # post left, post right, bar end
Y0, BAR, BOX, TOP = 0.0, 92.284, 310.472, 444.132  # bottom, bar top, top beam underside, top
Z0, Z1, Z2 = -62.0, 93.167, 505.212          # back, front, top beam front

# the bend: circles fitted to the original's curved strips, each tangent to its horizontal
# (deviation from the original's points: top 0.36, bottom 0.26, inside the old 0.6 bevel)
TC, TR = (58.15, BAR + 105.01), 105.01       # top (inner) arc, centre and radius
BC, BR = (-17.19, Y0 + 118.30), 118.30       # bottom (outer) arc

# upper diagonal: from the top beam's corner (R, BOX), tangent to the top arc
px, py = R, BOX
dx, dy = TC[0] - px, TC[1] - py
d = math.hypot(dx, dy)
a = math.asin(TR / d)
ang = math.atan2(dy, dx) - a                 # the tangent with the centre to its left
U = (math.cos(ang), math.sin(ang))           # direction down the diagonal
N = (-U[1], U[0])                            # its left normal, toward the arcs' centres
T_top = (TC[0] - N[0] * TR, TC[1] - N[1] * TR)
# lower diagonal: parallel to it (a beam of one width), tangent to the bottom arc
T_bot = (BC[0] - N[0] * BR, BC[1] - N[1] * BR)
YL = T_bot[1] + (R - T_bot[0]) * U[1] / U[0]  # where it meets the post

def arc(c, r, a0, a1):
    return [(c[0] + r * math.cos(a0 + (a1 - a0) * i / SEG), c[1] + r * math.sin(a0 + (a1 - a0) * i / SEG)) for i in range(SEG + 1)]
down = -math.pi / 2
tn = math.atan2(-N[1], -N[0])                # angle of the tangent points seen from the centres
bottom_arc = arc(BC, BR, tn, down)           # from the diagonal to the floor
top_arc = arc(TC, TR, down, tn)              # from the bar top to the diagonal
ARC = {p: (BC, 1) for p in bottom_arc}       # outward normal: away from the bottom centre
ARC.update({p: (TC, -1) for p in top_arc})   # toward the top centre

V, N_, F = [], [], []
def v(p):
    p = tuple(round(c, 4) for c in p)
    if p not in V: V.append(p)
    return V.index(p) + 1
def n(q):
    q = tuple(round(c, 5) for c in q)
    if q not in N_: N_.append(q)
    return N_.index(q) + 1
def newell(pts):
    x = y = z = 0.0
    for (ax, ay, az), (bx, by, bz) in zip(pts, pts[1:] + pts[:1]):
        x += (ay - by) * (az + bz); y += (az - bz) * (ax + bx); z += (ax - bx) * (ay + by)
    k = math.sqrt(x * x + y * y + z * z)
    return (x / k, y / k, z / k)
def face(*pts, normals=None):
    pts = list(pts)
    ns = normals or [newell(pts)] * len(pts)
    F.append([(v(p), n(q)) for p, q in zip(pts, ns)])
def smooth(p):
    c, s = ARC[p]
    k = math.hypot(p[0] - c[0], p[1] - c[1])
    return (s * (p[0] - c[0]) / k, s * (p[1] - c[1]) / k, 0.0)

# profile below the top beam, counter-clockwise seen from the front (+z)
low = [(L, Y0), (R, Y0), (R, YL)] + bottom_arc + [(E, Y0), (E, BAR)] + top_arc + [(R, BOX), (L, BOX)]
face(*[(x, y, Z0) for x, y in reversed(low[:-1] + [(R, TOP), (L, TOP)])])
face(*[(x, y, Z1) for x, y in low])
for p, q in zip(low, low[1:] + low[:1]):
    if p in ((R, BOX), (L, BOX)) or p[0] == q[0] == L: continue
    quad = [(p[0], p[1], Z0), (q[0], q[1], Z0), (q[0], q[1], Z1), (p[0], p[1], Z1)]
    on_arc = p in ARC and q in ARC and ARC[p] is ARC[q]
    face(*quad, normals=[smooth(p), smooth(q), smooth(q), smooth(p)] if on_arc else None)
# left side x = L: one L-shaped face from the floor to the top, back to the beam's front
face((L, Y0, Z0), (L, Y0, Z1), (L, BOX, Z1), (L, BOX, Z2), (L, TOP, Z2), (L, TOP, Z0))
# right side of the post above the diagonal, back to the beam's front
face((R, BOX, Z0), (R, TOP, Z0), (R, TOP, Z2), (R, BOX, Z2), (R, BOX, Z1))
# top, the beam's underside and front
face((L, TOP, Z0), (L, TOP, Z2), (R, TOP, Z2), (R, TOP, Z0))
face((L, BOX, Z1), (R, BOX, Z1), (R, BOX, Z2), (L, BOX, Z2))
face((L, BOX, Z2), (R, BOX, Z2), (R, TOP, Z2), (L, TOP, Z2))

# checks: every edge used once each way (closed, consistent), positive volume (faces outward)
idx = [[i - 1 for i, _ in f] for f in F]
de = collections.Counter((f[i], f[(i + 1) % len(f)]) for f in idx for i in range(len(f)))
bad = [e for e in de if de[e] != 1 or de[(e[1], e[0])] != 1]
vol = 0.0
for f in idx:
    a = V[f[0]]
    for i in range(1, len(f) - 1):
        b, c = V[f[i]], V[f[i + 1]]
        vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6
print(f'{len(V)} vertices, {len(F)} faces, bad edges {len(bad)}, volume {vol:.0f}')
print(f'diagonal {math.degrees(-ang):.2f} deg, width {(N[0] * (T_top[0] - T_bot[0]) + N[1] * (T_top[1] - T_bot[1])):.2f}, meets the post at y {YL:.2f}')
if bad: print(bad[:10]); sys.exit(1)

out = os.path.join(os.path.dirname(__file__), '..', 'public', 'models', 'future-mind-symbol-clean.obj')
with open(out, 'w') as o:
    o.write(f'# FM symbol, clean: no bevels, sharp corners, the bend as two true arcs ({SEG} segments each)\no future_mind_symbol_clean\n')
    for p in V: o.write('v %.4f %.4f %.4f\n' % p)
    for q in N_: o.write('vn %.5f %.5f %.5f\n' % q)
    for f in F: o.write('f ' + ' '.join(f'{i}//{k}' for i, k in f) + '\n')
print('wrote', os.path.normpath(out))
