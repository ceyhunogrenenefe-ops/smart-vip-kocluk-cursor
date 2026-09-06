/**
 * Gelen WhatsApp (Baileys) → panel Kayıt Takibi
 * Env:
 *   REGISTRATION_INBOUND_FROM_GATEWAY=1
 *   REGISTRATION_INBOUND_URL=https://www.dersonlinevipkocluk.com/api/registration-inbound-gateway
 *   REGISTRATION_INBOUND_GATEWAY_SECRET=<Vercel ile aynı>
 */

function inboundEnabled() {
  return String(process.env.REGISTRATION_INBOUND_FROM_GATEWAY || '0').trim() === '1';
}

function inboundUrl() {
  return String(
    process.env.REGISTRATION_INBOUND_URL ||
      process.env.REGISTRATION_TRACKING_INBOUND_URL ||
      'https://www.dersonlinevipkocluk.com/api/registration-inbound-gateway'
  ).trim();
}

function inboundSecret() {
  return String(
    process.env.REGISTRATION_INBOUND_GATEWAY_SECRET ||
      process.env.WHATSAPP_GATEWAY_INBOUND_SECRET ||
      ''
  ).trim();
}

export function extractBaileysText(message) {
  if (!message || typeof message !== 'object') return '';
  if (typeof message.conversation === 'string' && message.conversation.trim()) {
    return message.conversation.trim();
  }
  if (message.extendedTextMessage?.text) return String(message.extendedTextMessage.text).trim();
  if (message.imageMessage?.caption) return String(message.imageMessage.caption).trim();
  if (message.videoMessage?.caption) return String(message.videoMessage.caption).trim();
  if (message.documentMessage?.caption) return String(message.documentMessage.caption).trim();
  if (message.buttonsResponseMessage?.selectedDisplayText) {
    return String(message.buttonsResponseMessage.selectedDisplayText).trim();
  }
  if (message.listResponseMessage?.title) return String(message.listResponseMessage.title).trim();
  if (message.imageMessage) return '[image]';
  if (message.videoMessage) return '[video]';
  if (message.audioMessage) return '[audio]';
  if (message.documentMessage) return '[document]';
  if (message.stickerMessage) return '[sticker]';
  return '';
}

export function phoneFromRemoteJid(remoteJid) {
  const jid = String(remoteJid || '').trim();
  if (!jid || jid.endsWith('@g.us') || jid === 'status@broadcast') return null;
  // 90555...@s.whatsapp.net veya @lid (lid'de telefon yok — atla)
  if (jid.includes('@lid')) return null;
  const user = jid.split('@')[0].split(':')[0];
  const digits = user.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits;
}

/**
 * @param {object} opts
 * @param {object} opts.msg Baileys WAMessage
 * @param {string} [opts.coachId]
 * @param {import('pino').Logger} [opts.logger]
 */
export async function forwardInboundToRegistration({ msg, coachId, logger } = {}) {
  if (!inboundEnabled()) return { skipped: true, reason: 'disabled' };
  const url = inboundUrl();
  const secret = inboundSecret();
  if (!url || !secret) return { skipped: true, reason: 'not_configured' };

  if (!msg || msg?.key?.fromMe) return { skipped: true, reason: 'from_me' };
  const phone = phoneFromRemoteJid(msg?.key?.remoteJid);
  if (!phone) return { skipped: true, reason: 'no_phone' };

  const text = extractBaileysText(msg.message);
  if (!text) return { skipped: true, reason: 'no_text' };

  const externalMessageId = String(msg?.key?.id || '').trim() || `gw_${Date.now()}_${phone.slice(-4)}`;
  const contactName = msg?.pushName ? String(msg.pushName).trim() : null;
  const timestamp = msg?.messageTimestamp
    ? Number(msg.messageTimestamp)
    : Math.floor(Date.now() / 1000);

  const payload = {
    phone,
    body: text,
    contact_name: contactName,
    external_message_id: `gw_${externalMessageId}`,
    timestamp,
    coach_id: coachId || null,
    message_type: 'text',
    raw: { remoteJid: msg?.key?.remoteJid, id: msg?.key?.id }
  };

  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 12_000);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-registration-inbound-secret': secret
      },
      body: JSON.stringify(payload),
      signal: ac.signal
    });
    clearTimeout(t);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      logger?.warn?.(
        { status: res.status, json, phone: phone.slice(-4) },
        'registration inbound forward failed'
      );
      return { ok: false, status: res.status, json };
    }
    logger?.info?.(
      { phone: phone.slice(-4), lead_id: json?.result?.lead_id || null },
      'registration inbound forwarded'
    );
    return { ok: true, json };
  } catch (err) {
    logger?.warn?.({ err: err?.message || err }, 'registration inbound forward error');
    return { ok: false, error: err?.message || String(err) };
  }
}
