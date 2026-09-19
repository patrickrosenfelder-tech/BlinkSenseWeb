// BlinkSense website — in-browser Vision Check demo (vanilla JS, no camera/network).
// Mirrors the Ring Gap, Contrast, Amsler, and Tumbling E self-checks from the apps.

const VCD_TESTS = {
  ringgap: { label: 'Ring Gap (contrast)', blurb: 'Find where the small ring is open, then tap the matching spot on the large ring.' },
  contrast: { label: 'Shade Contrast', blurb: 'Tap the darker of the two squares — rounds get subtler.' },
  amsler: { label: 'Amsler Grid', blurb: 'Stare at the center dot. Tap if any line looks wavy, bent, or missing.' },
  tumblingE: { label: 'Tumbling E', blurb: 'Tap the direction the E is facing. Rounds get smaller.' },
};

const rand = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rand(arr.length)];

// ---------- canvas setup helpers ----------
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.style.width = '100%';
  c.style.maxWidth = w + 'px';
  c.style.height = 'auto';
  c.style.aspectRatio = String(w) + '/' + String(h);
  c.style.background = '#fff';
  c.style.borderRadius = '14px';
  c.style.display = 'block';
  return c;
}

function ctx2d(c) {
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = true;
  return x;
}

// ---------- Ring Gap (Landolt-C) ----------
function drawLandolt(g, cx, cy, r, stroke, gapDeg, ink) {
  g.lineWidth = stroke;
  g.lineCap = 'butt';
  g.strokeStyle = ink;
  g.beginPath();
  // Gap centered at gapDeg; draw the remaining ~335 degrees in two arcs for clarity
  const gapHalf = 12.5;
  const a0 = ((gapDeg + gapHalf) * Math.PI) / 180;
  const a1 = ((gapDeg + 360 - gapHalf) * Math.PI) / 180;
  g.arc(cx, cy, r, a0, a1);
  g.stroke();
}

function ringGapStage(root) {
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'vcd-test';
  const head = document.createElement('p');
  head.className = 'vcd-hint';
  let round = 1, score = 0, gap = 0;
  const maxRounds = 6;
  const feedback = document.createElement('p');
  feedback.className = 'vcd-feedback';

  function setupRound() {
    gap = pick([0, 45, 90, 135, 180, 225, 270, 315]);
    // Keep the outer stroke inside the canvas at every angle, including 0° and 180°.
    const size = Math.max(48, 138 - (round - 1) * 18);
    const stroke = Math.max(3, 14 - (round - 1) * 1.9);
    const inkA = Math.max(0.18, 1 - (round - 1) * 0.15);
    head.textContent = `Round ${round} of ${maxRounds} — the small ring has a gap. Tap the matching spot on the large ring.`;
    wrap.innerHTML = '';
    const top = makeCanvas(220, 180);
    const tg = ctx2d(top);
    const tcx = 110, tcy = 90;
    const ink = `rgba(20,20,20,${inkA})`;
    drawLandolt(tg, tcx, tcy, size / 2, stroke, gap, ink);
    // faint guide dot at center
    tg.fillStyle = 'rgba(20,20,20,.25)'; tg.beginPath(); tg.arc(tcx, tcy, 2.4, 0, 7); tg.fill();
    wrap.appendChild(top);

    const bot = makeCanvas(280, 280);
    const bg = ctx2d(bot);
    bg.strokeStyle = 'rgba(0,0,0,.28)';
    bg.lineWidth = 4;
    bg.beginPath(); bg.arc(140, 140, 106, 0, 7); bg.stroke();
    // 8 markers
    for (let i = 0; i < 8; i++) {
      const a = (i * 45 * Math.PI) / 180;
      const mx = 140 + 106 * Math.cos(a);
      const my = 140 + 106 * Math.sin(a);
      bg.save();
      bg.translate(mx, my);
      bg.rotate(a + Math.PI / 2);
      bg.fillStyle = 'rgba(0,0,0,.55)';
      bg.fillRect(-4, -11, 8, 22);
      bg.restore();
    }
    wrap.appendChild(bot);

    bot.addEventListener('click', (e) => {
      if (feedback.dataset.done) return;
      const rect = bot.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * 280;
      const py = ((e.clientY - rect.top) / rect.height) * 280;
      const vx = px - 140, vy = py - 140;
      if (Math.hypot(vx, vy) < 55 || Math.hypot(vx, vy) > 165) {
        feedback.textContent = 'Tap on the ring itself, near one of the tick marks.';
        return;
      }
      let deg = (Math.atan2(vy, vx) * 180) / Math.PI;
      deg = (deg + 360) % 360;
      const closest = Math.round(deg / 45) * 45 % 360;
      const ok = closest === gap;
      if (ok) score++;
      feedback.dataset.done = '1';
      feedback.style.color = ok ? 'var(--healthy)' : 'var(--critical)';
      feedback.textContent = ok ? `Correct! (${score}/${round} so far)` : `Not quite — that gap pointed ${gap}°.`;
      const next = document.createElement('button');
      next.className = 'button';
      next.textContent = round >= maxRounds ? 'See result' : 'Next round';
      next.addEventListener('click', () => {
        if (round >= maxRounds) {
          showResult(wrap, `Score ${score}/${maxRounds}`, score >= 4 ? 'PASS' : 'SCORE',
            'Ring-gap contrast check: you matched the open direction of a shrinking, fading ring.',
            () => ringGapStage(root));
        } else { round++; feedback.dataset.done = ''; setupRound(); }
      });
      wrap.appendChild(next);
    });
    wrap.appendChild(feedback);
  }

  root.appendChild(head);
  root.appendChild(wrap);
  setupRound();
}

// ---------- Shade Contrast ----------
function contrastStage(root) {
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'vcd-test';
  const head = document.createElement('p');
  head.className = 'vcd-hint';
  let round = 1, score = 0;
  const maxRounds = 5;
  const fb = document.createElement('p');
  fb.className = 'vcd-feedback';

  function stage() {
    const base = 200 - round * 12;           // gray base falls as rounds progress
    const diff = Math.max(2, 34 - round * 6); // contrast gap shrinks each round
    const which = rand(2);                    // 0 = left darker
    const cA = which === 0 ? base : base + diff;
    const cB = which === 0 ? base + diff : base;
    head.textContent = `Round ${round} of ${maxRounds} — tap the DARKER square.`;
    wrap.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'vcd-swatch-row';
    [cA, cB].forEach((v, i) => {
      const s = document.createElement('button');
      s.className = 'vcd-swatch';
      s.style.background = `rgb(${v},${v},${v})`;
      s.style.minHeight = '120px';
      s.addEventListener('click', () => {
        if (fb.dataset.done) return;
        const ok = (i === 0 && which === 0) || (i === 1 && which === 1);
        if (ok) score++;
        fb.dataset.done = '1';
        fb.style.color = ok ? 'var(--healthy)' : 'var(--critical)';
        fb.textContent = ok ? 'Correct' : `Not quite — square ${which === 0 ? 'A (left)' : 'B (right)'} was darker.`;
        const nx = document.createElement('button');
        nx.className = 'button';
        nx.textContent = round >= maxRounds ? 'See result' : 'Next round';
        nx.addEventListener('click', () => {
          if (round >= maxRounds) {
            showResult(wrap, `Score ${score}/${maxRounds}`, score >= 4 ? 'PASS' : 'SCORE',
              'Contrast discrimination: how small a brightness difference you could reliably detect.',
              () => contrastStage(root));
          } else { round++; fb.dataset.done = ''; stage(); }
        });
        wrap.appendChild(nx);
      });
      row.appendChild(s);
    });
    wrap.appendChild(row);
    wrap.appendChild(fb);
  }
  root.appendChild(head);
  root.appendChild(wrap);
  stage();
}

// ---------- Amsler Grid ----------
function amslerStage(root) {
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'vcd-test';
  const head = document.createElement('p');
  head.className = 'vcd-hint';
  head.textContent = 'Hold ~30 cm away, cover one eye, stare at the center dot. Tap any option below.';
  const c = makeCanvas(300, 300);
  const g = ctx2d(c);
  g.strokeStyle = '#000';
  g.lineWidth = 1.4;
  for (let i = 0; i <= 10; i++) {
    g.beginPath(); g.moveTo(i * 30, 0); g.lineTo(i * 30, 300); g.stroke();
    g.beginPath(); g.moveTo(0, i * 30); g.lineTo(300, i * 30); g.stroke();
  }
  g.fillStyle = '#000'; g.beginPath(); g.arc(150, 150, 3, 0, 7); g.fill();
  wrap.appendChild(c);
  const fb = document.createElement('p');
  fb.className = 'vcd-feedback';
  const gridButtons = [
    ['Lines look straight', 'PASS'],
    ['Some lines look wavy / bent', 'SCORE'],
    ['A patch of lines looks missing', 'SCORE'],
  ];
  gridButtons.forEach(([label, verdict]) => {
    const b = document.createElement('button');
    b.className = 'button button-outline';
    b.textContent = label;
    b.addEventListener('click', () => {
      const ok = label === 'Lines look straight';
      showResult(wrap, verdict, verdict,
        ok
          ? 'No distortion reported on this quick Amsler check. Periodic checks are good for monitoring change.'
          : 'You reported grid distortion. This is not a diagnosis — please follow up with an eye care professional.',
        () => amslerStage(root), !ok);
    });
    wrap.appendChild(b);
  });
  wrap.appendChild(fb);
  root.appendChild(head);
  root.appendChild(wrap);
}

// ---------- Tumbling E ----------
function tumblingEStage(root) {
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'vcd-test';
  const head = document.createElement('p');
  head.className = 'vcd-hint';
  let round = 1, score = 0;
  const maxRounds = 5;
  const dirs = ['up', 'right', 'down', 'left'];
  const fb = document.createElement('p');
  fb.className = 'vcd-feedback';

  function stage() {
    const dir = pick(dirs);
    const size = Math.max(48, 152 - (round - 1) * 24);
    head.textContent = `Round ${round} of ${maxRounds} — which way is the E facing?`;
    wrap.innerHTML = '';
    const c = makeCanvas(220, 220);
    const g = ctx2d(c);
    const cx = 110, cy = 110;
    g.fillStyle = '#111827';
    const drawE = () => {
      const s = size;
      const bar = Math.round(s / 5);
      const x = Math.round(cx - s / 2);
      const y = Math.round(cy - s / 2);
      // A filled, optotype-style E keeps all strokes crisp and equally weighted.
      g.fillRect(x, y, bar, s);
      g.fillRect(x, y, s, bar);
      g.fillRect(x, Math.round(cy - bar / 2), Math.round(s * .76), bar);
      g.fillRect(x, y + s - bar, s, bar);
    };
    g.save();
    g.translate(cx, cy);
    g.rotate({ up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 }[dir]);
    g.translate(-cx, -cy);
    drawE();
    g.restore();
    wrap.appendChild(c);
    const row = document.createElement('div');
    row.className = 'vcd-swatch-row';
    [['Up', 'up'], ['Right', 'right'], ['Down', 'down'], ['Left', 'left']].forEach(([lab, key]) => {
      const b = document.createElement('button');
      b.className = 'button button-outline';
      b.textContent = lab;
      b.addEventListener('click', () => {
        if (fb.dataset.done) return;
        const ok = key === dir;
        if (ok) score++;
        fb.dataset.done = '1';
        fb.style.color = ok ? 'var(--healthy)' : 'var(--critical)';
        fb.textContent = ok ? 'Correct' : `Not quite — it faced ${dir}.`;
        const nx = document.createElement('button');
        nx.className = 'button';
        nx.textContent = round >= maxRounds ? 'See result' : 'Next round';
        nx.addEventListener('click', () => {
          if (round >= maxRounds) {
            showResult(wrap, `Score ${score}/${maxRounds}`, score >= 4 ? 'PASS' : 'SCORE',
              'Orientation acuity: correctly reading the direction of a shrinking letter E.',
              () => tumblingEStage(root));
          } else { round++; fb.dataset.done = ''; stage(); }
        });
        wrap.appendChild(nx);
      });
      row.appendChild(b);
    });
    wrap.appendChild(row);
    wrap.appendChild(fb);
  }
  root.appendChild(head);
  root.appendChild(wrap);
  stage();
}

// ---------- shared result ----------
function showResult(host, verdict, status, detail, restart, warnColor) {
  host.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'vcd-result';
  const v = document.createElement('div');
  v.className = 'vcd-verdict';
  v.textContent = verdict;
  const s = document.createElement('div');
  s.className = 'vcd-status ' + (status === 'PASS' ? 'ok' : 'warn');
  s.textContent = status;
  if (warnColor) s.style.color = 'var(--low)';
  const d = document.createElement('p');
  d.textContent = detail;
  const r = document.createElement('button');
  r.className = 'button';
  r.textContent = 'Try again';
  r.addEventListener('click', restart);
  box.append(v, s, d, r);
  host.appendChild(box);
}

// ---------- boot ----------
export function bootVisionDemo(root) {
  if (!root) return;
  const nav = document.createElement('div');
  nav.className = 'vcd-nav';
  Object.entries(VCD_TESTS).forEach(([key, meta]) => {
    const b = document.createElement('button');
    b.className = 'button button-outline';
    b.dataset.k = key;
    b.textContent = meta.label;
    b.addEventListener('click', () => {
      nav.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      root.replaceChildren(nav);
      const blurb = document.createElement('p');
      blurb.className = 'vcd-blurb';
      blurb.textContent = meta.blurb;
      root.appendChild(blurb);
      const area = document.createElement('div');
      area.className = 'vcd-area';
      root.appendChild(area);
      ({ ringgap: ringGapStage, contrast: contrastStage, amsler: amslerStage, tumblingE: tumblingEStage })[key](area);
    });
    nav.appendChild(b);
  });
  const first = nav.querySelector('button');
  root.appendChild(nav);
  first.click();
}
