import { el } from '../ui/dom.js';

export function getConsentActionPolicy(acknowledged) {
  return {
    canContinueWithoutCamera: true,
    canContinueWithCamera: acknowledged,
  };
}

export function renderConsent(root, { onContinue, cameraError }) {
  let acknowledged = false;

  const actionPolicy = getConsentActionPolicy(acknowledged);
  const continueWithCameraBtn = el('button', { class: 'button', type: 'button', disabled: !actionPolicy.canContinueWithCamera }, 'Enable camera & continue');
  const continueWithoutBtn = el('button', { class: 'button button-outline', type: 'button', disabled: !actionPolicy.canContinueWithoutCamera }, 'Continue without camera');

  continueWithCameraBtn.addEventListener('click', () => onContinue(true));
  continueWithoutBtn.addEventListener('click', () => onContinue(false));

  const checkbox = el('input', {
    type: 'checkbox',
    id: 'consent-check',
    onChange: (e) => {
      acknowledged = e.target.checked;
      const nextPolicy = getConsentActionPolicy(acknowledged);
      continueWithCameraBtn.disabled = !nextPolicy.canContinueWithCamera;
      continueWithoutBtn.disabled = !nextPolicy.canContinueWithoutCamera;
    },
  });

  const node = el('div', { class: 'screen' }, [
    el('section', { class: 'card', 'aria-labelledby': 'consent-heading' }, [
      el('h2', { id: 'consent-heading' }, 'Before you start'),
      el('ul', { class: 'consent-list' }, [
        el('li', {}, 'All camera video and analysis happen locally in your browser using on-device machine learning. No frames, landmarks, or answers are ever sent anywhere.'),
        el('li', {}, 'The camera is used only to estimate how often you blink while you do the tasks — never to identify you or store footage.'),
        el('li', {}, 'You can decline the camera and still complete the reading and vision tasks; blink results will simply be marked unavailable.'),
        el('li', {}, 'This is a screening tool only, not a medical device, and does not diagnose or treat any condition.'),
      ]),
      cameraError
        ? el('p', { class: 'error-text', role: 'alert' }, cameraError)
        : null,
      el('div', { class: 'consent-check-row' }, [
        checkbox,
        el('label', { for: 'consent-check' }, 'I understand this is a local, screening-only tool and not medical advice.'),
      ]),
      el('div', { class: 'consent-actions' }, [continueWithCameraBtn, continueWithoutBtn]),
    ]),
  ]);
  return node;
}
