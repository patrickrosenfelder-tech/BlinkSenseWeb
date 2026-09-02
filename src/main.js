import './style.css';

const menuToggle = document.querySelector('.menu-toggle');
const primaryNav = document.querySelector('.primary-nav');
const earlyAccessButtons = document.querySelectorAll('.js-early-access');
const toast = document.querySelector('.toast');
const toastClose = document.querySelector('.toast-close');
let toastTimer;

document.querySelector('#year').textContent = new Date().getFullYear();

menuToggle.addEventListener('click', () => {
  const expanded = menuToggle.getAttribute('aria-expanded') === 'true';
  menuToggle.setAttribute('aria-expanded', String(!expanded));
  primaryNav.classList.toggle('is-open', !expanded);
});

primaryNav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
  menuToggle.setAttribute('aria-expanded', 'false');
  primaryNav.classList.remove('is-open');
}));

function hideToast() {
  toast.classList.remove('is-visible');
  toast.hidden = true;
}

earlyAccessButtons.forEach((button) => button.addEventListener('click', () => {
  toast.hidden = false;
  toast.classList.add('is-visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(hideToast, 6000);
}));

toastClose.addEventListener('click', () => {
  window.clearTimeout(toastTimer);
  hideToast();
});

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!reducedMotion) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));
} else {
  document.querySelectorAll('.reveal').forEach((element) => element.classList.add('is-visible'));
}

/* Live session dashboard demo (decorative — not connected to a camera) */
const GAUGE_CIRCUMFERENCE = 377;
const GAUGE_MAX_BPM = 28;
const bpmRing = document.querySelector('#bpmRing');
const bpmValue = document.querySelector('#bpmValue');
const zoneBadge = document.querySelector('#zoneBadge');
const zoneNote = document.querySelector('#zoneNote');
const blinkCount = document.querySelector('#blinkCount');
const lastBlink = document.querySelector('#lastBlink');
const sessionChips = document.querySelectorAll('.session-chips .chip');

const ZONE_STATES = [
  { zone: 'healthy', bpm: 18, note: 'Blink rate is in a comfortable range for this session.' },
  { zone: 'low', bpm: 9, note: 'Your blink rate has dropped below the Work threshold.' },
  { zone: 'critical', bpm: 4, note: 'Blink rate is critically low — consider a short break.' },
];

let blinkTotal = 712;
let stateIndex = 0;
let demoTimer;

function applyState(state) {
  const offset = GAUGE_CIRCUMFERENCE * (1 - Math.min(state.bpm / GAUGE_MAX_BPM, 1));
  bpmRing.style.strokeDashoffset = String(offset);
  bpmRing.style.stroke = `var(--${state.zone})`;
  bpmValue.textContent = String(state.bpm);
  zoneBadge.textContent = state.zone.charAt(0).toUpperCase() + state.zone.slice(1);
  zoneBadge.className = `zone-badge zone-${state.zone}`;
  zoneNote.textContent = state.note;
  blinkTotal += Math.max(1, Math.round(state.bpm / 6));
  blinkCount.textContent = String(blinkTotal);
  lastBlink.textContent = `${Math.floor(Math.random() * 3) + 1}s ago`;
}

if (bpmRing && bpmValue && !reducedMotion) {
  demoTimer = window.setInterval(() => {
    stateIndex = (stateIndex + 1) % ZONE_STATES.length;
    applyState(ZONE_STATES[stateIndex]);
  }, 4200);
}

sessionChips.forEach((chip) => chip.addEventListener('click', () => {
  sessionChips.forEach((other) => {
    other.classList.remove('is-active');
    other.setAttribute('aria-pressed', 'false');
  });
  chip.classList.add('is-active');
  chip.setAttribute('aria-pressed', 'true');
  window.clearInterval(demoTimer);
  stateIndex = 0;
  applyState(ZONE_STATES[0]);
  if (!reducedMotion) {
    demoTimer = window.setInterval(() => {
      stateIndex = (stateIndex + 1) % ZONE_STATES.length;
      applyState(ZONE_STATES[stateIndex]);
    }, 4200);
  }
}));
