import { el } from '../ui/dom.js';

export function renderWelcome(root, { onChooseAdult, onChooseKids }) {
  const node = el('div', { class: 'screen' }, [
    el('section', { class: 'card hero-card' }, [
      el('h1', {}, 'BlinkSense Assessment'),
      el('p', { class: 'hero-sub' }, 'A short, private screening: a reading task, a few quick vision checks, and on-device blink tracking — all in your browser.'),
      el('div', { class: 'privacy-banner', role: 'note', 'aria-label': 'Privacy notice' }, [
        el('strong', {}, 'Processed on-device.'),
        ' Your camera video, face landmarks, answers, and blink metrics are processed on this device and are never uploaded, stored remotely, or shared. This app\'s code and its on-device face-tracking model are downloaded from hosting CDNs when the page loads or the camera is enabled.',
      ]),
      el('div', { class: 'disclaimer-banner', role: 'note', 'aria-label': 'Not medical advice' }, [
        el('strong', {}, 'Screening only — not medical advice.'),
        ' This tool does not diagnose or treat any condition. If you have concerns about your eyes or vision, please see an eye-care professional.',
      ]),
    ]),
    el('section', { class: 'card choice-card', 'aria-labelledby': 'who-heading' }, [
      el('h2', { id: 'who-heading' }, "Who's taking the assessment?"),
      el('div', { class: 'choice-grid' }, [
        el('button', { class: 'choice-button', type: 'button', onClick: onChooseAdult }, [
          el('span', { class: 'choice-title' }, 'An adult'),
          el('span', { class: 'choice-desc' }, 'Profile questions, a timed reading passage, and three quick vision checks.'),
        ]),
        el('button', { class: 'choice-button', type: 'button', onClick: onChooseKids }, [
          el('span', { class: 'choice-title' }, 'A kid (ages 6–13)'),
          el('span', { class: 'choice-desc' }, 'A short, friendly story-and-picture game sized to their age.'),
        ]),
      ]),
    ]),
  ]);
  return node;
}
