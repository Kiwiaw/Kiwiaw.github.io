// Licence plate recognition on real frames from the TU Delft course video.
import { findPlates, splitChars, loadTemplates, recognise } from './lpr-core.js';

const lpr = document.querySelector('#lpr'); // the whole project card: thumbnails, canvas, plate crops
if (lpr) {
  const FRAMES = [
    { id: 0, truth: ['XS-NB-23'] },
    { id: 48, truth: ['23-GSR-5'] },
    { id: 96, truth: ['89-NV-JP', '24-LSB-1'], note: 'Two plates, both small: under about 90 px wide the characters are only a few pixels tall.' },
  ];
  const cv = lpr.querySelector('.lpr-canvas');
  const x = cv.getContext('2d', { willReadFrequently: true });
  const lightIn = lpr.querySelector('.lpr-light');
  const steps = [...lpr.querySelectorAll('.lpr-steps li')];
  const out = lpr.querySelector('.lpr-plates');
  const result = lpr.querySelector('.lpr-result');
  const thumbs = lpr.querySelector('.lpr-thumbs');
  let frame = FRAMES[0];
  let templates = null;
  let timer = 0;
  const images = {};

  fetch('lpr/templates.json').then((r) => r.json()).then((j) => (templates = loadTemplates(j)));

  for (const f of FRAMES) {
    const img = new Image();
    img.src = `lpr/frame_${f.id}.jpg`;
    img.alt = '';
    images[f.id] = img;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lpr-thumb';
    b.setAttribute('aria-label', `Video frame ${f.id}`);
    b.appendChild(img.cloneNode());
    b.addEventListener('click', () => { frame = f; show(); });
    thumbs.appendChild(b);
    f.btn = b;
  }

  // the frame, darkened by the light slider (like filming at dusk)
  function show() {
    clearTimeout(timer);
    const img = images[frame.id];
    if (!img.complete) { img.onload = show; return; }
    x.filter = `brightness(${lightIn.value}%)`;
    x.drawImage(img, 0, 0, cv.width, cv.height);
    x.filter = 'none';
    lpr.querySelector('.lpr-light-out').textContent = `${lightIn.value}%`;
    FRAMES.forEach((f) => f.btn.classList.toggle('is-active', f === frame));
    steps.forEach((li) => li.classList.remove('is-on', 'is-done'));
    out.replaceChildren();
    result.textContent = '';
    result.className = 'lpr-result';
  }

  // zoomed crop of one plate: ink in navy, character boxes in pink
  function cropView(px, p, chars, ink) {
    const pw = p.x1 - p.x0 + 1, ph = p.y1 - p.y0 + 1;
    const crop = new ImageData(pw, ph);
    for (let yy = 0; yy < ph; yy++) for (let xx = 0; xx < pw; xx++) {
      const s = ((p.y0 + yy) * cv.width + p.x0 + xx) * 4;
      crop.data.set(ink(p.x0 + xx, p.y0 + yy) ? [20, 23, 43, 255] : [px[s], px[s + 1], px[s + 2], 255], (yy * pw + xx) * 4);
    }
    const tmp = document.createElement('canvas');
    tmp.width = pw;
    tmp.height = ph;
    tmp.getContext('2d').putImageData(crop, 0, 0);
    const k = Math.min(4, 260 / pw);
    const c = document.createElement('canvas');
    c.width = Math.round(pw * k);
    c.height = Math.round(ph * k);
    const cx = c.getContext('2d');
    cx.imageSmoothingEnabled = false;
    cx.drawImage(tmp, 0, 0, c.width, c.height);
    cx.strokeStyle = '#ff5c9a';
    cx.lineWidth = 2;
    chars.forEach((ch) => cx.strokeRect((ch.x0 - p.x0) * k, (ch.y0 - p.y0) * k, (ch.x1 - ch.x0) * k, (ch.y1 - ch.y0) * k));
    return c;
  }

  function run() {
    if (!templates) return;
    show();
    const px = x.getImageData(0, 0, cv.width, cv.height).data;
    const say = (i) => steps.forEach((li, k) => { li.classList.toggle('is-on', k === i); li.classList.toggle('is-done', k < i); });

    // step 1: show what counts as yellow, and the plate-shaped regions
    const { mask, plates } = findPlates(px, cv.width, cv.height);
    say(0);
    const im = x.getImageData(0, 0, cv.width, cv.height);
    for (let k = 0; k < mask.length; k++) {
      if (mask[k]) im.data.set([255, 209, 102], k * 4);
      else for (let c = 0; c < 3; c++) im.data[k * 4 + c] *= 0.4;
    }
    x.putImageData(im, 0, 0);
    x.strokeStyle = '#3fe0b0';
    x.lineWidth = 3;
    plates.forEach((p) => x.strokeRect(p.x0 - 3, p.y0 - 3, p.x1 - p.x0 + 6, p.y1 - p.y0 + 6));
    if (!plates.length) {
      steps.forEach((li) => li.classList.add('is-done'));
      result.textContent = 'No yellow plate found: in this light the plate no longer looks yellow enough. Turn the light up.';
      result.className = 'lpr-result is-bad';
      return;
    }

    // step 2: split every plate into characters
    timer = setTimeout(() => {
      say(1);
      const reads = plates.map((p) => {
        const { chars, ink } = splitChars(px, cv.width, p);
        const fig = document.createElement('figure');
        const cap = document.createElement('figcaption');
        fig.append(cropView(px, p, chars, ink), cap);
        out.appendChild(fig);
        return { chars, ink, cap, p };
      });

      // step 3: read them
      timer = setTimeout(() => {
        say(2);
        let right = 0;
        reads.forEach((r) => {
          const text = recognise(r.ink, r.chars, templates);
          const ok = frame.truth.includes(text);
          right += ok;
          const real = frame.truth.length === 1 ? frame.truth[0] : frame.truth[r.p.x0 > cv.width / 2 ? 0 : 1];
          r.cap.innerHTML = `<strong>${text || '–'}</strong> ${ok ? '✓' : `✗ <span>real plate: ${real}</span>`}`;
          r.cap.className = ok ? 'is-good' : 'is-bad';
          x.fillStyle = 'rgba(20, 23, 43, .85)';
          x.fillRect(r.p.x0 - 3, r.p.y0 - 32, Math.max(60, text.length * 12 + 12), 26);
          x.fillStyle = ok ? '#3fe0b0' : '#ffd166';
          x.font = '600 18px ui-monospace, monospace';
          x.fillText(text || '?', r.p.x0 + 3, r.p.y0 - 13);
        });
        steps.forEach((li) => li.classList.add('is-done'));
        result.textContent = `${right} of ${frame.truth.length} plate${frame.truth.length > 1 ? 's' : ''} read correctly. ${frame.note || ''}`;
        result.className = `lpr-result ${right === frame.truth.length ? 'is-good' : 'is-bad'}`;
      }, 800);
    }, 800);
  }

  lpr.querySelector('.lpr-run').addEventListener('click', run);
  lightIn.addEventListener('input', show);
  show();
}
