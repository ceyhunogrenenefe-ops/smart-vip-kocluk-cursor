import { supabaseAdmin } from './supabase-admin.js';
import { resolveBbbMeetingDurationMinutes } from './bbb.js';
import { resolveBbbOrManualMeetingLink } from './resolve-bbb-meeting-link.js';
import {
  insertOneOptionalModerator,
  selectWithOptionalColumns,
  updateOneOptionalModerator
} from './supabase-optional-moderator.js';
import { isSolutionLessonSubject } from './solution-appointments-core.js';

function normTr(s) {
  return String(s || '')
    .trim()
    .toLocaleLowerCase('tr-TR');
}

function parsePeriodTime(timeStr) {
  const m = String(timeStr || '').match(/(\d{1,2}):(\d{2})/g);
  if (!m || m.length < 2) return null;
  const toMin = (s) => {
    const [h, min] = s.split(':').map(Number);
    return h * 60 + min;
  };
  let startMin = toMin(m[0]);
  let endMin = toMin(m[1]);
  if (endMin <= startMin) endMin += 24 * 60;
  const pad = (mins) => {
    const h = Math.floor(mins / 60) % 24;
    const mi = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}:00`;
  };
  return {
    start: pad(startMin),
    end: pad(endMin),
    durationMinutes: Math.max(15, endMin - startMin)
  };
}

function bbbFieldsFromResolved(resolved) {
  if (!resolved?.bbbMeetingId && !resolved?.bbbAttendeePw) return {};
  return {
    ...(resolved.bbbMeetingId ? { bbb_meeting_id: resolved.bbbMeetingId } : {}),
    ...(resolved.bbbAttendeePw ? { bbb_attendee_pw: resolved.bbbAttendeePw } : {})
  };
}

function slotMeetingFieldsFromResolved(resolved) {
  if (!resolved?.ok) return null;
  return {
    meeting_link: resolved.meetingLink,
    ...(resolved.meetingLinkModerator ? { meeting_link_moderator: resolved.meetingLinkModerator } : {}),
    ...bbbFieldsFromResolved(resolved)
  };
}

function needsMeetingLinkRefresh(link) {
  return !String(link || '').trim();
}

function inferSharedBucketKey(teacherName, di, subject, timeStr) {
  const t = normTr(teacherName);
  const sub = normTr(subject);
  if (!t || !sub) return null;
  const parsed = parsePeriodTime(timeStr);
  const timeKey = parsed ? parsed.start : String(timeStr || '').replace(/\s/g, '');
  return `infer:${t}|${di}|${timeKey}|${sub}`;
}

/**
 * Planlayıcıdaki ortak ders kümeleri — sharedLessonId veya aynı öğretmen/konu/gün/saat (farklı gruplar).
 * @returns {{
 *   clusterFor: (groupId: string, key: string) => string|null,
 *   partnerClassIds: (groupId: string, key: string, ownClassId?: string) => Set<string>,
 *   meetingKeyPrefix: (clusterKey: string) => string,
 *   isShared: (groupId: string, key: string) => boolean
 * }}
 */
export function indexPlannerSharedLessons(plannerJson) {
  const pj = plannerJson && typeof plannerJson === 'object' ? plannerJson : {};
  const groups = Array.isArray(pj.groups) ? pj.groups : [];
  const defaultPeriods = Array.isArray(pj.periods) ? pj.periods : [];
  /** @type {Map<string, { groupIds: Set<string>, classIds: Set<string> }>} */
  const clusters = new Map();
  /** @type {Map<string, string>} */
  const cellToCluster = new Map();

  for (const g of groups) {
    const schedule = g.schedule && typeof g.schedule === 'object' ? g.schedule : {};
    const periods = Array.isArray(g.periods) ? g.periods : defaultPeriods;
    const groupId = String(g.id || '');
    for (const [key, cell] of Object.entries(schedule)) {
      if (!cell || typeof cell !== 'object' || !String(cell.teacher || '').trim()) continue;
      const [diStr, piStr] = String(key).split('_');
      const di = Number(diStr);
      const pi = Number(piStr);
      if (!Number.isFinite(di) || !Number.isFinite(pi)) continue;
      const period = periods[pi] || {};
      const teacherName = String(cell.teacher || '').trim();
      const subject = String(cell.subject || '').trim();
      const explicitId = String(cell.sharedLessonId || '').trim();
      const bucketKey = explicitId
        ? `id:${explicitId}`
        : inferSharedBucketKey(teacherName, di, subject, period?.time);
      if (!bucketKey) continue;

      const cellKey = `${groupId}|${key}`;
      if (!clusters.has(bucketKey)) {
        clusters.set(bucketKey, { groupIds: new Set(), classIds: new Set() });
      }
      const meta = clusters.get(bucketKey);
      meta.groupIds.add(groupId);
      if (g.classId) meta.classIds.add(String(g.classId));
      cellToCluster.set(cellKey, bucketKey);
    }
  }

  const sharedClusters = new Set();
  for (const [bucketKey, meta] of clusters) {
    if (meta.groupIds.size >= 2) sharedClusters.add(bucketKey);
  }

  return {
    clusterFor(groupId, key) {
      const bucket = cellToCluster.get(`${String(groupId)}|${String(key)}`);
      if (!bucket || !sharedClusters.has(bucket)) return null;
      return bucket;
    },
    partnerClassIds(groupId, key, ownClassId) {
      const bucket = cellToCluster.get(`${String(groupId)}|${String(key)}`);
      if (!bucket || !sharedClusters.has(bucket)) return new Set();
      const meta = clusters.get(bucket);
      const out = new Set(meta?.classIds || []);
      if (ownClassId) out.delete(String(ownClassId));
      return out;
    },
    meetingKeyPrefix(clusterKey) {
      const id = String(clusterKey || '')
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(0, 64);
      return `planimportshared${id}`;
    },
    isShared(groupId, key) {
      const bucket = cellToCluster.get(`${String(groupId)}|${String(key)}`);
      return Boolean(bucket && sharedClusters.has(bucket));
    }
  };
}

/** Planlayıcıda yalnızca öğretmen varsa ders adını otomatik üret (Canlı Grup Dersi ile uyumlu). */
export function resolvePlannerCellSubject(cell, period, teacherName, dayLabel) {
  const explicit = String(cell?.subject || '').trim();
  if (explicit) return explicit;
  const periodLabel = String(period?.label || '').trim();
  if (periodLabel && !/^\d+\.\s*Ders$/i.test(periodLabel)) return periodLabel;
  const teacher = String(teacherName || '').trim();
  if (teacher) return `${teacher} — ${dayLabel || 'Ders'}`;
  return 'Grup dersi';
}

async function teacherDisplayName(teacherId) {
  if (!teacherId) return 'Öğretmen';
  const { data } = await supabaseAdmin.from('users').select('name,email').eq('id', teacherId).maybeSingle();
  return data?.name || data?.email || 'Öğretmen';
}

async function resolveClassMeetingLinkFromRequest(opts) {
  return resolveBbbOrManualMeetingLink({
    manualLink: opts.manualLink,
    meetingName: `${opts.subject} — ${opts.className || 'Grup dersi'}`,
    attendeeName: 'Öğrenci',
    moderatorName: await teacherDisplayName(opts.teacherId),
    durationMinutes: opts.durationMinutes,
    meetingKeyPrefix: opts.meetingKeyPrefix
  });
}

function timeOverlap(aStart, aEnd, bStart, bEnd) {
  const toSec = (t) => {
    const p = String(t || '00:00:00').split(':').map(Number);
    return (p[0] || 0) * 3600 + (p[1] || 0) * 60 + (p[2] || 0);
  };
  const a0 = toSec(aStart);
  const a1 = toSec(aEnd);
  const b0 = toSec(bStart);
  const b1 = toSec(bEnd);
  return a0 < b1 && b0 < a1;
}

/** Kurum öğretmenleri + hedef sınıfa atanmış öğretmenler */
export async function loadTeachersForClassExport(institutionId, classId) {
  const map = new Map();
  if (institutionId) {
    for (const t of await loadInstitutionTeachers(institutionId)) {
      map.set(String(t.id), t);
    }
  }
  const cid = String(classId || '').trim();
  if (cid) {
    const { data: links } = await supabaseAdmin
      .from('class_teachers')
      .select('teacher_id')
      .eq('class_id', cid);
    const ids = [...new Set((links || []).map((l) => String(l.teacher_id || '')).filter(Boolean))];
    if (ids.length) {
      const { data: extra } = await supabaseAdmin
        .from('users')
        .select('id,name,email,role,roles,institution_id')
        .in('id', ids);
      for (const t of extra || []) map.set(String(t.id), t);
    }
  }
  return [...map.values()];
}

export async function loadInstitutionTeachers(institutionId) {
  const instId = String(institutionId || '').trim();
  if (!instId) return [];
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id,name,email,role,roles,institution_id');
  if (error) throw error;
  return (data || []).filter((u) => {
    const stored = String(u.institution_id || '').trim();
    if (!stored) return false;
    if (stored === instId || stored.toLowerCase() === instId.toLowerCase()) {
      const roleRaw = String(u.role || '').toLowerCase();
      const roleList = Array.isArray(u.roles) ? u.roles.map((x) => String(x || '').toLowerCase()) : [];
      return roleRaw === 'teacher' || roleList.includes('teacher');
    }
    return false;
  });
}

export function matchTeacherId(teacherName, teachers, teacherMap = {}) {
  const raw = String(teacherName || '').trim();
  if (!raw) return null;
  if (teacherMap[raw]) return String(teacherMap[raw]);
  const n = normTr(raw);
  const exact = teachers.find((t) => normTr(t.name) === n || normTr(t.email) === n);
  if (exact) return String(exact.id);
  const partial = teachers.find((t) => {
    const tn = normTr(t.name);
    return tn.includes(n) || n.includes(tn);
  });
  return partial ? String(partial.id) : null;
}

export const SKIP_REASON_LABELS = {
  subject_missing: 'Ders adı eksik',
  day_invalid: 'Geçersiz gün',
  time_invalid: 'Ders saati okunamadı',
  teacher_not_matched: 'Öğretmen sistemde bulunamadı',
  teacher_time_conflict: 'Öğretmenin aynı saatte başka sınıfta şablonu var',
  bbb_failed: 'BBB toplantı linki oluşturulamadı',
  group_not_found: 'Planlayıcı grubu bulunamadı',
  date_range_invalid: 'Tarih aralığı geçersiz',
  no_weekly_slots: 'Haftalık ders şablonu yok',
  session_insert_failed: 'Tarihli oturum kaydedilemedi'
};

const classMetaCache = new Map();

async function getClassMeta(classId) {
  const cid = String(classId || '').trim();
  if (!cid) return null;
  if (classMetaCache.has(cid)) return classMetaCache.get(cid);
  const { data } = await supabaseAdmin
    .from('classes')
    .select('id,name,institution_id')
    .eq('id', cid)
    .maybeSingle();
  const meta = data
    ? { id: cid, name: String(data.name || cid).trim() || cid, institution_id: data.institution_id ?? null }
    : { id: cid, name: cid, institution_id: null, missing: true };
  classMetaCache.set(cid, meta);
  return meta;
}

/** Aynı kurumdaki veya yetim sınıftaki hayalet şablon silinebilir. */
function conflictSlotClearable(slotClassId, targetInstitutionId, meta) {
  if (!meta || meta.missing) return true;
  const targetInst = String(targetInstitutionId || '').trim();
  if (!targetInst) return true;
  const slotInst = String(meta.institution_id || '').trim();
  if (!slotInst) return true;
  return slotInst === targetInst;
}

async function clearCrossClassSlotConflicts(conflicts, targetInstitutionId) {
  const cleared = [];
  for (const slot of conflicts) {
    const meta = await getClassMeta(slot.class_id);
    if (!conflictSlotClearable(slot.class_id, targetInstitutionId, meta)) continue;
    const { error } = await supabaseAdmin.from('class_weekly_slots').delete().eq('id', slot.id);
    if (!error) cleared.push({ id: slot.id, class_name: meta?.name || slot.class_id });
  }
  return cleared;
}

export function describeSkippedItem(item) {
  if (!item || typeof item !== 'object') return 'Bilinmeyen hata';
  const reason = SKIP_REASON_LABELS[item.reason] || String(item.reason || 'Bilinmeyen hata');
  const parts = [reason];
  if (item.day) parts.push(`Gün: ${item.day}`);
  if (item.time) parts.push(`Saat: ${item.time}`);
  if (item.subject) parts.push(`Ders: ${item.subject}`);
  if (item.teacher) parts.push(`Öğretmen: ${item.teacher}`);
  if (item.lesson_date) parts.push(`Tarih: ${item.lesson_date}`);
  if (item.detail) parts.push(String(item.detail));
  if (item.conflict_class) parts.push(`Çakışan sınıf: ${item.conflict_class}`);
  return parts.join(' · ');
}

export function buildExportResultSummary({
  slotsCreated,
  sessionsCreated,
  slotsAlreadyExists = 0,
  sessionsAlreadyExists = 0,
  skipped = [],
  sessionSkipped = [],
  errors = [],
  dateFrom,
  dateTo
}) {
  const slotSkipped = Array.isArray(skipped) ? skipped : [];
  const sessSkipped = Array.isArray(sessionSkipped) ? sessionSkipped : [];
  const errList = Array.isArray(errors) ? errors : [];
  const newSlots = Number(slotsCreated || 0);
  const newSessions = Number(sessionsCreated || 0);
  const existSlots = Number(slotsAlreadyExists || 0);
  const existSessions = Number(sessionsAlreadyExists || 0);
  const hasSlots = newSlots > 0 || existSlots > 0;
  const hasSessions = newSessions > 0 || existSessions > 0;
  const hasProblems = slotSkipped.length > 0 || sessSkipped.length > 0 || errList.length > 0;

  let ok = false;
  let message = '';
  if (!hasSlots && !hasSessions) {
    ok = false;
    const topReasons = [...new Set(slotSkipped.map((s) => SKIP_REASON_LABELS[s.reason] || s.reason))].slice(0, 3);
    const topErrors = [...new Set(errList.map((e) => String(e || '').trim()).filter(Boolean))].slice(0, 2);
    if (topErrors.length) {
      message = `Aktarım başarısız: ${topErrors.join('; ')}`;
    } else if (topReasons.length > 0) {
      message = `Aktarım başarısız: ${topReasons.join('; ')}. Öğretmen adlarını ve planlayıcı hücrelerini kontrol edin.`;
    } else {
      message = 'Aktarım başarısız: planlayıcıda doldurulmuş ders yok veya tüm kayıtlar atlandı.';
    }
  } else if ((newSessions > 0 || existSessions > 0) && !hasProblems) {
    ok = true;
    message = `Aktarım başarılı: ${newSlots} yeni şablon${existSlots ? `, ${existSlots} mevcut şablon` : ''}, ${newSessions} yeni oturum${existSessions ? `, ${existSessions} oturum zaten vardı` : ''} (${dateFrom} – ${dateTo}).`;
  } else if (newSessions > 0 || existSessions > 0 || newSlots > 0 || existSlots > 0) {
    ok = newSessions > 0 || (existSessions > 0 && newSlots + existSlots > 0);
    message = `Aktarım ${ok ? 'tamamlandı' : 'kısmen tamamlandı'}: ${newSlots} yeni şablon, ${newSessions} yeni oturum. ${slotSkipped.length + sessSkipped.length} hücre atlandı.`;
  } else {
    ok = false;
    message = 'Aktarım başarısız.';
  }

  return {
    ok,
    partial: (newSlots + existSlots > 0 || newSessions + existSessions > 0) && hasProblems,
    message,
    slots_created: newSlots,
    slots_already_exists: existSlots,
    sessions_created: newSessions,
    sessions_already_exists: existSessions,
    date_from: dateFrom,
    date_to: dateTo
  };
}

/**
 * Planlayıcı grubundan class_weekly_slots oluşturur.
 * @returns {{ created: number, skipped: Array<{reason:string, subject?:string, teacher?:string, day?:string, time?:string}>, errors: string[] }}
 */
export async function exportPlannerGroupToClass({
  plannerJson,
  groupId,
  classId,
  classRow,
  replaceExisting = false,
  clearCrossClassConflicts = false,
  teacherMap = {}
}) {
  const pj = plannerJson && typeof plannerJson === 'object' ? plannerJson : {};
  const groups = Array.isArray(pj.groups) ? pj.groups : [];
  const group = groups.find((g) => String(g.id) === String(groupId));
  if (!group) {
    return { created: 0, skipped: [], errors: ['group_not_found'] };
  }

  const days = Array.isArray(pj.days) ? pj.days : [];
  const periods = Array.isArray(group.periods) ? group.periods : Array.isArray(pj.periods) ? pj.periods : [];
  const schedule = group.schedule && typeof group.schedule === 'object' ? group.schedule : {};
  const institutionId = String(classRow.institution_id || '').trim();
  const teachers = await loadTeachersForClassExport(institutionId, classId);
  const sharedIndex = indexPlannerSharedLessons(plannerJson);

  if (replaceExisting) {
    const { error: delErr } = await supabaseAdmin.from('class_weekly_slots').delete().eq('class_id', classId);
    if (delErr) return { created: 0, already_exists: 0, skipped: [], errors: [delErr.message] };
  }

  const created = [];
  const skipped = [];
  const errors = [];
  let alreadyExists = 0;
  let conflictsCleared = 0;

  for (const [key, cell] of Object.entries(schedule)) {
    if (!cell || typeof cell !== 'object') continue;
    const teacherName = String(cell.teacher || '').trim();
    if (!String(cell.subject || '').trim() && !teacherName) continue;

    const [diStr, piStr] = String(key).split('_');
    const di = Number(diStr);
    const pi = Number(piStr);
    if (!Number.isFinite(di) || !Number.isFinite(pi)) continue;

    const period = periods[pi];
    const dayLabel = days[di] || String(di);
    const subject = resolvePlannerCellSubject(cell, period, teacherName, dayLabel);

    const dayOfWeek = di + 1;
    if (dayOfWeek < 1 || dayOfWeek > 7) {
      skipped.push({ reason: 'day_invalid', subject, teacher: teacherName, day: days[di] || String(di) });
      continue;
    }

    const timeParsed = parsePeriodTime(period?.time);
    if (!timeParsed) {
      skipped.push({
        reason: 'time_invalid',
        subject,
        teacher: teacherName,
        day: days[di] || String(di),
        time: period?.time || ''
      });
      continue;
    }

    const teacherId = matchTeacherId(teacherName, teachers, teacherMap);
    if (!teacherId) {
      skipped.push({
        reason: 'teacher_not_matched',
        subject,
        teacher: teacherName,
        day: days[di] || String(di),
        time: period?.time || ''
      });
      continue;
    }

    const duration = resolveBbbMeetingDurationMinutes(timeParsed.durationMinutes);
    const sharedCluster = sharedIndex.clusterFor(groupId, key);
    const meetingKeyPrefix = sharedCluster
      ? sharedIndex.meetingKeyPrefix(sharedCluster)
      : `planimport${classId}${di}${pi}`;
    const resolved = await resolveClassMeetingLinkFromRequest({
      manualLink: '',
      subject,
      className: classRow.name || group.name || '',
      teacherId,
      durationMinutes: duration,
      meetingKeyPrefix
    });
    if (!resolved.ok) {
      skipped.push({
        reason: resolved.code || resolved.error || 'bbb_failed',
        subject,
        teacher: teacherName,
        day: dayLabel,
        time: period?.time || ''
      });
      continue;
    }
    const meetingFields = slotMeetingFieldsFromResolved(resolved);
    if (!meetingFields?.meeting_link) {
      skipped.push({
        reason: 'bbb_failed',
        subject,
        teacher: teacherName,
        day: dayLabel,
        time: period?.time || '',
        detail: 'Toplantı bağlantısı oluşturulamadı'
      });
      continue;
    }

    const { data: sameTeacherSlots, error: cErr } = await selectWithOptionalColumns(
      'class_weekly_slots',
      'id,start_time,end_time,class_id,meeting_link',
      ['bbb_meeting_id', 'bbb_attendee_pw', 'meeting_link_moderator'],
      (q) => q.eq('teacher_id', teacherId).eq('day_of_week', dayOfWeek)
    );
    if (cErr) {
      errors.push(cErr.message);
      continue;
    }
    const sameClassDup = (sameTeacherSlots || []).find(
      (x) =>
        String(x.class_id) === String(classId) &&
        timeOverlap(timeParsed.start, timeParsed.end, x.start_time, x.end_time)
    );
    if (sameClassDup && !replaceExisting) {
      alreadyExists += 1;
      if (needsMeetingLinkRefresh(sameClassDup.meeting_link)) {
        const { error: patchErr } = await updateOneOptionalModerator(
          'class_weekly_slots',
          meetingFields,
          'id',
          sameClassDup.id
        );
        if (patchErr) errors.push(patchErr.message);
      }
      continue;
    }

    const crossConflicts = isSolutionLessonSubject(subject)
      ? []
      : (sameTeacherSlots || []).filter(
          (x) =>
            String(x.class_id) !== String(classId) &&
            timeOverlap(timeParsed.start, timeParsed.end, x.start_time, x.end_time)
        );
    const sharedPartnerIds = sharedIndex.partnerClassIds(groupId, key, classId);
    const sharedPartnerSlots = crossConflicts.filter((x) => sharedPartnerIds.has(String(x.class_id)));
    if (sharedPartnerSlots.length) {
      const donor = sharedPartnerSlots.find((x) => String(x.meeting_link || '').trim()) || sharedPartnerSlots[0];
      if (donor?.meeting_link) {
        Object.assign(meetingFields, {
          meeting_link: donor.meeting_link,
          ...(donor.bbb_meeting_id ? { bbb_meeting_id: donor.bbb_meeting_id } : {}),
          ...(donor.bbb_attendee_pw ? { bbb_attendee_pw: donor.bbb_attendee_pw } : {})
        });
      }
    }
    const blockingConflicts = crossConflicts.filter((x) => !sharedPartnerIds.has(String(x.class_id)));
    if (blockingConflicts.length) {
      if (clearCrossClassConflicts) {
        const cleared = await clearCrossClassSlotConflicts(blockingConflicts, institutionId);
        conflictsCleared += cleared.length;
        if (cleared.length < blockingConflicts.length) {
          const blocked = blockingConflicts.filter((c) => !cleared.some((x) => x.id === c.id));
          const names = [];
          for (const b of blocked) {
            const meta = await getClassMeta(b.class_id);
            if (meta?.name) names.push(meta.name);
          }
          skipped.push({
            reason: 'teacher_time_conflict',
            subject,
            teacher: teacherName,
            day: dayLabel,
            time: period?.time || '',
            conflict_class: names.join(', ') || 'başka kurum/sınıf'
          });
          continue;
        }
      } else {
        const names = [];
        for (const b of blockingConflicts) {
          const meta = await getClassMeta(b.class_id);
          if (meta?.name) names.push(meta.name);
        }
        skipped.push({
          reason: 'teacher_time_conflict',
          subject,
          teacher: teacherName,
          day: dayLabel,
          time: period?.time || '',
          conflict_class: names.join(', ') || undefined
        });
        continue;
      }
    }

    const { error: insErr } = await insertOneOptionalModerator('class_weekly_slots', {
      class_id: classId,
      institution_id: institutionId && /^[0-9a-f-]{36}$/i.test(institutionId) ? institutionId : null,
      day_of_week: dayOfWeek,
      start_time: timeParsed.start,
      end_time: timeParsed.end,
      subject,
      teacher_id: teacherId,
      ...meetingFields,
      homework: null
    });
    if (insErr) {
      errors.push(insErr.message);
      continue;
    }
    created.push({ subject, teacher: teacherName, day: days[di], time: period?.time });
  }

  return {
    created: created.length,
    already_exists: alreadyExists,
    conflicts_cleared: conflictsCleared,
    skipped,
    errors,
    details: created
  };
}
