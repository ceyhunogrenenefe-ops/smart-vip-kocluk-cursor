/**
 * FAZ 7 — Personele (temsilci / yönetici) resmî Meta WhatsApp Cloud API şablonu ile bildirim.
 * - Yalnız onaylı UTILITY şablonu `crm_staff_alert`; QR / kişisel hat / resmî olmayan otomasyon YOK.
 * - Yalnız CRM temsilci atamalı personele gider; müşteri / veliye asla gitmez.
 * - Kurum ana şalteri (crm_settings.staff_wa_enabled) varsayılan KAPALI.
 * - Sessiz saat 22:00–09:00, kişi başı saatte en fazla 6 mesaj, aynı olay için tek mesaj (dedupe_key UNIQUE).
 */
import { supabaseAdmin } from './supabase-admin.js';
import { loadMetaWhatsAppSecretsFromDb, metaWhatsAppConfigured, sendMetaTemplateMessage } from './meta-whatsapp.js';
import { createOrReuseMetaMessageTemplate } from './meta-template-create.js';
import { fetchMetaTemplatesFromPhoneWaba, isMetaTemplateSendableStatus } from './meta-templates-sync.js';
import { normalizePhoneToE164 } from './phone-whatsapp.js';
import { buildSalesBoard, istanbulDayStart } from './crm-sales-board.js';

export const STAFF_ALERT_TEMPLATE = 'crm_staff_alert';
export const STAFF_ALERT_BODY =
  "Merhaba {{1}}, CRM'de sizi bekleyen bir iş var: {{2}}. Detay: {{3}}. Lütfen CRM'den kontrol edin.";
const CRM_URL = 'https://www.dersonlinevipkocluk.com/crm/bugun';
export const QUIET_START_HOUR = 22;
export const QUIET_END_HOUR = 9;
export const MAX_PER_HOUR = 6;
/** Yalnız son 2 saatte başlayan beklemeler uyarılır (açılışta eski konuşmalar için mesaj yağmasın) */
export const FRESH_WAIT_MS = 2 * 60 * 60 * 1000;
const TEMPLATE_RECHECK_MS = 30 * 60 * 1000;

export function buildStaffAlertTemplatePayload() {
  return {
    name: STAFF_ALERT_TEMPLATE,
    language: 'tr',
    category: 'UTILITY',
    parameter_format: 'POSITIONAL',
    components: [
      {
        type: 'BODY',
        text: STAFF_ALERT_BODY,
        example: { body_text: [['Ayşe', 'Yeni lead size atandı', 'Veli: Mehmet Yılmaz, 8. sınıf, Instagram']] }
      },
      { type: 'BUTTONS', buttons: [{ type: 'URL', text: "CRM'de aç", url: CRM_URL }] }
    ]
  };
}

export function istanbulHour(now = Date.now()) {
  return Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', hour12: false }).format(new Date(now))
  ) % 24;
}

export function istanbulMinute(now = Date.now()) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', minute: '2-digit' }).format(new Date(now)));
}

export function isQuietHour(now = Date.now()) {
  const h = istanbulHour(now);
  return h >= QUIET_START_HOUR || h < QUIET_END_HOUR;
}

function ymd(now) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date(now));
}

/** Meta şablon parametresi: yeni satır / sekme / 4+ boşluk yasak */
export function cleanParam(text, max = 120) {
  const s = String(text ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim()
    .slice(0, max);
  return s || '-';
}

async function saveTemplateState(institutionId, patch) {
  await supabaseAdmin
    .from('crm_settings')
    .upsert({ institution_id: institutionId, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'institution_id' });
}

/** Şablon yoksa Meta'ya onaya gönderir; varsa durumunu çeker ve crm_settings'e yazar. */
export async function ensureStaffAlertTemplate(institutionId, { force = false } = {}) {
  const { data: settings } = await supabaseAdmin
    .from('crm_settings')
    .select('staff_wa_template_status, staff_wa_template_checked_at')
    .eq('institution_id', institutionId)
    .maybeSingle();
  const status = String(settings?.staff_wa_template_status || '');
  const checkedAt = settings?.staff_wa_template_checked_at ? new Date(settings.staff_wa_template_checked_at).getTime() : 0;
  if (!force && isMetaTemplateSendableStatus(status)) return { status, approved: true, cached: true };
  if (!force && checkedAt && Date.now() - checkedAt < TEMPLATE_RECHECK_MS) {
    return { status, approved: false, cached: true };
  }

  await loadMetaWhatsAppSecretsFromDb();
  let result;
  try {
    const existing = await fetchMetaTemplatesFromPhoneWaba(STAFF_ALERT_TEMPLATE, { includeComponents: false });
    const hit = (existing.matches || []).find((r) => String(r.name || '') === STAFF_ALERT_TEMPLATE);
    result = hit
      ? { ok: true, status: String(hit.status || 'UNKNOWN') }
      : await createOrReuseMetaMessageTemplate(buildStaffAlertTemplatePayload());
  } catch (e) {
    result = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  const newStatus = result.ok ? String(result.status || 'PENDING').toUpperCase() : 'ERROR';
  await saveTemplateState(institutionId, {
    staff_wa_template_status: newStatus,
    staff_wa_template_checked_at: new Date().toISOString(),
    staff_wa_template_error: result.ok ? null : String(result.error || 'meta_error').slice(0, 500)
  });
  return { status: newStatus, approved: isMetaTemplateSendableStatus(newStatus), error: result.ok ? null : result.error };
}

async function recipient(userId) {
  const { data: assign } = await supabaseAdmin
    .from('crm_user_assignments')
    .select('user_id, is_active, wa_alerts_enabled')
    .eq('user_id', String(userId))
    .maybeSingle();
  if (!assign || assign.is_active === false || assign.wa_alerts_enabled === false) return null;
  const { data: user } = await supabaseAdmin.from('users').select('id, name, phone').eq('id', String(userId)).maybeSingle();
  const phone = normalizePhoneToE164(user?.phone || '');
  if (!user || !phone) return null;
  return { id: String(user.id), firstName: String(user.name || '').trim().split(/\s+/)[0] || 'Merhaba', phone };
}

async function sentLastHour(userId, now) {
  const { count } = await supabaseAdmin
    .from('crm_staff_alert_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', String(userId))
    .eq('status', 'sent')
    .gte('created_at', new Date(now - 60 * 60 * 1000).toISOString());
  return count || 0;
}

/**
 * Tek personel bildirimi. Önce dedupe kaydı açılır (UNIQUE) → aynı olay iki kez gönderilmez.
 * @returns {Promise<{ status: string, error?: string }>}
 */
export async function sendStaffAlert({ institutionId, userId, eventType, dedupeKey, summary, detail, now = Date.now(), ignoreQuiet = false }) {
  if (!userId) return { status: 'skipped', error: 'no_user' };
  if (!ignoreQuiet && isQuietHour(now)) return { status: 'skipped', error: 'quiet_hours' };
  const to = await recipient(userId);
  if (!to) return { status: 'skipped', error: 'recipient_not_eligible' };
  if ((await sentLastHour(userId, now)) >= MAX_PER_HOUR) return { status: 'skipped', error: 'rate_limited' };

  const { data: logRow, error: insErr } = await supabaseAdmin
    .from('crm_staff_alert_log')
    .insert({
      institution_id: institutionId,
      user_id: to.id,
      event_type: eventType,
      dedupe_key: dedupeKey,
      to_phone: to.phone,
      summary: `${summary} — ${detail}`.slice(0, 300),
      status: 'pending'
    })
    .select('id')
    .single();
  if (insErr) {
    if (String(insErr.code) === '23505') return { status: 'duplicate' };
    return { status: 'failed', error: insErr.message };
  }

  try {
    const sent = await sendMetaTemplateMessage({
      toE164: to.phone,
      templateName: STAFF_ALERT_TEMPLATE,
      languageCode: 'tr',
      bodyParameterTexts: [cleanParam(to.firstName, 40), cleanParam(summary, 80), cleanParam(detail, 160)]
    });
    await supabaseAdmin
      .from('crm_staff_alert_log')
      .update({ status: 'sent', meta_message_id: sent?.messageId || null })
      .eq('id', logRow.id);
    return { status: 'sent' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabaseAdmin.from('crm_staff_alert_log').update({ status: 'failed', error: msg.slice(0, 500) }).eq('id', logRow.id);
    return { status: 'failed', error: msg };
  }
}

const CHANNEL_TR = { whatsapp: 'WhatsApp', instagram: 'Instagram', facebook: 'Facebook' };

function contactLabel(w) {
  const name = String(w.contact_name || '').trim();
  if (name && !/^(instagram|facebook) (kullanıcısı|user)/i.test(name)) return name;
  if (w.contact_username) return `@${String(w.contact_username).replace(/^@/, '')}`;
  return String(w.contact_identifier || 'Müşteri');
}

/** Zamanlanmış görev: kurum başına SLA 15/30 dk, yeni atanan lead, 09:30 gecikmiş görev özeti. */
export async function runStaffAlertsJob({ now = Date.now() } = {}) {
  const out = { institutions: 0, sent: 0, skipped: 0, failed: 0, template: null, events: [] };

  // Şablon hiç gönderilmediyse (yönetici onayıyla) bir kez Meta onayına gönder — bildirimler kapalı olsa da.
  const { data: neverSubmitted } = await supabaseAdmin
    .from('crm_settings')
    .select('institution_id')
    .is('staff_wa_template_status', null)
    .not('staff_wa_admin_user_id', 'is', null)
    .limit(5);
  for (const row of neverSubmitted || []) {
    const r = await ensureStaffAlertTemplate(String(row.institution_id), { force: true });
    out.template = r.status;
  }

  const { data: settingsRows } = await supabaseAdmin.from('crm_settings').select('*').eq('staff_wa_enabled', true);
  if (!settingsRows?.length) return { ...out, note: 'staff_wa_disabled' };

  await loadMetaWhatsAppSecretsFromDb();
  if (!metaWhatsAppConfigured()) return { ...out, note: 'meta_not_configured' };

  const tally = (r, event) => {
    if (r.status === 'sent') out.sent += 1;
    else if (r.status === 'failed') out.failed += 1;
    else out.skipped += 1;
    if (r.status === 'sent' || r.status === 'failed') out.events.push({ event, status: r.status, error: r.error });
  };

  for (const st of settingsRows) {
    const inst = String(st.institution_id);
    out.institutions += 1;
    const tpl = await ensureStaffAlertTemplate(inst);
    out.template = tpl.status;
    if (!tpl.approved) continue;
    if (isQuietHour(now)) continue;
    const adminId = st.staff_wa_admin_user_id ? String(st.staff_wa_admin_user_id) : null;

    // 1) SLA: yalnız son 2 saatte başlayan beklemeler
    const board = await buildSalesBoard({ institutionId: inst, now });
    for (const w of board.waiting) {
      const since = new Date(w.waiting_since).getTime();
      if (now - since > FRESH_WAIT_MS) continue;
      const who = contactLabel(w);
      const ch = CHANNEL_TR[w.channel] || w.channel;
      const base = `${w.conversation_id}:${since}`;
      if (w.waiting_minutes >= 15 && w.assigned_user_id) {
        tally(
          await sendStaffAlert({
            institutionId: inst,
            userId: w.assigned_user_id,
            eventType: 'sla_15',
            dedupeKey: `sla15:${base}`,
            summary: `${w.waiting_minutes} dakikadır cevap bekleyen müşteri`,
            detail: `${who} (${ch})`,
            now
          }),
          'sla_15'
        );
      }
      if (w.waiting_minutes >= 30) {
        const targets = new Set([w.assigned_user_id, adminId].filter(Boolean).map(String));
        for (const uid of targets) {
          const isAdminCopy = uid === adminId && uid !== String(w.assigned_user_id || '');
          tally(
            await sendStaffAlert({
              institutionId: inst,
              userId: uid,
              eventType: 'sla_30',
              dedupeKey: `sla30:${base}:${uid}`,
              summary: `KIRMIZI: ${w.waiting_minutes} dakikadır cevapsız müşteri`,
              detail: isAdminCopy ? `${who} (${ch}) — temsilci: ${w.assigned_name || 'atanmamış'}` : `${who} (${ch})`,
              now
            }),
            'sla_30'
          );
        }
      }
    }

    // 2) Son 30 dk içinde oluşturulup birine atanmış lead
    const { data: leads } = await supabaseAdmin
      .from('registration_leads')
      .select('id, full_name, parent_full_name, grade_program, source, assigned_user_id, created_at')
      .eq('institution_id', inst)
      .is('deleted_at', null)
      .eq('is_internal', false)
      .not('assigned_user_id', 'is', null)
      .gte('created_at', new Date(now - 30 * 60 * 1000).toISOString())
      .limit(50);
    for (const l of leads || []) {
      const name = l.parent_full_name || l.full_name || 'İsimsiz';
      const parts = [name, l.grade_program, l.source].filter(Boolean).join(', ');
      tally(
        await sendStaffAlert({
          institutionId: inst,
          userId: l.assigned_user_id,
          eventType: 'lead_assigned',
          dedupeKey: `lead:${l.id}:${l.assigned_user_id}`,
          summary: 'Yeni lead size atandı',
          detail: parts,
          now
        }),
        'lead_assigned'
      );
    }

    // 3) 09:30 sonrası (öğlene kadar) günde bir gecikmiş görev özeti
    const h = istanbulHour(now);
    if ((h === 9 && istanbulMinute(now) >= 30) || (h >= 10 && h < 12)) {
      const { data: tasks } = await supabaseAdmin
        .from('registration_tasks')
        .select('assigned_to')
        .eq('institution_id', inst)
        .eq('status', 'pending')
        .lt('due_at', new Date(istanbulDayStart(now)).toISOString())
        .not('assigned_to', 'is', null)
        .limit(1000);
      const counts = new Map();
      for (const t of tasks || []) counts.set(String(t.assigned_to), (counts.get(String(t.assigned_to)) || 0) + 1);
      for (const [uid, n] of counts) {
        tally(
          await sendStaffAlert({
            institutionId: inst,
            userId: uid,
            eventType: 'overdue_digest',
            dedupeKey: `digest:${uid}:${ymd(now)}`,
            summary: `${n} gecikmiş göreviniz var`,
            detail: 'Bugünkü işlerim sayfasında listelendi',
            now
          }),
          'overdue_digest'
        );
      }
    }
  }
  return out;
}
