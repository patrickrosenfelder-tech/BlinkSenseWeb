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

if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
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
