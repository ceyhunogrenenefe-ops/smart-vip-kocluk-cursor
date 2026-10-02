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
import { periodLabel, periodRange, previousPeriod } from './teacher-declaration-core.js';
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

/**
 * Kimlik gerçekten UUID mi?
 *
 * Eski/deneme kayıtlarında `meetings.coach_user_id` gibi alanlarda
 * "demo-coach" benzeri UUID olmayan değerler bulunabiliyor. Böyle bir değer
 * `in(...)` sorgusuna girdiğinde Postgres bütün sorguyu reddediyor ve tek bir
 * bozuk satır yüzünden hiç kimse listeye eklenemiyor. Bu yüzden kimlikler
 * sorguya girmeden önce süzülür.
 */
export function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

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
 * Dönemde fiilen çalışmış kişilerin kimlikleri.
 *
 * Rol tek başına yetmiyor: Eylül'de ders veren 35 kişi varken rolü "teacher"
 * olan 27 kişi — bir kısmı koç ya da başka rolde görünüyor. Mesajın doğru
 * kişilere gitmesi için role değil, o ay gerçekten derse/koçluğa giren
 * kayıtlara bakılır.
 */
export async function loadActiveWorkerIds({ period, institutionId = null }) {
  const range = periodRange(period);
  const ids = new Set();
  if (!range) return ids;

  let cq = supabaseAdmin
    .from('class_sessions')
    .select('teacher_id')
    .eq('status', 'completed')
    .not('teacher_id', 'is', null)
    .gte('lesson_date', range.from)
    .lte('lesson_date', range.to)
    .limit(8000);
  if (institutionId) cq = cq.eq('institution_id', institutionId);

  let pq = supabaseAdmin
    .from('teacher_lessons')
    .select('teacher_id')
    .eq('status', 'completed')
    .not('teacher_id', 'is', null)
    .gte('lesson_date', range.from)
    .lte('lesson_date', range.to)
    .limit(8000);
  if (institutionId) pq = pq.eq('institution_id', institutionId);

  // Koçluk görüşmeleri: attended alanı doldurulmadığı için planlanan
  // görüşmeler de aktiflik sayılır
  let mq = supabaseAdmin
    .from('meetings')
    .select('coach_user_id')
    .not('coach_user_id', 'is', null)
    .gte('start_time', `${range.from}T00:00:00`)
    .lte('start_time', `${range.to}T23:59:59`)
    .limit(8000);
  if (institutionId) mq = mq.eq('institution_id', institutionId);

  const [cls, prv, mtg] = await Promise.all([
    cq.then((r) => r.data || []).catch(() => []),
    pq.then((r) => r.data || []).catch(() => []),
    mq.then((r) => r.data || []).catch(() => [])
  ]);

  const ekle = (v) => {
    const id = String(v || '').trim();
    if (isUuid(id)) ids.add(id);
  };
  for (const r of cls) ekle(r.teacher_id);
  for (const r of prv) ekle(r.teacher_id);
  for (const r of mtg) ekle(r.coach_user_id);
  return ids;
}

/**
 * Dönem için eksik beyan kayıtlarını açar (token üretir).
 *
 * Kapsam: aktif öğretmen VE koç kullanıcıları, ayrıca o dönemde fiilen
 * çalışmış herkes (rolü farklı olsa bile). Var olan kayda dokunulmaz —
 * token yeniden üretilirse öğretmenin elindeki bağlantı çalışmaz hâle gelir.
 */
export async function ensureDeclarationsForPeriod({ period, institutionId = null }) {
  const p = String(period || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p)) return { created: 0, total: 0 };

  let tq = supabaseAdmin
    .from('users')
    .select('id, name, phone, institution_id, role')
    .in('role', ['teacher', 'coach'])
    .eq('is_active', true)
    .limit(1000);
  if (institutionId) tq = tq.eq('institution_id', institutionId);
  const { data: roleUsers, error } = await tq;
  if (error) throw error;

  // O dönem çalışmış ama rolü teacher/coach olmayanlar da listeye girsin
  const activeIds = await loadActiveWorkerIds({ period: p, institutionId });
  const known = new Set((roleUsers || []).map((u) => String(u.id)));
  const extraIds = [...activeIds].filter((id) => !known.has(id) && isUuid(id));
  let extras = [];
  if (extraIds.length) {
    const { data } = await supabaseAdmin
      .from('users')
      .select('id, name, phone, institution_id, role')
      .in('id', extraIds.slice(0, 500))
      .eq('is_active', true);
    extras = data || [];
  }

  const teachers = [...(roleUsers || []), ...extras];
  if (!teachers.length) return { created: 0, total: 0 };

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
  if (!insErr) return { created: rows.length, total: teachers.length };
  if (/duplicate key/i.test(insErr.message || '')) return { created: 0, total: teachers.length };

  // Toplu ekleme bir satır yüzünden düştüyse tek tek denenir; bir bozuk kayıt
  // bütün öğretmen ve koçların listeye girmesini engellemesin
  console.warn('[declaration-ensure] toplu ekleme basarisiz, tek tek denenecek:', insErr.message);
  let created = 0;
  for (const row of rows) {
    const { error } = await supabaseAdmin.from(DECL).insert(row);
    if (!error) created += 1;
    else if (!/duplicate key/i.test(error.message || '')) {
      console.warn('[declaration-ensure] atlandi', { teacher_id: row.teacher_id, error: error.message });
    }
  }
  return { created, total: teachers.length };
}

function fillMessage(template, { donem, link, ad }) {
  return String(template || DEFAULT_MESSAGE)
    .replace(/\{\{\s*donem\s*\}\}/gi, donem)
    .replace(/\{\{\s*link\s*\}\}/gi, link)
    .replace(/\{\{\s*ad\s*\}\}/gi, ad || '');
}

/**
 * Beyan formunu gönderir.
 *
 * Hem aylık cron hem yöneticinin "seçilenlere gönder" düğmesi buradan geçer;
 * iki ayrı gönderim kodu olsa biri düzelir diğeri eski kalırdı.
 *
 * @param {{
 *   period: string,
 *   declarationIds?: string[] | null,
 *   institutionId?: string | null,
 *   includeSubmitted?: boolean,
 *   kind?: 'initial'|'reminder',
 *   dryRun?: boolean
 * }} args
 */
export async function sendDeclarationMessages({
  period,
  declarationIds = null,
  onlyTeacherIds = null,
  institutionId = null,
  includeSubmitted = false,
  kind = 'initial',
  dryRun = false
}) {
  const settings = await loadDeclarationSettings();

  let q = supabaseAdmin
    .from(DECL)
    .select('id, teacher_id, token, status, institution_id')
    .eq('period_month', period)
    .limit(500);
  // Formu doldurana tekrar mesaj gitmesin; yönetici özellikle isterse gider
  if (!includeSubmitted) q = q.in('status', ['pending', 'opened']);
  if (Array.isArray(declarationIds) && declarationIds.length) q = q.in('id', declarationIds);
  if (Array.isArray(onlyTeacherIds) && onlyTeacherIds.length) q = q.in('teacher_id', onlyTeacherIds);
  if (institutionId) q = q.eq('institution_id', institutionId);

  const { data: decls, error } = await q;
  if (error) throw error;
  if (!decls?.length) return { ok: true, sent: 0, failed: 0, skipped: 'yok', period };

  const { data: teachers } = await supabaseAdmin
    .from('users')
    .select('id, name, phone')
    .in('id', decls.map((d) => d.teacher_id));
  const byId = Object.fromEntries((teachers || []).map((t) => [String(t.id), t]));

  const reminderSettings = await loadTeacherReminderSettings();
  const session = await resolveTeacherReminderSession(reminderSettings);
  if (!session.sessionId && !dryRun) {
    return {
      ok: false,
      sent: 0,
      failed: 0,
      period,
      error: 'Bağlı WhatsApp hattı yok — süper admin hesabından QR ile bağlanın veya panelden bir hat seçin.'
    };
  }

  const label = periodLabel(period);
  const errors = [];
  let sent = 0;
  let failed = 0;

  for (const d of decls) {
    const t = byId[String(d.teacher_id)];
    const phone = String(t?.phone || '').trim();
    if (!phone) {
      failed += 1;
      errors.push(`${t?.name || 'Öğretmen'}: telefon kayıtlı değil`);
      continue;
    }
    const link = await buildDeclarationFormUrl(d.token);
    const text = fillMessage(settings.message_text, { donem: label, link, ad: t?.name || '' });

    if (dryRun) {
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

    if (result?.ok) {
      sent += 1;
    } else {
      failed += 1;
      errors.push(`${t?.name || 'Öğretmen'}: ${String(result?.error || 'gönderilemedi')}`);
    }

    await supabaseAdmin.from(MSGS).insert({
      declaration_id: d.id,
      kind,
      channel: 'gateway',
      ok: Boolean(result?.ok),
      error: result?.ok ? null : String(result?.error || 'gonderilemedi').slice(0, 500)
    });
  }

  return { ok: true, period, sent, failed, errors: errors.slice(0, 10) };
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

  // Otomatik gönderim yalnız o ay derse/koçluğa girenlere gider; çalışmamış
  // kişiye "çalışmanı bildir" mesajı atmak anlamsız
  const activeIds = await loadActiveWorkerIds({ period });
  const r = await sendDeclarationMessages({
    period,
    kind: isFirst ? 'initial' : 'reminder',
    onlyTeacherIds: [...activeIds].filter(isUuid),
    dryRun: opts.dryRun === true
  });
  const sent = r.sent;
  const failed = r.failed;
  if (r.error) return { ...r, period };

  console.info('[declaration-notify] tamam', { period, sent, failed, day: dayOfMonth });
  return { ok: true, period, sent, failed, kind: isFirst ? 'initial' : 'reminder' };
}
