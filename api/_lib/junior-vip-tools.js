/**
 * Junior VIP — sunucu araçları. Her araç öğrenci kimliğini OTURUMDAN (scope.studentId) alır;
 * modelin / istemcinin gönderdiği öğrenci kimliğine güvenilmez. Yazma işlemleri:
 *  - deterministik kimlik (öğrenci + istek anahtarı) ile mükerrer kaydı önler,
 *  - kayıttan sonra veri kaynağından tekrar okuyarak doğrular.
 */
import { createHash } from 'node:crypto';
import { supabaseAdmin } from './supabase-admin.js';
import { findPlannerOverlapConflict } from './planner-slot-conflict.js';
import { syncWeeklyEntryPlannerRow } from './sync-weekly-entry-planner.js';
import { resolvePlannerEntryTitle } from './planner-entry-title.js';
import { ensureClassSessionsForClassInRange } from './class-sessions-from-slots.js';
import {
  buildClassStudentSubjectMap,
  loadClassStudentSubjectRows,
  studentHasClassSubject
} from './class-student-subjects.js';
import { addMinutesHhmm, istanbulHhmm, istanbulToday } from './junior-vip-dates.js';
import { trKey } from './junior-vip-text.js';

export class JuniorVipToolError extends Error {
  constructor(code, message, extra = {}) {
    super(message || code);
    this.code = code;
    Object.assign(this, extra);
  }
}

function shortHash(...parts) {
  return createHash('sha256').update(parts.map((p) => String(p ?? '')).join('|')).digest('hex').slice(0, 20);
}

export function plannerIdFor(studentId, requestKey) {
  return `wpe-jv-${shortHash('plan', studentId, requestKey)}`;
}

export function entryIdFor(studentId, requestKey) {
  return `entry-jv-${shortHash('log', studentId, requestKey)}`;
}

function isUniqueViolation(err) {
  return err && (err.code === '23505' || /duplicate key|already exists/i.test(String(err.message || '')));
}

function sameSubject(a, b) {
  return trKey(a) === trKey(b);
}

export async function loadStudentProfile(studentId) {
  const { data, error } = await supabaseAdmin
    .from('students')
    .select('id,name,class_level,branch,institution_id')
    .eq('id', studentId)
    .maybeSingle();
  if (error) throw new JuniorVipToolError('student_read_failed', error.message);
  if (!data) throw new JuniorVipToolError('student_not_found');
  // students tablosunda şube bilgisi `branch` kolonunda; eski alan adı geriye uyum için korunur.
  return { ...data, group_name: data.branch ?? null };
}

async function readPlannerById(id) {
  const { data, error } = await supabaseAdmin.from('weekly_planner_entries').select('*').eq('id', id).maybeSingle();
  if (error) throw new JuniorVipToolError('verify_failed', error.message);
  return data || null;
}

async function readEntryById(id) {
  const { data, error } = await supabaseAdmin.from('weekly_entries').select('*').eq('id', id).maybeSingle();
  if (error) throw new JuniorVipToolError('verify_failed', error.message);
  return data || null;
}

/** Planlayıcıda ilk boş saatlik dilim. Bugün için şu andan sonraki saatler. */
async function findFreeSlot(studentId, date, now = new Date()) {
  const today = istanbulToday(now);
  let hours;
  if (date === today) {
    const nowH = parseInt(istanbulHhmm(now).slice(0, 2), 10);
    const startH = Math.max(8, nowH + 1);
    hours = [];
    for (let h = startH; h <= 22; h++) hours.push(h);
  } else {
    hours = [16, 17, 18, 19, 20, 21, 22, 8, 9, 10, 11, 12, 13, 14, 15];
  }
  for (const h of hours) {
    const start = `${String(h).padStart(2, '0')}:00`;
    const end = addMinutesHhmm(start, 60);
    const clash = await findPlannerOverlapConflict(studentId, date, start, end, null);
    if (!clash?.conflictingId && !clash?.error) return { start_time: start, end_time: end };
  }
  return null;
}

/**
 * Haftalık plana bireysel çalışma bloğu ekler (canlı ders programına DEĞİL).
 * Var olan blokların üzerine yazmaz; çakışmada hata döner.
 */
export async function addPlanItem({ studentId, institutionId, date, subject, topic, quantity, time, requestKey, now }) {
  if (!studentId) throw new JuniorVipToolError('student_required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) throw new JuniorVipToolError('date_required');
  if (!subject) throw new JuniorVipToolError('subject_required');
  const qty = Math.round(Number(quantity) || 0);
  if (qty < 1 || qty > 1000) throw new JuniorVipToolError('quantity_invalid');

  const id = plannerIdFor(studentId, requestKey);
  const existing = await readPlannerById(id);
  if (existing) {
    if (String(existing.student_id) !== String(studentId)) throw new JuniorVipToolError('forbidden');
    return { row: existing, duplicate: true };
  }

  let slot;
  if (time) {
    slot = { start_time: time, end_time: addMinutesHhmm(time, 60) };
    const clash = await findPlannerOverlapConflict(studentId, date, slot.start_time, slot.end_time, null);
    if (clash?.error) throw new JuniorVipToolError('invalid_time');
    if (clash?.conflictingId) {
      const other = await readPlannerById(clash.conflictingId);
      throw new JuniorVipToolError('time_conflict', 'time_conflict', {
        conflicting: other
          ? {
              title: other.title || other.subject,
              start_time: String(other.start_time || '').slice(0, 5),
              end_time: String(other.end_time || '').slice(0, 5)
            }
          : null
      });
    }
  } else {
    slot = await findFreeSlot(studentId, date, now);
    if (!slot) throw new JuniorVipToolError('no_free_slot');
  }

  const ts = new Date().toISOString();
  const row = {
    id,
    student_id: studentId,
    institution_id: institutionId ?? null,
    coach_goal_id: null,
    subject,
    title: String(topic || '').trim() || `${subject} çalışması`,
    planned_quantity: qty,
    completed_quantity: 0,
    planner_date: date,
    start_time: slot.start_time,
    end_time: slot.end_time,
    status: 'planned',
    created_at: ts,
    updated_at: ts
  };
  const { error } = await supabaseAdmin.from('weekly_planner_entries').insert(row);
  if (error) {
    if (isUniqueViolation(error)) {
      const dup = await readPlannerById(id);
      if (dup) return { row: dup, duplicate: true };
    }
    throw new JuniorVipToolError('plan_insert_failed', error.message);
  }
  const verified = await readPlannerById(id);
  if (!verified || String(verified.student_id) !== String(studentId) || String(verified.planner_date).slice(0, 10) !== date) {
    throw new JuniorVipToolError('verify_failed', 'Kayıt geri okunamadı');
  }
  return { row: verified, duplicate: false };
}

export async function updatePlannedQuantity({ studentId, plannerId, quantity }) {
  const qty = Math.round(Number(quantity) || 0);
  if (qty < 1 || qty > 1000) throw new JuniorVipToolError('quantity_invalid');
  const row = await readPlannerById(plannerId);
  if (!row || String(row.student_id) !== String(studentId)) throw new JuniorVipToolError('not_found');
  const completed = Number(row.completed_quantity) || 0;
  let status = row.status;
  if (completed > 0) status = completed >= qty ? 'completed' : 'partial';
  const { error } = await supabaseAdmin
    .from('weekly_planner_entries')
    .update({ planned_quantity: qty, status, updated_at: new Date().toISOString() })
    .eq('id', plannerId)
    .eq('student_id', studentId);
  if (error) throw new JuniorVipToolError('plan_update_failed', error.message);
  const verified = await readPlannerById(plannerId);
  if (!verified || Number(verified.planned_quantity) !== qty) throw new JuniorVipToolError('verify_failed');
  return { row: verified };
}

/**
 * Aynı gün + aynı derste, henüz gerçekleşen kayda bağlanmamış plan bloğu.
 * Konu yazılıysa konu da uyuşmalı (ilgisiz görevi tamamlandı yapmamak için).
 */
async function findMatchingPlanBlock({ studentId, date, subject, topic, time }) {
  const { data, error } = await supabaseAdmin
    .from('weekly_planner_entries')
    .select('*')
    .eq('student_id', studentId)
    .eq('planner_date', date);
  if (error) throw new JuniorVipToolError('plan_read_failed', error.message);
  const topicKey = trKey(topic);
  const candidates = (data || []).filter((r) => {
    if (r.weekly_entry_id) return false;
    if (!['planned', 'partial'].includes(String(r.status || 'planned'))) return false;
    if (!sameSubject(r.subject, subject)) return false;
    const titleKey = trKey(r.title);
    const generic = !titleKey || titleKey === trKey(subject) || titleKey === trKey(`${subject} calismasi`);
    if (generic) return true;
    if (!topicKey) return false;
    return titleKey === topicKey || titleKey.includes(topicKey) || topicKey.includes(titleKey);
  });
  if (!candidates.length) return null;
  if (time) {
    const byTime = candidates.find((r) => String(r.start_time || '').slice(0, 5) <= time && time < String(r.end_time || '').slice(0, 5));
    if (byTime) return byTime;
  }
  // Konu birebir uyan blok önce
  const exactTopic = candidates.find((r) => topicKey && trKey(r.title) === topicKey);
  return exactTopic || candidates[0];
}

/**
 * Tamamlanan çalışmayı (çözülen soru) gerçekleşen çalışma tablosuna kaydeder.
 * Uygun plan bloğu varsa onunla ilişkilendirir; yoksa planlayıcıda kayıt bloğu oluşturulur.
 */
export async function logStudy({ studentId, institutionId, date, subject, topic, solved, time, requestKey }) {
  if (!studentId) throw new JuniorVipToolError('student_required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) throw new JuniorVipToolError('date_required');
  if (!subject) throw new JuniorVipToolError('subject_required');
  const n = Math.round(Number(solved) || 0);
  if (n < 1 || n > 1000) throw new JuniorVipToolError('quantity_invalid');

  const entryId = entryIdFor(studentId, requestKey);
  const existing = await readEntryById(entryId);
  if (existing) {
    if (String(existing.student_id) !== String(studentId)) throw new JuniorVipToolError('forbidden');
    const { data: linked } = await supabaseAdmin
      .from('weekly_planner_entries')
      .select('*')
      .eq('weekly_entry_id', entryId)
      .maybeSingle();
    return { entry: existing, planner: linked || null, duplicate: true, linkedToPlan: Boolean(linked && !String(linked.id).startsWith('wpe-sync-')) };
  }

  const plan = await findMatchingPlanBlock({ studentId, date, subject, topic, time });
  const ts = new Date().toISOString();
  const topicText = String(topic || '').trim() || subject;
  const planned = plan ? Math.max(0, Number(plan.planned_quantity) || 0) : 0;
  const entryRow = {
    id: entryId,
    student_id: studentId,
    date,
    subject,
    topic: topicText,
    target_questions: plan && planned > 0 ? planned : n,
    solved_questions: n,
    correct: 0,
    wrong: 0,
    blank: 0,
    notes: time ? `Junior VIP · saat ${time}` : null,
    institution_id: institutionId ?? null,
    created_at: ts,
    updated_at: ts
  };
  const { error: insErr } = await supabaseAdmin.from('weekly_entries').insert(entryRow);
  if (insErr) {
    if (isUniqueViolation(insErr)) {
      const dup = await readEntryById(entryId);
      if (dup) return { entry: dup, planner: null, duplicate: true, linkedToPlan: false };
    }
    throw new JuniorVipToolError('entry_insert_failed', insErr.message);
  }

  let plannerRow = null;
  let linkedToPlan = false;
  try {
    if (plan) {
      const completedQty = planned > 0 ? Math.min(n, planned) : n;
      let status = 'partial';
      if (planned > 0 && n >= planned) status = 'completed';
      const { data: upd, error: upErr } = await supabaseAdmin
        .from('weekly_planner_entries')
        .update({
          weekly_entry_id: entryId,
          completed_quantity: completedQty,
          planned_quantity: planned > 0 ? planned : n,
          status,
          title: resolvePlannerEntryTitle(plan.title, subject, topicText),
          updated_at: new Date().toISOString()
        })
        .eq('id', plan.id)
        .eq('student_id', studentId)
        .is('weekly_entry_id', null)
        .select()
        .maybeSingle();
      if (upErr) throw upErr;
      if (upd) {
        plannerRow = upd;
        linkedToPlan = true;
      }
    }
    if (!plannerRow) {
      plannerRow = await syncWeeklyEntryPlannerRow(
        entryRow,
        time ? { preferredStart: time, preferredEnd: addMinutesHhmm(time, 60) } : {}
      );
    }
  } catch (e) {
    // Gerçekleşen kayıt yazıldı; plan görünümü senkronu başarısız → kaydı geri al, yarım iş bırakma
    await supabaseAdmin.from('weekly_entries').delete().eq('id', entryId).eq('student_id', studentId);
    throw new JuniorVipToolError('planner_sync_failed', e?.message || String(e));
  }

  const verified = await readEntryById(entryId);
  if (!verified || Number(verified.solved_questions) !== n || String(verified.date).slice(0, 10) !== date) {
    throw new JuniorVipToolError('verify_failed', 'Kayıt geri okunamadı');
  }
  return { entry: verified, planner: plannerRow, duplicate: false, linkedToPlan };
}

/** "80 değil 60" düzeltmesi — yalnız bu öğrencinin, bu konuşmada oluşturulan kaydı. */
export async function updateLoggedQuantity({ studentId, entryId, solved }) {
  const n = Math.round(Number(solved) || 0);
  if (n < 1 || n > 1000) throw new JuniorVipToolError('quantity_invalid');
  const entry = await readEntryById(entryId);
  if (!entry || String(entry.student_id) !== String(studentId)) throw new JuniorVipToolError('not_found');

  const { data: linked } = await supabaseAdmin
    .from('weekly_planner_entries')
    .select('*')
    .eq('weekly_entry_id', entryId)
    .maybeSingle();
  const linkedPlan = linked && !String(linked.id).startsWith('wpe-sync-') ? linked : null;
  // Plan bağlıysa hedef planın hedefidir; bağımsız kayıtta hedef = çözülen
  const target = linkedPlan ? Number(linkedPlan.planned_quantity) || n : n;

  const { error } = await supabaseAdmin
    .from('weekly_entries')
    .update({ solved_questions: n, target_questions: target, updated_at: new Date().toISOString() })
    .eq('id', entryId)
    .eq('student_id', studentId);
  if (error) throw new JuniorVipToolError('entry_update_failed', error.message);

  if (linkedPlan) {
    const planned = Number(linkedPlan.planned_quantity) || n;
    await supabaseAdmin
      .from('weekly_planner_entries')
      .update({
        completed_quantity: Math.min(n, planned),
        status: n >= planned ? 'completed' : 'partial',
        updated_at: new Date().toISOString()
      })
      .eq('id', linkedPlan.id)
      .eq('student_id', studentId);
  } else {
    const fresh = await readEntryById(entryId);
    if (fresh) await syncWeeklyEntryPlannerRow(fresh);
  }
  const verified = await readEntryById(entryId);
  if (!verified || Number(verified.solved_questions) !== n) throw new JuniorVipToolError('verify_failed');
  return { entry: verified };
}

function hhmm(t) {
  return String(t || '').slice(0, 5);
}

/**
 * Öğrencinin bir gündeki canlı dersleri — Canlı Dersler ekranıyla aynı kaynaklar:
 *  grup: class_students → (şablondan üretilen) class_sessions, ders kaydı filtresi ile
 *  birebir: teacher_lessons (öğrenci kimliğiyle)
 * Kaynak hatası "ders yok" olarak sunulmaz; `failed` listesinde döner.
 */
export async function listLiveLessonsForDate({ studentId, date }) {
  const failed = [];
  const lessons = [];

  // ---- Grup dersleri
  let classIds = [];
  try {
    const { data, error } = await supabaseAdmin.from('class_students').select('class_id').eq('student_id', studentId);
    if (error) throw error;
    classIds = [...new Set((data || []).map((r) => String(r.class_id || '').trim()).filter(Boolean))];
  } catch (e) {
    failed.push({ source: 'group', reason: e?.message || 'class_students' });
  }

  if (classIds.length && !failed.some((f) => f.source === 'group')) {
    for (const cid of classIds) {
      try {
        // Ekran da okurken haftalık şablondan oturum üretir; asistan aynı adımı atlamamalı
        await ensureClassSessionsForClassInRange(cid, date, date, { ignoreCancelled: false });
      } catch (e) {
        console.warn('[junior-vip] ensure sessions', cid, e?.message || e);
      }
    }
    try {
      const [sessRes, classRes, enrollRows] = await Promise.all([
        supabaseAdmin
          .from('class_sessions')
          .select('id,class_id,subject,lesson_date,start_time,end_time,status,teacher_id')
          .in('class_id', classIds)
          .eq('lesson_date', date)
          .order('start_time', { ascending: true }),
        supabaseAdmin.from('classes').select('id,name').in('id', classIds),
        loadClassStudentSubjectRows(classIds)
      ]);
      if (sessRes.error) throw sessRes.error;
      const classNames = new Map((classRes.data || []).map((c) => [String(c.id), c.name]));
      const subjMap = buildClassStudentSubjectMap(enrollRows);
      for (const s of sessRes.data || []) {
        const enrolled = subjMap.get(String(s.class_id))?.get(String(studentId));
        if (!studentHasClassSubject(enrolled, s.subject)) continue;
        lessons.push({
          kind: 'group',
          id: s.id,
          title: s.subject || 'Grup dersi',
          class_name: classNames.get(String(s.class_id)) || null,
          start_time: hhmm(s.start_time),
          end_time: hhmm(s.end_time) || null,
          status: s.status || 'scheduled',
          teacher_id: s.teacher_id || null
        });
      }
    } catch (e) {
      failed.push({ source: 'group', reason: e?.message || 'class_sessions' });
    }
  }

  // ---- Birebir (özel) dersler
  try {
    const { data, error } = await supabaseAdmin
      .from('teacher_lessons')
      .select('id,title,lesson_date,start_time,end_time,status,teacher_id,student_id')
      .eq('student_id', studentId)
      .eq('lesson_date', date)
      .order('start_time', { ascending: true });
    if (error) {
      const msg = String(error.message || '');
      if (!/teacher_lessons/.test(msg) || !/does not exist|schema cache|relation/i.test(msg)) throw error;
    }
    for (const l of data || []) {
      lessons.push({
        kind: 'private',
        id: l.id,
        title: l.title || 'Özel ders',
        class_name: null,
        start_time: hhmm(l.start_time),
        end_time: hhmm(l.end_time) || null,
        status: l.status || 'scheduled',
        teacher_id: l.teacher_id || null
      });
    }
  } catch (e) {
    failed.push({ source: 'private', reason: e?.message || 'teacher_lessons' });
  }

  // ---- Öğretmen adları
  const tids = [...new Set(lessons.map((l) => l.teacher_id).filter(Boolean).map(String))];
  if (tids.length) {
    const { data: users } = await supabaseAdmin.from('users').select('id,name').in('id', tids);
    const names = new Map((users || []).map((u) => [String(u.id), u.name]));
    for (const l of lessons) l.teacher_name = l.teacher_id ? names.get(String(l.teacher_id)) || null : null;
  }
  for (const l of lessons) delete l.teacher_id;
  lessons.sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
  return { date, lessons, failed, ok: failed.length === 0 };
}
