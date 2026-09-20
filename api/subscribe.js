/**
 * POST /api/subscribe
 * Body: { email: string }
 *
 * Storage: Vercel KV (Redis-compatible).
 * Required env vars (set in Vercel project settings):
 *   KV_REST_API_URL      – from Vercel KV dashboard
 *   KV_REST_API_TOKEN    – from Vercel KV dashboard
 *
 * Optional (for confirmation email via Resend):
 *   RESEND_API_KEY       – from resend.com dashboard
 *   RESEND_FROM_EMAIL    – e.g. "BlinkSense <hello@blinksenseapp.com>"
 *
 * If KV env vars are absent the handler still stores the email in a
 * memory-only Set for local dev and returns success so the form is
 * fully testable without a database.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Simple in-memory fallback for local dev / missing KV config
const memoryStore = new Set();

async function saveToKV(email) {
  const { KV_REST_API_URL, KV_REST_API_TOKEN } = process.env;
  if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
    memoryStore.add(email);
    return { stored: false, reason: 'no-kv-config' };
  }

  // SADD blinksense:waitlist <email> — idempotent, deduplicates automatically
  const res = await fetch(`${KV_REST_API_URL}/sadd/blinksense:waitlist/${encodeURIComponent(email)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`KV error ${res.status}: ${text}`);
  }

  return { stored: true };
}

async function sendConfirmationEmail(email) {
  const { RESEND_API_KEY, RESEND_FROM_EMAIL } = process.env;
  if (!RESEND_API_KEY) return { sent: false, reason: 'no-resend-key' };

  const from = RESEND_FROM_EMAIL || 'BlinkSense <no-reply@blinksenseapp.com>';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "You're on the BlinkSense early access list 👁",
      html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:40px 24px;color:#0d1117">
  <h1 style="font-size:24px;margin:0 0 16px">You're in. 👁</h1>
  <p style="font-size:16px;line-height:1.6;margin:0 0 20px">
    Thanks for joining the BlinkSense early access list — we'll reach out as
    soon as a slot opens up.
  </p>
  <p style="font-size:14px;color:#555;margin:0 0 32px">
    BlinkSense is a privacy-first, on-device blink-rate monitor. Your camera
    data never leaves your device.
  </p>
  <a href="https://www.blinksenseapp.com/"
     style="display:inline-block;background:#0a7c4e;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600">
    Visit blinksenseapp.com →
  </a>
  <p style="font-size:12px;color:#999;margin:32px 0 0">
    You received this because you signed up at blinksenseapp.com.
    To unsubscribe, reply with "unsubscribe".
  </p>
</div>`,
      text: `You're on the BlinkSense early access list!\n\nWe'll reach out as soon as a slot opens up. Visit https://www.blinksenseapp.com/ to learn more.\n\nTo unsubscribe, reply with "unsubscribe".`,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('Resend error', res.status, text);
    return { sent: false, reason: 'resend-api-error' };
  }

  return { sent: true };
}

export default async function handler(req, res) {
  // CORS – allow the same origin and Vercel preview deployments
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let email;
  try {
    ({ email } = typeof req.body === 'string' ? JSON.parse(req.body) : req.body);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'email is required' });
  }

  email = email.trim().toLowerCase();

  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  if (email.length > 320) {
    return res.status(400).json({ error: 'Email address is too long.' });
  }

  try {
    const [kvResult, emailResult] = await Promise.allSettled([
      saveToKV(email),
      sendConfirmationEmail(email),
    ]);

    if (kvResult.status === 'rejected') {
      console.error('KV save failed:', kvResult.reason);
      return res.status(500).json({ error: 'Failed to save — please try again.' });
    }

    console.log('subscribe', {
      email,
      kv: kvResult.value,
      email_sent: emailResult.status === 'fulfilled' ? emailResult.value : emailResult.reason,
    });

    return res.status(200).json({ ok: true, message: "You're on the list!" });
  } catch (err) {
    console.error('subscribe error:', err);
    return res.status(500).json({ error: 'Something went wrong — please try again.' });
  }
}
