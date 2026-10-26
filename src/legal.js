import './style.css';

// ── Year ──────────────────────────────────────────────────────
const year = document.querySelector('#year');
if (year) year.textContent = new Date().getFullYear();
