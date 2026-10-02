// forkpoint in the browser: a real ResNet18 (ImageNet weights) on real cat photos.
// Every fork (remove one piece x prune the smallest weights) was run in PyTorch beforehand;
// fork/resnet18.json holds each fork's top-3 answers per photo.
const root = document.querySelector('#fork');
if (root) {
  const strip = root.querySelector('.fp3-model');
  const grid = root.querySelector('.fp3-photos');
  const pruneIn = root.querySelector('.fp3-prune');
  const say = root.querySelector('.fp3-say');
  const NAMES = ['input layer', 'block 1', 'block 2', 'block 3', 'block 4', 'block 5', 'block 6', 'block 7', 'block 8', 'output layer'];
  const SHORT = ['in', '1', '2', '3', '4', '5', '6', '7', '8', 'out'];
  let D = null, cut = null, keep = [];
  const pieces = [];
  const cards = [];

  const catClass = (i) => i >= 281 && i <= 285; // ImageNet classes 281-285 are the domestic cats
  const name = (i) => D.labels[i].replace(/^./, (c) => c.toUpperCase());
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  const M = (n) => `${(n / 1e6).toFixed(1)} M`;

  function build() {
    const A = D.res['-|0'];
    // only photos the original gets right, so every change you see is caused by your edit
    keep = A.map((row, i) => (catClass(row[0][0]) ? i : -1)).filter((i) => i >= 0);
    D.layers.forEach((l, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'fp3-piece';
      b.style.flexGrow = Math.sqrt(l.params);
      b.title = `${cap(NAMES[i])}: ${l.params.toLocaleString('en')} weights. Click to remove it from your fork.`;
      b.setAttribute('aria-label', `Remove ${NAMES[i]}`);
      b.innerHTML = `<i></i><span>${SHORT[i]}</span>`;
      b.addEventListener('click', () => { cut = cut === l.name ? null : l.name; render(); });
      strip.appendChild(b);
      pieces.push(b);
    });
    keep.forEach((i) => {
      const f = document.createElement('figure');
      f.className = 'fp3-card';
      f.innerHTML = `<img src="fork/cat_${D.images[i]}.jpg" alt="Cat photo"><figcaption><span class="fp3-fork"></span><span class="fp3-orig"></span></figcaption>`;
      grid.appendChild(f);
      cards.push(f);
    });
  }

  function render() {
    const A = D.res['-|0'], B = D.res[`${cut || '-'}|${pruneIn.value}`];
    const pr = +pruneIn.value;
    const ci = D.layers.findIndex((l) => l.name === cut);
    pieces.forEach((b, i) => {
      b.classList.toggle('is-cut', i === ci);
      b.querySelector('i').style.opacity = i === ci ? 0 : 1 - (0.85 * pr) / 100;
    });
    let right = 0;
    const wrong = [];
    keep.forEach((i, k) => {
      const ok = catClass(B[i][0][0]);
      right += ok;
      if (!ok) wrong.push(D.labels[B[i][0][0]].toLowerCase());
      cards[k].classList.toggle('is-bad', !ok);
      cards[k].querySelector('.fp3-fork').textContent = `${ok ? '✓' : '✗'} ${name(B[i][0][0])}`;
      cards[k].querySelector('.fp3-orig').textContent = ok ? '' : `original: ${name(A[i][0][0]).toLowerCase()}`;
    });
    const n = keep.length;
    const size = (D.total - (ci >= 0 ? D.layers[ci].params : 0)) * (1 - pr / 100);
    root.querySelector('.fp3-prune-out').textContent = `${pr}%`;
    root.querySelector('.fp3-size').textContent = M(size);
    root.querySelector('.fp3-size0').textContent = M(D.total);
    root.querySelector('.fp3-score').textContent = `${right} / ${n}`;
    root.querySelector('.fp3-scorebox').classList.toggle('is-bad', right < n);
    const seen = [...new Set(wrong)].slice(0, 3).join(', ');
    let msg;
    if (!pr && ci < 0) msg = 'Your fork is still an exact copy of the original. Drag the slider to shrink it.';
    else if (ci === 0 || ci === 9) msg = `Without the ${NAMES[ci]} nothing useful gets through, and every photo becomes "${seen}". Every model needs its first and last layer.`;
    else if (ci > 0) {
      msg = right
        ? `${cap(NAMES[ci])} removed, and ${right} of ${n} are still cats. Each block has a shortcut around it, so some information still gets past the hole.`
        : `${cap(NAMES[ci])} removed, and no cats are left (now: ${seen}). ${D.layers[ci].down ? 'This block also makes the image smaller for the next blocks, so they' : 'The blocks after it'} cannot work without it.`;
      if (pr) msg += ` On top of that, ${pr}% of the weights are pruned.`;
    } else if (right === n) msg = `${pr}% of the weights are gone and every answer is still right. Most weights in a trained model barely matter. This is how models are made small enough for phones and drones.`;
    else msg = `Too far: with ${pr}% of the weights gone, only ${right} of ${n} are still cats. The fork now sees: ${seen}.`;
    say.textContent = msg;
  }

  root.querySelector('.fp3-reset').addEventListener('click', () => { cut = null; pruneIn.value = 0; render(); });
  pruneIn.addEventListener('input', render);
  fetch('fork/resnet18.json').then((r) => r.json()).then((j) => { D = j; build(); render(); })
    .catch(() => { say.textContent = 'Could not load the model results.'; });
}
