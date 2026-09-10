import { getMetaWhatsAppEnvStatus, loadMetaWhatsAppSecretsFromDb, metaWhatsAppConfigured } from './_lib/meta-whatsapp.js';
import { getTwilioEnvStatus } from './_lib/whatsapp-twilio.js';
import {
  fetchMetaTemplatesFromPhoneWaba,
  isMetaTemplateSendableStatus,
  resolvePrimaryWabaId
} from './_lib/meta-templates-sync.js';
import { supabaseAdmin } from './_lib/supabase-admin.js';
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
  listConnectedGatewaySessionIds,
  probeConnectedGatewaySessionIds
} from './_lib/whatsapp-gateway-send.js';
import { ensureAttendanceMetaTemplates } from './_lib/ensure-attendance-meta-templates.js';

const ATTENDANCE_META_TYPES = [
  'class_absent_notice_1',
  'class_camera_off_notice',
  'attendance_status_update',
  'coach_lesson_attendance_summary',
  'attendance_coach_late_update'
];

const maskId = (id) => {
  const s = String(id || '').trim();
  if (!s) return null;
  return s.length > 12 ? `…${s.slice(-12)}` : s;
};

async function diagnoseAttendanceMetaTemplates() {
  const out = [];
  let dbRows = [];
  try {
    const { data } = await supabaseAdmin
      .from('message_templates')
      .select('type, name, meta_template_name, meta_template_language, whatsapp_template_status, is_active')
      .in('type', ATTENDANCE_META_TYPES);
    dbRows = data || [];
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      templates: []
    };
  }

  for (const type of ATTENDANCE_META_TYPES) {
    const row = dbRows.find((r) => String(r.type) === type) || null;
    const metaName = String(row?.meta_template_name || type).trim();
    const preferredLang = String(row?.meta_template_language || 'tr').trim() || 'tr';
    /** @type {Record<string, unknown>} */
    const entry = {
      type,
      db_row: Boolean(row),
      db_active: row ? row.is_active !== false : false,
      db_meta_template_name: row?.meta_template_name || null,
      db_language: row?.meta_template_language || null,
      db_status: row?.whatsapp_template_status || null,
      meta_name_queried: metaName,
      meta_ok: false,
      meta_status: null,
      meta_language: null,
      meta_approved: false,
      meta_matches: [],
      hint: null
    };

    if (!metaWhatsAppConfigured()) {
      entry.hint = 'meta_not_configured';
      out.push(entry);
      continue;
    }

    try {
      const phone = await fetchMetaTemplatesFromPhoneWaba(metaName, { includeComponents: false });
      if (!phone.ok) {
        entry.hint = phone.hint || phone.error || 'phone_waba_lookup_failed';
        out.push(entry);
        continue;
      }
      const matches = phone.matches || [];
      entry.meta_matches = matches.map((m) => ({
        name: m.name,
        language: m.language,
        status: m.status
      }));
      const approved =
        matches.find(
          (m) =>
            isMetaTemplateSendableStatus(m.status) &&
            String(m.language || '')
              .toLowerCase()
              .startsWith('tr')
        ) ||
        matches.find((m) => isMetaTemplateSendableStatus(m.status)) ||
        null;
      const any = approved || matches[0] || null;
      if (any) {
        entry.meta_ok = true;
        entry.meta_status = any.status || null;
        entry.meta_language = any.language || null;
        entry.meta_approved = isMetaTemplateSendableStatus(any.status);
      } else {
        entry.hint = `WABA'da "${metaName}" yok`;
      }

      // DB durumunu Meta ile hizala (panelde APPROVED görünsün)
      if (row && entry.meta_approved) {
        try {
          await supabaseAdmin
            .from('message_templates')
            .update({
              meta_template_name: metaName,
              meta_template_language: entry.meta_language || preferredLang,
              whatsapp_template_status: String(entry.meta_status || 'APPROVED'),
              whatsapp_template_synced_at: new Date().toISOString(),
              is_active: true,
              updated_at: new Date().toISOString()
            })
            .eq('type', type);
          entry.db_synced = true;
        } catch {
          entry.db_synced = false;
        }
      }
    } catch (e) {
      entry.hint = e instanceof Error ? e.message : String(e);
    }
    out.push(entry);
  }

  const approvedCount = out.filter((t) => t.meta_approved).length;
  return {
    ok: approvedCount > 0,
    approved_count: approvedCount,
    total: out.length,
    all_required_approved: ['class_camera_off_notice', 'coach_lesson_attendance_summary', 'attendance_status_update'].every(
      (t) => out.find((x) => x.type === t)?.meta_approved
    ),
    templates: out
  };
}

/**
 * WhatsApp teşhis — giriş gerekmez.
 * GET /api/whatsapp-health
 * GET /api/whatsapp-health?attendance_templates=1  → Meta yoklama şablon durumları
 * GET /api/whatsapp-health?attendance_templates=1&ensure=1  → DB upsert + eksik şablonu Meta’ya gönder
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  await loadMetaWhatsAppSecretsFromDb();
  const meta = getMetaWhatsAppEnvStatus();
  const twilio = getTwilioEnvStatus();
  const metaReady = metaWhatsAppConfigured();
  const twilioReady = Boolean(twilio.configured);

  const wantAttendance =
    String(req.query?.attendance_templates || req.query?.attendance || '').trim() === '1' ||
    String(req.query?.diag || '').trim() === 'attendance';
  const wantEnsure =
    String(req.query?.ensure || req.query?.bootstrap || '').trim() === '1' ||
    String(req.query?.fix || '').trim() === 'attendance_meta';

  let attendance_meta_templates = null;
  let attendance_meta_ensure = null;
  if (wantEnsure) {
    attendance_meta_ensure = await ensureAttendanceMetaTemplates({ submitMissing: true });
  }
  if (wantAttendance || wantEnsure) {
    if (metaReady) {
      attendance_meta_templates = await diagnoseAttendanceMetaTemplates();
    } else {
      attendance_meta_templates = { ok: false, error: 'meta_not_configured', templates: [] };
    }
  }

  const gatewayEnv = getGatewaySendEnvStatus();
  const gatewayHealth = await probeGatewayHealth();
  const envSessionId = bookOrderGatewaySessionId();
  let connectedLive = [];
  if (gatewayHealth.ok) {
    connectedLive = await listConnectedGatewaySessionIds();
    if (!connectedLive.length && Number(gatewayHealth.connected) > 0) {
      connectedLive = await probeConnectedGatewaySessionIds([envSessionId]);
    }
  }

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

  const gatewayConnected =
    sessionChecks.some((s) => s.ok && s.status === 'connected') || connectedLive.length > 0;
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
    hint = 'Meta hazır — kitap siparişi ve veli PDF kurumsal Meta ile gider. Gateway grup dersi / veli ders için.';
  } else if (gatewayConnected) {
    hint = 'Gateway (Baileys) bağlı — grup dersi vb. Meta yoksa gateway kullanılır.';
  } else if (metaReady) {
    hint = 'Meta Cloud API hazır — kitap siparişi, veli PDF ve otomasyon bildirimleri Meta ile gider.';
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
    attendance_meta_templates,
    attendance_meta_ensure,
    gateway: {
      upstream_reachable: gatewayHealth.ok === true,
      upstream_error: gatewayHealth.error || null,
      upstream_host: gatewayHealth.upstream || gatewayEnv.upstream_suffix || null,
      upstream_pin: gatewayHealth.pin || 'phoenix-89.252.179.128:4010',
      env_session_id_suffix: maskId(envSessionId),
      connected_live_count: connectedLive.length,
      connected_live_suffixes: connectedLive.map(maskId),
      env_session_mismatch: envMismatch,
      session_checks: sessionChecks,
      gateway_connected: gatewayConnected,
      book_order_channel: bookOrderChannel,
      send_env: gatewayEnv,
      get_message_implemented: gatewayHealth.get_message_implemented === true,
      message_store: gatewayHealth.message_store || null,
      sessions_detail: Array.isArray(gatewayHealth.sessions_detail)
        ? gatewayHealth.sessions_detail
        : null,
      pending_message_fix_fix:
        'Alıcıda «Mesaj bekleniyor» genelde Baileys getMessage / LID-PN uyumsuzluğundan olur. Gateway marker wa-mesaj-bekleniyor-fix-2026-09-10 olmalı; Meta WABA numarasını QR ile bağlamayın (aynı hatta Meta+Baileys → telefonda bekleyen balon). VPS: pm2 restart whatsapp-gateway.'
    },
    report_reminder: {
      channel: reportReminderSendChannel(),
      ist_hour: reportReminderIstHour(),
      cron_utc: CRON_DAILY_REPORT_REMINDERS_UTC,
      template_type: 'report_reminder',
      env_channel: String(process.env.WHATSAPP_AUTOMATION_CHANNEL ?? 'gateway').trim() || 'gateway',
      hint:
        reportReminderSendChannel() === 'meta'
          ? 'Günlük rapor: Meta API (NOTIFY_CHANNEL_REPORT_REMINDER=meta_api).'
          : reportReminderSendChannel() === 'gateway'
            ? 'Günlük rapor: koç gateway · yalnızca tik’i açık + gateway bağlı koçların kendi öğrencileri · 22:00 TR.'
            : 'Gateway ve Meta yapılandırılmamış — mesaj gitmez.'
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
