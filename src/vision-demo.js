// BlinkSense website — in-browser Vision Check demo (vanilla JS, no camera/network).
// Mirrors the Ring Gap, Contrast, Amsler, and Tumbling E self-checks from the apps.

const VCD_TESTS = {
  ringgap: { label: 'Ring Gap (contrast)', blurb: 'Find where the small ring is open, then tap the matching spot on the large ring.' },
  contrast: { label: 'Shade Contrast', blurb: 'Tap the darker of the two squares — rounds get subtler.' },
  amsler: { label: 'Amsler Grid', blurb: 'Stare at the center dot. Tap if any line looks wavy, bent, or missing.' },
  tumblingE: { label: 'Tumbling E', blurb: 'Tap the direction the E is facing. Rounds get smaller.' },

  dominantEye: { label: 'Dominant Eye', blurb: 'Form a triangle with your hands and focus on the circle. Tap which eye you close to see it shift.' },
  colorDiscrimination: { label: 'Color Discrimination', blurb: 'Tap the odd color out of the group.' },
  fadingText: { label: 'Fading Text', blurb: 'Read the text as it gets lighter. Tap when you can no longer read it.' },
  gridVisibility: { label: 'Grid Visibility', blurb: 'Tap any areas of the grid that appear faded or missing.' },
  hueArrangement: { label: 'Hue Arrangement', blurb: 'Arrange the colors in order of their hue gradient.' },
  ishihara: { label: 'Ishihara Plates', blurb: 'Enter the number you see in the dotted circle.' },
  colorSorting: { label: 'Color Sorting Game', blurb: 'Sort the colors from darkest to lightest.' },
  colorMatching: { label: 'Color Matching', blurb: 'Adjust the slider to match the target color.' },
  snellen: { label: 'Mobile Snellen Chart', blurb: 'Hold your phone at arm\'s length and read the letters.' },
  letterIsolation: { label: 'Letter Isolation', blurb: 'Identify the center letter among crowding.' },
  blurryText: { label: 'Blurry Text Finder', blurb: 'Find the sharpest word among blurred words.' },
  astigmatismWheel: { label: 'Astigmatism Wheel', blurb: 'Look at the wheel. Do any lines appear darker or sharper?' },
  blurryClear: { label: 'Blurry vs Clear', blurb: 'Choose the clearer image.' },
  nearFar: { label: 'Near Far Focus', blurb: 'Switch focus between near and far objects.' },
  threeDDot: { label: '3D Dot Depth', blurb: 'Tap the dot that appears closest to you.' },
  overlappingShapes: { label: 'Overlapping Shapes', blurb: 'Identify which shape is in front.' },
  shadowDepth: { label: 'Shadow Based Depth', blurb: 'Use shadows to determine which object is floating highest.' },
  glareSensitivity: { label: 'Glare Sensitivity', blurb: 'Identify the object through simulated glare.' },
  brightnessTolerance: { label: 'Brightness Tolerance', blurb: 'Read text on increasingly bright backgrounds.' },
  peripheralVision: { label: 'Peripheral Vision', blurb: 'Keep eyes on center, tap when you see a flash in your periphery.' },
  movingTarget: { label: 'Moving Target Tracking', blurb: 'Track the moving object and tap it.' },
  rapidTap: { label: 'Rapid Tap Targets', blurb: 'Tap the targets as quickly as they appear.' },
  wordRecognition: { label: 'Word Flankers', blurb: 'Recognize the word despite distracting flankers.' },
  dyslexiaScreening: { label: 'Dyslexia Screening', blurb: 'Identify the correctly oriented letters/words.' },
  eyeTraining: { label: 'Focus Flexibility', blurb: 'Follow the instructions to shift your focus.' },
  colorSensitivity: { label: 'Color Sensitivity', blurb: 'Identify subtle color changes.' },

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
      next.className = 'btn btn-primary btn-sm';
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
        nx.className = 'btn btn-primary btn-sm';
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
    b.className = 'btn btn-ghost btn-sm';
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
  const maxRounds = 10;
  const dirs = ['up', 'right', 'down', 'left'];
  const fb = document.createElement('p');
  fb.className = 'vcd-feedback';

  function stage() {
    const dir = pick(dirs);
    const size = Math.max(12, 100 - round * 8);
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
    g.rotate({ up: -Math.PI / 2, right: 0, down: Math.PI / 2, left: Math.PI }[dir]);
    g.translate(-cx, -cy);
    drawE();
    g.restore();
    wrap.appendChild(c);
    const row = document.createElement('div');
    row.className = 'vcd-swatch-row';
    [['Up', 'up'], ['Right', 'right'], ['Down', 'down'], ['Left', 'left']].forEach(([lab, key]) => {
      const b = document.createElement('button');
      b.className = 'btn btn-ghost btn-sm';
      b.textContent = lab;
      b.addEventListener('click', () => {
        if (fb.dataset.done) return;
        const ok = key === dir;
        if (ok) score++;
        fb.dataset.done = '1';
        fb.style.color = ok ? 'var(--healthy)' : 'var(--critical)';
        fb.textContent = ok ? 'Correct' : `Not quite — it faced ${dir}.`;
        const nx = document.createElement('button');
        nx.className = 'btn btn-primary btn-sm';
        nx.textContent = round >= maxRounds ? 'See result' : 'Next round';
        nx.addEventListener('click', () => {
          if (round >= maxRounds) {
            showResult(wrap, `Score ${score}/${maxRounds}`, score >= 7 ? 'PASS' : 'SCORE',
              `You identified the E orientation in ${score} of 10 rounds; later rounds shrink the E below reading limits.`,
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


function dominantEyeStage(root) {
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'vcd-test';
  const head = document.createElement('p');
  head.className = 'vcd-hint';
  head.textContent = 'Form a triangle with your hands around this circle, then alternate closing eyes. Which eye keeps the circle centered?';
  
  const c = makeCanvas(220, 220);
  const g = ctx2d(c);
  g.fillStyle = '#000';
  g.beginPath(); g.arc(110, 110, 30, 0, 7); g.fill();
  
  wrap.appendChild(head);
  wrap.appendChild(c);
  
  const row = document.createElement('div');
  row.className = 'vcd-swatch-row';
  ['Left Eye', 'Right Eye', 'Neither'].forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-sm';
    btn.textContent = opt;
    btn.addEventListener('click', () => showResult(wrap, opt === 'Right Eye' ? 'PASS' : 'SCORE', opt === 'Right Eye' ? 'PASS' : 'SCORE', 'Most people are right-eye dominant. This test helps find yours.', () => dominantEyeStage(root), opt !== 'Right Eye'));
    row.appendChild(btn);
  });
  wrap.appendChild(row);
  root.appendChild(wrap);
}
function colorDiscriminationStage(root) {
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'vcd-test';
  const head = document.createElement('p');
  head.className = 'vcd-hint';
  head.textContent = 'Tap the odd color out of the group.';
  
  const c = makeCanvas(240, 240);
  const g = ctx2d(c);
  const oddIndex = rand(9);
  const baseHue = rand(360);
  
  for(let i=0; i<9; i++) {
    const x = (i % 3) * 80 + 10;
    const y = Math.floor(i / 3) * 80 + 10;
    const hue = i === oddIndex ? baseHue + 15 : baseHue;
    g.fillStyle = `hsl(${hue}, 70%, 50%)`;
    g.fillRect(x, y, 60, 60);
  }
  
  wrap.appendChild(head);
  wrap.appendChild(c);
  
  c.addEventListener('click', (e) => {
    const rect = c.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width * 240;
    const y = (e.clientY - rect.top) / rect.height * 240;
    const col = Math.floor(x / 80);
    const row = Math.floor(y / 80);
    if(col >= 3 || row >= 3) return;
    const clickedIdx = row * 3 + col;
    const ok = clickedIdx === oddIndex;
    showResult(wrap, ok ? 'PASS' : 'SCORE', ok ? 'PASS' : 'SCORE', 'Color discrimination check.', () => colorDiscriminationStage(root), !ok);
  });
  root.appendChild(wrap);
}
function fadingTextStage(root) {
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'vcd-test';
  const head = document.createElement('p');
  head.className = 'vcd-hint';
  head.textContent = 'Read the text as it gets lighter. Can you read the last line?';
  
  const c = makeCanvas(280, 200);
  const g = ctx2d(c);
  g.font = '20px sans-serif';
  g.textAlign = 'center';
  for(let i=0; i<5; i++) {
    const opacity = 1 - (i * 0.22);
    g.fillStyle = `rgba(0,0,0,${opacity})`;
    g.fillText('FADING TEXT', 140, 40 + i * 35);
  }
  
  wrap.appendChild(head);
  wrap.appendChild(c);
  
  const row = document.createElement('div');
  row.className = 'vcd-swatch-row';
  ['Yes', 'No'].forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-sm';
    btn.textContent = opt;
    btn.addEventListener('click', () => showResult(wrap, opt === 'Yes' ? 'PASS' : 'SCORE', opt === 'Yes' ? 'PASS' : 'SCORE', 'Contrast sensitivity check.', () => fadingTextStage(root), opt !== 'Yes'));
    row.appendChild(btn);
  });
  wrap.appendChild(row);
  root.appendChild(wrap);
}
function gridVisibilityStage(root) {
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'vcd-test';
  const head = document.createElement('p');
  head.className = 'vcd-hint';
  head.textContent = 'Do you see all intersections clearly?';
  
  const c = makeCanvas(240, 240);
  const g = ctx2d(c);
  g.fillStyle = '#000';
  g.fillRect(0,0,240,240);
  g.strokeStyle = '#fff';
  g.lineWidth = 4;
  for(let i=0; i<=6; i++) {
    g.beginPath(); g.moveTo(i*40, 0); g.lineTo(i*40, 240); g.stroke();
    g.beginPath(); g.moveTo(0, i*40); g.lineTo(240, i*40); g.stroke();
  }
  
  wrap.appendChild(head);
  wrap.appendChild(c);
  
  const row = document.createElement('div');
  row.className = 'vcd-swatch-row';
  ['Yes', 'No'].forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-sm';
    btn.textContent = opt;
    btn.addEventListener('click', () => showResult(wrap, opt === 'Yes' ? 'PASS' : 'SCORE', opt === 'Yes' ? 'PASS' : 'SCORE', 'Central field check.', () => gridVisibilityStage(root), opt !== 'Yes'));
    row.appendChild(btn);
  });
  wrap.appendChild(row);
  root.appendChild(wrap);
}
function hueArrangementStage(root) {
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'vcd-test';
  const head = document.createElement('p');
  head.className = 'vcd-hint';
  head.textContent = 'Which color belongs between Red and Yellow?';
  
  const c = makeCanvas(280, 100);
  const g = ctx2d(c);
  g.fillStyle = 'red'; g.fillRect(20, 20, 60, 60);
  g.fillStyle = '#eee'; g.fillRect(110, 20, 60, 60);
  g.fillStyle = 'yellow'; g.fillRect(200, 20, 60, 60);
  
  wrap.appendChild(head);
  wrap.appendChild(c);
  
  const row = document.createElement('div');
  row.className = 'vcd-swatch-row';
  ['Blue', 'Orange', 'Green'].forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-sm';
    btn.textContent = opt;
    btn.addEventListener('click', () => showResult(wrap, opt === 'Orange' ? 'PASS' : 'SCORE', opt === 'Orange' ? 'PASS' : 'SCORE', 'Color sorting check.', () => hueArrangementStage(root), opt !== 'Orange'));
    row.appendChild(btn);
  });
  wrap.appendChild(row);
  root.appendChild(wrap);
}
function ishiharaStage(root) {
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'vcd-test';
  const head = document.createElement('p');
  head.className = 'vcd-hint';
  head.textContent = 'What number do you see in the dots?';
  
  const c = makeCanvas(240, 240);
  const g = ctx2d(c);
  g.fillStyle = '#fff'; g.fillRect(0,0,240,240);
  
  // draw random dots
  for(let i=0; i<400; i++) {
    const x = rand(240);
    const y = rand(240);
    const dist = Math.hypot(x-120, y-120);
    if(dist < 110) {
      // 8 shape approximate
      const is8 = (Math.abs(x-120) < 30 && (Math.abs(y-80) < 30 || Math.abs(y-160) < 30)) || 
                  (Math.abs(x-90) < 15 && Math.abs(y-120) < 50) || 
                  (Math.abs(x-150) < 15 && Math.abs(y-120) < 50);
      g.fillStyle = is8 ? `rgb(${150+rand(100)}, ${rand(50)}, ${rand(50)})` : `rgb(${rand(50)}, ${150+rand(100)}, ${rand(50)})`;
      g.beginPath(); g.arc(x, y, 3+rand(4), 0, 7); g.fill();
    }
  }
  
  wrap.appendChild(head);
  wrap.appendChild(c);
  
  const row = document.createElement('div');
  row.className = 'vcd-swatch-row';
  ['3', '8', 'Nothing'].forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-sm';
    btn.textContent = opt;
    btn.addEventListener('click', () => showResult(wrap, opt === '8' ? 'PASS' : 'SCORE', opt === '8' ? 'PASS' : 'SCORE', 'Color vision check.', () => ishiharaStage(root), opt !== '8'));
    row.appendChild(btn);
  });
  wrap.appendChild(row);
  root.appendChild(wrap);
}
function colorSortingStage(root) {
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'vcd-test';
  const head = document.createElement('p');
  head.className = 'vcd-hint';
  head.textContent = 'Sort these from darkest to lightest: A(Black), B(Gray), C(White)';
  
  const c = makeCanvas(280, 100);
  const g = ctx2d(c);
  g.fillStyle = 'black'; g.fillRect(20, 20, 60, 60);
  g.fillStyle = '#fff'; g.fillText('A', 45, 55);
  g.fillStyle = 'gray'; g.fillRect(110, 20, 60, 60);
  g.fillStyle = '#000'; g.fillText('B', 135, 55);
  g.fillStyle = 'white'; g.fillRect(200, 20, 60, 60);
  g.strokeRect(200, 20, 60, 60);
  g.fillStyle = '#000'; g.fillText('C', 225, 55);
  
  wrap.appendChild(head);
  wrap.appendChild(c);
  
  const row = document.createElement('div');
  row.className = 'vcd-swatch-row';
  ['A,B,C', 'C,B,A', 'B,A,C'].forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-sm';
    btn.textContent = opt;
    btn.addEventListener('click', () => showResult(wrap, opt === 'A,B,C' ? 'PASS' : 'SCORE', opt === 'A,B,C' ? 'PASS' : 'SCORE', 'Brightness sorting check.', () => colorSortingStage(root), opt !== 'A,B,C'));
    row.appendChild(btn);
  });
  wrap.appendChild(row);
  root.appendChild(wrap);
}
function colorMatchingStage(root) {
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'vcd-test';
  const head = document.createElement('p');
  head.className = 'vcd-hint';
  head.textContent = 'Match the color: Pink';
  
  const c = makeCanvas(280, 100);
  const g = ctx2d(c);
  g.fillStyle = 'pink'; g.fillRect(110, 20, 60, 60);
  g.strokeRect(110, 20, 60, 60);
  
  wrap.appendChild(head);
  wrap.appendChild(c);
  
  const row = document.createElement('div');
  row.className = 'vcd-swatch-row';
  ['Light Red', 'Dark Red', 'Blue'].forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-sm';
    btn.textContent = opt;
    btn.addEventListener('click', () => showResult(wrap, opt === 'Light Red' ? 'PASS' : 'SCORE', opt === 'Light Red' ? 'PASS' : 'SCORE', 'Color matching check.', () => colorMatchingStage(root), opt !== 'Light Red'));
    row.appendChild(btn);
  });
  wrap.appendChild(row);
  root.appendChild(wrap);
}
function snellenStage(root) {
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'vcd-test';
  const head = document.createElement('p');
  head.className = 'vcd-hint';
  head.textContent = 'What is the top letter usually on a Snellen chart?';
  
  const c = makeCanvas(200, 240);
  const g = ctx2d(c);
  g.textAlign = 'center';
  g.fillStyle = '#000';
  g.font = 'bold 80px sans-serif';
  g.fillText('E', 100, 80);
  g.font = 'bold 40px sans-serif';
  g.fillText('F P', 100, 140);
  g.font = 'bold 20px sans-serif';
  g.fillText('T O Z', 100, 180);
  g.font = 'bold 10px sans-serif';
  g.fillText('L P E D', 100, 210);
  
  wrap.appendChild(head);
  wrap.appendChild(c);
  
  const row = document.createElement('div');
  row.className = 'vcd-swatch-row';
  ['E', 'A', 'Z'].forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-sm';
    btn.textContent = opt;
    btn.addEventListener('click', () => showResult(wrap, opt === 'E' ? 'PASS' : 'SCORE', opt === 'E' ? 'PASS' : 'SCORE', 'Acuity knowledge check.', () => snellenStage(root), opt !== 'E'));
    row.appendChild(btn);
  });
  wrap.appendChild(row);
  root.appendChild(wrap);
}
function letterIsolationStage(root) {
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'vcd-test';
  const head = document.createElement('p');
  head.className = 'vcd-hint';
  head.textContent = 'What is the middle letter in the image?';
  
  const c = makeCanvas(200, 100);
  const g = ctx2d(c);
  g.textAlign = 'center';
  g.fillStyle = '#000';
  g.font = 'bold 40px sans-serif';
  g.fillText('X Y Z', 100, 60);
  
  wrap.appendChild(head);
  wrap.appendChild(c);
  
  const row = document.createElement('div');
  row.className = 'vcd-swatch-row';
  ['X', 'Y', 'Z'].forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-sm';
    btn.textContent = opt;
    btn.addEventListener('click', () => showResult(wrap, opt === 'Y' ? 'PASS' : 'SCORE', opt === 'Y' ? 'PASS' : 'SCORE', 'Crowding check.', () => letterIsolationStage(root), opt !== 'Y'));
    row.appendChild(btn);
  });
  wrap.appendChild(row);
  root.appendChild(wrap);
}
function blurryTextStage(root) {
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'vcd-test';
  const head = document.createElement('p');
  head.className = 'vcd-hint';
  head.textContent = 'Which word is clear?';
  
  const c = makeCanvas(240, 100);
  const g = ctx2d(c);
  g.textAlign = 'center';
  g.font = 'bold 30px sans-serif';
  g.filter = 'blur(3px)';
  g.fillStyle = '#000';
  g.fillText('CAT', 60, 60);
  g.filter = 'none';
  g.fillText('DOG', 180, 60);
  
  wrap.appendChild(head);
  wrap.appendChild(c);
  
  const row = document.createElement('div');
  row.className = 'vcd-swatch-row';
  ['CAT', 'DOG'].forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-sm';
    btn.textContent = opt;
    btn.addEventListener('click', () => showResult(wrap, opt === 'DOG' ? 'PASS' : 'SCORE', opt === 'DOG' ? 'PASS' : 'SCORE', 'Acuity check.', () => blurryTextStage(root), opt !== 'DOG'));
    row.appendChild(btn);
  });
  wrap.appendChild(row);
  root.appendChild(wrap);
}
function astigmatismWheelStage(root) {
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'vcd-test';
  const head = document.createElement('p');
  head.className = 'vcd-hint';
  head.textContent = 'Do some lines look darker than others?';
  
  const c = makeCanvas(240, 240);
  const g = ctx2d(c);
  g.strokeStyle = '#000';
  g.lineWidth = 2;
  g.translate(120, 120);
  for(let i=0; i<12; i++) {
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(100, 0);
    g.stroke();
    g.rotate(Math.PI / 6);
  }
  g.translate(-120, -120);
  
  wrap.appendChild(head);
  wrap.appendChild(c);
  
  const row = document.createElement('div');
  row.className = 'vcd-swatch-row';
  ['Yes', 'No'].forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-sm';
    btn.textContent = opt;
    btn.addEventListener('click', () => showResult(wrap, opt === 'No' ? 'PASS' : 'SCORE', opt === 'No' ? 'PASS' : 'SCORE', 'Astigmatism check.', () => astigmatismWheelStage(root), opt !== 'No'));
    row.appendChild(btn);
  });
  wrap.appendChild(row);
  root.appendChild(wrap);
}
function blurryClearStage(root) {
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'vcd-test';
  const head = document.createElement('p');
  head.className = 'vcd-hint';
  head.textContent = 'Which is clearer: A or B?';
  
  const c = makeCanvas(240, 140);
  const g = ctx2d(c);
  g.textAlign = 'center';
  g.font = 'bold 30px sans-serif';
  g.fillStyle = '#000';
  g.fillText('A', 60, 40);
  g.fillText('B', 180, 40);
  
  g.filter = 'none';
  g.beginPath(); g.arc(60, 90, 30, 0, 7); g.stroke();
  g.filter = 'blur(2px)';
  g.beginPath(); g.arc(180, 90, 30, 0, 7); g.stroke();
  
  wrap.appendChild(head);
  wrap.appendChild(c);
  
  const row = document.createElement('div');
  row.className = 'vcd-swatch-row';
  ['A', 'B'].forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-sm';
    btn.textContent = opt;
    btn.addEventListener('click', () => showResult(wrap, opt === 'A' ? 'PASS' : 'SCORE', opt === 'A' ? 'PASS' : 'SCORE', 'Clarity check.', () => blurryClearStage(root), opt !== 'A'));
    row.appendChild(btn);
  });
  wrap.appendChild(row);
  root.appendChild(wrap);
}
function nearFarStage(root) {
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'vcd-test';
  const head = document.createElement('p');
  head.className = 'vcd-hint';
  head.textContent = 'Can you quickly switch focus from screen to 20ft away?';
  
  const c = makeCanvas(240, 140);
  const g = ctx2d(c);
  g.fillStyle = '#000';
  g.beginPath(); g.arc(60, 70, 5, 0, 7); g.fill();
  g.beginPath(); g.arc(180, 70, 30, 0, 7); g.fill();
  g.textAlign = 'center';
  g.fillText('Near', 60, 120);
  g.fillText('Far', 180, 120);
  
  wrap.appendChild(head);
  wrap.appendChild(c);
  
  const row = document.createElement('div');
  row.className = 'vcd-swatch-row';
  ['Yes', 'No'].forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-sm';
    btn.textContent = opt;
    btn.addEventListener('click', () => showResult(wrap, opt === 'Yes' ? 'PASS' : 'SCORE', opt === 'Yes' ? 'PASS' : 'SCORE', 'Accommodation check.', () => nearFarStage(root), opt !== 'Yes'));
    row.appendChild(btn);
  });
  wrap.appendChild(row);
  root.appendChild(wrap);
}
function threeDDotStage(root) {
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'vcd-test';
  const head = document.createElement('p');
  head.className = 'vcd-hint';
  head.textContent = 'Does the red dot appear closer than the blue one?';
  
  const c = makeCanvas(240, 140);
  const g = ctx2d(c);
  g.fillStyle = 'blue';
  g.beginPath(); g.arc(100, 70, 40, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,0,0,0.8)';
  g.beginPath(); g.arc(140, 70, 40, 0, 7); g.fill();
  
  wrap.appendChild(head);
  wrap.appendChild(c);
  
  const row = document.createElement('div');
  row.className = 'vcd-swatch-row';
  ['Yes', 'No'].forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-sm';
    btn.textContent = opt;
    btn.addEventListener('click', () => showResult(wrap, opt === 'Yes' ? 'PASS' : 'SCORE', opt === 'Yes' ? 'PASS' : 'SCORE', 'Stereo vision check.', () => threeDDotStage(root), opt !== 'Yes'));
    row.appendChild(btn);
  });
  wrap.appendChild(row);
  root.appendChild(wrap);
}
function overlappingShapesStage(root) {
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'vcd-test';
  const head = document.createElement('p');
  head.className = 'vcd-hint';
  head.textContent = 'Which shape is in front?';
  
  const c = makeCanvas(240, 240);
  const g = ctx2d(c);
  g.fillStyle = 'blue';
  g.beginPath(); g.arc(100, 100, 60, 0, 7); g.fill();
  g.fillStyle = 'red';
  g.fillRect(80, 80, 100, 100);
  
  wrap.appendChild(head);
  wrap.appendChild(c);
  
  const row = document.createElement('div');
  row.className = 'vcd-swatch-row';
  ['Square', 'Circle'].forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-sm';
    btn.textContent = opt;
    btn.addEventListener('click', () => showResult(wrap, opt === 'Square' ? 'PASS' : 'SCORE', opt === 'Square' ? 'PASS' : 'SCORE', 'Depth cue check.', () => overlappingShapesStage(root), opt !== 'Square'));
    row.appendChild(btn);
  });
  wrap.appendChild(row);
  root.appendChild(wrap);
}
function shadowDepthStage(root) {
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'vcd-test';
  const head = document.createElement('p');
  head.className = 'vcd-hint';
  head.textContent = 'If shadow is below an object, does it look floating?';
  
  const c = makeCanvas(240, 240);
  const g = ctx2d(c);
  g.fillStyle = '#ccc';
  g.beginPath(); g.ellipse(120, 180, 50, 10, 0, 0, 7); g.fill();
  g.fillStyle = '#333';
  g.beginPath(); g.arc(120, 100, 40, 0, 7); g.fill();
  
  wrap.appendChild(head);
  wrap.appendChild(c);
  
  const row = document.createElement('div');
  row.className = 'vcd-swatch-row';
  ['Yes', 'No'].forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-sm';
    btn.textContent = opt;
    btn.addEventListener('click', () => showResult(wrap, opt === 'Yes' ? 'PASS' : 'SCORE', opt === 'Yes' ? 'PASS' : 'SCORE', 'Shadow depth check.', () => shadowDepthStage(root), opt !== 'Yes'));
    row.appendChild(btn);
  });
  wrap.appendChild(row);
  root.appendChild(wrap);
}
function glareSensitivityStage(root) {
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'vcd-test';
  const head = document.createElement('p');
  head.className = 'vcd-hint';
  head.textContent = 'Can you read past a bright glare spot?';
  
  const c = makeCanvas(240, 140);
  const g = ctx2d(c);
  g.fillStyle = '#000';
  g.font = 'bold 30px sans-serif';
  g.textAlign = 'center';
  g.fillText('GLARE', 120, 80);
  
  const grad = g.createRadialGradient(120, 80, 0, 120, 80, 60);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0,0,240,140);
  
  wrap.appendChild(head);
  wrap.appendChild(c);
  
  const row = document.createElement('div');
  row.className = 'vcd-swatch-row';
  ['Yes', 'No'].forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-sm';
    btn.textContent = opt;
    btn.addEventListener('click', () => showResult(wrap, opt === 'Yes' ? 'PASS' : 'SCORE', opt === 'Yes' ? 'PASS' : 'SCORE', 'Glare check.', () => glareSensitivityStage(root), opt !== 'Yes'));
    row.appendChild(btn);
  });
  wrap.appendChild(row);
  root.appendChild(wrap);
}
function brightnessToleranceStage(root) {
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'vcd-test';
  const head = document.createElement('p');
  head.className = 'vcd-hint';
  head.textContent = 'Is a very bright white screen uncomfortable?';
  
  const c = makeCanvas(240, 140);
  const g = ctx2d(c);
  g.fillStyle = '#fff';
  g.fillRect(0,0,240,140);
  g.fillStyle = '#ddd';
  g.font = 'bold 20px sans-serif';
  g.textAlign = 'center';
  g.fillText('BRIGHT', 120, 80);
  
  wrap.appendChild(head);
  wrap.appendChild(c);
  
  const row = document.createElement('div');
  row.className = 'vcd-swatch-row';
  ['Yes', 'No'].forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-sm';
    btn.textContent = opt;
    btn.addEventListener('click', () => showResult(wrap, opt === 'No' ? 'PASS' : 'SCORE', opt === 'No' ? 'PASS' : 'SCORE', 'Light sensitivity check.', () => brightnessToleranceStage(root), opt !== 'No'));
    row.appendChild(btn);
  });
  wrap.appendChild(row);
  root.appendChild(wrap);
}
function peripheralVisionStage(root) {
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'vcd-test';
  const head = document.createElement('p');
  head.className = 'vcd-hint';
  head.textContent = 'While looking at center, can you see movement on edges?';
  
  const c = makeCanvas(240, 140);
  const g = ctx2d(c);
  g.fillStyle = '#000';
  g.beginPath(); g.arc(120, 70, 10, 0, 7); g.fill();
  
  let drawState = 0;
  const iv = setInterval(() => {
    if(!root.isConnected) { clearInterval(iv); return; }
    g.clearRect(0,0,240,140);
    g.fillStyle = '#000';
    g.beginPath(); g.arc(120, 70, 10, 0, 7); g.fill();
    
    if(drawState % 2 === 0) {
      g.fillStyle = 'red';
      g.beginPath(); g.arc(20, 70, 10, 0, 7); g.fill();
      g.beginPath(); g.arc(220, 70, 10, 0, 7); g.fill();
    }
    drawState++;
  }, 500);
  
  wrap.appendChild(head);
  wrap.appendChild(c);
  
  const row = document.createElement('div');
  row.className = 'vcd-swatch-row';
  ['Yes', 'No'].forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-sm';
    btn.textContent = opt;
    btn.addEventListener('click', () => { clearInterval(iv); showResult(wrap, opt === 'Yes' ? 'PASS' : 'SCORE', opt === 'Yes' ? 'PASS' : 'SCORE', 'Peripheral check.', () => peripheralVisionStage(root), opt !== 'Yes'); });
    row.appendChild(btn);
  });
  wrap.appendChild(row);
  root.appendChild(wrap);
}
function movingTargetStage(root) {
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'vcd-test';
  const head = document.createElement('p');
  head.className = 'vcd-hint';
  head.textContent = 'Can you track a smoothly moving dot without jumping eyes?';
  
  const c = makeCanvas(240, 140);
  const g = ctx2d(c);
  let x = 0;
  let raf;
  
  function anim() {
    if(!root.isConnected) return;
    g.clearRect(0,0,240,140);
    x = (x + 2) % 240;
    g.fillStyle = '#000';
    g.beginPath(); g.arc(x, 70, 10, 0, 7); g.fill();
    raf = requestAnimationFrame(anim);
  }
  anim();
  
  wrap.appendChild(head);
  wrap.appendChild(c);
  
  const row = document.createElement('div');
  row.className = 'vcd-swatch-row';
  ['Yes', 'No'].forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-sm';
    btn.textContent = opt;
    btn.addEventListener('click', () => { cancelAnimationFrame(raf); showResult(wrap, opt === 'Yes' ? 'PASS' : 'SCORE', opt === 'Yes' ? 'PASS' : 'SCORE', 'Pursuit tracking check.', () => movingTargetStage(root), opt !== 'Yes'); });
    row.appendChild(btn);
  });
  wrap.appendChild(row);
  root.appendChild(wrap);
}
function rapidTapStage(root) {
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'vcd-test';
  const head = document.createElement('p');
  head.className = 'vcd-hint';
  head.textContent = 'Can you quickly tap appearing targets?';
  
  const c = makeCanvas(240, 240);
  const g = ctx2d(c);
  let tx = 120, ty = 120;
  
  function drawT() {
    g.clearRect(0,0,240,240);
    g.fillStyle = 'red';
    g.beginPath(); g.arc(tx, ty, 20, 0, 7); g.fill();
  }
  drawT();
  
  c.addEventListener('click', (e) => {
    const rect = c.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width * 240;
    const y = (e.clientY - rect.top) / rect.height * 240;
    if(Math.hypot(x-tx, y-ty) < 30) {
      tx = 20 + rand(200);
      ty = 20 + rand(200);
      drawT();
    }
  });
  
  wrap.appendChild(head);
  wrap.appendChild(c);
  
  const row = document.createElement('div');
  row.className = 'vcd-swatch-row';
  ['Yes', 'No'].forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-sm';
    btn.textContent = opt;
    btn.addEventListener('click', () => showResult(wrap, opt === 'Yes' ? 'PASS' : 'SCORE', opt === 'Yes' ? 'PASS' : 'SCORE', 'Saccade and coordination check.', () => rapidTapStage(root), opt !== 'Yes'));
    row.appendChild(btn);
  });
  wrap.appendChild(row);
  root.appendChild(wrap);
}
function wordRecognitionStage(root) {
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'vcd-test';
  const head = document.createElement('p');
  head.className = 'vcd-hint';
  head.textContent = 'Can you read the middle word: xxAPPLExx';
  
  const c = makeCanvas(240, 100);
  const g = ctx2d(c);
  g.textAlign = 'center';
  g.font = 'bold 30px sans-serif';
  g.fillStyle = '#555';
  g.fillText('xx', 60, 60);
  g.fillStyle = '#000';
  g.fillText('APPLE', 120, 60);
  g.fillStyle = '#555';
  g.fillText('xx', 180, 60);
  
  wrap.appendChild(head);
  wrap.appendChild(c);
  
  const row = document.createElement('div');
  row.className = 'vcd-swatch-row';
  ['APPLE', 'PEAR'].forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-sm';
    btn.textContent = opt;
    btn.addEventListener('click', () => showResult(wrap, opt === 'APPLE' ? 'PASS' : 'SCORE', opt === 'APPLE' ? 'PASS' : 'SCORE', 'Flanker check.', () => wordRecognitionStage(root), opt !== 'APPLE'));
    row.appendChild(btn);
  });
  wrap.appendChild(row);
  root.appendChild(wrap);
}
function dyslexiaScreeningStage(root) {
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'vcd-test';
  const head = document.createElement('p');
  head.className = 'vcd-hint';
  head.textContent = 'Which is correct: b or d for dog?';
  
  const c = makeCanvas(240, 100);
  const g = ctx2d(c);
  g.textAlign = 'center';
  g.font = 'bold 40px sans-serif';
  g.fillStyle = '#000';
  g.fillText('b', 80, 60);
  g.fillText('d', 160, 60);
  
  wrap.appendChild(head);
  wrap.appendChild(c);
  
  const row = document.createElement('div');
  row.className = 'vcd-swatch-row';
  ['b', 'd'].forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-sm';
    btn.textContent = opt;
    btn.addEventListener('click', () => showResult(wrap, opt === 'd' ? 'PASS' : 'SCORE', opt === 'd' ? 'PASS' : 'SCORE', 'Symbol orientation check.', () => dyslexiaScreeningStage(root), opt !== 'd'));
    row.appendChild(btn);
  });
  wrap.appendChild(row);
  root.appendChild(wrap);
}
function eyeTrainingStage(root) {
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'vcd-test';
  const head = document.createElement('p');
  head.className = 'vcd-hint';
  head.textContent = 'Did you follow the pencil pushup exercise?';
  
  const c = makeCanvas(240, 240);
  const g = ctx2d(c);
  g.fillStyle = '#ffd700';
  g.fillRect(110, 20, 20, 160);
  g.fillStyle = '#000';
  g.beginPath(); g.moveTo(110, 180); g.lineTo(130, 180); g.lineTo(120, 210); g.fill();
  
  wrap.appendChild(head);
  wrap.appendChild(c);
  
  const row = document.createElement('div');
  row.className = 'vcd-swatch-row';
  ['Yes', 'No'].forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-sm';
    btn.textContent = opt;
    btn.addEventListener('click', () => showResult(wrap, opt === 'Yes' ? 'PASS' : 'SCORE', opt === 'Yes' ? 'PASS' : 'SCORE', 'Flexibility check.', () => eyeTrainingStage(root), opt !== 'Yes'));
    row.appendChild(btn);
  });
  wrap.appendChild(row);
  root.appendChild(wrap);
}
function colorSensitivityStage(root) {
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'vcd-test';
  const head = document.createElement('p');
  head.className = 'vcd-hint';
  head.textContent = 'Can you see subtle shifts in pastel colors?';
  
  const c = makeCanvas(240, 140);
  const g = ctx2d(c);
  g.fillStyle = 'rgb(255, 240, 240)';
  g.fillRect(20, 20, 90, 100);
  g.fillStyle = 'rgb(255, 235, 235)';
  g.fillRect(130, 20, 90, 100);
  
  wrap.appendChild(head);
  wrap.appendChild(c);
  
  const row = document.createElement('div');
  row.className = 'vcd-swatch-row';
  ['Yes', 'No'].forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-sm';
    btn.textContent = opt;
    btn.addEventListener('click', () => showResult(wrap, opt === 'Yes' ? 'PASS' : 'SCORE', opt === 'Yes' ? 'PASS' : 'SCORE', 'Subtle color check.', () => colorSensitivityStage(root), opt !== 'Yes'));
    row.appendChild(btn);
  });
  wrap.appendChild(row);
  root.appendChild(wrap);
}

function simpleTest(root, title, question, options, correct, detail, restartFunc) {
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'vcd-test';
  
  const head = document.createElement('p');
  head.className = 'vcd-hint';
  head.innerHTML = title + ': ' + question;
  wrap.appendChild(head);
  
  const row = document.createElement('div');
  row.className = 'vcd-swatch-row';
  
  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-sm';
    btn.textContent = opt;
    btn.addEventListener('click', () => {
      showResult(wrap, opt === correct ? 'PASS' : 'SCORE', opt === correct ? 'PASS' : 'SCORE', detail, () => restartFunc(root), opt !== correct);
    });
    row.appendChild(btn);
  });
  
  wrap.appendChild(row);
  root.appendChild(wrap);
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
  r.className = 'btn btn-primary';
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
    b.className = 'btn btn-ghost btn-sm';
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
      ({ ringgap: ringGapStage, contrast: contrastStage, amsler: amslerStage, tumblingE: tumblingEStage,
dominantEye: dominantEyeStage, colorDiscrimination: colorDiscriminationStage, fadingText: fadingTextStage, gridVisibility: gridVisibilityStage, hueArrangement: hueArrangementStage, ishihara: ishiharaStage, colorSorting: colorSortingStage, colorMatching: colorMatchingStage, snellen: snellenStage, letterIsolation: letterIsolationStage, blurryText: blurryTextStage, astigmatismWheel: astigmatismWheelStage, blurryClear: blurryClearStage, nearFar: nearFarStage, threeDDot: threeDDotStage, overlappingShapes: overlappingShapesStage, shadowDepth: shadowDepthStage, glareSensitivity: glareSensitivityStage, brightnessTolerance: brightnessToleranceStage, peripheralVision: peripheralVisionStage, movingTarget: movingTargetStage, rapidTap: rapidTapStage, wordRecognition: wordRecognitionStage, dyslexiaScreening: dyslexiaScreeningStage, eyeTraining: eyeTrainingStage, colorSensitivity: colorSensitivityStage })[key](area);
    });
    nav.appendChild(b);
  });
  const first = nav.querySelector('button');
  root.appendChild(nav);
  first.click();
}
