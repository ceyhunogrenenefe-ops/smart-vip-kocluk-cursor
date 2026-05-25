import { errorMessage } from './error-msg.js';

function emailFromAddress() {
  return (
    process.env.EMAIL_FROM?.trim() ||
    process.env.SENDGRID_FROM?.trim() ||
    'noreply@dersonlinevipkocluk.com'
  );
}

function emailFromName() {
  return process.env.EMAIL_FROM_NAME?.trim() || 'Smart VIP Koçluk';
}

/**
 * Resend veya SendGrid ile tek alıcıya transactional e-posta.
 * Ortam: RESEND_API_KEY veya SENDGRID_API_KEY (+ doğrulanmış gönderen EMAIL_FROM).
 */
export async function sendTransactionalEmail({ to, subject, html, text }) {
  const toAddr = String(to || '')
    .trim()
    .toLowerCase();
  if (!toAddr || !toAddr.includes('@')) {
    throw new Error('invalid_recipient');
  }

  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (resendKey) {
    const from = emailFromAddress();
    const fromLabel = emailFromName();
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: `${fromLabel} <${from}>`,
        to: [toAddr],
        subject,
        html,
        text: text || html.replace(/<[^>]+>/g, ' ')
      })
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      let detail = body.slice(0, 300);
      try {
        const j = JSON.parse(body);
        detail = j.message || j.error || detail;
      } catch {
        /* metin kalsın */
      }
      throw new Error(`resend_failed: ${res.status} ${detail}`);
    }
    const sent = await res.json().catch(() => ({}));
    return { provider: 'resend', id: sent?.id || null };
  }

  const sgKey = process.env.SENDGRID_API_KEY?.trim();
  if (sgKey) {
    const from = emailFromAddress();
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sgKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: toAddr }] }],
        from: { email: from, name: emailFromName() },
        subject,
        content: [
          { type: 'text/plain', value: text || html.replace(/<[^>]+>/g, ' ') },
          { type: 'text/html', value: html }
        ]
      })
    });
    if (!res.ok && res.status !== 202) {
      const body = await res.text().catch(() => '');
      throw new Error(`sendgrid_failed: ${res.status} ${body.slice(0, 200)}`);
    }
    return { provider: 'sendgrid' };
  }

  throw new Error('email_not_configured');
}

export function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim() || process.env.SENDGRID_API_KEY?.trim());
}

export function publicAppOrigin() {
  const explicit =
    process.env.APP_PUBLIC_URL?.trim() ||
    process.env.PUBLIC_APP_URL?.trim() ||
    process.env.FRONTEND_APP_URL?.trim() ||
    process.env.APP_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, '')}`;
  return 'https://www.dersonlinevipkocluk.com';
}

export function logEmailError(scope, err) {
  console.error(`[${scope}]`, errorMessage(err));
}
