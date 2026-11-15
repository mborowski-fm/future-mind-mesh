// FM symbol editor (editor.html): the clean version with the bend, built from parameters
// (src/shape.js), with its bevel, a procedural texture (dots after the reference, grid, stripes,
// checker, squares), its material, the light and the background. Settings are kept in this
// browser; Copy settings / Paste settings move them around, Export gives an OBJ or a PNG.
import * as THREE from 'three';
import GUI from 'lil-gui';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { buildShape, SHAPE_DEFAULTS } from './shape.js';

const PATTERNS = { None: 0, Dots: 1, Grid: 2, Stripes: 3, Checker: 4, Squares: 5, Noise: 7, 'Uploaded image': 6 };
const BGS = { Dark: ['#161616', '#0b0b0b'], Light: ['#f4f4f2', '#dcdcd8'] };

const LOOK_DEFAULTS = {
  // texture
  pattern: 1, cell: 14, size: 0.36, patColor: '#060606', patRough: 0.85, patMetal: 0, bump: 1.2,
  // material
  color: '#1c1c1c', roughness: 0.5, metalness: 0.1, clearcoat: 0, clearcoatRoughness: 0.3, reflections: 0.35,
  // light
  exposure: 1, ambient: 0.25, key: 2.2, keyColor: '#ffffff', azimuth: -35, elevation: 48,
  rim: 0.6, shadows: true, softness: 6, ground: 0.45,
  // background
  bg: 'Dark',
  // an uploaded image: its pixels as the pattern (dark = pattern), and/or its colours on the surface
  imgInvert: false, imgColour: false,
  // view
  lines: 'Off', autoRotate: false, fov: 30,
};
// starting points for the look (the shape stays as it is)
const PRESETS = {
  'FM dots (reference)': {},
  'Clay': { pattern: 0, color: '#d8d6d2', roughness: 0.85, metalness: 0, reflections: 0.6, ambient: 0.5, key: 2.4, bg: 'Light', ground: 0.25 },
  'White dots': { pattern: 1, color: '#f2f2f2', patColor: '#cfcfcf', roughness: 0.6, reflections: 0.7, ambient: 0.55, key: 2, bg: 'Light', ground: 0.2 },
  'Glossy black': { pattern: 0, color: '#0d0d0d', roughness: 0.18, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08, reflections: 1.2, bg: 'Dark' },
  'Chrome': { pattern: 0, color: '#d9dbe0', roughness: 0.08, metalness: 1, reflections: 1.4, ambient: 0.1, bg: 'Dark' },
  'Grid': { pattern: 2, cell: 24, size: 0.08, color: '#e9e9e6', patColor: '#1b1b1b', roughness: 0.7, bump: 0, bg: 'Light', ambient: 0.55, reflections: 0.6, ground: 0.2 },
};

const KEY = 'fm-editor';
const S = { ...SHAPE_DEFAULTS, ...LOOK_DEFAULTS };
try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };

// --- renderer, scene, camera ---------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
document.body.append(renderer.domElement);

const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(S.fov, innerWidth / innerHeight, 1, 20000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const hemi = new THREE.HemisphereLight(0xffffff, 0x404040, 1);
const key = new THREE.DirectionalLight(0xffffff, 1);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0004;
const rim = new THREE.DirectionalLight(0xffffff, 1);
scene.add(hemi, key, key.target, rim);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.ShadowMaterial({ opacity: 0.4 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// --- material with the pattern ---------------------------------------------------------------
const U = {
  uPattern: { value: 1 }, uScale: { value: 14 }, uSize: { value: 0.36 },
  uImg: { value: null }, uImgOn: { value: 0 }, uImgInvert: { value: 0 }, uImgColour: { value: 0 },
  uPatColor: { value: new THREE.Color() }, uPatRough: { value: 0.85 }, uPatMetal: { value: 0 }, uBump: { value: 1 },
};
const material = new THREE.MeshPhysicalMaterial();
material.onBeforeCompile = (sh) => {
  Object.assign(sh.uniforms, U);
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec2 fmuv;\nvarying vec2 vFm;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFm = fmuv;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>
varying vec2 vFm;
uniform float uPattern, uScale, uSize, uPatRough, uPatMetal, uBump;
uniform vec3 uPatColor;
uniform sampler2D uImg;
uniform float uImgOn, uImgInvert, uImgColour;
float fmHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float fmNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(fmHash(i), fmHash(i + vec2(1, 0)), f.x), mix(fmHash(i + vec2(0, 1)), fmHash(i + vec2(1, 1)), f.x), f.y); }
float fmPattern(vec2 uv) {
  if (uPattern < 0.5) return 0.0;
  vec2 g = uv / uScale;
  vec2 f = fract(g) - 0.5;
  float w = 0.5 * (fwidth(g.x) + fwidth(g.y));
  if (uPattern < 1.5) return 1.0 - smoothstep(uSize - w, uSize + w, length(f));            // dots
  if (uPattern < 2.5) { vec2 e = 0.5 - abs(f); return 1.0 - smoothstep(uSize * 0.5 - w, uSize * 0.5 + w, min(e.x, e.y)); } // grid
  if (uPattern < 3.5) return 1.0 - smoothstep(uSize - w, uSize + w, abs(f.x));             // stripes
  if (uPattern < 4.5) { vec2 q = floor(g); return mod(q.x + q.y, 2.0); }                   // checker
  if (uPattern > 6.5) { float n = fmNoise(g) * 0.6 + fmNoise(g * 2.3) * 0.4; return smoothstep(1.0 - uSize * 2.0 - 0.05, 1.0 - uSize * 2.0 + 0.05, n); } // noise
  if (uPattern > 5.5) { if (uImgOn < 0.5) return 0.0; float l = dot(texture2D(uImg, g).rgb, vec3(0.299, 0.587, 0.114)); return uImgInvert > 0.5 ? l : 1.0 - l; } // image
  vec2 e = abs(f); return 1.0 - smoothstep(uSize - w, uSize + w, max(e.x, e.y));           // squares
}`)
    .replace('#include <color_fragment>', `#include <color_fragment>
float fmMask = fmPattern(vFm);
if (uImgOn > 0.5 && uImgColour > 0.5) diffuseColor.rgb *= texture2D(uImg, vFm / uScale).rgb;
diffuseColor.rgb = mix(diffuseColor.rgb, uPatColor, fmMask);`)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, uPatRough, fmMask);')
    .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, uPatMetal, fmMask);')
    .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
if (uBump > 0.0 && uPattern > 0.5) { // the pattern pressed in, like perforation
  vec3 fp = -vViewPosition;
  vec3 dpx = dFdx(fp), dpy = dFdy(fp);
  float fh = -fmMask * uBump;
  float dhx = dFdx(fh), dhy = dFdy(fh);
  vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
  normal = normalize(abs(det) * normal - grad);
}`);
};

const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
mesh.castShadow = mesh.receiveShadow = true;
const lines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xff8a00, transparent: true, opacity: 0.8 }));
scene.add(mesh, lines);

// --- applying the settings -------------------------------------------------------------------
let warn = null;
function rebuildShape() {
  const { geo, ok } = buildShape(S);
  // stand it on the floor, centred
  const b = geo.boundingBox, c = b.getCenter(new THREE.Vector3());
  geo.translate(-c.x, -b.min.y, -c.z);
  geo.computeBoundingBox();
  mesh.geometry.dispose();
  mesh.geometry = geo;
  rebuildLines();
  fitShadow();
  if (warn) warn.style.display = ok ? 'none' : 'block';
}
function rebuildLines() {
  lines.geometry.dispose();
  lines.visible = S.lines !== 'Off';
  lines.geometry = S.lines === 'Triangles' ? new THREE.WireframeGeometry(mesh.geometry)
    : S.lines === 'Edges' ? new THREE.EdgesGeometry(mesh.geometry, 20) : new THREE.BufferGeometry();
}
function fitShadow() {
  const b = mesh.geometry.boundingBox;
  const r = b.getSize(new THREE.Vector3()).length() * 0.75;
  const cam = key.shadow.camera;
  cam.left = cam.bottom = -r; cam.right = cam.top = r; cam.near = 1; cam.far = r * 6;
  cam.updateProjectionMatrix();
  placeLights();
}
function placeLights() {
  const b = mesh.geometry.boundingBox;
  const c = b.getCenter(new THREE.Vector3());
  const r = b.getSize(new THREE.Vector3()).length() * 1.5;
  const az = THREE.MathUtils.degToRad(S.azimuth), el = THREE.MathUtils.degToRad(S.elevation);
  key.position.set(c.x + r * Math.cos(el) * Math.sin(az), c.y + r * Math.sin(el), c.z + r * Math.cos(el) * Math.cos(az));
  key.target.position.copy(c);
  rim.position.set(c.x - (key.position.x - c.x), c.y + r * 0.3, c.z - (key.position.z - c.z));
}
function background() {
  const [mid, edge] = BGS[S.bg] || BGS.Dark;
  document.body.style.background = mid;
  document.body.classList.toggle('is-light', S.bg === 'Light');
  const cv = document.createElement('canvas');
  cv.width = cv.height = 512;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(256, 230, 20, 256, 256, 380);
  grad.addColorStop(0, mid);
  grad.addColorStop(1, edge);
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 512);
  scene.background?.dispose?.();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  scene.background = tex;
}
function look() {
  U.uImgInvert.value = S.imgInvert ? 1 : 0; U.uImgColour.value = S.imgColour ? 1 : 0;
  U.uPattern.value = S.pattern; U.uScale.value = S.cell; U.uSize.value = S.size;
  U.uPatColor.value.set(S.patColor); U.uPatRough.value = S.patRough; U.uPatMetal.value = S.patMetal; U.uBump.value = S.bump;
  material.color.set(S.color);
  material.roughness = S.roughness; material.metalness = S.metalness;
  material.clearcoat = S.clearcoat; material.clearcoatRoughness = S.clearcoatRoughness;
  scene.environmentIntensity = S.reflections;
  renderer.toneMappingExposure = S.exposure;
  hemi.intensity = S.ambient;
  key.intensity = S.key; key.color.set(S.keyColor);
  rim.intensity = S.rim;
  key.castShadow = S.shadows;
  key.shadow.radius = S.softness;
  key.shadow.blurSamples = 16;
  ground.material.opacity = S.ground;
  ground.visible = S.shadows && S.ground > 0;
  controls.autoRotate = S.autoRotate;
  camera.fov = S.fov; camera.updateProjectionMatrix();
  placeLights();
  background();
}

function frameView(dir = new THREE.Vector3(-0.55, 0.32, 1)) {
  const b = mesh.geometry.boundingBox;
  const c = b.getCenter(new THREE.Vector3());
  const r = b.getSize(new THREE.Vector3()).length() / 2;
  const vf = THREE.MathUtils.degToRad(camera.fov / 2);
  const hf = Math.atan(Math.tan(vf) * camera.aspect);
  const d = r / Math.sin(Math.min(vf, hf)) * 1.08;
  camera.position.copy(c).add(dir.normalize().multiplyScalar(d));
  controls.target.copy(c);
  controls.update();
}

// --- an uploaded texture (kept in this browser) ------------------------------------------------
function setImage(url) {
  U.uImg.value?.dispose();
  U.uImg.value = null; U.uImgOn.value = 0;
  if (!url) return;
  new THREE.TextureLoader().load(url, (t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    U.uImg.value = t; U.uImgOn.value = 1;
  });
}
const picker = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*' });
picker.onchange = () => {
  const file = picker.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    setImage(r.result);
    try { localStorage.setItem(KEY + '-img', r.result); } catch {}
    if (S.pattern !== 6 && !S.imgColour) { S.pattern = 6; refresh(); look(); save(); }
  };
  r.readAsDataURL(file);
  picker.value = '';
};
try { setImage(localStorage.getItem(KEY + '-img')); } catch {}

// --- the panel -------------------------------------------------------------------------------
const gui = new GUI({ title: 'FM symbol' });
const all = [];
const on = (ctrl, fn) => { all.push(ctrl); return ctrl.onChange(() => { fn(); save(); }); };
const shapeChange = () => { rebuildShape(); };

const actions = {
  preset: 'FM dots (reference)',
  resetShape() { Object.assign(S, SHAPE_DEFAULTS); refresh(); rebuildShape(); save(); },
  resetLook() { Object.assign(S, LOOK_DEFAULTS); refresh(); look(); rebuildLines(); save(); },
  front() { frameView(new THREE.Vector3(0, 0, 1)); },
  side() { frameView(new THREE.Vector3(1, 0, 0)); },
  threeQuarter() { frameView(); },
  png() {
    renderer.render(scene, camera);
    const a = document.createElement('a');
    a.download = 'future-mind-symbol.png';
    a.href = renderer.domElement.toDataURL('image/png');
    a.click();
  },
  obj() {
    const m = new THREE.Mesh(mesh.geometry.clone());
    m.name = 'future_mind_symbol';
    const blob = new Blob([new OBJExporter().parse(m)], { type: 'text/plain' });
    const a = document.createElement('a');
    a.download = 'future-mind-symbol-edited.obj';
    a.href = URL.createObjectURL(blob);
    a.click();
  },
  upload() { picker.click(); },
  clearImage() { setImage(null); try { localStorage.removeItem(KEY + '-img'); } catch {} },
  // one tile of the generated pattern, 512 px, to use elsewhere (or edit and upload back)
  saveTile() {
    const n = 512, cv = document.createElement('canvas');
    cv.width = cv.height = n;
    const g = cv.getContext('2d');
    g.fillStyle = S.color; g.fillRect(0, 0, n, n);
    g.fillStyle = S.patColor;
    const r = S.size * n, h = n / 2;
    if (S.pattern === 1) { g.beginPath(); g.arc(h, h, r, 0, Math.PI * 2); g.fill(); }
    else if (S.pattern === 2) { const w = S.size * n / 2; g.fillRect(0, 0, n, w); g.fillRect(0, n - w, n, w); g.fillRect(0, 0, w, n); g.fillRect(n - w, 0, w, n); }
    else if (S.pattern === 3) g.fillRect(h - r, 0, 2 * r, n);
    else if (S.pattern === 4) { g.fillRect(0, 0, h, h); g.fillRect(h, h, h, h); }
    else if (S.pattern === 5) g.fillRect(h - r, h - r, 2 * r, 2 * r);
    const a = document.createElement('a');
    a.download = 'fm-pattern-tile.png';
    a.href = cv.toDataURL('image/png');
    a.click();
  },
  async copy() {
    const text = `FM editor settings: ${JSON.stringify(S)}`;
    try { await navigator.clipboard.writeText(text); } catch { prompt('Copy', text); }
  },
  paste() {
    const t = prompt('Paste the settings line');
    const m = t && t.match(/\{.*\}/s);
    if (!m) return;
    try { Object.assign(S, JSON.parse(m[0])); } catch { return; }
    refresh(); rebuildShape(); look(); save();
  },
};
gui.add(actions, 'preset', Object.keys(PRESETS)).name('Look preset').onChange((name) => {
  Object.assign(S, LOOK_DEFAULTS, PRESETS[name]);
  refresh(); look(); rebuildLines(); save();
});

const fs = gui.addFolder('Shape');
on(fs.add(S, 'postWidth', 60, 300, 0.1).name('Post width'), shapeChange);
on(fs.add(S, 'height', 250, 700, 0.1).name('Height'), shapeChange);
on(fs.add(S, 'beamHeight', 40, 250, 0.1).name('Top beam height'), shapeChange);
on(fs.add(S, 'beamLength', 0, 900, 0.1).name('Top beam length'), shapeChange);
on(fs.add(S, 'barLength', 200, 1000, 0.1).name('Bottom bar length'), shapeChange);
on(fs.add(S, 'barHeight', 30, 200, 0.1).name('Bottom bar height'), shapeChange);
on(fs.add(S, 'depth', 30, 400, 0.1).name('Depth'), shapeChange);
on(fs.add(S, 'angle', 20, 70, 0.1).name('Diagonal angle'), shapeChange);
on(fs.add(S, 'width', 40, 220, 0.1).name('Diagonal width'), shapeChange);
on(fs.add(S, 'topRadius', 1, 300, 0.1).name('Bend, inner radius'), shapeChange);
on(fs.add(S, 'bottomRadius', 1, 400, 0.1).name('Bend, outer radius'), shapeChange);
on(fs.add(S, 'curveSegments', 2, 96, 1).name('Bend segments'), shapeChange);
fs.add(actions, 'resetShape').name('Reset shape');
warn = document.createElement('div');
warn.textContent = 'These values don’t fit together: the bend overlaps the post or the bar.';
warn.style.cssText = 'display:none;padding:6px 8px;color:#ff8a8a;font-size:11px';
fs.$children.append(warn);

const fb = gui.addFolder('Bevel');
on(fb.add(S, 'bevel', 0, 40, 0.1).name('Size'), shapeChange);
on(fb.add(S, 'bevelSegments', 1, 12, 1).name('Segments (1 = chamfer)'), shapeChange);

const ft = gui.addFolder('Texture');
on(ft.add(S, 'pattern', PATTERNS).name('Pattern'), look);
on(ft.add(S, 'cell', 2, 80, 0.1).name('Cell size'), look);
on(ft.add(S, 'size', 0.02, 0.5, 0.005).name('Dot / line size'), look);
on(ft.addColor(S, 'patColor').name('Pattern colour'), look);
on(ft.add(S, 'patRough', 0, 1, 0.01).name('Pattern roughness'), look);
on(ft.add(S, 'patMetal', 0, 1, 0.01).name('Pattern metalness'), look);
on(ft.add(S, 'bump', 0, 6, 0.05).name('Pressed in'), look);
ft.add(actions, 'upload').name('Upload image…');
on(ft.add(S, 'imgInvert').name('Image: light = pattern'), look);
on(ft.add(S, 'imgColour').name('Image: colour the surface'), look);
ft.add(actions, 'clearImage').name('Remove image');
ft.add(actions, 'saveTile').name('Save pattern tile (PNG)');

const fm = gui.addFolder('Material');
on(fm.addColor(S, 'color').name('Colour'), look);
on(fm.add(S, 'roughness', 0, 1, 0.01).name('Roughness'), look);
on(fm.add(S, 'metalness', 0, 1, 0.01).name('Metalness'), look);
on(fm.add(S, 'clearcoat', 0, 1, 0.01).name('Clearcoat'), look);
on(fm.add(S, 'clearcoatRoughness', 0, 1, 0.01).name('Clearcoat roughness'), look);
on(fm.add(S, 'reflections', 0, 3, 0.01).name('Reflections'), look);

const fl = gui.addFolder('Light');
on(fl.add(S, 'exposure', 0.1, 3, 0.01).name('Exposure'), look);
on(fl.add(S, 'ambient', 0, 3, 0.01).name('Ambient'), look);
on(fl.add(S, 'key', 0, 8, 0.01).name('Key light'), look);
on(fl.addColor(S, 'keyColor').name('Key colour'), look);
on(fl.add(S, 'azimuth', -180, 180, 1).name('Key direction'), look);
on(fl.add(S, 'elevation', 2, 89, 1).name('Key height'), look);
on(fl.add(S, 'rim', 0, 6, 0.01).name('Rim light'), look);
on(fl.add(S, 'shadows').name('Shadows'), look);
on(fl.add(S, 'softness', 0, 20, 0.1).name('Shadow softness'), look);
on(fl.add(S, 'ground', 0, 1, 0.01).name('Floor shadow'), look);


const fv = gui.addFolder('View');
on(fv.add(S, 'bg', Object.keys(BGS)).name('Background'), look);
on(fv.add(S, 'lines', ['Off', 'Edges', 'Triangles']).name('Mesh lines'), rebuildLines);
on(fv.add(S, 'autoRotate').name('Turn'), look);
on(fv.add(S, 'fov', 10, 70, 1).name('Lens (fov)'), look);
fv.add(actions, 'threeQuarter').name('3/4 view');
fv.add(actions, 'front').name('Front view');
fv.add(actions, 'side').name('Side view');

const fe = gui.addFolder('Export');
fe.add(actions, 'png').name('Save PNG');
fe.add(actions, 'obj').name('Export OBJ');
fe.add(actions, 'copy').name('Copy settings');
fe.add(actions, 'paste').name('Paste settings');
fe.add(actions, 'resetLook').name('Reset look');

function refresh() { all.forEach((c) => c.updateDisplay()); }
for (const f of [fs, fb, fm, fl, fv, fe]) f.close();

// --- go ----------------------------------------------------------------------------------------
rebuildShape();
look();
frameView();
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
window.__fm = { S, scene, camera, mesh, rebuildShape, look, setImage };
