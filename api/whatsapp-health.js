import { getMetaWhatsAppEnvStatus, metaWhatsAppConfigured } from './_lib/meta-whatsapp.js';
import { getTwilioEnvStatus } from './_lib/whatsapp-twilio.js';

/**
 * WhatsApp teşhis — giriş gerekmez.
 * GET /api/whatsapp-health
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const meta = getMetaWhatsAppEnvStatus();
  const twilio = getTwilioEnvStatus();
  const metaReady = metaWhatsAppConfigured();
  const twilioReady = Boolean(twilio.configured);

  let hint;
  if (metaReady) {
    hint =
      'Meta Cloud API hazır. Otomasyon şablon mesajı kullanır; serbest metin testi yalnızca 24 saat penceresinde çalışır.';
  } else if (twilioReady) {
    hint = 'Twilio yapılandırılmış (eski yol). Otomasyon için Meta env önerilir.';
  } else {
    hint =
      'Vercel Production: META_WHATSAPP_TOKEN + META_PHONE_NUMBER_ID değerlerini doldurun (boş satır bırakmayın) ve Redeploy yapın.';
  }

  return res.status(200).json({
    meta_configured: metaReady,
    twilio_configured: twilioReady,
    automation_provider: metaReady ? 'meta_cloud_api' : twilioReady ? 'twilio' : null,
    meta,
    twilio: {
      configured: twilio.configured,
      has_auth_token: twilio.has_auth_token,
      account_sid_suffix: twilio.account_sid_suffix,
      whatsapp_from_masked: twilio.whatsapp_from_masked
    },
    hint
  });
}
