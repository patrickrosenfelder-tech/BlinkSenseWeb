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

// ── Early-access modal ────────────────────────────────────────
const backdrop    = document.getElementById('ea-backdrop');
const modal       = document.getElementById('ea-modal');
const form        = document.getElementById('ea-form');
const emailInput  = document.getElementById('ea-email');
const errorEl     = document.getElementById('ea-email-error');
const submitBtn   = form.querySelector('.ea-submit');
const submitLabel = submitBtn.querySelector('.ea-submit-label');
const spinner     = submitBtn.querySelector('.ea-submit-spinner');
const successEl   = document.getElementById('ea-success');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function openModal() {
  backdrop.hidden = false;
  backdrop.removeAttribute('aria-hidden');
  modal.showModal ? modal.showModal() : (modal.open = true);
  document.body.style.overflow = 'hidden';
  // Reset to form state
  form.hidden = false;
  successEl.hidden = true;
  errorEl.hidden = true;
  emailInput.value = '';
  emailInput.setAttribute('aria-invalid', 'false');
  // Focus the input on next frame
  requestAnimationFrame(() => emailInput.focus());
}

function closeModal() {
  modal.close ? modal.close() : (modal.open = false);
  backdrop.hidden = true;
  backdrop.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.hidden = false;
  emailInput.setAttribute('aria-invalid', 'true');
  emailInput.focus();
}

function clearError() {
  errorEl.hidden = true;
  emailInput.setAttribute('aria-invalid', 'false');
}

function setLoading(loading) {
  submitBtn.disabled = loading;
  emailInput.disabled = loading;
  submitLabel.hidden = loading;
  spinner.hidden = !loading;
  submitBtn.setAttribute('aria-busy', String(loading));
}

// Open on all early-access trigger buttons
document.querySelectorAll('.js-early-access').forEach((btn) =>
  btn.addEventListener('click', openModal)
);

// Close on backdrop click
backdrop.addEventListener('click', closeModal);

// Close on Escape / native dialog close
modal.addEventListener('close', () => {
  backdrop.hidden = true;
  backdrop.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
});

// Close button inside modal
modal.querySelector('.ea-close').addEventListener('click', closeModal);
successEl.querySelector('.ea-success-close').addEventListener('click', closeModal);

// Inline validation on blur
emailInput.addEventListener('blur', () => {
  const val = emailInput.value.trim();
  if (val && !EMAIL_RE.test(val)) {
    showError('Please enter a valid email address.');
  } else {
    clearError();
  }
});

// Form submission
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();

  const email = emailInput.value.trim().toLowerCase();

  if (!email) {
    showError('Please enter your email address.');
    return;
  }
  if (!EMAIL_RE.test(email)) {
    showError('Please enter a valid email address.');
    return;
  }

  setLoading(true);

  try {
    const res = await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || `Server error ${res.status}`);
    }

    // Show success
    form.hidden = true;
    successEl.hidden = false;
    successEl.querySelector('.ea-success-close').focus();

  } catch (err) {
    showError(err.message || 'Something went wrong — please try again.');
  } finally {
    setLoading(false);
  }
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
