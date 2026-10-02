import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// scene colours (the character itself lives in avatar.glb, built in Blender)
const LOOK = {
  disc: '#1f2547',
  discRim: '#3b4380',
  accent: '#3f9a94',
  planet: '#b9a4e8',
  gold: '#e6b450',
  rim: '#ff5c9a', // coloured edge light on the character
};

// camera presets for the tour stops on the left
const VIEWS = {
  overview: { pos: [4.5, 3.0, 5.4], target: [0, 1.25, 0.3] },
  desk: { pos: [1.15, 1.3, 1.25], target: [0, 0.95, 0.05] },
  drone: { pos: [0.9, 1.9, 2.5], target: [-1.05, 1.0, 0.35] },
  moon: { pos: [2.9, 1.4, 1.0], target: [1.05, 0.3, -0.55] },
  alps: { pos: [-3.7, 2.3, 1.7], target: [-0.45, 0.75, -0.9] },
};
const Y = new THREE.Vector3(0, 1, 0);

const stage = document.getElementById('stage');
const canvas = document.getElementById('scene');
const loadingEl = document.getElementById('loading');
const hintEl = document.getElementById('hint');
const pills = [...document.querySelectorAll('.pill')];
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
} catch (err) {
  loadingEl.textContent = 'This browser cannot show the 3D scene (no WebGL). Everything below works without it.';
  throw err;
}
renderer.setClearColor(0xffffff, 0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);

scene.add(new THREE.HemisphereLight(0xffffff, 0xcfd3e6, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(3.5, 6, 2.5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -3;
sun.shadow.camera.right = 3;
sun.shadow.camera.top = 3;
sun.shadow.camera.bottom = -3;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 14;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.02;
sun.shadow.radius = 4;
scene.add(sun);

// ---------- helpers ----------
function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...opts });
}

function add(parent, geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// capsule between two points
function limb(parent, a, b, r, material) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const dir = vb.clone().sub(va);
  const m = add(parent, new THREE.CapsuleGeometry(r, dir.length(), 6, 14), material);
  m.position.copy(va).add(vb).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(Y, dir.normalize());
  return m;
}

// ---------- platform ----------
const world = new THREE.Group();
scene.add(world);

const disc = add(world, new THREE.CylinderGeometry(1.8, 1.8, 0.08, 96), mat(LOOK.disc, { roughness: 0.9 }), 0, -0.04, 0);
disc.castShadow = false;
const rim = add(world, new THREE.TorusGeometry(1.8, 0.022, 10, 120), mat(LOOK.discRim), 0, 0, 0);
rim.rotation.x = Math.PI / 2;
rim.castShadow = false;

// ---------- desk ----------
function buildDesk() {
  const g = new THREE.Group();
  const wood = mat('#e8cfa6');
  const dark = mat('#2c2a33');
  add(g, new THREE.BoxGeometry(1.5, 0.04, 0.68), wood, 0, 0.73, 0.64);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = add(g, new THREE.CylinderGeometry(0.028, 0.016, 0.71, 10), dark, sx * 0.66, 0.355, 0.64 + sz * 0.26);
    leg.rotation.z = -sx * 0.06;
  }

  // laptop, screen facing the chair (-z)
  const alu = mat('#d5d7de', { metalness: 0.5, roughness: 0.4 });
  add(g, new THREE.BoxGeometry(0.36, 0.014, 0.24), alu, 0, 0.757, 0.42);
  add(g, new THREE.BoxGeometry(0.3, 0.002, 0.1), mat('#3a3d4a'), 0, 0.765, 0.44);
  const lid = new THREE.Group();
  lid.position.set(0, 0.764, 0.54);
  lid.rotation.x = 0.26;
  g.add(lid);
  add(lid, new THREE.BoxGeometry(0.36, 0.24, 0.01), alu, 0, 0.12, 0);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.335, 0.215),
    new THREE.MeshBasicMaterial({ map: matchTexture(), toneMapped: false })
  );
  screen.position.set(0, 0.12, -0.0056);
  screen.rotation.y = Math.PI;
  lid.add(screen);

  // notebook and pen
  const nb = add(g, new THREE.BoxGeometry(0.2, 0.012, 0.26), mat('#fbfbf7'), -0.36, 0.756, 0.5);
  nb.rotation.y = 0.18;
  const pen = add(g, new THREE.CylinderGeometry(0.005, 0.005, 0.13, 8), mat(LOOK.accent), -0.33, 0.768, 0.5);
  pen.rotation.set(Math.PI / 2, 0, 0.7);

  // mug
  add(g, new THREE.CylinderGeometry(0.035, 0.03, 0.075, 20), mat('#f4f4f6'), 0.33, 0.788, 0.48);
  const handle = add(g, new THREE.TorusGeometry(0.022, 0.006, 8, 16), mat('#f4f4f6'), 0.37, 0.79, 0.48);
  handle.castShadow = false;
  add(g, new THREE.CylinderGeometry(0.03, 0.03, 0.004, 20), mat('#5a3a2a'), 0.33, 0.823, 0.48);

  // books
  const bookColors = ['#3f9a94', '#b9a4e8', '#e6b450'];
  bookColors.forEach((c, i) => {
    const b = add(g, new THREE.BoxGeometry(0.24 - i * 0.02, 0.032, 0.17), mat(c), 0.5, 0.766 + i * 0.032, 0.82);
    b.rotation.y = 0.15 * (i - 1);
  });

  // lamp
  const lampMat = mat('#2c2a33', { metalness: 0.3 });
  add(g, new THREE.CylinderGeometry(0.06, 0.065, 0.014, 20), lampMat, -0.6, 0.757, 0.86);
  limb(g, [-0.6, 0.76, 0.86], [-0.66, 1.0, 0.88], 0.007, lampMat);
  limb(g, [-0.66, 1.0, 0.88], [-0.48, 1.13, 0.8], 0.007, lampMat);
  const shade = add(g, new THREE.ConeGeometry(0.06, 0.08, 20, 1, true), mat(LOOK.accent, { side: THREE.DoubleSide }), -0.46, 1.11, 0.79);
  shade.rotation.z = 0.5;
  const bulb = add(g, new THREE.SphereGeometry(0.02, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffe9b0' }), -0.445, 1.085, 0.785);
  bulb.castShadow = false;
  const glow = new THREE.PointLight('#ffd98a', 0.5, 1.6, 2);
  glow.position.set(-0.43, 1.05, 0.77);
  g.add(glow);
  g.userData.glow = glow;
  return g;
}

function matchTexture() {
  // two views of the same mountain, with matched keypoints joined by lines
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 328;
  const x = c.getContext('2d');
  x.fillStyle = '#14172b';
  x.fillRect(0, 0, 512, 328);
  const ridge = (ox, oy, k) => [[0, 210], [60, 150], [95, 175], [150, 80], [190, 130], [230, 100], [250, 200]]
    .map(([px, py]) => [ox + px * k, oy + py * k]);
  const views = [ridge(6, 30, 0.96), ridge(262, 50, 0.9)];
  views.forEach((pts, v) => {
    x.fillStyle = v ? '#24304f' : '#22304a';
    x.fillRect(v ? 262 : 6, 30, 244, 268);
    x.fillStyle = '#6f7d8c';
    x.beginPath();
    pts.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py)));
    x.lineTo(pts[pts.length - 1][0], 298);
    x.lineTo(pts[0][0], 298);
    x.fill();
  });
  x.strokeStyle = 'rgba(63, 224, 176, .85)';
  x.lineWidth = 2;
  views[0].forEach(([px, py], i) => {
    const [qx, qy] = views[1][i];
    x.beginPath(); x.moveTo(px, py); x.lineTo(qx, qy); x.stroke();
  });
  x.fillStyle = '#ffd166';
  views.flat().forEach(([px, py]) => { x.beginPath(); x.arc(px, py, 4.5, 0, Math.PI * 2); x.fill(); });
  x.fillStyle = '#9aa3c7';
  x.font = '600 18px monospace';
  x.fillText('7 / 7 inliers', 16, 322);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- chair: office chair with headrest and armrests, placed around the seated model ----------
const SEAT_Z = -0.089; // chair and character sit this far behind the scene centre (wrists land on the laptop)
function buildChair() {
  const g = new THREE.Group();
  const fabric = mat('#5b5f86');
  const metal = mat('#3a3d4a', { metalness: 0.4, roughness: 0.5 });
  const lean = -0.1;
  add(g, new THREE.CylinderGeometry(0.22, 0.21, 0.06, 28), fabric, 0, 0.37, 0.06);
  add(g, new THREE.CylinderGeometry(0.022, 0.022, 0.31, 12), metal, 0, 0.235, 0.06);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    limb(g, [0, 0.08, 0.06], [Math.sin(a) * 0.26, 0.05, 0.06 + Math.cos(a) * 0.26], 0.014, metal);
    add(g, new THREE.SphereGeometry(0.026, 10, 8), metal, Math.sin(a) * 0.26, 0.026, 0.06 + Math.cos(a) * 0.26);
  }
  limb(g, [0, 0.36, -0.08], [0, 0.5, -0.12], 0.018, metal);
  add(g, new THREE.BoxGeometry(0.4, 0.533, 0.05), fabric, 0, 0.735, -0.14).rotation.x = lean;
  limb(g, [0, 0.95, -0.17], [0, 1.2, -0.215], 0.013, metal);
  add(g, new THREE.BoxGeometry(0.24, 0.17, 0.055), fabric, 0, 1.2, -0.19).rotation.x = lean;
  for (const sx of [-1, 1]) {
    add(g, new THREE.BoxGeometry(0.07, 0.03, 0.25), fabric, sx * 0.245, 0.662, -0.02);
    limb(g, [sx * 0.245, 0.64, -0.07], [sx * 0.2, 0.4, -0.03], 0.013, metal);
  }
  g.position.z = SEAT_Z;
  return g;
}

// ---------- character: Blender model, leaning in to the laptop, facing +z ----------
// painted look: light falls off in a few flat steps and a coloured light catches the edges
const ramp = new THREE.DataTexture(new Uint8Array([95, 165, 225, 255]), 4, 1, THREE.RedFormat);
ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
ramp.needsUpdate = true;
const envMap = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

function painted(src, rim = 0.2) {
  if (src.map) src.map.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const m = new THREE.MeshToonMaterial({ map: src.map, color: src.color, gradientMap: ramp });
  m.name = src.name;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.rimColor = { value: new THREE.Color(LOOK.rim).multiplyScalar(rim) };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 rimColor;')
      .replace(
        '#include <opaque_fragment>',
        'outgoingLight += rimColor * pow(1.0 - saturate(dot(normalize(normal), normalize(vViewPosition))), 4.0);\n#include <opaque_fragment>'
      );
  };
  return m;
}

const contour = new THREE.MeshBasicMaterial({ color: '#2a1420', side: THREE.BackSide });
contour.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader.replace(
    '#include <begin_vertex>',
    '#include <begin_vertex>\ntransformed += normalize(normal) * 0.0022;'
  );
};

const character = new THREE.Group();
character.position.set(0, 0, SEAT_Z);
let avatarReady = false;
new GLTFLoader().setRequestHeader({ 'Cache-Control': 'no-cache' }).load('avatar.glb', (gltf) => {
  const avatar = gltf.scene;
  const outlined = [];
  avatar.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = false;
    let m = o.material;
    if (/glasses|Stud/.test(m.name)) {
      // dark silver: needs something to reflect
      m.envMap = envMap;
      m.metalness = 0.85;
      m.roughness = 0.35;
      m.transparent = /glasses/.test(m.name);
    } else if (/ponytail|bob|eyebrow|eyelashes/.test(m.name)) {
      // hair cards: cut out by the texture's alpha
      m = o.material = painted(m, /eyebrow|eyelashes/.test(m.name) ? 0 : 0.25);
      m.alphaTest = /eyebrow|eyelashes/.test(m.name) ? 0.2 : 0.35;
      m.alphaToCoverage = true;
      m.side = THREE.DoubleSide;
    } else if (!/eye/.test(m.name)) {
      o.material = painted(m);
      outlined.push(o);
    } else {
      m.transparent = false;
      m.depthWrite = true;
    }
  });
  // dark contour: a slightly fattened copy of each mesh, drawn inside out behind it
  for (const o of outlined) {
    const shell = o.isSkinnedMesh ? new THREE.SkinnedMesh(o.geometry, contour) : new THREE.Mesh(o.geometry, contour);
    if (o.isSkinnedMesh) shell.bind(o.skeleton, o.bindMatrix);
    shell.frustumCulled = false;
    o.parent.add(shell);
  }
  character.add(avatar);
  character.updateMatrixWorld(true);
  // bones that turn the head, with what they need to rotate about world axes
  character.userData.neck = ['neck01', 'head'].map((name) => {
    const bone = avatar.getObjectByName(name);
    const parentQ = bone.parent.getWorldQuaternion(new THREE.Quaternion());
    return { bone, rest: bone.quaternion.clone(), parentQ, parentInv: parentQ.clone().invert() };
  });
  avatarReady = true;
}, undefined, (err) => {
  console.error('avatar.glb failed to load', err);
  avatarReady = true;
});

// ---------- lab theme: the places in her CV, as props around the desk ----------
let seed = 11;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// satellite tile under the drone: fields, roads, a river, a village
function mapTexture() {
  return canvasTexture(256, 256, (x) => {
    const fields = ['#9cb86a', '#b9c97d', '#7fa35a', '#c9b878', '#8fae6c'];
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
      x.fillStyle = fields[Math.floor(rnd() * fields.length)];
      x.fillRect(i * 43, j * 43, 43, 43);
    }
    x.strokeStyle = '#ece6d6';
    x.lineWidth = 6;
    x.beginPath(); x.moveTo(0, 90); x.lineTo(256, 130); x.moveTo(150, 0); x.lineTo(120, 256); x.stroke();
    x.strokeStyle = '#5b8fb0';
    x.lineWidth = 10;
    x.beginPath(); x.moveTo(0, 210); x.bezierCurveTo(80, 170, 160, 250, 256, 190); x.stroke();
    x.fillStyle = '#d9d2c3';
    for (let i = 0; i < 10; i++) x.fillRect(165 + rnd() * 70, 20 + rnd() * 55, 10, 8);
  });
}

function buildDrone() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.position.set(-1.05, 1.55, 0.35);
  g.add(body);
  const shell = mat('#2c2a33', { roughness: 0.5 });
  add(body, new THREE.BoxGeometry(0.14, 0.04, 0.14), shell);
  add(body, new THREE.SphereGeometry(0.024, 12, 8), mat('#8fd6ee', { metalness: 0.6, roughness: 0.15 }), 0, -0.03, 0.04);
  const props = [];
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    limb(body, [0, 0, 0], [sx * 0.13, 0.01, sz * 0.13], 0.008, shell);
    add(body, new THREE.CylinderGeometry(0.018, 0.018, 0.03, 12), mat(LOOK.accent), sx * 0.13, 0.02, sz * 0.13);
    const p = add(body, new THREE.BoxGeometry(0.15, 0.003, 0.016), mat('#f4f4f6'), sx * 0.13, 0.04, sz * 0.13);
    p.castShadow = false;
    props.push(p);
  }
  // what its camera sees: a pyramid from the lens down to the map tile
  const frustum = new THREE.ConeGeometry(0.49, 1.5, 4, 1, true);
  frustum.rotateY(Math.PI / 4);
  const ray = new THREE.Mesh(frustum, new THREE.MeshBasicMaterial({ color: LOOK.accent, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide }));
  ray.position.y = -0.78;
  body.add(ray);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(frustum), new THREE.LineBasicMaterial({ color: LOOK.accent, transparent: true, opacity: 0.55 }));
  edges.position.y = -0.78;
  body.add(edges);
  const tile = add(g, new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshStandardMaterial({ map: mapTexture(), roughness: 0.95 }), -1.05, 0.004, 0.35);
  tile.rotation.x = -Math.PI / 2;
  tile.castShadow = false;
  g.userData = { body, props };
  return g;
}

function buildMoon() {
  const g = new THREE.Group();
  g.position.set(1.05, 0, -0.55);
  const regolith = mat('#b8b6bf', { roughness: 1, flatShading: true });
  const geo = new THREE.CylinderGeometry(0.5, 0.56, 0.08, 40, 1);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > 0) p.setY(i, 0.04 + 0.02 * Math.sin(p.getX(i) * 17) * Math.cos(p.getZ(i) * 13));
  }
  geo.computeVertexNormals();
  add(g, geo, regolith, 0, 0.04, 0);
  for (const [x, z, r] of [[0.27, 0.12, 0.07], [-0.24, 0.2, 0.05], [-0.12, -0.28, 0.09]]) {
    const c = add(g, new THREE.TorusGeometry(r, r * 0.25, 6, 20), regolith, x, 0.088, z);
    c.rotation.x = Math.PI / 2;
    const d = add(g, new THREE.CircleGeometry(r, 20), mat('#8f8d99', { roughness: 1 }), x, 0.086, z);
    d.rotation.x = -Math.PI / 2;
  }
  const lander = new THREE.Group();
  lander.position.y = 0.08;
  g.add(lander);
  const foil = mat('#e6b450', { metalness: 0.7, roughness: 0.35 });
  const strut = mat('#3a3d4a');
  add(lander, new THREE.CylinderGeometry(0.09, 0.1, 0.1, 8), foil, 0, 0.17, 0);
  add(lander, new THREE.CylinderGeometry(0.07, 0.07, 0.07, 8), mat('#f4f4f6'), 0, 0.255, 0);
  add(lander, new THREE.ConeGeometry(0.035, 0.05, 12), strut, 0, 0.1, 0);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    limb(lander, [Math.sin(a) * 0.08, 0.16, Math.cos(a) * 0.08], [Math.sin(a) * 0.17, 0.01, Math.cos(a) * 0.17], 0.006, strut);
    add(lander, new THREE.CylinderGeometry(0.022, 0.022, 0.006, 10), strut, Math.sin(a) * 0.17, 0.004, Math.cos(a) * 0.17);
  }
  add(lander, new THREE.SphereGeometry(0.018, 10, 8), mat('#8fd6ee', { metalness: 0.6, roughness: 0.15 }), 0, 0.15, 0.1);
  const beacon = add(lander, new THREE.SphereGeometry(0.012, 10, 8), new THREE.MeshBasicMaterial({ color: '#ff5c6a' }), 0, 0.3, 0);
  // event camera: pixels fire red/blue where brightness changes, so the terrain flickers in sparse dots
  const n = 90;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const events = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)).setAttribute('color', new THREE.BufferAttribute(col, 3)),
    new THREE.PointsMaterial({ size: 0.018, vertexColors: true, toneMapped: false })
  );
  g.add(events);
  g.userData = { beacon, events };
  return g;
}

function scatterEvents(events) {
  const pos = events.geometry.attributes.position;
  const col = events.geometry.attributes.color;
  for (let i = 0; i < pos.count; i++) {
    const a = 0.2 + rnd() * 1.6 - Math.PI / 2;
    const r = 0.18 + rnd() * 0.28;
    pos.setXYZ(i, Math.sin(a) * r * 0.9, 0.095, Math.cos(a) * r + 0.05);
    const on = rnd() > 0.5;
    col.setXYZ(i, on ? 1 : 0.2, on ? 0.25 : 0.45, on ? 0.3 : 1);
  }
  pos.needsUpdate = col.needsUpdate = true;
}

function buildAlps() {
  const g = new THREE.Group();
  g.position.set(-0.55, 0, -1.2);
  g.scale.setScalar(1.35);
  const rock = mat('#6f7d8c', { flatShading: true, roughness: 0.9 });
  const snow = mat('#f4f6fa', { flatShading: true });
  for (const [x, z, h, r] of [[0, 0, 1.0, 0.42], [0.45, 0.15, 0.7, 0.32], [-0.42, 0.12, 0.6, 0.3]]) {
    add(g, new THREE.ConeGeometry(r, h, 6), rock, x, h / 2, z);
    const cap = add(g, new THREE.ConeGeometry(r * 0.37, h * 0.37, 6), snow, x, h * 0.815 + 0.003, z);
    cap.scale.setScalar(1.02);
  }
  const pole = mat('#3a3d4a');
  limb(g, [0, 0.98, 0], [0, 1.2, 0], 0.005, pole);
  const flag = add(g, new THREE.PlaneGeometry(0.2, 0.08), new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide, toneMapped: false,
    map: canvasTexture(256, 102, (x, w, h) => {
      x.fillStyle = LOOK.accent; x.fillRect(0, 0, w, h);
      x.fillStyle = '#fff'; x.font = '600 44px Poppins, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('CVG', w / 2, h / 2 + 2);
    }),
  }), 0.1, 1.155, 0);
  flag.castShadow = false;
  g.userData = { flag };
  return g;
}

function buildTea() {
  const g = new THREE.Group();
  g.position.set(0.58, 0.75, 0.56);
  const china = mat('#f4f4f6', { roughness: 0.4 });
  const pot = add(g, new THREE.SphereGeometry(0.06, 20, 14), china, 0, 0.055, 0);
  pot.scale.y = 0.85;
  add(g, new THREE.CylinderGeometry(0.03, 0.035, 0.012, 16), china, 0, 0.105, 0);
  add(g, new THREE.SphereGeometry(0.01, 8, 6), mat(LOOK.accent), 0, 0.118, 0);
  limb(g, [0.045, 0.05, 0], [0.095, 0.1, 0], 0.008, china);
  const handle = add(g, new THREE.TorusGeometry(0.03, 0.007, 8, 16, Math.PI * 1.2), china, -0.06, 0.06, 0);
  handle.rotation.z = Math.PI * 0.4;
  const band = add(g, new THREE.TorusGeometry(0.058, 0.004, 6, 30), mat(LOOK.accent), 0, 0.05, 0);
  band.rotation.x = Math.PI / 2;
  const steam = [0, 1, 2].map((i) => {
    const s = add(g, new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, depthWrite: false }), 0.1, 0.12, 0);
    s.castShadow = false;
    s.userData.phase = i / 3;
    return s;
  });
  g.userData = { steam };
  return g;
}

const desk = buildDesk();
const chair = buildChair();
const drone = buildDrone();
const moon = buildMoon();
const alps = buildAlps();
const tea = buildTea();
desk.position.z = -0.03;
desk.add(tea);
world.add(desk, chair, character, drone, moon, alps);
world.updateMatrixWorld(true);
scatterEvents(moon.userData.events);

// ---------- hotspots: buttons pinned to the props; click one for the story behind it ----------
const SPOTS = [
  { id: 'kinga', obj: character, at: [0, 1.62, SEAT_Z], label: 'Kinga' },
  { id: 'eth', obj: alps, at: [-0.55, 1.8, -1.2], label: 'ETH Zürich',
    title: 'ETH Zürich · Computer Vision and Geometry Group', meta: 'Research intern · since July 2026',
    text: 'Keypoint detection and uncertainty for more reliable camera pose: a new training objective for a learned detector, built on the group\'s RaCo (3DV 2026). Evaluated on HPatches, MegaDepth, ScanNet and ETH3D on the Euler cluster.', href: '#experience' },
  { id: 'esa', obj: moon, at: [1.05, 0.55, -0.55], label: 'ESA ESTEC',
    title: 'ESA ESTEC · GNC section', meta: 'April to June 2026',
    text: 'Cross-modal feature matching, event camera to optical imagery, for terrain-relative navigation in lunar landings. Test scenarios built in the PANGU simulator. The flickering dots are what an event camera sees.', href: '#experience' },
  { id: 'drone', obj: drone, at: [-1.05, 1.78, 0.35], label: 'Scaled Autonomy',
    title: 'Scaled Autonomy · Computer vision engineer', meta: 'December 2025 to June 2026',
    text: 'Drone-to-satellite image registration for GPS-denied flight. LoFTR plus Fourier-Mellin matching: four times the baseline inlier ratio on real flight data.', href: '#experience' },
  { id: 'tea', obj: tea, at: [0.58, 0.97, 0.53], label: 'Projects',
    title: 'Multi-camera 3D drone monitoring', meta: 'Projects · five demos you can play with',
    text: 'Several cameras together find where a drone is in 3D, because one camera alone only knows the direction, not the distance. Further down: step through it with 1, 2 and 3 cameras, shrink a real image classifier until it stops seeing cats, read licence plates from real car park video, and more.', href: '#track' },
];
const spotLayer = document.getElementById('spots');
const card = document.getElementById('spot-card');
const bubble = document.getElementById('bubble');
for (const s of SPOTS) {
  s.anchor = new THREE.Vector3(...s.at);
  s.el = document.createElement('button');
  s.el.type = 'button';
  s.el.className = 'spot';
  s.el.innerHTML = `<span class="spot-dot"></span><span class="spot-label">${s.label}</span>`;
  s.el.setAttribute('aria-label', s.id === 'kinga' ? 'Say hi to Kinga' : `${s.label}: show details`);
  s.el.addEventListener('click', () => open(s));
  spotLayer.appendChild(s.el);
}

function open(s) {
  if (s.id === 'kinga') return greet();
  card.querySelector('.spot-title').textContent = s.title;
  card.querySelector('.spot-meta').textContent = s.meta;
  card.querySelector('.spot-text').textContent = s.text;
  card.querySelector('.spot-more').href = s.href;
  card.hidden = false;
  SPOTS.forEach((o) => o.el.classList.toggle('is-open', o === s));
}
function closeCard() {
  card.hidden = true;
  SPOTS.forEach((o) => o.el.classList.remove('is-open'));
}
card.querySelector('.spot-close').addEventListener('click', closeCard);

// clicking the figure itself: she looks up and says something
const LINES = [
  'Hi! I match keypoints so cameras know where they are.',
  'Currently: making a learned detector say how sure it is.',
  'Try the keypoint view, top right. It runs a real corner detector on this scene.',
  'GPS-denied? Then the pixels have to do the work.',
  'Tea is always on.',
];
let line = 0;
let greetUntil = 0;
let bubbleTimer = 0;
function greet() {
  bubble.textContent = LINES[line++ % LINES.length];
  bubble.hidden = false;
  greetUntil = clock.elapsedTime + 3.5;
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => (bubble.hidden = true), 4200);
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downAt = null;
canvas.addEventListener('pointerdown', (e) => (downAt = [e.clientX, e.clientY]));
canvas.addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  const r = canvas.getBoundingClientRect();
  pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects([character, drone, moon, alps, tea], true)[0];
  if (!hit) return;
  for (let o = hit.object; o; o = o.parent) {
    const s = SPOTS.find((sp) => sp.obj === o);
    if (s) return open(s);
  }
});

const tmp = new THREE.Vector3();
function placeSpots() {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  for (const s of SPOTS) {
    tmp.copy(s.anchor).project(camera);
    const behind = tmp.z > 1;
    s.el.style.transform = `translate(${((tmp.x + 1) / 2) * w}px, ${((1 - tmp.y) / 2) * h}px)`;
    s.el.classList.toggle('is-off', behind);
    if (s.id === 'kinga' && !bubble.hidden) {
      bubble.style.transform = `translate(${((tmp.x + 1) / 2) * w}px, ${((1 - tmp.y) / 2) * h - 18}px) translate(-50%, -100%)`;
    }
  }
}

// ---------- keypoint view: Harris corners on the rendered frame, tracked from frame to frame ----------
const visionBtn = document.getElementById('vision');
const kp = document.getElementById('kp');
const kpx = kp.getContext('2d');
const small = document.createElement('canvas');
const sx = small.getContext('2d', { willReadFrequently: true });
const kpStat = document.getElementById('kp-stat');
let vision = false;
let prevPts = [];
let tick = 0;
visionBtn.addEventListener('click', () => {
  vision = !vision;
  visionBtn.setAttribute('aria-pressed', String(vision));
  stage.classList.toggle('is-vision', vision);
  kpx.clearRect(0, 0, kp.width, kp.height);
  prevPts = [];
});

function harris() {
  const W = 256;
  const H = Math.round(W * canvas.height / canvas.width);
  small.width = W;
  small.height = H;
  sx.drawImage(canvas, 0, 0, W, H);
  const d = sx.getImageData(0, 0, W, H).data;
  const g = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const a = d[i * 4 + 3] / 255; // transparent background counts as white page
    g[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) * a / 255 + (1 - a);
  }
  const xx = new Float32Array(W * H), yy = new Float32Array(W * H), xy = new Float32Array(W * H);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    const gx = g[i + 1] - g[i - 1];
    const gy = g[i + W] - g[i - W];
    xx[i] = gx * gx; yy[i] = gy * gy; xy[i] = gx * gy;
  }
  // 5x5 window sums, then response R = det - 0.05 trace^2
  const R = new Float32Array(W * H);
  for (let y = 3; y < H - 3; y++) for (let x = 3; x < W - 3; x++) {
    let a = 0, b = 0, c = 0;
    for (let v = -2; v <= 2; v++) for (let u = -2; u <= 2; u++) {
      const j = (y + v) * W + x + u;
      a += xx[j]; b += yy[j]; c += xy[j];
    }
    R[y * W + x] = a * b - c * c - 0.05 * (a + b) * (a + b);
  }
  const pts = [];
  for (let y = 4; y < H - 4; y++) for (let x = 4; x < W - 4; x++) {
    const r = R[y * W + x];
    if (r < 2e-5) continue;
    let peak = true;
    for (let v = -3; v <= 3 && peak; v++) for (let u = -3; u <= 3; u++) {
      if ((u || v) && R[(y + v) * W + x + u] > r) { peak = false; break; }
    }
    if (peak) pts.push({ x: x / W, y: y / H, r, p: g[y * W + x] });
  }
  pts.sort((p, q) => q.r - p.r);
  return pts.slice(0, 160);
}

function drawVision() {
  const w = kp.clientWidth;
  const h = kp.clientHeight;
  const dpr = Math.min(window.devicePixelRatio, 2);
  if (kp.width !== Math.round(w * dpr)) { kp.width = Math.round(w * dpr); kp.height = Math.round(h * dpr); }
  const pts = harris();
  kpx.setTransform(dpr, 0, 0, dpr, 0, 0);
  kpx.clearRect(0, 0, w, h);
  let tracked = 0;
  kpx.lineWidth = 1.5;
  for (const p of pts) {
    // nearest corner of the previous frame with a similar brightness = the same point, moved
    let best = null, bd = 0.03;
    for (const q of prevPts) {
      const dd = Math.hypot(p.x - q.x, p.y - q.y);
      if (dd < bd && Math.abs(p.p - q.p) < 0.08) { bd = dd; best = q; }
    }
    p.trail = best ? [...best.trail.slice(-8), [best.x, best.y]] : [];
    if (best) tracked++;
    if (p.trail.length > 1) {
      kpx.strokeStyle = 'rgba(255, 92, 154, .8)';
      kpx.beginPath();
      p.trail.forEach(([x, y], i) => (i ? kpx.lineTo(x * w, y * h) : kpx.moveTo(x * w, y * h)));
      kpx.lineTo(p.x * w, p.y * h);
      kpx.stroke();
    }
    kpx.strokeStyle = best ? '#3fe0b0' : '#ffd166';
    kpx.beginPath();
    kpx.arc(p.x * w, p.y * h, 4, 0, Math.PI * 2);
    kpx.stroke();
  }
  prevPts = pts;
  kpStat.textContent = `${pts.length} Harris corners · ${tracked} tracked from the last frame`;
}

// ---------- controls and views ----------
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.enableZoom = false; // keeps page scrolling working over the canvas
canvas.style.touchAction = 'pan-y'; // phones: swipe up/down scrolls the page, sideways rotates
controls.minPolarAngle = 0.35;
controls.maxPolarAngle = Math.PI / 2 - 0.04;
controls.autoRotate = !reducedMotion;
controls.autoRotateSpeed = 0.7;

let resumeTimer = 0;
let tween = null;
let dragged = false;

controls.addEventListener('start', () => {
  controls.autoRotate = false;
  clearTimeout(resumeTimer);
  tween = null;
  if (!dragged) {
    dragged = true;
    hintEl.classList.add('is-hidden');
  }
});
controls.addEventListener('end', scheduleResume);

function scheduleResume() {
  clearTimeout(resumeTimer);
  if (reducedMotion || tourTimer) return;
  resumeTimer = setTimeout(() => (controls.autoRotate = true), 3000);
}

// pull the camera back on narrow screens so the disc still fits
function fitted(view) {
  const target = new THREE.Vector3(...view.target);
  const pos = new THREE.Vector3(...view.pos);
  const k = Math.min(2.2, Math.max(1, 1.35 / camera.aspect));
  return { target, pos: target.clone().add(pos.sub(target).multiplyScalar(k)) };
}

function goTo(name, instant = false) {
  const v = fitted(VIEWS[name]);
  pills.forEach((p) => {
    const on = p.dataset.view === name;
    p.classList.toggle('is-active', on);
    p.setAttribute('aria-pressed', String(on));
  });
  if (instant || reducedMotion) {
    camera.position.copy(v.pos);
    controls.target.copy(v.target);
    return;
  }
  controls.autoRotate = false;
  clearTimeout(resumeTimer);
  tween = { t: 0, start: performance.now(), fromPos: camera.position.clone(), fromTarget: controls.target.clone(), ...v };
}

// each stop: where the camera goes and which story opens
const STOP_SPOT = { desk: 'kinga', alps: 'eth', moon: 'esa', drone: 'drone' };
function visit(name) {
  goTo(name);
  const s = SPOTS.find((o) => o.id === STOP_SPOT[name]);
  if (s) open(s);
  else closeCard();
}
pills.forEach((p) => p.addEventListener('click', () => {
  stopTour();
  visit(p.dataset.view);
}));

// guided tour: every stop in turn, then back to the overview
const TOUR = ['desk', 'alps', 'moon', 'drone', 'overview'];
const tourBtn = document.getElementById('tour');
let tourTimer = 0;
function stopTour() {
  if (!tourTimer) return;
  clearInterval(tourTimer);
  tourTimer = 0;
  tourBtn.setAttribute('aria-pressed', 'false');
  tourBtn.querySelector('.tour-text').textContent = 'Take the tour';
  scheduleResume();
}
tourBtn.addEventListener('click', () => {
  if (tourTimer) return stopTour();
  let i = 0;
  visit(TOUR[i]);
  tourBtn.setAttribute('aria-pressed', 'true');
  tourBtn.querySelector('.tour-text').textContent = 'Stop the tour';
  tourTimer = setInterval(() => {
    if (++i >= TOUR.length) return stopTour();
    visit(TOUR[i]);
  }, 6500);
});
controls.addEventListener('start', stopTour);

function resize() {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  if (!w || !h) return;
  // draw at least twice the screen resolution (smooth edges), and follow browser zoom
  // phones: native resolution is enough and saves battery
  renderer.setPixelRatio(w < 700 ? Math.min(window.devicePixelRatio, 2) : Math.min(Math.max(window.devicePixelRatio, 2), 3));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);
resize();
goTo('overview', true);

// ---------- animation ----------
const clock = new THREE.Clock();
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
let first = true;
const lookEuler = new THREE.Euler();
const lookQ = new THREE.Quaternion();

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (tween) {
    tween.t = Math.min(1, (performance.now() - tween.start) / 1200);
    const k = ease(tween.t);
    camera.position.lerpVectors(tween.fromPos, tween.pos, k);
    controls.target.lerpVectors(tween.fromTarget, tween.target, k);
    if (tween.t >= 1) {
      tween = null;
      scheduleResume();
    }
  }
  controls.update();

  // character: eyes on the screen, the head only drifts a little
  if (character.userData.neck) {
    let pitch = Math.sin(t * 0.5) * 0.02;
    let yaw = Math.sin(t * 0.3) * 0.04;
    if (t < greetUntil) {
      // split the turn towards the camera over neck and head, ease in and out
      const k = Math.sin(Math.min(1, (greetUntil - t) / 3.5) * Math.PI);
      const to = camera.position.clone().sub(character.getWorldPosition(tmp));
      yaw += Math.max(-0.6, Math.min(0.6, Math.atan2(to.x, to.z) / 2)) * Math.min(1, k * 1.6);
      pitch -= 0.12 * Math.min(1, k * 1.6);
    }
    lookEuler.set(pitch, yaw, 0, 'YXZ');
    lookQ.setFromEuler(lookEuler);
    for (const n of character.userData.neck) {
      n.bone.quaternion.copy(n.parentInv).multiply(lookQ).multiply(n.parentQ).multiply(n.rest);
    }
  }

  const b = drone.userData.body;
  b.position.y = 1.55 + Math.sin(t * 1.3) * 0.04;
  b.rotation.y = Math.sin(t * 0.4) * 0.3;
  drone.userData.props.forEach((p, i) => (p.rotation.y = t * 30 * (i % 3 ? 1 : -1)));
  moon.userData.beacon.visible = t % 1.4 < 0.18;
  if (Math.floor(t * 12) !== Math.floor((t - dt) * 12)) scatterEvents(moon.userData.events);
  alps.userData.flag.rotation.y = Math.sin(t * 2.2) * 0.25;
  tea.userData.steam.forEach((sp) => {
    const k = (t * 0.45 + sp.userData.phase) % 1;
    sp.position.set(0.1 + Math.sin(k * 6 + sp.userData.phase * 9) * 0.012, 0.12 + k * 0.16, 0);
    sp.scale.setScalar(0.6 + k * 1.4);
    sp.material.opacity = 0.55 * Math.sin(k * Math.PI);
  });

  desk.userData.glow.intensity = 0.5 + Math.sin(t * 3.1) * 0.04;

  renderer.render(scene, camera);
  placeSpots();
  if (vision && tick++ % 2 === 0) drawVision();

  if (first && avatarReady) {
    first = false;
    loadingEl.classList.add('is-hidden');
    hintEl.classList.add('is-visible');
  }
}
renderer.setAnimationLoop(frame);
