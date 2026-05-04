import Twilio from 'twilio';

const getClient = () => {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!sid || !token) throw new Error('missing_twilio_env');
  return Twilio(sid, token);
};

const fromWhatsApp = () => {
  const raw = process.env.TWILIO_WHATSAPP_FROM?.trim();
  if (!raw) throw new Error('missing_TWILIO_WHATSAPP_FROM');
  return raw.startsWith('whatsapp:') ? raw : `whatsapp:${raw}`;
};

/**
 * Gizli anahtar döndürmez — Ayarlar ekranında Vercel yapılandırmasını doğrulamak için.
 */
export function getTwilioEnvStatus() {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const hasToken = Boolean(process.env.TWILIO_AUTH_TOKEN?.trim());
  const fromRaw = process.env.TWILIO_WHATSAPP_FROM?.trim();
  const configured = Boolean(sid && hasToken && fromRaw);
  const digits = fromRaw ? String(fromRaw).replace(/\D/g, '') : '';
  const whatsapp_from_masked =
    digits.length >= 4 ? `whatsapp:+******${digits.slice(-4)}` : fromRaw ? 'whatsapp:(tanımlı)' : null;
  const fromLower = (fromRaw || '').toLowerCase();
  const sandbox_likely =
    fromLower.includes('14155238886') ||
    fromLower.includes('sandbox') ||
    (sid && String(sid).toLowerCase().includes('sandbox'));
  return {
    configured,
    account_sid_suffix: sid && sid.length > 4 ? sid.slice(-6) : null,
    has_auth_token: hasToken,
    whatsapp_from_masked,
    sandbox_likely
  };
}

/** TR telefon → +90… E.164 (Twilio WhatsApp) */
export function normalizePhoneToE164(phone) {
  const digits = String(phone || '')
    .replace(/^whatsapp:/i, '')
    .replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('90') && digits.length >= 12) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 11) return `+90${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith('5')) return `+90${digits}`;
  if (digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return null;
}

/**
 * Genel WhatsApp metni (Twilio). `phone` +90… veya 05… olabilir.
 * @returns {Promise<{ sid?: string }>}
 */
export async function sendWhatsAppMessage(phone, message) {
  const e164 = normalizePhoneToE164(phone);
  if (!e164) throw new Error('invalid_phone');
  return sendMeetingWhatsApp(e164, message);
}

/** @returns {Promise<{ sid?: string }>} */
export async function sendMeetingWhatsApp(toE164, bodyText) {
  const client = getClient();
  const to =
    typeof toE164 === 'string' && toE164.startsWith('whatsapp:') ? toE164 : `whatsapp:${toE164.replace(/^whatsapp:/i, '')}`;

  const msg = await client.messages.create({
    from: fromWhatsApp(),
    to,
    body: bodyText
  });
  return { sid: msg.sid };
}
