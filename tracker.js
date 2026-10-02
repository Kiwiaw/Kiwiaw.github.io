// Multi-camera drone tracking, told in four steps: one camera only gives a direction,
// two cameras give a position, three are more accurate, and they keep tracking when one view is blocked.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const root = document.querySelector('#track'); // the whole project card: step buttons, canvases, caption
// set up only when the demo gets close to the screen: it needs its own WebGL context
if (root) {
  new IntersectionObserver(([e], obs) => {
    if (e.isIntersecting) { obs.disconnect(); init(); }
  }, { rootMargin: '600px' }).observe(root);
}

function init() {
  const canvas = root.querySelector('.mc-canvas');
  const overlay = root.querySelector('.mc-overlay');
  const ox = overlay.getContext('2d');
  const caption = root.querySelector('.mc-caption');
  const noiseIn = root.querySelector('.mc-noise');
  const W = 960, H = 620, SPLIT = 400; // main view on top, three camera images below

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W, H, false);
  renderer.setScissorTest(true);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#eef0f6');
  scene.add(new THREE.HemisphereLight('#ffffff', '#b8bdd0', 2.2));
  const sun = new THREE.DirectionalLight('#ffffff', 1.4);
  sun.position.set(3, 6, 2);
  scene.add(sun);

  // room: floor 6 x 4 m
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 4), new THREE.MeshStandardMaterial({ color: '#d9dce8' }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const grid = new THREE.GridHelper(6, 12, '#b4b8c9', '#c6c9d6');
  grid.scale.z = 4 / 6;
  grid.position.y = 0.002;
  scene.add(grid);
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 2.6, 24), new THREE.MeshStandardMaterial({ color: '#8f93a8' }));
  pillar.position.set(1.4, 1.3, 0.55);
  pillar.visible = false;
  scene.add(pillar);

  // drone
  const drone = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: '#2c2a33' });
  drone.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.16), dark));
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.015, 0.02), dark);
    arm.position.set(sx * 0.07, 0, sz * 0.07);
    arm.rotation.y = sx * sz > 0 ? -Math.PI / 4 : Math.PI / 4;
    drone.add(arm);
    const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.01, 18), new THREE.MeshStandardMaterial({ color: '#3f9a94', transparent: true, opacity: 0.7 }));
    rotor.position.set(sx * 0.14, 0.03, sz * 0.14);
    drone.add(rotor);
  }
  drone.scale.setScalar(2);
  scene.add(drone);

  // cameras on poles in three corners, aimed at the middle of the room
  const COLORS = ['#e6a817', '#b4415f', '#2f7fd0'];
  const cams = [[-2.8, 2.3, -1.8], [2.8, 2.3, -1.8], [0, 2.3, 1.85]].map((p, k) => {
    const cam = new THREE.PerspectiveCamera(55, (W / 3) / (H - SPLIT), 0.1, 20);
    cam.position.set(...p);
    cam.lookAt(0, 1.0, 0);
    cam.updateMatrixWorld(); // project/unproject below need it before the first render
    const body = new THREE.Group();
    body.position.copy(cam.position);
    body.quaternion.copy(cam.quaternion);
    const mat = new THREE.MeshStandardMaterial({ color: COLORS[k] });
    body.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.22), mat));
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 16), dark);
    lens.rotation.x = Math.PI / 2;
    lens.position.z = -0.14;
    body.add(lens);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, p[1], 8), dark);
    pole.position.set(p[0], p[1] / 2, p[2]);
    body.layers.set(1);
    body.children.forEach((c) => c.layers.set(1));
    pole.layers.set(1);
    scene.add(body, pole);
    // sight line as a thin tube (WebGL lines are always 1 px wide)
    const ray = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1, 8).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: COLORS[k] }));
    ray.layers.set(1);
    ray.frustumCulled = false;
    scene.add(ray);
    return { cam, ray, on: true, color: COLORS[k], name: `Camera ${k + 1}` };
  });

  // "could be here" ghosts along the single ray, and the estimate
  const ghosts = Array.from({ length: 5 }, () => {
    const g = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), new THREE.MeshBasicMaterial({ color: '#e6a817', transparent: true, opacity: 0.45 }));
    g.layers.set(1);
    scene.add(g);
    return g;
  });
  const estimate = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 12), new THREE.MeshBasicMaterial({ color: '#3fe0b0', wireframe: true }));
  estimate.layers.set(1);
  scene.add(estimate);

  const view = new THREE.PerspectiveCamera(42, W / SPLIT, 0.1, 50);
  view.position.set(3.9, 3.2, 4.6);
  view.layers.enable(1);
  const controls = new OrbitControls(view, canvas);
  controls.target.set(0, 0.9, 0);
  controls.enableZoom = false;
  controls.enableDamping = true;
  canvas.style.touchAction = 'pan-y';

  // ---------- the four steps ----------
  const STEPS = [
    { cams: [true, false, false], pillar: false,
      text: 'One camera sees the drone as a dot in its image. That fixes a direction, not a distance: the drone could be anywhere along the yellow line.' },
    { cams: [true, true, false], pillar: false,
      text: 'A second camera from another angle gives a second line. Where the two lines (nearly) cross is the drone: this is triangulation.' },
    { cams: [true, true, true], pillar: false,
      text: 'A third camera adds a third line. Noise in each image no longer pulls the estimate as far, so the error drops.' },
    { cams: [true, true, true], pillar: true,
      text: 'A pillar now blocks some views. Any two cameras that still see the drone are enough, so tracking keeps going where one camera alone would lose it.' },
  ];
  const stepBtns = [...root.querySelectorAll('[data-step]')];
  let stepIdx = 0;
  function setStep(i) {
    stepIdx = i;
    const s = STEPS[i];
    cams.forEach((c, k) => (c.on = s.cams[k]));
    pillar.visible = s.pillar;
    caption.textContent = s.text;
    errs.length = 0;
    stepBtns.forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
  }
  stepBtns.forEach((b, i) => b.addEventListener('click', () => setStep(i)));

  // click a camera image to switch that camera off or on
  canvas.addEventListener('click', (e) => {
    const r = canvas.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const py = ((e.clientY - r.top) / r.height) * H;
    if (py < SPLIT) return;
    const c = cams[Math.min(2, Math.floor(px / (W / 3)))];
    c.on = !c.on;
    caption.textContent = `${c.name} switched ${c.on ? 'on' : 'off'}.`;
    errs.length = 0;
  });

  // ---------- measurement and triangulation ----------
  const errs = [];
  const raycaster = new THREE.Raycaster();
  const tmp = new THREE.Vector3();
  const gauss = () => Math.sqrt(-2 * Math.log(Math.random() + 1e-12)) * Math.cos(2 * Math.PI * Math.random());

  function observe(c) {
    // is the drone in front of the camera, inside its image, and not hidden behind the pillar?
    const ndc = drone.position.clone().project(c.cam);
    if (ndc.z > 1 || Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1) return null;
    const to = drone.position.clone().sub(c.cam.position);
    raycaster.set(c.cam.position, to.clone().normalize());
    if (pillar.visible && raycaster.intersectObject(pillar)[0]?.distance < to.length()) return { blocked: true };
    // detection with pixel noise (image is 320 px wide)
    const sigma = (+noiseIn.value / 160);
    const nx = ndc.x + sigma * gauss();
    const ny = ndc.y + sigma * gauss() * c.cam.aspect;
    const dir = new THREE.Vector3(nx, ny, 0.5).unproject(c.cam).sub(c.cam.position).normalize();
    return { ndc: [nx, ny], dir };
  }

  function triangulate(rays) {
    // the point closest to all rays: (sum of I - d d^T) p = sum of (I - d d^T) c
    const A = new THREE.Matrix3().set(0, 0, 0, 0, 0, 0, 0, 0, 0);
    const b = new THREE.Vector3();
    for (const { c, dir } of rays) {
      const d = dir;
      const M = new THREE.Matrix3().set(
        1 - d.x * d.x, -d.x * d.y, -d.x * d.z,
        -d.x * d.y, 1 - d.y * d.y, -d.y * d.z,
        -d.x * d.z, -d.y * d.z, 1 - d.z * d.z);
      for (let i = 0; i < 9; i++) A.elements[i] += M.elements[i];
      b.add(c.cam.position.clone().applyMatrix3(M));
    }
    if (Math.abs(A.determinant()) < 1e-6) return null;
    return b.applyMatrix3(A.invert());
  }

  let visible = false;
  let t = 0;
  function frame() {
    if (!visible) return;
    t += 1 / 60;
    drone.position.set(1.9 * Math.sin(t * 0.45), 1.1 + 0.45 * Math.sin(t * 0.9), 1.2 * Math.sin(t * 0.9));
    drone.rotation.y = t * 0.4;

    const seen = [];
    const obs = cams.map((c) => (c.on ? observe(c) : null));
    cams.forEach((c, k) => {
      const o = obs[k];
      c.ray.visible = !!(o && o.dir);
      if (c.ray.visible) {
        c.ray.position.copy(c.cam.position);
        c.ray.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), o.dir);
        c.ray.scale.set(1, 9, 1);
        seen.push({ c, dir: o.dir });
      }
    });
    const est = seen.length >= 2 ? triangulate(seen) : null;
    estimate.visible = !!est;
    if (est) {
      estimate.position.copy(est);
      errs.push(est.distanceTo(drone.position));
      if (errs.length > 120) errs.shift();
    }
    ghosts.forEach((g, i) => {
      g.visible = seen.length === 1;
      if (g.visible) g.position.copy(seen[0].c.cam.position).addScaledVector(seen[0].dir, 1.6 + i * 0.9);
    });

    // main view, then the three camera images
    controls.update();
    renderer.setViewport(0, H - SPLIT, W, SPLIT);
    renderer.setScissor(0, H - SPLIT, W, SPLIT);
    renderer.render(scene, view);
    cams.forEach((c, k) => {
      renderer.setViewport((k * W) / 3, 0, W / 3, H - SPLIT);
      renderer.setScissor((k * W) / 3, 0, W / 3, H - SPLIT);
      renderer.render(scene, c.cam);
    });

    // overlay: detections in each image, labels, and the result
    ox.clearRect(0, 0, W, H);
    ox.font = '600 15px Poppins, sans-serif';
    const ih = H - SPLIT, iw = W / 3;
    cams.forEach((c, k) => {
      const x0 = k * iw;
      const o = obs[k];
      ox.fillStyle = c.on ? 'rgba(20, 23, 43, 0)' : 'rgba(20, 23, 43, .7)';
      ox.fillRect(x0, SPLIT, iw, ih);
      ox.strokeStyle = c.color;
      ox.lineWidth = 4;
      ox.strokeRect(x0 + 2, SPLIT + 2, iw - 4, ih - 4);
      ox.fillStyle = c.color;
      ox.fillRect(x0 + 2, SPLIT + 2, 104, 24);
      ox.fillStyle = '#fff';
      ox.fillText(c.name, x0 + 10, SPLIT + 20);
      ox.fillStyle = '#fff';
      if (!c.on) ox.fillText('off · click to switch on', x0 + 16, SPLIT + ih / 2);
      else if (o?.blocked) { ox.fillStyle = '#b4415f'; ox.fillText('view blocked', x0 + 16, SPLIT + ih - 14); }
      else if (!o) { ox.fillStyle = '#74747f'; ox.fillText('out of view', x0 + 16, SPLIT + ih - 14); }
      else {
        const px = x0 + ((o.ndc[0] + 1) / 2) * iw, py = SPLIT + ((1 - o.ndc[1]) / 2) * ih;
        ox.strokeStyle = c.color;
        ox.lineWidth = 3;
        ox.beginPath(); ox.arc(px, py, 13, 0, Math.PI * 2); ox.stroke();
        ox.beginPath(); ox.moveTo(px - 20, py); ox.lineTo(px - 8, py); ox.moveTo(px + 8, py); ox.lineTo(px + 20, py);
        ox.moveTo(px, py - 20); ox.lineTo(px, py - 8); ox.moveTo(px, py + 8); ox.lineTo(px, py + 20); ox.stroke();
      }
    });
    ox.fillStyle = 'rgba(255, 255, 255, .92)';
    ox.fillRect(12, 12, 330, 58);
    ox.fillStyle = '#1f2547';
    ox.font = '600 16px Poppins, sans-serif';
    ox.fillText(seen.length >= 2 ? `Position from ${seen.length} cameras` : seen.length === 1 ? 'One camera: direction only' : 'No camera sees the drone', 24, 37);
    ox.font = '14px Poppins, sans-serif';
    const mean = errs.length ? errs.reduce((a, b) => a + b, 0) / errs.length : null;
    ox.fillText(est ? `average error over 2 s: ${(mean * 100).toFixed(1)} cm` : seen.length === 1 ? 'distance unknown' : 'lost', 24, 59);
    requestAnimationFrame(frame);
  }

  setStep(0);
  new IntersectionObserver(([e]) => {
    const was = visible;
    visible = e.isIntersecting;
    if (visible && !was) requestAnimationFrame(frame);
  }).observe(canvas);
}
