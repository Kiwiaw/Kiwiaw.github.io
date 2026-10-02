// Interactive project demos: an ARC-AGI puzzle and a DLT camera calibration in the browser.

// ---------- ARC puzzle: the output is the input next to its mirror image (so the width doubles) ----------
const ARC_COLORS = ['#111111', '#1e93ff', '#f93c31', '#4fcc30', '#ffdc00', '#999999', '#e53aa3', '#ff851b', '#87d8f1', '#921231'];
const mirror = (g) => g.map((row) => [...row, ...[...row].reverse()]);
const EXAMPLES = [
  [[1, 0, 0], [1, 1, 0], [0, 0, 2]],
  [[3, 3, 0, 4], [0, 3, 0, 0]],
];
const TEST = [[0, 5, 0], [6, 5, 0], [0, 0, 6]];

function gridEl(g, cls = '') {
  const el = document.createElement('div');
  el.className = `arc-grid ${cls}`;
  el.style.gridTemplateColumns = `repeat(${g[0].length}, 1fr)`;
  el.style.aspectRatio = `${g[0].length} / ${g.length}`;
  g.flat().forEach((c) => {
    const cell = document.createElement('span');
    cell.style.background = ARC_COLORS[c];
    el.appendChild(cell);
  });
  return el;
}

function pair(a, b, caption) {
  const el = document.createElement('figure');
  el.className = 'arc-pair';
  el.append(gridEl(a), Object.assign(document.createElement('span'), { className: 'arc-arrow', textContent: '→' }));
  el.append(b ? gridEl(b) : Object.assign(document.createElement('span'), { className: 'arc-q', textContent: '?' }));
  el.append(Object.assign(document.createElement('figcaption'), { textContent: caption }));
  return el;
}

const arc = document.querySelector('[data-arc]');
if (arc) {
  EXAMPLES.forEach((g, i) => arc.querySelector('.arc-examples').append(pair(g, mirror(g), `Example ${i + 1}`)));
  arc.querySelector('.arc-test').append(pair(TEST, null, 'Test'));
  const edit = arc.querySelector('.arc-grid--edit');
  const result = arc.querySelector('.arc-result');
  let colour = 1;
  let answer = TEST.map((row) => row.map(() => 0));
  let painting = false;

  const palette = arc.querySelector('.arc-palette');
  ARC_COLORS.forEach((c, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.style.background = c;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-label', `colour ${i}`);
    b.setAttribute('aria-checked', String(i === colour));
    b.addEventListener('click', () => {
      colour = i;
      palette.querySelectorAll('button').forEach((o, j) => o.setAttribute('aria-checked', String(j === i)));
    });
    palette.appendChild(b);
  });

  function draw() {
    const h = answer.length;
    const w = answer[0].length;
    edit.style.gridTemplateColumns = `repeat(${w}, 1fr)`;
    edit.style.aspectRatio = `${w} / ${h}`;
    edit.style.width = `${w * 28}px`;
    edit.replaceChildren(...answer.flat().map((c, k) => {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.style.background = ARC_COLORS[c];
      cell.setAttribute('aria-label', `row ${Math.floor(k / w) + 1}, column ${(k % w) + 1}`);
      const paint = () => {
        answer[Math.floor(k / w)][k % w] = colour;
        cell.style.background = ARC_COLORS[colour];
      };
      cell.addEventListener('pointerdown', (e) => { painting = true; paint(); e.preventDefault(); });
      cell.addEventListener('pointerenter', () => painting && paint());
      cell.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && paint());
      return cell;
    }));
  }
  window.addEventListener('pointerup', () => (painting = false));

  arc.querySelectorAll('[data-size]').forEach((b) => b.addEventListener('click', () => {
    const [axis, sign] = b.dataset.size;
    const h = answer.length;
    const w = answer[0].length;
    const nh = Math.max(1, Math.min(10, h + (axis === 'h' ? (sign === '+' ? 1 : -1) : 0)));
    const nw = Math.max(1, Math.min(10, w + (axis === 'w' ? (sign === '+' ? 1 : -1) : 0)));
    answer = Array.from({ length: nh }, (_, y) => Array.from({ length: nw }, (_, x) => answer[y]?.[x] ?? 0));
    draw();
  }));

  arc.querySelector('.arc-check').addEventListener('click', () => {
    const want = mirror(TEST);
    if (answer.length !== want.length || answer[0].length !== want[0].length) {
      result.textContent = `Wrong size: you have ${answer[0].length}×${answer.length}, the answer is not. Getting the shape wrong is exactly what my GPT-2 does most.`;
      result.className = 'arc-result is-bad';
      return;
    }
    const wrong = want.flat().filter((c, i) => c !== answer.flat()[i]).length;
    result.textContent = wrong ? `Right size, ${wrong} cell${wrong > 1 ? 's' : ''} off. Look at example 1 again.` : 'Solved. The output is the input next to its mirror image.';
    result.className = `arc-result ${wrong ? 'is-bad' : 'is-good'}`;
  });
  draw();
}

// ---------- DLT: recover a camera matrix from 2D-3D correspondences ----------
const dlt = document.querySelector('.dlt');
if (dlt) {
  const cv = dlt.querySelector('canvas');
  const x = cv.getContext('2d');
  const W = cv.width;
  const H = cv.height;
  const F = 800;
  const noiseIn = dlt.querySelector('.dlt-noise');
  const normIn = dlt.querySelector('.dlt-norm');
  const out = (s) => dlt.querySelector(s);

  // rig: two checkerboards at a right angle, 40 mm squares
  const rig = [];
  for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) {
    rig.push([0, 20 + i * 40, 20 + j * 40]);
    rig.push([20 + i * 40, 0, 20 + j * 40]);
  }
  let yaw = 0.8;
  let pitch = 0.45;
  let seed = 3;
  const gauss = () => {
    const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
  };
  let unit = rig.map(() => [gauss(), gauss()]);

  const sub = (a, b) => a.map((v, i) => v - b[i]);
  const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => a.map((v) => v / Math.hypot(...a));

  function trueP() {
    const target = [90, 90, 70];
    const C = [target[0] + 650 * Math.cos(pitch) * Math.cos(yaw), target[1] + 650 * Math.cos(pitch) * Math.sin(yaw), target[2] + 650 * Math.sin(pitch)];
    const z = norm(sub(target, C));
    const xa = norm(cross(z, [0, 0, 1]));
    const ya = cross(z, xa);
    const R = [xa, ya, z];
    const t = R.map((r) => -dot(r, C));
    const K = [[F, 0, W / 2], [0, F, H / 2], [0, 0, 1]];
    return K.map((k) => [0, 1, 2, 3].map((c) => k.reduce((s, kv, m) => s + kv * (c < 3 ? R[m][c] : t[m]), 0)));
  }
  const project = (P, X) => {
    const h = P.map((r) => r[0] * X[0] + r[1] * X[1] + r[2] * X[2] + r[3]);
    return [h[0] / h[2], h[1] / h[2]];
  };

  // eigen-decomposition of a symmetric matrix (cyclic Jacobi)
  function eig(A) {
    const n = A.length;
    const a = A.map((r) => [...r]);
    const V = a.map((_, i) => a.map((__, j) => +(i === j)));
    for (let sweep = 0; sweep < 80; sweep++) {
      let off = 0;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] ** 2;
      if (off < 1e-30 * (a.reduce((s, r, i) => s + r[i] ** 2, 0) + 1e-300)) break;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue;
        const th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k][p], akq = a[k][q];
          a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k], aqk = a[q][k];
          a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k][p], vkq = V[k][q];
          V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq;
        }
      }
    }
    return a.map((r, i) => ({ value: r[i], vector: V.map((row) => row[i]) })).sort((p, q) => p.value - q.value);
  }

  // similarity transform: centroid to 0, mean distance to sqrt(d)
  function normaliser(pts) {
    const d = pts[0].length;
    const c = Array.from({ length: d }, (_, k) => pts.reduce((s, p) => s + p[k], 0) / pts.length);
    const mean = pts.reduce((s, p) => s + Math.hypot(...sub(p, c)), 0) / pts.length;
    const s = Math.sqrt(d) / mean;
    return { apply: (p) => p.map((v, k) => (v - c[k]) * s), s, c };
  }

  function solve(X3, x2, hartley) {
    const n3 = hartley ? normaliser(X3) : { apply: (p) => p, s: 1, c: [0, 0, 0] };
    const n2 = hartley ? normaliser(x2) : { apply: (p) => p, s: 1, c: [0, 0] };
    const M = Array.from({ length: 12 }, () => new Array(12).fill(0));
    X3.forEach((Xw, i) => {
      const [X, Y, Z] = n3.apply(Xw);
      const [u, v] = n2.apply(x2[i]);
      for (const row of [[X, Y, Z, 1, 0, 0, 0, 0, -u * X, -u * Y, -u * Z, -u], [0, 0, 0, 0, X, Y, Z, 1, -v * X, -v * Y, -v * Z, -v]]) {
        for (let r = 0; r < 12; r++) for (let c = 0; c < 12; c++) M[r][c] += row[r] * row[c];
      }
    });
    const e = eig(M);
    const p = e[0].vector;
    let P = [p.slice(0, 4), p.slice(4, 8), p.slice(8, 12)];
    // undo the normalisation: P = T2^-1 * P~ * T3
    const T3 = [[n3.s, 0, 0, -n3.s * n3.c[0]], [0, n3.s, 0, -n3.s * n3.c[1]], [0, 0, n3.s, -n3.s * n3.c[2]], [0, 0, 0, 1]];
    const T2i = [[1 / n2.s, 0, n2.c[0]], [0, 1 / n2.s, n2.c[1]], [0, 0, 1]];
    const mul = (A, B) => A.map((r) => B[0].map((_, c) => r.reduce((s, v, k) => s + v * B[k][c], 0)));
    P = mul(mul(T2i, P), T3);
    return { P, cond: e[11].value / Math.max(e[1].value, 1e-300) };
  }

  function focal(P) {
    const [m1, m2, m3] = P.map((r) => r.slice(0, 3));
    const l2 = dot(m3, m3);
    const u0 = dot(m1, m3) / l2;
    const v0 = dot(m2, m3) / l2;
    return (Math.sqrt(dot(m1, m1) / l2 - u0 * u0) + Math.sqrt(dot(m2, m2) / l2 - v0 * v0)) / 2;
  }

  function render() {
    const sigma = +noiseIn.value;
    out('.dlt-noise-out').textContent = `${sigma.toFixed(1)} px`;
    const Pt = trueP();
    const truth = rig.map((X) => project(Pt, X));
    const seen = truth.map((p, i) => [p[0] + sigma * unit[i][0], p[1] + sigma * unit[i][1]]);
    const { P, cond } = solve(rig, seen, normIn.checked);
    const rep = rig.map((X) => project(P, X));
    const rms = Math.sqrt(rep.reduce((s, p, i) => s + (p[0] - truth[i][0]) ** 2 + (p[1] - truth[i][1]) ** 2, 0) / rep.length);
    out('.dlt-err').textContent = `${rms.toFixed(2)} px`;
    out('.dlt-cond').textContent = cond.toExponential(1);
    out('.dlt-f').textContent = `${focal(P).toFixed(1)} px`;

    x.fillStyle = '#14172b';
    x.fillRect(0, 0, W, H);
    // the two boards as quads, then the error vectors (x10), then the points
    for (const plane of [0, 1]) {
      x.fillStyle = plane ? 'rgba(63, 154, 148, .18)' : 'rgba(185, 164, 232, .16)';
      const corner = (a, b) => project(Pt, plane ? [a, 0, b] : [0, a, b]);
      const q = [corner(0, 0), corner(200, 0), corner(200, 160), corner(0, 160)];
      x.beginPath();
      q.forEach(([u, v], i) => (i ? x.lineTo(u, v) : x.moveTo(u, v)));
      x.fill();
    }
    x.strokeStyle = 'rgba(255, 92, 154, .9)';
    x.lineWidth = 1.5;
    truth.forEach(([u, v], i) => {
      x.beginPath();
      x.moveTo(u, v);
      x.lineTo(u + (rep[i][0] - u) * 10, v + (rep[i][1] - v) * 10);
      x.stroke();
    });
    x.fillStyle = '#c9cbe0';
    truth.forEach(([u, v]) => x.fillRect(u - 1.5, v - 1.5, 3, 3));
    x.strokeStyle = '#ffd166';
    seen.forEach(([u, v]) => {
      x.beginPath(); x.moveTo(u - 4, v - 4); x.lineTo(u + 4, v + 4); x.moveTo(u + 4, v - 4); x.lineTo(u - 4, v + 4); x.stroke();
    });
    x.strokeStyle = '#3fe0b0';
    rep.forEach(([u, v]) => { x.beginPath(); x.arc(u, v, 5, 0, Math.PI * 2); x.stroke(); });
    x.fillStyle = '#9aa3c7';
    x.font = '13px Poppins, sans-serif';
    x.fillText('pink lines: reprojection error ×10 · drag to move the camera', 12, H - 12);
  }

  let drag = null;
  cv.addEventListener('pointerdown', (e) => { drag = [e.clientX, e.clientY]; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', (e) => {
    if (!drag) return;
    yaw += (e.clientX - drag[0]) * 0.008;
    pitch = Math.max(0.1, Math.min(1.2, pitch - (e.clientY - drag[1]) * 0.006));
    drag = [e.clientX, e.clientY];
    render();
  });
  cv.addEventListener('pointerup', () => (drag = null));
  noiseIn.addEventListener('input', render);
  normIn.addEventListener('change', render);
  dlt.querySelector('.dlt-resample').addEventListener('click', () => {
    unit = rig.map(() => [gauss(), gauss()]);
    render();
  });
  render();
}
