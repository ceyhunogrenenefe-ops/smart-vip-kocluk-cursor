/**
 * Misafir öğrenci kayıtları — class_session_guests okuma/yazma.
 *
 * Tablo yoksa (migration çalıştırılmadıysa) hiçbir ekran çökmez: okumalar boş
 * döner, yazmalar `schema_missing` hatası verir ve hangi SQL dosyasının
 * çalıştırılacağı söylenir. Mevcut yoklama akışı bundan etkilenmez.
 */
import { supabaseAdmin } from './supabase-admin.js';
import { errorMessage } from './error-msg.js';
import { buildClassSessionAttendanceRoster } from './class-session-attendance-roster.js';
import { mergeSeenNames } from './bbb-attendance.js';
import {
  detectGuestNames,
  guestVisitStats,
  minutesPresent
} from './class-session-guest-core.js';

const TABLE = 'class_session_guests';
export const GUESTS_SQL_HINT = 'sql/2026-10-07-class-session-guests.sql';

export function guestsTableMissing(err) {
  return /class_session_guests|does not exist|schema cache|PGRST205/i.test(errorMessage(err));
}

export class GuestSchemaMissing extends Error {
  constructor() {
    super('Misafir öğrenci tablosu yok');
    this.code = 'schema_missing';
    this.hint = GUESTS_SQL_HINT;
  }
}

/** Dersin öğretmen adları — misafir tespitinde listeden düşmeleri için. */
async function loadSessionTeacherNames(session) {
  const ids = [String(session?.teacher_id || '').trim()].filter(Boolean);
  if (!ids.length) return [];
  const { data } = await supabaseAdmin.from('users').select('id,name').in('id', ids);
  return (data || []).map((u) => String(u.name || '')).filter(Boolean);
}

/**
 * Otomatik tespit: katılımcı listesinde kayıtlı öğrenciyle eşleşmeyen adları
 * "muhtemel misafir" olarak yazar.
 *
 * Kesin karar vermez. Zaten onaylanmış (confirmed) veya reddedilmiş (dismissed)
 * satırların durumuna DOKUNMAZ; yalnız son görülme zamanını tazeler. Böylece
 * öğretmenin verdiği karar otomatik tespitle ezilmez.
 */
export async function detectGuestsForSession(session) {
  if (!session?.id) return { ok: false, reason: 'no_session' };
  const seen = mergeSeenNames(session.bbb_seen_names, []);
  if (!seen.length) return { ok: true, detected: 0, reason: 'no_attendees' };

  const [roster, teacherNames] = await Promise.all([
    buildClassSessionAttendanceRoster({
      classId: session.class_id,
      subject: session.subject
    }),
    loadSessionTeacherNames(session)
  ]);

  const candidates = detectGuestNames(seen, roster, teacherNames);
  if (!candidates.length) return { ok: true, detected: 0 };

  const now = new Date().toISOString();
  let written = 0;
  for (const c of candidates) {
    try {
      const { data: existing } = await supabaseAdmin
        .from(TABLE)
        .select('id,status')
        .eq('session_id', session.id)
        .eq('normalized_name', c.normalized_name)
        .maybeSingle();

      if (existing?.id) {
        // Öğretmenin kararına dokunulmaz; yalnız son görülme tazelenir
        await supabaseAdmin
          .from(TABLE)
          .update({ last_seen_at: now, updated_at: now })
          .eq('id', existing.id);
        continue;
      }

      const { error } = await supabaseAdmin.from(TABLE).insert({
        session_id: session.id,
        class_id: session.class_id || null,
        institution_id: session.institution_id ? String(session.institution_id) : null,
        display_name: c.display_name,
        normalized_name: c.normalized_name,
        status: 'suspected',
        source: 'auto',
        first_seen_at: now,
        last_seen_at: now
      });
      if (error) throw error;
      written += 1;
    } catch (e) {
      if (guestsTableMissing(e)) return { ok: false, reason: 'schema_missing' };
      // Tek bir adın yazılamaması yoklama akışını durdurmasın
      console.warn('[guests] tespit yazılamadı:', errorMessage(e));
    }
  }
  return { ok: true, detected: written, candidates: candidates.length };
}

/** Bir dersin misafir kayıtları (öğretmen ekranı). */
export async function listGuestsForSession(sessionId, session = null) {
  const sid = String(sessionId || '').trim();
  if (!sid) return [];
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select('*')
    .eq('session_id', sid)
    .order('created_at', { ascending: true });
  if (error) {
    if (guestsTableMissing(error)) return [];
    throw error;
  }
  const rows = data || [];
  const names = [...new Set(rows.map((r) => r.normalized_name).filter(Boolean))];
  const history = await loadGuestHistory(names);
  return rows.map((r) => decorateGuest(r, session, history));
}

/**
 * "İlk kez mi katılıyor, daha önce kaç misafir derse katıldı" — aynı ada sahip
 * bütün kayıtlardan sayılır.
 */
export async function loadGuestHistory(normalizedNames) {
  const names = [...new Set((normalizedNames || []).map((x) => String(x || '').trim()).filter(Boolean))];
  if (!names.length) return new Map();
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select('normalized_name,session_id,status')
    .in('normalized_name', names)
    .limit(5000);
  if (error) {
    if (guestsTableMissing(error)) return new Map();
    throw error;
  }
  return guestVisitStats(data || []);
}

function decorateGuest(row, session, history) {
  const stats = history?.get(String(row.normalized_name || '')) || null;
  const visits = stats?.visits || 1;
  return {
    ...row,
    minutes_present:
      row.minutes_present != null
        ? Number(row.minutes_present)
        : minutesPresent(row.first_seen_at, row.last_seen_at, session),
    total_guest_visits: visits,
    is_first_visit: visits <= 1
  };
}

/** Öğretmen/yönetici kararı: misafir olarak onayla veya işareti kaldır. */
export async function setGuestStatus({ guestId, status, source, actorId, note }) {
  const now = new Date().toISOString();
  const patch = {
    status,
    marked_by: actorId || null,
    marked_at: now,
    updated_at: now
  };
  if (source) patch.source = source;
  if (note !== undefined) patch.note = note == null ? null : String(note).slice(0, 500);

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .update(patch)
    .eq('id', String(guestId))
    .select('*')
    .maybeSingle();
  if (error) {
    if (guestsTableMissing(error)) throw new GuestSchemaMissing();
    throw error;
  }
  return data;
}

/**
 * Yönetici/öğretmen elle misafir ekler ya da katılımcı listesindeki bir adı
 * misafir olarak işaretler. Aynı derste aynı ad varsa yeni satır açılmaz,
 * mevcut satır onaylanır.
 */
export async function upsertGuest({
  session,
  displayName,
  normalizedName,
  status = 'confirmed',
  source = 'teacher',
  actorId = null,
  note = null
}) {
  const now = new Date().toISOString();
  try {
    const { data: existing } = await supabaseAdmin
      .from(TABLE)
      .select('id')
      .eq('session_id', session.id)
      .eq('normalized_name', normalizedName)
      .maybeSingle();

    if (existing?.id) {
      return await setGuestStatus({ guestId: existing.id, status, source, actorId, note });
    }

    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .insert({
        session_id: session.id,
        class_id: session.class_id || null,
        institution_id: session.institution_id ? String(session.institution_id) : null,
        display_name: displayName,
        normalized_name: normalizedName,
        status,
        source,
        marked_by: actorId,
        marked_at: now,
        note: note == null ? null : String(note).slice(0, 500),
        first_seen_at: now,
        last_seen_at: now
      })
      .select('*')
      .single();
    if (error) throw error;
    return data;
  } catch (e) {
    if (guestsTableMissing(e)) throw new GuestSchemaMissing();
    throw e;
  }
}

/**
 * Misafiri kayıtlı öğrenciye bağlar.
 *
 * Geçmiş kaybolmasın diye yalnız seçilen satır değil, AYNI ADA sahip bütün
 * misafir kayıtları öğrenciye bağlanır; böylece aynı kişi için iki ayrı
 * geçmiş oluşmaz. Yoklama tablosuna yazılmaz — orası dersin kendi kaydıdır ve
 * geçmişe dönük öğrenci eklemek devamsızlık raporlarını bozar.
 */
export async function convertGuestToStudent({ guestId, studentId, actorId }) {
  const gid = String(guestId || '').trim();
  const sid = String(studentId || '').trim();
  if (!gid || !sid) throw new Error('guest_id_and_student_id_required');

  const { data: guest, error: gErr } = await supabaseAdmin
    .from(TABLE)
    .select('*')
    .eq('id', gid)
    .maybeSingle();
  if (gErr) {
    if (guestsTableMissing(gErr)) throw new GuestSchemaMissing();
    throw gErr;
  }
  if (!guest) throw new Error('guest_not_found');

  const { data: student } = await supabaseAdmin
    .from('students')
    .select('id,name')
    .eq('id', sid)
    .maybeSingle();
  if (!student) throw new Error('student_not_found');

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .update({
      student_id: sid,
      converted_at: now,
      converted_by: actorId || null,
      status: 'confirmed',
      updated_at: now
    })
    .eq('normalized_name', guest.normalized_name)
    .is('student_id', null)
    .select('id,session_id');
  if (error) throw error;

  return {
    student: { id: student.id, name: student.name },
    linked_rows: (data || []).length,
    normalized_name: guest.normalized_name
  };
}

/**
 * Yönetici tablosu — ders / öğretmen / sınıf bilgileriyle birlikte.
 * Ders bilgileri ayrı sorgularla getirilip birleştirilir; Supabase ilişki
 * adlarına bağımlı kalmamak için (class_sessions.institution_id uuid,
 * institutions.id text olduğundan gömülü seçim güvenilmez).
 */
export async function listGuestReport({ institutionId, from, to, status, limit = 500 }) {
  let q = supabaseAdmin
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(Math.min(2000, Math.max(1, Number(limit) || 500)));
  if (institutionId) q = q.eq('institution_id', String(institutionId));
  if (status && status !== 'all') q = q.eq('status', status);

  const { data, error } = await q;
  if (error) {
    if (guestsTableMissing(error)) return { rows: [], table_missing: true };
    throw error;
  }
  let rows = data || [];
  if (!rows.length) return { rows: [], table_missing: false };

  const sessionIds = [...new Set(rows.map((r) => String(r.session_id)).filter(Boolean))];
  const { data: sessions } = await supabaseAdmin
    .from('class_sessions')
    .select('id,class_id,teacher_id,subject,lesson_date,start_time,end_time,status')
    .in('id', sessionIds);
  const sessionById = new Map((sessions || []).map((s) => [String(s.id), s]));

  // Tarih süzgeci ders tarihine göre — kaydın oluşma anına göre değil
  if (from || to) {
    rows = rows.filter((r) => {
      const d = String(sessionById.get(String(r.session_id))?.lesson_date || '');
      if (!d) return false;
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }
  if (!rows.length) return { rows: [], table_missing: false };

  const classIds = [...new Set((sessions || []).map((s) => String(s.class_id)).filter(Boolean))];
  const teacherIds = [...new Set((sessions || []).map((s) => String(s.teacher_id)).filter(Boolean))];
  const studentIds = [...new Set(rows.map((r) => String(r.student_id || '')).filter(Boolean))];

  const [{ data: classes }, { data: teachers }, { data: students }] = await Promise.all([
    classIds.length
      ? supabaseAdmin.from('classes').select('id,name,class_level').in('id', classIds)
      : Promise.resolve({ data: [] }),
    teacherIds.length
      ? supabaseAdmin.from('users').select('id,name,email').in('id', teacherIds)
      : Promise.resolve({ data: [] }),
    studentIds.length
      ? supabaseAdmin.from('students').select('id,name').in('id', studentIds)
      : Promise.resolve({ data: [] })
  ]);
  const classById = new Map((classes || []).map((c) => [String(c.id), c]));
  const teacherById = new Map((teachers || []).map((u) => [String(u.id), u]));
  const studentById = new Map((students || []).map((s) => [String(s.id), s]));

  const history = await loadGuestHistory(rows.map((r) => r.normalized_name));

  const out = rows.map((r) => {
    const s = sessionById.get(String(r.session_id)) || null;
    const cls = s ? classById.get(String(s.class_id)) : null;
    const teacher = s ? teacherById.get(String(s.teacher_id)) : null;
    const base = decorateGuest(r, s, history);
    return {
      ...base,
      lesson_date: s?.lesson_date || null,
      start_time: s?.start_time ? String(s.start_time).slice(0, 5) : null,
      end_time: s?.end_time ? String(s.end_time).slice(0, 5) : null,
      subject: s?.subject || null,
      session_status: s?.status || null,
      class_name: cls?.name || null,
      class_level: cls?.class_level || null,
      teacher_name: teacher ? teacher.name || teacher.email || teacher.id : null,
      student_name: r.student_id ? studentById.get(String(r.student_id))?.name || null : null
    };
  });

  out.sort((a, b) => String(b.lesson_date || '').localeCompare(String(a.lesson_date || '')));
  return { rows: out, table_missing: false };
}
