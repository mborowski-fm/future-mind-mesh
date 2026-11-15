// The FM symbol, clean version with the bend, built from parameters (the same geometry as
// scripts/clean.py, whose measured values are the defaults). Two extrusions along z:
//  A, the profile (post, diagonal, the bend's two arcs, the bottom bar), depth `depth`;
//  B, the top beam, the post's top part running forward by `beamLength`.
// B overlaps A over A's depth, so with a bevel the join stays flush (no groove where they meet).
import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const SHAPE_DEFAULTS = {
  postWidth: 163.02,   // the post, left to right
  height: 444.13,      // floor to the top
  beamHeight: 133.66,  // the top beam, its underside to the top
  barLength: 588.6,    // the bottom bar, from the post's right side to its end
  barHeight: 92.28,
  depth: 155.17,       // the profile's extrusion (z)
  beamLength: 412.05,  // how far the top beam runs forward past the profile
  angle: 44.4,         // the diagonal, degrees down from horizontal
  width: 122.44,       // the diagonal's thickness
  topRadius: 105.01,   // the bend: inner arc (top side)
  bottomRadius: 118.3, // the bend: outer arc (bottom side)
  curveSegments: 32,
  bevel: 0,            // bevel size, model units (0 = sharp)
  bevelSegments: 4,
};

// the profile and the numbers derived from it
export function profile(p) {
  const L = 0, R = p.postWidth, E = R + p.barLength;
  const BAR = p.barHeight, TOP = p.height, BOX = TOP - p.beamHeight;
  const a = THREE.MathUtils.degToRad(p.angle);
  const s = Math.sin(a), c = Math.cos(a);
  const N = new THREE.Vector2(s, c); // the diagonal's normal, toward the arcs' centres
  // top arc: tangent to y = BAR and to the upper line through (R, BOX)
  const tr = p.topRadius;
  const tc = new THREE.Vector2(R + (tr - c * (BAR + tr - BOX)) / s, BAR + tr);
  // bottom arc: tangent to y = 0 and to the lower line, `width` below the upper one
  const br = p.bottomRadius;
  const bc = new THREE.Vector2(R + (br - p.width - c * (br - BOX)) / s, br);
  const yl = BOX - p.width / c; // the lower line meets the post
  const phi = Math.atan2(-c, -s); // the tangent points seen from the centres
  const shape = new THREE.Shape();
  shape.moveTo(L, 0);
  shape.lineTo(R, 0);
  shape.lineTo(R, yl);
  shape.absarc(bc.x, bc.y, br, phi, -Math.PI / 2, false);
  shape.lineTo(E, 0);
  shape.lineTo(E, BAR);
  shape.absarc(tc.x, tc.y, tr, -Math.PI / 2, phi, true);
  shape.lineTo(R, BOX);
  shape.lineTo(R, TOP);
  shape.lineTo(L, TOP);
  shape.closePath();
  const beam = new THREE.Shape([new THREE.Vector2(L, BOX), new THREE.Vector2(R, BOX), new THREE.Vector2(R, TOP), new THREE.Vector2(L, TOP)]);
  // sanity: the arcs must sit between the post and the bar's end, the lines must reach them
  const ok = yl > 0 && bc.x - N.x * br > R && tc.x < E && bc.x < E && tc.x - N.x * tr > R;
  return { shape, beam, L, R, E, BAR, TOP, BOX, ok };
}

function extrude(shape, depth, p, segs) {
  const b = Math.min(p.bevel, depth / 2 - 0.01, p.barHeight / 2 - 0.01, p.width / 2 - 0.01);
  const on = b > 0.01;
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: on ? depth - 2 * b : depth,
    curveSegments: segs,
    bevelEnabled: on,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: -b,
    bevelSegments: Math.max(1, Math.round(p.bevelSegments)),
  });
  if (on) g.translate(0, 0, b);
  return g;
}

// texture coordinates in model units: the profile's sides by their length along the outline
// (so the dots run round the diagonal and the bend unbroken), every flat face by its plane
function uvs(geo, outline, near) {
  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  // the outline's cumulative length
  const len = [0];
  for (let i = 1; i < outline.length; i++) len.push(len[i - 1] + outline[i].distanceTo(outline[i - 1]));
  const along = (x, y) => {
    let best = Infinity, s = 0;
    for (let i = 1; i < outline.length; i++) {
      const a = outline[i - 1], b = outline[i];
      const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2));
      const px = a.x + dx * t - x, py = a.y + dy * t - y, d = px * px + py * py;
      if (d < best) { best = d; s = len[i - 1] + Math.sqrt(l2) * t; }
    }
    return [s, Math.sqrt(best)];
  };
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    A.fromBufferAttribute(pos, i); B.fromBufferAttribute(pos, i + 1); C.fromBufferAttribute(pos, i + 2);
    n.subVectors(C, B).cross(B.clone().sub(A)).normalize();
    const cap = Math.abs(n.z) > 0.5;
    const on = cap ? null : [A, B, C].map((q) => along(q.x, q.y));
    // a side lies on the profile's outline when all three corners do (the top beam's
    // underside doesn't: it gets its plane's coordinates)
    const side = on && on.every(([, d]) => d < near);
    for (let k = 0; k < 3; k++) {
      const x = pos.getX(i + k), y = pos.getY(i + k), z = pos.getZ(i + k);
      let u, v;
      if (cap) { u = x; v = y; }
      else if (side) { u = on[k][0]; v = z; }
      else if (Math.abs(n.y) >= Math.abs(n.x)) { u = x; v = z; }
      else { u = z; v = y; }
      uv[(i + k) * 2] = u; uv[(i + k) * 2 + 1] = v;
    }
  }
  geo.setAttribute('fmuv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

export function buildShape(p) {
  const pr = profile(p);
  const segs = Math.max(2, Math.round(p.curveSegments));
  const outline = pr.shape.getPoints(segs);
  outline.push(outline[0].clone());
  const a = extrude(pr.shape, p.depth, p, segs);
  const b = extrude(pr.beam, p.depth + p.beamLength, p, segs);
  const parts = [a, b].map((g) => {
    g.deleteAttribute('uv');
    const c = toCreasedNormals(g, THREE.MathUtils.degToRad(35));
    return uvs(c, outline, Math.max(2, p.bevel * 1.5));
  });
  const geo = mergeGeometries(parts);
  geo.computeBoundingBox();
  return { geo, ok: pr.ok };
}
