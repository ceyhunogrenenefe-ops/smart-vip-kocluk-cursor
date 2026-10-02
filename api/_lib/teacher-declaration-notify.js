/**
 * Aylık beyan bildirimi ve hatırlatmaları.
 *
 * Ayın 1'inde aktif öğretmenlere BİR ÖNCEKİ ayın formu gönderilir. Formu
 * dolduran öğretmene bir daha hatırlatma gitmez — doldurduktan sonra mesaj
 * almak, sistemin kendisine güveni azaltır.
 *
 * Mesaj mevcut WhatsApp gateway'inden çıkar; yeni entegrasyon kurulmaz,
 * mevcut hat ayarlarına dokunulmaz.
 */
import crypto from 'node:crypto';
import { supabaseAdmin } from './supabase-admin.js';
import { errorMessage } from './error-msg.js';
import { periodLabel, previousPeriod } from './teacher-declaration-core.js';
import {
  loadTeacherReminderSettings,
  resolveTeacherReminderSession
} from './teacher-lesson-reminder-job.js';
import { sendGatewayTextMessage } from './whatsapp-gateway-send.js';

const DECL = 'teacher_month_declarations';
const MSGS = 'teacher_declaration_messages';
const SETTINGS = 'teacher_declaration_settings';

const DEFAULT_MESSAGE =
  'Sayın öğretmenim,\n\n' +
  '{{donem}} ayına ait ders ve rehberlik çalışmalarınızın kontrol edilerek hakedişinizin ' +
  'oluşturulabilmesi için aşağıdaki bağlantı üzerinden aylık çalışma formunuzu doldurmanızı rica ederiz.\n\n' +
  '{{link}}\n\n' +
  'Online VIP Dershane';

/** Tahmin edilemez anahtar — 32 bayt, URL'de güvenli. */
export function newDeclarationToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export async function loadDeclarationSettings() {
  const fallback = {
    is_active: false,
    reminder_days: [1, 3, 5],
    message_text: DEFAULT_MESSAGE,
    form_base_url: ''
  };
  try {
    const { data, error } = await supabaseAdmin.from(SETTINGS).select('*').eq('id', true).maybeSingle();
    if (error || !data) return fallback;
    return {
      is_active: data.is_active === true,
      reminder_days: Array.isArray(data.reminder_days) && data.reminder_days.length ? data.reminder_days : [1, 3, 5],
      message_text: String(data.message_text || '').trim() || DEFAULT_MESSAGE,
      form_base_url: String(data.form_base_url || '').trim()
    };
  } catch (e) {
    console.warn('[declaration-notify] ayarlar:', errorMessage(e));
    return fallback;
  }
}

/** Form adresinin kökü — ayardan, yoksa ortam değişkeninden. */
export async function buildDeclarationFormUrl(token) {
  const s = await loadDeclarationSettings();
  const base =
    s.form_base_url ||
    String(process.env.PUBLIC_APP_URL || process.env.VITE_APP_URL || '').trim() ||
    'https://www.dersonlinevipkocluk.com';
  return `${base.replace(/\/+$/, '')}/ogretmen-calisma?token=${encodeURIComponent(token)}`;
}

/**
 * Dönem için eksik beyan kayıtlarını açar (token üretir).
 * Var olan kayda dokunmaz — token yeniden üretilirse öğretmenin elindeki
 * bağlantı çalışmaz hâle gelir.
 */
export async function ensureDeclarationsForPeriod({ period, institutionId = null }) {
  const p = String(period || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p)) return { created: 0, total: 0 };

  let tq = supabaseAdmin
    .from('users')
    .select('id, name, phone, institution_id')
    .eq('role', 'teacher')
    .eq('is_active', true)
    .limit(500);
  if (institutionId) tq = tq.eq('institution_id', institutionId);
  const { data: teachers, error } = await tq;
  if (error) throw error;
  if (!teachers?.length) return { created: 0, total: 0 };

  const { data: existing } = await supabaseAdmin
    .from(DECL)
    .select('teacher_id')
    .eq('period_month', p)
    .in('teacher_id', teachers.map((t) => t.id));
  const have = new Set((existing || []).map((e) => String(e.teacher_id)));

  const missing = teachers.filter((t) => !have.has(String(t.id)));
  if (!missing.length) return { created: 0, total: teachers.length };

  // Anahtar dönemin sonundan 90 gün sonra geçersiz olur; geçmiş ayın formu
  // sonsuza kadar açık kalmasın
  const expires = new Date(p);
  expires.setMonth(expires.getMonth() + 4);

  const rows = missing.map((t) => ({
    institution_id: t.institution_id || institutionId || null,
    teacher_id: t.id,
    period_month: p,
    status: 'pending',
    token: newDeclarationToken(),
    token_expires_at: expires.toISOString()
  }));
  const { error: insErr } = await supabaseAdmin.from(DECL).insert(rows);
  if (insErr && !/duplicate key/i.test(insErr.message || '')) throw insErr;
  return { created: rows.length, total: teachers.length };
}

function fillMessage(template, { donem, link, ad }) {
  return String(template || DEFAULT_MESSAGE)
    .replace(/\{\{\s*donem\s*\}\}/gi, donem)
    .replace(/\{\{\s*link\s*\}\}/gi, link)
    .replace(/\{\{\s*ad\s*\}\}/gi, ad || '');
}

/**
 * Günlük iş: ayın 1'inde bildirim, ayarlı günlerde hatırlatma.
 *
 * @param {{ now?: Date, force?: boolean, dryRun?: boolean }} opts
 */
export async function runTeacherDeclarationNotifyJob(opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const settings = await loadDeclarationSettings();

  if (!settings.is_active && !opts.force) {
    return { ok: true, skipped: 'disabled', sent: 0 };
  }

  const dayOfMonth = now.getDate();
  const isFirst = dayOfMonth === 1;
  const isReminderDay = settings.reminder_days.includes(dayOfMonth);
  if (!isFirst && !isReminderDay && !opts.force) {
    return { ok: true, skipped: 'not_a_notify_day', sent: 0 };
  }

  const period = previousPeriod(now);
  await ensureDeclarationsForPeriod({ period });

  // Yalnız hâlâ doldurmamış olanlara gidilir
  const { data: decls, error } = await supabaseAdmin
    .from(DECL)
    .select('id, teacher_id, token, status, institution_id')
    .eq('period_month', period)
    .in('status', ['pending', 'opened'])
    .limit(500);
  if (error) throw error;
  if (!decls?.length) return { ok: true, sent: 0, period, skipped: 'all_submitted' };

  const { data: teachers } = await supabaseAdmin
    .from('users')
    .select('id, name, phone')
    .in('id', decls.map((d) => d.teacher_id));
  const byId = Object.fromEntries((teachers || []).map((t) => [String(t.id), t]));

  const reminderSettings = await loadTeacherReminderSettings();
  const session = await resolveTeacherReminderSession(reminderSettings);
  if (!session.sessionId && !opts.dryRun) {
    return {
      ok: false,
      error: 'Bağlı WhatsApp hattı yok — süper admin hesabından QR ile bağlanın.',
      sent: 0,
      period
    };
  }

  const label = periodLabel(period);
  let sent = 0;
  let failed = 0;

  for (const d of decls) {
    const t = byId[String(d.teacher_id)];
    const phone = String(t?.phone || '').trim();
    if (!phone) {
      failed += 1;
      continue;
    }
    const link = await buildDeclarationFormUrl(d.token);
    const text = fillMessage(settings.message_text, { donem: label, link, ad: t?.name || '' });

    if (opts.dryRun) {
      sent += 1;
      continue;
    }

    let result;
    try {
      result = await sendGatewayTextMessage({
        phone,
        message: text,
        sessionId: session.sessionId,
        sessionCandidates: [session.sessionId],
        allowSharedFallback: false
      });
    } catch (e) {
      result = { ok: false, error: errorMessage(e) };
    }

    if (result?.ok) sent += 1;
    else failed += 1;

    await supabaseAdmin.from(MSGS).insert({
      declaration_id: d.id,
      kind: isFirst ? 'initial' : 'reminder',
      channel: 'gateway',
      ok: Boolean(result?.ok),
      error: result?.ok ? null : String(result?.error || 'gonderilemedi').slice(0, 500)
    });
  }

  console.info('[declaration-notify] tamam', { period, sent, failed, day: dayOfMonth });
  return { ok: true, period, sent, failed, kind: isFirst ? 'initial' : 'reminder' };
}
