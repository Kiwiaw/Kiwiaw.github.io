// Dutch licence plate reading on raw RGBA pixels: the three steps of the TU Delft course project.
// 1. find yellow, plate-shaped regions; 2. split each plate into characters; 3. match them to templates.

const lum = (p, i) => 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];

// 1. yellow pixels (hue 25-65 degrees, saturated, not dark), grouped into connected regions
export function findPlates(px, w, h) {
  const mask = new Uint8Array(w * h);
  for (let k = 0; k < w * h; k++) {
    const r = px[k * 4] / 255, g = px[k * 4 + 1] / 255, b = px[k * 4 + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max < 0.35 || max - min < 0.4 * max || max !== r && max !== g) continue;
    const hue = max === r ? 60 * ((g - b) / (max - min)) : 60 * (2 + (b - r) / (max - min));
    if (hue >= 25 && hue <= 65) mask[k] = 1;
  }
  const seen = new Uint8Array(w * h);
  const plates = [];
  const stack = [];
  for (let k = 0; k < w * h; k++) {
    if (!mask[k] || seen[k]) continue;
    let x0 = w, x1 = 0, y0 = h, y1 = 0, area = 0;
    stack.push(k);
    seen[k] = 1;
    while (stack.length) {
      const q = stack.pop();
      const x = q % w, y = (q / w) | 0;
      area++;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (const n of [q - 1, q + 1, q - w, q + w]) {
        if (n >= 0 && n < w * h && !seen[n] && mask[n] && Math.abs((n % w) - x) <= 1) { seen[n] = 1; stack.push(n); }
      }
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const ratio = bw / bh;
    if (area > 120 && ratio > 2.2 && ratio < 7 && area / (bw * bh) > 0.3) plates.push({ x0, y0, x1, y1 });
  }
  return { mask, plates };
}

// 2. dark pixels inside the plate (Otsu threshold), grouped into blobs; a character is a blob of
// about plate height that does not touch the plate's edge (that would be its border or the bumper)
export function splitChars(px, w, plate) {
  const { x0, y0, x1, y1 } = plate;
  const pw = x1 - x0 + 1, ph = y1 - y0 + 1;
  const hist = new Array(256).fill(0);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) hist[Math.round(lum(px, (y * w + x) * 4))]++;
  const total = pw * ph;
  let sumAll = 0;
  hist.forEach((n, v) => (sumAll += n * v));
  let best = -1, thr = 128, wB = 0, sumB = 0;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB || wB === total) continue;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sumAll - sumB) / (total - wB);
    const between = wB * (total - wB) * (mB - mF) ** 2;
    if (between > best) { best = between; thr = t; }
  }
  const ink = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1 && lum(px, (y * w + x) * 4) <= thr;
  const seen = new Uint8Array(pw * ph);
  const chars = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const k = (y - y0) * pw + (x - x0);
    if (seen[k] || !ink(x, y)) continue;
    let bx0 = x, bx1 = x, by0 = y, by1 = y, area = 0;
    const stack = [[x, y]];
    seen[k] = 1;
    while (stack.length) {
      const [cx, cy] = stack.pop();
      area++;
      bx0 = Math.min(bx0, cx); bx1 = Math.max(bx1, cx); by0 = Math.min(by0, cy); by1 = Math.max(by1, cy);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (!ink(nx, ny)) continue;
        const nk = (ny - y0) * pw + (nx - x0);
        if (!seen[nk]) { seen[nk] = 1; stack.push([nx, ny]); }
      }
    }
    const edge = bx0 <= x0 || bx1 >= x1 || by0 <= y0 || by1 >= y1;
    const bh = by1 - by0 + 1, bw = bx1 - bx0 + 1, mid = (by0 + by1) / 2 - y0;
    if (edge) continue;
    if (bh >= ph * 0.4 && bh <= ph * 0.95 && bw <= bh * 1.2) chars.push({ x0: bx0, x1: bx1 + 1, y0: by0, y1: by1 + 1 });
    else if (bh <= ph * 0.25 && bw >= 2 && bw >= bh && mid > ph * 0.3 && mid < ph * 0.7) chars.push({ x0: bx0, x1: bx1 + 1, y0: by0, y1: by1 + 1, dash: true });
  }
  chars.sort((a, b) => a.x0 - b.x0);
  return { chars, ink, thr };
}

// 3. each character against every template; a group between dashes is all letters or all digits
const unit = (g) => {
  const m = g.reduce((a, v) => a + v, 0) / g.length;
  const d = Math.hypot(...g.map((v) => v - m)) || 1;
  return g.map((v) => (v - m) / d);
};
export function loadTemplates(json) {
  const parse = (set) => Object.entries(set).map(([ch, s]) => ({ ch, g: unit([...s].map(Number)) }));
  return { w: json.w, h: json.h, letters: parse(json.letters), digits: parse(json.digits) };
}

export function recognise(ink, chars, T) {
  const grid = (c) => {
    const g = new Array(T.w * T.h).fill(0);
    for (let j = 0; j < T.h; j++) for (let i = 0; i < T.w; i++) {
      const xa = c.x0 + (i * (c.x1 - c.x0)) / T.w, xb = c.x0 + ((i + 1) * (c.x1 - c.x0)) / T.w;
      const ya = c.y0 + (j * (c.y1 - c.y0)) / T.h, yb = c.y0 + ((j + 1) * (c.y1 - c.y0)) / T.h;
      let s = 0, n = 0;
      for (let y = Math.floor(ya); y < Math.max(Math.ceil(yb), Math.floor(ya) + 1); y++) {
        for (let x = Math.floor(xa); x < Math.max(Math.ceil(xb), Math.floor(xa) + 1); x++) { s += ink(x, y); n++; }
      }
      g[j * T.w + i] = s / n;
    }
    return unit(g);
  };
  const best = (g, set) => set.reduce((b, t) => {
    const s = t.g.reduce((a, v, k) => a + v * g[k], 0);
    return s > b.score ? { ch: t.ch, score: s } : b;
  }, { ch: '?', score: -2 });
  const groups = [[]];
  for (const c of chars) {
    if (c.dash) { c.ch = '-'; groups.push([]); } else groups.at(-1).push(c);
  }
  for (const group of groups) {
    const gs = group.map(grid);
    const asL = gs.map((g) => best(g, T.letters));
    const asD = gs.map((g) => best(g, T.digits));
    const sum = (r) => r.reduce((a, b) => a + b.score, 0);
    const pick = sum(asL) > sum(asD) ? asL : asD;
    group.forEach((c, k) => Object.assign(c, pick[k]));
  }
  return chars.map((c) => c.ch).join('');
}
