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

// ── Scroll reveal (progressive enhancement) ───────────────────
// Content is visible by default. Only elements that start below the fold
// are hidden and faded in, so nothing on the first screen ever waits on JS.
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!reducedMotion && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          observer.unobserve(e.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
  );
  const fold = window.innerHeight;
  document.querySelectorAll('.reveal').forEach((el) => {
    if (el.getBoundingClientRect().top < fold) return;
    el.classList.add('reveal-pending');
    observer.observe(el);
  });
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
