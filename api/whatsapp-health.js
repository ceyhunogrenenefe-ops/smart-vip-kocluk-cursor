import { getMetaWhatsAppEnvStatus, metaWhatsAppConfigured } from './_lib/meta-whatsapp.js';
import { getTwilioEnvStatus } from './_lib/whatsapp-twilio.js';
import { resolvePrimaryWabaId } from './_lib/meta-templates-sync.js';
import {
  reportReminderIstHour,
  reportReminderSendChannel
} from './_lib/daily-report-reminder-job.js';
import { CRON_DAILY_REPORT_REMINDERS_UTC } from './_lib/vercel-cron-contract.js';
import { probeGatewayHealth } from './_lib/gateway-upstream.js';
import {
  bookOrderGatewaySessionId,
  getGatewaySendEnvStatus,
  getGatewaySessionStatus,
  listConnectedGatewaySessionIds
} from './_lib/whatsapp-gateway-send.js';

const maskId = (id) => {
  const s = String(id || '').trim();
  if (!s) return null;
  return s.length > 12 ? `…${s.slice(-12)}` : s;
};

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

  const gatewayEnv = getGatewaySendEnvStatus();
  const gatewayHealth = await probeGatewayHealth();
  const envSessionId = bookOrderGatewaySessionId();
  const connectedLive = gatewayHealth.ok ? await listConnectedGatewaySessionIds() : [];

  const sessionChecks = [];
  const candidates = [...new Set([envSessionId, ...connectedLive].filter(Boolean))];
  for (const sid of candidates.slice(0, 5)) {
    try {
      const st = await getGatewaySessionStatus(sid);
      sessionChecks.push({
        session_id_suffix: maskId(sid),
        ok: st.ok === true,
        status: st.status || null,
        error: st.error || null
      });
    } catch (e) {
      sessionChecks.push({
        session_id_suffix: maskId(sid),
        ok: false,
        status: 'check_failed',
        error: e instanceof Error ? e.message : String(e)
      });
    }
  }

  const gatewayConnected = sessionChecks.some((s) => s.ok && s.status === 'connected');
  const bookOrderChannel = String(process.env.BOOK_ORDER_WHATSAPP_CHANNEL || 'auto').trim() || 'auto';

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
  if (gatewayConnected && metaReady) {
    hint = 'Gateway (QR) bağlı + Meta hazır — kitap siparişi auto modda her iki kanal da kullanılabilir.';
  } else if (gatewayConnected) {
    hint = 'Gateway (Baileys) bağlı — kitap siparişi gateway ile gidebilir.';
  } else if (metaReady) {
    hint = 'Gateway bağlı değil; Meta Cloud API hazır — kitap siparişi Meta yedek ile gidebilir.';
  } else if (twilioReady) {
    hint = 'Twilio yapılandırılmış (eski yol). Otomasyon için Meta env önerilir.';
  } else {
    hint =
      'Vercel Production: META_WHATSAPP_TOKEN + META_PHONE_NUMBER_ID ve/veya WHATSAPP_GATEWAY_UPSTREAM + QR bağlantısı gerekli.';
  }

  const envMismatch =
    envSessionId &&
    connectedLive.length > 0 &&
    !connectedLive.includes(envSessionId);

  return res.status(200).json({
    meta_configured: metaReady,
    waba_resolved: waba_diag.resolved,
    waba_source: waba_diag.source,
    waba_id_suffix: waba_diag.waba_id_suffix,
    twilio_configured: twilioReady,
    automation_provider: metaReady ? 'meta_cloud_api' : twilioReady ? 'twilio' : null,
    gateway: {
      upstream_reachable: gatewayHealth.ok === true,
      upstream_error: gatewayHealth.error || null,
      upstream_host: gatewayHealth.upstream || gatewayEnv.upstream_suffix || null,
      env_session_id_suffix: maskId(envSessionId),
      connected_live_count: connectedLive.length,
      connected_live_suffixes: connectedLive.map(maskId),
      env_session_mismatch: envMismatch,
      session_checks: sessionChecks,
      gateway_connected: gatewayConnected,
      book_order_channel: bookOrderChannel,
      send_env: gatewayEnv
    },
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
