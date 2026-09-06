/**
 * QR / Baileys WhatsApp gateway → Kayıt Takibi inbound
 * POST /api/registration-inbound-gateway
 * Header: x-registration-inbound-secret  (veya Authorization: Bearer …)
 * Body: { phone, body, contact_name?, external_message_id?, timestamp?, coach_id? }
 *
 * Gateway env:
 *   REGISTRATION_INBOUND_URL=https://www.dersonlinevipkocluk.com/api/registration-inbound-gateway
 *   REGISTRATION_INBOUND_GATEWAY_SECRET=<aynı secret>
 *   REGISTRATION_INBOUND_FROM_GATEWAY=1
 */
import { ingestRegistrationChannelMessage } from '../api/_lib/registration-channel-ingest.js';

function expectedSecret() {
  return String(
    process.env.REGISTRATION_INBOUND_GATEWAY_SECRET ||
      process.env.WHATSAPP_GATEWAY_INBOUND_SECRET ||
      ''
  ).trim();
}

function readSecret(req) {
  const h = req.headers || {};
  const header =
    h['x-registration-inbound-secret'] ||
    h['x-inbound-secret'] ||
    h['x-gateway-secret'] ||
    '';
  if (header) return String(header).trim();
  const auth = String(h.authorization || h.Authorization || '').trim();
  if (/^bearer\s+/i.test(auth)) return auth.replace(/^bearer\s+/i, '').trim();
  const q = req.query && typeof req.query === 'object' ? req.query : {};
  return String(q.secret || '').trim();
}

function parseBody(req) {
  let b = req.body;
  if (typeof b === 'string') {
    try {
      b = JSON.parse(b || '{}');
    } catch {
      b = {};
    }
  }
  return b && typeof b === 'object' ? b : {};
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      service: 'registration-inbound-gateway',
      secret_configured: Boolean(expectedSecret())
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const expected = expectedSecret();
  if (!expected) {
    return res.status(503).json({
      error: 'secret_not_configured',
      hint: 'Vercel REGISTRATION_INBOUND_GATEWAY_SECRET tanımlayın'
    });
  }

  if (readSecret(req) !== expected) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const body = parseBody(req);
  const phone = String(body.phone || body.from || body.wa_id || '').replace(/\D/g, '');
  if (!phone || phone.length < 10) {
    return res.status(400).json({ error: 'phone_required' });
  }

  const text =
    body.body != null
      ? String(body.body)
      : body.text != null
        ? String(body.text)
        : body.message != null
          ? String(body.message)
          : '';
  if (!String(text).trim()) {
    return res.status(400).json({ error: 'body_required' });
  }

  const externalMessageId = String(
    body.external_message_id || body.message_id || body.id || `gw_${Date.now()}_${phone.slice(-4)}`
  ).slice(0, 180);

  try {
    const result = await ingestRegistrationChannelMessage({
      channel: 'whatsapp',
      direction: 'inbound',
      phone,
      externalContactId: phone,
      contactName: body.contact_name || body.push_name || body.name || null,
      body: text,
      messageType: String(body.message_type || 'text').slice(0, 40),
      externalMessageId,
      timestamp: body.timestamp || Math.floor(Date.now() / 1000),
      institutionId: body.institution_id || null,
      payload: {
        source: 'whatsapp_gateway',
        coach_id: body.coach_id || null,
        raw: body.raw || null
      }
    });

    return res.status(200).json({ ok: true, result });
  } catch (e) {
    console.error('[registration-inbound-gateway]', e instanceof Error ? e.message : e);
    return res.status(500).json({ error: 'ingest_failed', message: e instanceof Error ? e.message : String(e) });
  }
}
