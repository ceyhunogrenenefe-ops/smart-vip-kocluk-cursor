import { getMetaWhatsAppEnvStatus, metaWhatsAppConfigured } from './_lib/meta-whatsapp.js';
import { getTwilioEnvStatus } from './_lib/whatsapp-twilio.js';
import { resolvePrimaryWabaId } from './_lib/meta-templates-sync.js';
import {
  reportReminderIstHour,
  reportReminderSendChannel
} from './_lib/daily-report-reminder-job.js';
import { CRON_DAILY_REPORT_REMINDERS_UTC } from './_lib/vercel-cron-contract.js';

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

  let waba_diag = { resolved: false, source: null, waba_id_suffix: null };
  if (metaReady) {
    const primary = await resolvePrimaryWabaId();
    if (primary.waba_id) {
      const w = String(primary.waba_id);
      waba_diag = {
        resolved: true,
        source: primary.source,
        waba_id_suffix: w.length > 4 ? w.slice(-6) : w
      };
    }
  }

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
    waba_resolved: waba_diag.resolved,
    waba_source: waba_diag.source,
    waba_id_suffix: waba_diag.waba_id_suffix,
    twilio_configured: twilioReady,
    automation_provider: metaReady ? 'meta_cloud_api' : twilioReady ? 'twilio' : null,
    report_reminder: {
      channel: reportReminderSendChannel(),
      ist_hour: reportReminderIstHour(),
      cron_utc: CRON_DAILY_REPORT_REMINDERS_UTC,
      template_type: 'report_reminder',
      env_channel: String(process.env.REPORT_REMINDER_CHANNEL ?? 'meta').trim() || 'meta',
      hint:
        reportReminderSendChannel() === 'meta'
          ? 'Günlük rapor hatırlatması Meta şablonu ile gider (22:00 TR). Supabase message_templates.report_reminder aktif olmalı.'
          : reportReminderSendChannel() === 'gateway'
            ? 'Gateway modu — REPORT_REMINDER_CHANNEL=gateway. Meta için env boş bırakın veya meta yazın.'
            : 'Meta env eksik veya gateway yapılandırılmamış — mesaj gitmez.'
    },
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
