import './style.css';

// ── Year ──────────────────────────────────────────────────────
document.querySelector('#year').textContent = new Date().getFullYear();

// ── Mobile nav ───────────────────────────────────────────────
const menuToggle = document.querySelector('.menu-toggle');
const primaryNav = document.querySelector('.primary-nav');

menuToggle.addEventListener('click', () => {
  const expanded = menuToggle.getAttribute('aria-expanded') === 'true';
  menuToggle.setAttribute('aria-expanded', String(!expanded));
  primaryNav.classList.toggle('is-open', !expanded);
});

primaryNav.querySelectorAll('a').forEach((link) =>
  link.addEventListener('click', () => {
    menuToggle.setAttribute('aria-expanded', 'false');
    primaryNav.classList.remove('is-open');
  })
);

// ── Toast ─────────────────────────────────────────────────────
const toast      = document.querySelector('.toast');
const toastClose = document.querySelector('.toast-close');
let toastTimer;

function hideToast() {
  toast.classList.remove('is-visible');
  toast.hidden = true;
}

document.querySelectorAll('.js-early-access').forEach((btn) =>
  btn.addEventListener('click', () => {
    toast.hidden = false;
    requestAnimationFrame(() => toast.classList.add('is-visible'));
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(hideToast, 6000);
  })
);

toastClose.addEventListener('click', () => {
  window.clearTimeout(toastTimer);
  hideToast();
});

// ── Scroll reveal ─────────────────────────────────────────────
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!reducedMotion) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          observer.unobserve(e.target);
        }
      });
    },
    { threshold: 0.1 }
  );
  document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));
} else {
  document.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-visible'));
}

// ── Live dashboard demo ───────────────────────────────────────
const CIRC      = 377;
const MAX_BPM   = 28;
const bpmRing   = document.querySelector('#bpmRing');
const bpmValue  = document.querySelector('#bpmValue');
const zoneBadge = document.querySelector('#zoneBadge');
const zoneNote  = document.querySelector('#zoneNote');
const blinkCount= document.querySelector('#blinkCount');
const lastBlink = document.querySelector('#lastBlink');
const chips     = document.querySelectorAll('.chips .chip');

const STATES = [
  { zone: 'healthy',  bpm: 18, note: 'Blink rate is in a comfortable range for this session.' },
  { zone: 'low',      bpm:  9, note: 'Your blink rate has dropped below the Work threshold.' },
  { zone: 'critical', bpm:  4, note: 'Blink rate is critically low — consider a short break.' },
];

let blinkTotal = 712;
let stateIdx   = 0;
let demoTimer;

function applyState(s) {
  const offset = CIRC * (1 - Math.min(s.bpm / MAX_BPM, 1));
  bpmRing.style.strokeDashoffset = String(offset);
  bpmRing.style.stroke = `var(--${s.zone})`;
  bpmValue.textContent  = String(s.bpm);
  zoneBadge.textContent = s.zone.charAt(0).toUpperCase() + s.zone.slice(1);
  zoneBadge.className   = `zone-badge zone-${s.zone}`;
  zoneNote.textContent  = s.note;
  blinkTotal += Math.max(1, Math.round(s.bpm / 6));
  blinkCount.textContent = String(blinkTotal);
  lastBlink.textContent  = `${Math.floor(Math.random() * 3) + 1}s ago`;
}

function startDemo() {
  if (reducedMotion) return;
  demoTimer = window.setInterval(() => {
    stateIdx = (stateIdx + 1) % STATES.length;
    applyState(STATES[stateIdx]);
  }, 4200);
}

if (bpmRing && bpmValue) startDemo();

chips.forEach((chip) =>
  chip.addEventListener('click', () => {
    chips.forEach((c) => { c.classList.remove('is-active'); c.setAttribute('aria-pressed', 'false'); });
    chip.classList.add('is-active');
    chip.setAttribute('aria-pressed', 'true');
    window.clearInterval(demoTimer);
    stateIdx = 0;
    applyState(STATES[0]);
    startDemo();
  })
);
