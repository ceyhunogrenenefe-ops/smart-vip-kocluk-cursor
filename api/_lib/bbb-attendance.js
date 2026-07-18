import { supabaseAdmin } from './supabase-admin.js';
import { bbbGetMeetingAttendeeNames, isBbbJoinUrl, parseBbbMeetingIdFromJoinUrl, sanitizeBbbMeetingId } from './bbb.js';
import { sendAbsentNoticeForStudent } from './class-attendance-notify.js';

/** Türkçe karakter / boşluk normalize — öğrenci adı ↔ BBB fullName */
export function normalizePersonNameForMatch(raw) {
  return String(raw || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '');
}

/**
 * @param {{ id: string, name: string }[]} students
 * @param {string[]} attendeeNames BBB katılımcı isimleri (moderatör hariç)
 */
export function matchStudentsByBbbNames(students, attendeeNames) {
  const attendeeObjs = (attendeeNames || []).map((n) => ({ fullName: String(n || '') }));
  /** @type {Map<string, 'present' | 'absent'>} */
  const out = new Map();
  for (const s of students || []) {
    const sid = String(s.id || '').trim();
    if (!sid) continue;
    const matched = findBbbAttendeeForStudentName(s.name, attendeeObjs);
    out.set(sid, matched ? 'present' : 'absent');
  }
  return out;
}

export function resolveBbbMeetingIdFromSession(session) {
  const ids = collectBbbMeetingIdsForLiveSession(session);
  return ids[0] || '';
}

/** Canlı katılım / yoklama için olası BBB meetingID adayları (bbb:auto dahil). */
export function collectBbbMeetingIdsForLiveSession(session) {
  const ids = [];
  const push = (v) => {
    const raw = String(v || '').trim();
    if (!raw) return;
    const id = sanitizeBbbMeetingId(raw);
    if (id && !ids.includes(id)) ids.push(id);
  };
  push(session?.bbb_meeting_id);
  push(parseBbbMeetingIdFromJoinUrl(session?.meeting_link));
  push(parseBbbMeetingIdFromJoinUrl(session?.meeting_link_moderator));
  const sid = String(session?.id || '').replace(/-/g, '');
  if (sid) push(`cljoin${sid}`);
  return ids;
}

/** BBB ekran adından parantez / ek açıklamaları temizle */
export function stripBbbDisplayNameNoise(raw) {
  return String(raw || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Öğrenci adını BBB katılımcı listesiyle eşleştir (tam + parçalı).
 * @param {string} studentName
 * @param {Array<{ fullName: string }>} attendees
 */
export function findBbbAttendeeForStudentName(studentName, attendees) {
  const list = Array.isArray(attendees) ? attendees : [];
  const ranked = rankBbbAttendeesForStudentName(studentName, list);
  return ranked[0]?.attendee || null;
}

/**
 * Eşleşme skoru — yüksek = daha iyi. 0 = eşleşme yok.
 * exact=100, token overlap, includes fallback.
 */
function scoreBbbAttendeeForStudentName(studentName, attendee) {
  const studentNorm = normalizePersonNameForMatch(stripBbbDisplayNameNoise(studentName));
  if (!studentNorm) return 0;
  const norm = normalizePersonNameForMatch(stripBbbDisplayNameNoise(attendee?.fullName));
  if (!norm) return 0;
  if (norm === studentNorm) return 100;

  const studentTokens = studentNorm.split(' ').filter((t) => t.length >= 2);
  const tokens = norm.split(' ').filter(Boolean);
  if (studentTokens.length) {
    const score = studentTokens.filter((t) => tokens.includes(t)).length;
    const need = Math.min(2, studentTokens.length);
    if (score >= need) {
      // ad+soyad tam ise yüksek; tek token daha düşük
      return 40 + score * 10 + (norm.length === studentNorm.length ? 5 : 0);
    }
  }

  if (norm.includes(studentNorm) || studentNorm.includes(norm)) {
    const lenRatio = Math.min(norm.length, studentNorm.length) / Math.max(norm.length, studentNorm.length);
    return Math.floor(20 * lenRatio);
  }
  return 0;
}

export function rankBbbAttendeesForStudentName(studentName, attendees) {
  const list = Array.isArray(attendees) ? attendees : [];
  /** @type {{ attendee: any, score: number }[]} */
  const ranked = [];
  for (const a of list) {
    const score = scoreBbbAttendeeForStudentName(studentName, a);
    if (score > 0) ranked.push({ attendee: a, score });
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

/**
 * Roster ↔ BBB 1:1 eşleştirme (her BBB katılımcısı en fazla bir öğrenciye).
 * @param {{ id: string, name: string }[]} roster
 * @param {Array<{ fullName: string, userId?: string, hasVideo?: boolean, hasJoinedVoice?: boolean, isListeningOnly?: boolean }>} attendees
 * @returns {Map<string, object>} studentId → attendee
 */
export function matchRosterToAttendeesUnique(roster, attendees) {
  const list = Array.isArray(attendees) ? [...attendees] : [];
  /** @type {{ studentId: string, name: string, attendee: any, score: number }[]} */
  const pairs = [];
  for (const student of roster || []) {
    const sid = String(student?.id || '').trim();
    if (!sid) continue;
    for (const { attendee, score } of rankBbbAttendeesForStudentName(student.name, list)) {
      pairs.push({ studentId: sid, name: student.name, attendee, score });
    }
  }
  pairs.sort((a, b) => b.score - a.score);

  /** @type {Map<string, object>} */
  const byStudent = new Map();
  const usedAttendeeKeys = new Set();
  const attendeeKey = (a) =>
    String(a?.userId || '').trim() ||
    normalizePersonNameForMatch(stripBbbDisplayNameNoise(a?.fullName || ''));

  for (const p of pairs) {
    if (byStudent.has(p.studentId)) continue;
    const key = attendeeKey(p.attendee);
    if (!key || usedAttendeeKeys.has(key)) continue;
    usedAttendeeKeys.add(key);
    byStudent.set(p.studentId, p.attendee);
  }
  return byStudent;
}

export function mergeSeenNames(existing, incoming) {
  const set = new Set();
  for (const n of Array.isArray(existing) ? existing : []) {
    const t = String(n || '').trim();
    if (t) set.add(t);
  }
  for (const n of Array.isArray(incoming) ? incoming : []) {
    const t = String(n || '').trim();
    if (t) set.add(t);
  }
  return [...set];
}

/**
 * Aktif BBB oturumundan katılımcı isimlerini çekip bbb_seen_names günceller.
 */
export async function pollBbbPresenceForSession(session) {
  if (!session?.id) return { ok: false, reason: 'no_session' };
  const link = String(session.meeting_link || '').trim();
  if (!isBbbJoinUrl(link) && !session.bbb_meeting_id) {
    return { ok: false, reason: 'not_bbb' };
  }
  const meetingId = resolveBbbMeetingIdFromSession(session);
  if (!meetingId) return { ok: false, reason: 'no_meeting_id' };

  const liveNames = await bbbGetMeetingAttendeeNames(meetingId);
  if (!liveNames?.length) {
    return { ok: true, live: false, added: 0 };
  }

  const merged = mergeSeenNames(session.bbb_seen_names, liveNames);
  const { error } = await supabaseAdmin
    .from('class_sessions')
    .update({ bbb_seen_names: merged, updated_at: new Date().toISOString() })
    .eq('id', session.id);
  if (error) throw error;
  return { ok: true, live: true, added: merged.length, names: merged };
}

/**
 * Sınıf öğrencileri için otomatik yoklama + devamsız Meta şablonu (mevcut sendAbsentNotice).
 * Manuel işaretlenmiş öğrencilerin statüsü değiştirilmez.
 */
export async function applyAutoAttendanceForClassSession(session, classStudentIds, className, opts = {}) {
  const force = Boolean(opts.force);
  if (!session?.id) return { ok: false, reason: 'no_session' };
  if (!force && session.attendance_auto_at) {
    return { ok: true, skipped: 'already_auto' };
  }

  const meetingId = resolveBbbMeetingIdFromSession(session);
  const seen = mergeSeenNames(session.bbb_seen_names, []);
  let attendeeNames = [...seen];
  if (meetingId) {
    const live = await bbbGetMeetingAttendeeNames(meetingId);
    attendeeNames = mergeSeenNames(attendeeNames, live);
  }

  const { data: students, error: stErr } = await supabaseAdmin
    .from('students')
    .select('id, name')
    .in('id', classStudentIds);
  if (stErr) throw stErr;

  const statusByStudent = matchStudentsByBbbNames(students || [], attendeeNames);

  const { data: priorRows } = await supabaseAdmin
    .from('class_session_attendance')
    .select('student_id, status')
    .eq('session_id', session.id);
  const priorMap = new Map((priorRows || []).map((r) => [String(r.student_id), String(r.status)]));

  const prepared = [];
  for (const sid of classStudentIds) {
    if (priorMap.has(sid)) continue;
    const status = statusByStudent.get(sid) || 'absent';
    prepared.push({
      session_id: session.id,
      student_id: sid,
      status,
      marked_by: null,
      marked_at: new Date().toISOString()
    });
  }

  if (prepared.length) {
    const { error: upErr } = await supabaseAdmin
      .from('class_session_attendance')
      .upsert(prepared, { onConflict: 'session_id,student_id' });
    if (upErr) throw upErr;
  }

  const instKey = session.institution_id != null ? String(session.institution_id).trim() : '';
  const absent_whatsapp = [];
  for (const row of prepared) {
    if (row.status !== 'absent') continue;
    try {
      const r = await sendAbsentNoticeForStudent({
        session,
        className,
        studentId: row.student_id,
        institutionId: instKey
      });
      absent_whatsapp.push({ student_id: row.student_id, ...r });
    } catch (e) {
      absent_whatsapp.push({
        student_id: row.student_id,
        ok: false,
        note: e instanceof Error ? e.message : 'exception'
      });
    }
  }

  const { error: markErr } = await supabaseAdmin
    .from('class_sessions')
    .update({
      attendance_auto_at: new Date().toISOString(),
      bbb_seen_names: attendeeNames,
      updated_at: new Date().toISOString()
    })
    .eq('id', session.id);
  if (markErr) throw markErr;

  return {
    ok: true,
    recorded: prepared.length,
    present: prepared.filter((p) => p.status === 'present').length,
    absent: prepared.filter((p) => p.status === 'absent').length,
    skipped_manual: priorMap.size,
    attendee_names: attendeeNames.length,
    absent_whatsapp
  };
}
