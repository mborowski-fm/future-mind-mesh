// FM mesh viewer (local project): an OBJ shown with its real polygons
// (quads and n-gons as modelled, not the loader's triangles), side by side with another one, to
// fix a model and compare. Our own small OBJ parser keeps the faces; the solid is triangulated
// per face (earcut on the face's plane), the wire is the faces' own edges.
import './mesh-viewer.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const MODELS = [
  ['Future Mind symbol · original', 'models/future-mind-symbol.obj'],
  ['Future Mind symbol · 1. clean, sharp', 'models/future-mind-symbol-clean-sharp.obj'],
  ['Future Mind symbol · 2. clean, with the bend', 'models/future-mind-symbol-clean.obj'],
];
const COL = { body: 0xd9d9de, wire: 0x16161a, ngon: 0xff8a00, open: 0xff2d55, nonman: 0x7b61ff, tri: 0x9a9aa6 };

const $ = (s) => document.querySelector(s);
const view = $('.mv__view');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setScissorTest(true);
view.append(renderer.domElement);

const camera = new THREE.PerspectiveCamera(30, 1, 1, 100000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const state = { mode: 'wire', points: false, tris: false, flags: true, split: true };
const loaded = new Map(); // url -> { name, mesh }
const slots = { a: null, b: null };

// --- parsing -------------------------------------------------------------------------------
export function parseOBJ(text) {
  const v = [], vn = [], f = [], fn = [];
  const at = (t, list) => {
    const i = parseInt(t, 10);
    return i < 0 ? list.length + i : i - 1;
  };
  for (const line of text.split('\n')) {
    const p = line.trim().split(/\s+/);
    if (p[0] === 'v') v.push([+p[1], +p[2], +p[3]]);
    else if (p[0] === 'vn') vn.push([+p[1], +p[2], +p[3]]);
    else if (p[0] === 'f') {
      const c = p.slice(1).map((t) => t.split('/'));
      f.push(c.map((t) => at(t[0], v)));
      // a corner without a normal, or a broken index (the original's C4D export has some 0s),
      // and the face takes its own flat normal
      const ns = c.map((t) => (t[2] ? at(t[2], vn) : -1));
      fn.push(ns.every((k) => k >= 0) ? ns : null);
    }
  }
  return { v, vn, f, fn };
}

function newell(pts) {
  const n = new THREE.Vector3();
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    n.x += (a.y - b.y) * (a.z + b.z);
    n.y += (a.z - b.z) * (a.x + b.x);
    n.z += (a.x - b.x) * (a.y + b.y);
  }
  return n.normalize();
}

function triangulate(pts) {
  if (pts.length === 3) return [[0, 1, 2]];
  const n = newell(pts);
  const u = new THREE.Vector3(1, 0, 0);
  if (Math.abs(n.dot(u)) > 0.9) u.set(0, 1, 0);
  u.sub(n.clone().multiplyScalar(u.dot(n))).normalize();
  const w = new THREE.Vector3().crossVectors(n, u);
  const flat = pts.map((p) => new THREE.Vector2(p.dot(u), p.dot(w)));
  const tris = THREE.ShapeUtils.triangulateShape(flat, []);
  // earcut follows the contour's winding; keep the face's own
  return THREE.ShapeUtils.isClockWise(flat) ? tris.map(([a, b, c]) => [a, c, b]) : tris;
}

function analyse({ v, f }) {
  const edges = new Map();
  const key = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  let tris = 0, quads = 0, ngons = 0;
  for (const face of f) {
    if (face.length === 3) tris++; else if (face.length === 4) quads++; else ngons++;
    for (let i = 0; i < face.length; i++) {
      const k = key(face[i], face[(i + 1) % face.length]);
      edges.set(k, (edges.get(k) || 0) + 1);
    }
  }
  let open = 0, nonman = 0;
  for (const c of edges.values()) { if (c === 1) open++; else if (c > 2) nonman++; }
  const used = new Set(f.flat());
  const box = new THREE.Box3().setFromPoints(v.map((p) => new THREE.Vector3(...p)));
  const size = box.getSize(new THREE.Vector3());
  return { verts: v.length, unused: v.length - used.size, faces: f.length, tris, quads, ngons, edges: edges.size, open, nonman, size, edgeCount: edges };
}

function build({ v, vn = [], f, fn = [] }) {
  const P = v.map((p) => new THREE.Vector3(...p));
  const pos = [], wire = [], triWire = [], ngonWire = [];
  for (const [fi, face] of f.entries()) {
    const pts = face.map((i) => P[i]);
    const t = triangulate(pts);
    const n = newell(pts);
    // the file's own normals when it has them (a smooth curve), else the face's
    const own = fn[fi]?.map((k) => vn[k]);
    const ns = own?.every(Boolean) ? own : pts.map(() => [n.x, n.y, n.z]);
    for (const tri of t) for (const k of tri) pos.push(pts[k].x, pts[k].y, pts[k].z, ...ns[k]);
    for (const [a, b, c] of t) for (const [x, y] of [[a, b], [b, c], [c, a]]) {
      if (Math.abs(x - y) === 1 || Math.abs(x - y) === pts.length - 1) continue; // a real edge
      triWire.push(...pts[x].toArray(), ...pts[y].toArray());
    }
    const out = face.length > 4 ? ngonWire : null;
    for (let i = 0; i < face.length; i++) {
      const a = P[face[i]], b = P[face[(i + 1) % face.length]];
      wire.push(a.x, a.y, a.z, b.x, b.y, b.z);
      if (out) out.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  }
  const stats = analyse({ v, f });
  const open = [], nonman = [];
  for (const [k, c] of stats.edgeCount) {
    if (c === 2) continue;
    const [a, b] = k.split('_').map(Number);
    (c === 1 ? open : nonman).push(...P[a].toArray(), ...P[b].toArray());
  }

  const group = new THREE.Group();
  const inter = new THREE.InterleavedBuffer(new Float32Array(pos), 6);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.InterleavedBufferAttribute(inter, 3, 0));
  g.setAttribute('normal', new THREE.InterleavedBufferAttribute(inter, 3, 3));
  const solid = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
    color: COL.body, roughness: 0.75, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  }));
  const lines = (arr, color, extra = {}) => {
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    return new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color, ...extra }));
  };
  const parts = {
    solid,
    wire: lines(wire, COL.wire),
    tris: lines(triWire, COL.tri, { transparent: true, opacity: 0.6 }),
    ngon: lines(ngonWire, COL.ngon, { depthTest: false }),
    open: lines(open, COL.open, { depthTest: false }),
    nonman: lines(nonman, COL.nonman, { depthTest: false }),
    points: new THREE.Points(
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(v.flat(), 3)),
      new THREE.PointsMaterial({ color: COL.wire, size: 4, sizeAttenuation: false }),
    ),
  };
  for (const o of [parts.ngon, parts.open, parts.nonman]) o.renderOrder = 2;
  group.add(...Object.values(parts));
  return { group, parts, stats };
}

// --- scenes --------------------------------------------------------------------------------
function scene() {
  const s = new THREE.Scene();
  s.background = new THREE.Color(0xf4f4f6);
  s.add(new THREE.HemisphereLight(0xffffff, 0x8a8a95, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.8);
  key.position.set(0.6, 1, 0.9);
  s.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.6);
  rim.position.set(-1, -0.3, -0.8);
  s.add(rim);
  return s;
}
const scenes = { a: scene(), b: scene() };

function apply(m) {
  if (!m) return;
  const { parts } = m;
  const x = state.mode;
  parts.solid.visible = x !== 'lines';
  parts.solid.material.transparent = x === 'xray';
  parts.solid.material.opacity = x === 'xray' ? 0.25 : 1;
  parts.solid.material.depthWrite = x !== 'xray';
  parts.wire.visible = x !== 'solid';
  parts.wire.material.depthTest = x !== 'xray' && x !== 'lines';
  parts.wire.material.opacity = x === 'xray' || x === 'lines' ? 0.55 : 1;
  parts.wire.material.transparent = parts.wire.material.opacity < 1;
  parts.tris.visible = state.tris && x !== 'solid';
  parts.points.visible = state.points;
  parts.ngon.visible = parts.open.visible = parts.nonman.visible = state.flags;
}

async function load(url, name) {
  if (loaded.has(url)) return loaded.get(url);
  const text = await fetch(url).then((r) => (r.ok ? r.text() : '')).catch(() => '');
  if (!text.includes('\nv ') && !text.startsWith('v ')) return null;
  const m = { name, ...build(parseOBJ(text)) };
  loaded.set(url, m);
  return m;
}

let fitted = false;
async function put(slot, url) {
  const m = url ? await load(url, url) : null;
  const s = scenes[slot];
  if (slots[slot]) s.remove(slots[slot].group);
  slots[slot] = m;
  if (m) { s.add(m.group); apply(m); }
  if (m && !fitted) { fit(m); fitted = true; }
  stats();
}

function fit(m, dir = new THREE.Vector3(0.55, 0.35, 1)) {
  const box = new THREE.Box3().setFromObject(m.parts.solid);
  const c = box.getCenter(new THREE.Vector3());
  const r = box.getSize(new THREE.Vector3()).length() / 2;
  const w = view.clientWidth / (state.split ? 2 : 1), h = view.clientHeight;
  const vf = THREE.MathUtils.degToRad(camera.fov / 2);
  const hf = Math.atan(Math.tan(vf) * (w / h));
  const d = r / Math.sin(Math.min(vf, hf)) * 1.05;
  camera.position.copy(c).add(dir.normalize().multiplyScalar(d));
  camera.near = d / 100; camera.far = d * 10; camera.updateProjectionMatrix();
  controls.target.copy(c);
  controls.update();
}

function stats() {
  const row = (m, label) => {
    if (!m) return `<section><h2>${label}</h2><p>Not found. Drop an .obj to add one.</p></section>`;
    const s = m.stats, z = s.size;
    const flag = (n, cls) => (n ? `<b class="${cls}">${n}</b>` : '0');
    return `<section><h2>${label}</h2><dl>
      <dt>Vertices</dt><dd>${s.verts}${s.unused ? ` (${s.unused} unused)` : ''}</dd>
      <dt>Faces</dt><dd>${s.faces}</dd>
      <dt>Tris / quads / n-gons</dt><dd>${s.tris} / ${s.quads} / ${flag(s.ngons, 'is-ngon')}</dd>
      <dt>Edges</dt><dd>${s.edges}</dd>
      <dt>Open edges</dt><dd>${flag(s.open, 'is-open')}</dd>
      <dt>Non-manifold</dt><dd>${flag(s.nonman, 'is-nonman')}</dd>
      <dt>Size</dt><dd>${z.x.toFixed(1)} × ${z.y.toFixed(1)} × ${z.z.toFixed(1)}</dd>
    </dl></section>`;
  };
  $('[data-stats]').innerHTML = row(slots.a, 'Left') + (state.split ? row(slots.b, 'Right') : '');
}

// --- ui ------------------------------------------------------------------------------------
const selA = $('[data-a]'), selB = $('[data-b]');
function options() {
  const list = [...MODELS, ...[...loaded.entries()].filter(([u]) => u.startsWith('blob:')).map(([u, m]) => [m.name, u])];
  for (const [sel, slot] of [[selA, 'a'], [selB, 'b']]) {
    const cur = sel.value;
    sel.innerHTML = list.map(([n, u]) => `<option value="${u}">${n}</option>`).join('');
    if (cur) sel.value = cur;
    else if (slot === 'b' && list[2]) sel.value = list[2][1];
  }
}
options();
selA.onchange = () => put('a', selA.value);
selB.onchange = () => put('b', selB.value);

$('[data-display]').onclick = (e) => {
  const b = e.target.closest('[data-mode]');
  if (!b) return;
  state.mode = b.dataset.mode;
  for (const x of e.currentTarget.children) x.setAttribute('aria-pressed', x === b);
  apply(slots.a); apply(slots.b);
};
for (const k of ['points', 'tris', 'flags', 'split']) {
  $(`[data-${k}]`).onchange = (e) => { state[k] = e.target.checked; apply(slots.a); apply(slots.b); stats(); };
}
const VIEWS = { front: [0, 0, 1], side: [1, 0, 0], top: [0, 1, 0.0001], iso: [0.55, 0.35, 1] };
document.querySelectorAll('[data-view]').forEach((b) => {
  b.onclick = () => slots.a && fit(slots.a, new THREE.Vector3(...VIEWS[b.dataset.view]));
});

addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', async (e) => {
  e.preventDefault();
  const file = [...e.dataTransfer.files].find((f) => /\.obj$/i.test(f.name));
  if (!file) return;
  const url = URL.createObjectURL(file);
  await load(url, file.name);
  options();
  const slot = state.split ? 'b' : 'a';
  (slot === 'a' ? selA : selB).value = url;
  put(slot, url);
});

function frame() {
  controls.update();
  const w = view.clientWidth, h = view.clientHeight;
  if (renderer.domElement.width !== Math.round(w * renderer.getPixelRatio())) renderer.setSize(w, h);
  const halves = state.split ? [['a', 0, w / 2], ['b', w / 2, w / 2]] : [['a', 0, w]];
  for (const [slot, x, ww] of halves) {
    renderer.setViewport(x, 0, ww, h);
    renderer.setScissor(x, 0, ww, h);
    camera.aspect = ww / h;
    camera.updateProjectionMatrix();
    renderer.render(scenes[slot], camera);
  }
  requestAnimationFrame(frame);
}

await Promise.all([put('a', selA.value), put('b', selB.value)]);
frame();
window.__mesh = { slots, state, camera, controls };
