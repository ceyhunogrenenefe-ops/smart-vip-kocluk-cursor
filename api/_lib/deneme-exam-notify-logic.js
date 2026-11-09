/**
 * Deneme Kulübü sınav bildirimleri — saf kurallar.
 * Gönderim kararı burada verilir; veritabanı ve WhatsApp bu dosyaya girmez.
 */
import { addCalendarDaysYmd } from './istanbul-time.js';
import {
  EXAM_CALENDAR_LEVEL_LABELS,
  examCalendarLevelForClassLevel
} from './exam-calendar.js';
import { ACADEMIC_EXAM_ROOM_LABELS } from './academic-center-links-store.js';

export const NOTIFY_STEPS = ['day_before', 'soon', 'karne'];

export const DEFAULT_NOTIFY_SETTINGS = {
  enabled: false,
  day_before_enabled: true,
  soon_enabled: true,
  karne_enabled: true,
  day_before_time: '18:00',
  default_exam_time: '10:00',
  tpl_day_before:
    'Merhaba {{ogrenci}}, yarın {{sinav_adi}} deneme sınavın var. Tarih: {{tarih}} Saat: {{saat}}.',
  tpl_soon:
    '{{ogrenci}}, {{sinav_adi}} 30 dakika sonra başlıyor. Saat: {{saat}}. Katılacağın yer: Akademik Merkez → {{bolum}}. Bağlantı: {{link}}',
  tpl_karne:
    '{{ogrenci}}, {{sinav_adi}} sonuç karnen hazır. Bu bağlantı yalnız senin karnendir: {{karne_link}}'
};

const STEP_FLAG = {
  day_before: 'day_before_enabled',
  soon: 'soon_enabled',
  karne: 'karne_enabled'
};

const SOON_GRACE_MS = 20 * 60 * 1000;
const KARNE_AFTER_START_MS = 3 * 60 * 60 * 1000;
const KARNE_WINDOW_MS = 21 * 24 * 60 * 60 * 1000;

export function hmOr(raw, fallback) {
  const s = String(raw || '').trim().slice(0, 5);
  return /^\d{2}:\d{2}$/.test(s) ? s : fallback;
}

export function normalizeNotifySettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const base = DEFAULT_NOTIFY_SETTINGS;
  return {
    enabled: Boolean(src.enabled),
    day_before_enabled: src.day_before_enabled !== false,
    soon_enabled: src.soon_enabled !== false,
    karne_enabled: src.karne_enabled !== false,
    day_before_time: hmOr(src.day_before_time, base.day_before_time),
    default_exam_time: hmOr(src.default_exam_time, base.default_exam_time),
    tpl_day_before: String(src.tpl_day_before || base.tpl_day_before).slice(0, 1200),
    tpl_soon: String(src.tpl_soon || base.tpl_soon).slice(0, 1200),
    tpl_karne: String(src.tpl_karne || base.tpl_karne).slice(0, 1200),
    test_phone: String(src.test_phone || '').trim().slice(0, 32)
  };
}

export function examTitle(exam) {
  const no = String(exam?.exam_no || '').trim();
  const pub = String(exam?.publisher || '').trim();
  const level = EXAM_CALENDAR_LEVEL_LABELS[exam?.level] || String(exam?.level || '');
  const head = [no ? `${no}. deneme` : '', pub].filter(Boolean).join(' · ');
  return [level, head].filter(Boolean).join(' — ') || 'Deneme sınavı';
}

export function examRoomForLevel(level) {
  const l = String(level || '').trim().toLowerCase();
  if (l === '3') return 'class34';
  if (l === '4') return 'class47';
  if (l === '5' || l === '6') return 'class56';
  if (l === '7' || l === 'lgs') return 'class78';
  if (l === '9' || l === '10' || l === '11' || l === 'yks') return 'lise';
  return null;
}

export function examStopped(exam) {
  const s = String(exam?.status || exam?.etkin_durum || '').trim();
  return s === 'yapilmadi' || Boolean(exam?.deleted);
}

export function istanbulStampMs(ymd, hm) {
  const date = String(ymd || '').trim().slice(0, 10);
  const time = hmOr(hm, '00:00');
  const ms = new Date(`${date}T${time}:00+03:00`).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function isWeekendExam(ymd) {
  const date = String(ymd || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const day = new Date(`${date}T12:00:00+03:00`).getUTCDay();
  return day === 0 || day === 6;
}

/** Cumartesi ve pazar denemeleri 10:00'da başlar. */
export function examClock(exam, settings) {
  if (isWeekendExam(exam?.exam_date)) return '10:00';
  return hmOr(exam?.exam_time, settings.default_exam_time);
}

export function examStartMs(exam, settings) {
  return istanbulStampMs(exam?.exam_date, examClock(exam, settings));
}

function gradeBlob(level, name) {
  return `${String(level ?? '')} ${String(name ?? '')}`
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}

/** Sınıfın kendi kademesine denk deneme odası. */
export function examRoomForClass(level, name) {
  const blob = gradeBlob(level, name);
  if (/\byos\b/.test(blob)) return 'yos';
  if (/\b(tyt|ayt|yks|lise|mezun)\b/.test(blob) || /(?:^|[^\d])(9|10|11|12)(?:\.|\s|$)/.test(blob)) return 'lise';
  if (/\blgs\b/.test(blob) || /(?:^|[^\d])8(?:[a-z]|\.|\s|$)/.test(blob)) return 'class78';
  if (/(?:^|[^\d])7(?:[a-z]|\.|\s|$)/.test(blob)) return 'class78';
  if (/(?:^|[^\d])([56])(?:[a-z]|\.|\s|$)/.test(blob) && !/(?:^|[^\d])([47])(?:[a-z]|\.|\s|$)/.test(blob)) {
    return 'class56';
  }
  if (/(?:^|[^\d])4(?:[a-z]|\.|\s|$)/.test(blob)) return 'class47';
  if (/(?:^|[^\d])3(?:[a-z]|\.|\s|$)/.test(blob)) return 'class34';
  return examRoomForLevel(level);
}

export function suggestClassJoinLink({ slotLink, room, linksByRoom }) {
  const slot = String(slotLink || '').trim();
  if (/^https?:\/\//i.test(slot)) return slot;
  return String(linksByRoom?.[room] || '').trim();
}

export function stepScheduleMs(exam, settings, step) {
  const start = examStartMs(exam, settings);
  if (start == null) return null;
  if (step === 'day_before') {
    const ymd = addCalendarDaysYmd(String(exam.exam_date).slice(0, 10), -1);
    return istanbulStampMs(ymd, settings.day_before_time);
  }
  if (step === 'soon') return start - 30 * 60 * 1000;
  if (step === 'karne') return start + KARNE_AFTER_START_MS;
  return null;
}

export function stepIsDue(step, scheduleMs, nowMs, startMs) {
  if (scheduleMs == null || nowMs < scheduleMs) return false;
  if (step === 'day_before') return nowMs < startMs;
  if (step === 'soon') return nowMs <= startMs + SOON_GRACE_MS;
  if (step === 'karne') return nowMs <= startMs + KARNE_WINDOW_MS;
  return false;
}

export function uniqueStudents(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const id = String(row?.id || '').trim();
    if (!id || map.has(id)) continue;
    map.set(id, row);
  }
  return [...map.values()];
}

export function studentMatchesGrade(student, gradeLevel) {
  return examCalendarLevelForClassLevel(student?.class_level) === String(gradeLevel || '');
}

export function renderNotifyTemplate(tpl, vars) {
  return String(tpl || '').replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, key) => {
    const v = vars?.[key] ?? vars?.[String(key).toLowerCase()];
    return v == null ? '' : String(v);
  });
}

export function formatTrDate(ymd) {
  const [y, m, d] = String(ymd || '').slice(0, 10).split('-');
  return y && m && d ? `${d}.${m}.${y}` : '';
}

export function pickPublishedResult(results, exam) {
  const date = String(exam?.exam_date || '').slice(0, 10);
  const sameDay = (results || []).filter((r) => String(r?.date || '').slice(0, 10) === date);
  if (!sameDay.length) return null;
  const pub = String(exam?.publisher || '').toLocaleLowerCase('tr-TR').slice(0, 8);
  const no = String(exam?.exam_no || '').trim();
  const named = sameDay.find((r) => {
    const n = String(r.exam_name || '').toLocaleLowerCase('tr-TR');
    return (pub && n.includes(pub)) || (no && n.includes(no));
  });
  return named || sameDay[0];
}

function templateFor(settings, step) {
  if (step === 'day_before') return settings.tpl_day_before;
  if (step === 'soon') return settings.tpl_soon;
  return settings.tpl_karne;
}

function stepEnabled(settings, step) {
  return Boolean(settings[STEP_FLAG[step]]);
}

function keyOf(examId, studentId, step) {
  return `${examId}|${studentId}|${step}`;
}

/**
 * Bekleyen satırları ve bu turda gidecek mesajları üretir.
 * Aynı öğrenci + sınav + adım için status=sent olan kayıt bir daha gönderilmez.
 */
export function planNotifyActions({
  exams,
  students,
  settings,
  existing = [],
  attendanceByExam = {},
  resultsByStudent = {},
  linksByRoom = {},
  nowMs,
  karneUrlFor,
  masterEnabled
}) {
  const cfg = normalizeNotifySettings(settings);
  const people = uniqueStudents(students);
  const prior = new Map(existing.map((row) => [keyOf(row.exam_id, row.student_id, row.step), row]));
  const upserts = [];
  const sends = [];

  for (const exam of exams || []) {
    const start = examStartMs(exam, cfg);
    if (start == null) continue;
    const stopped = examStopped(exam);
    const room = examRoomForLevel(exam.level);
    const attended = new Set(attendanceByExam[exam.id] || []);
    const title = examTitle(exam);
    const clock = examClock(exam, cfg);
    const section = ACADEMIC_EXAM_ROOM_LABELS[room] || 'Deneme sınavı';
    const link = String(linksByRoom[room] || '').trim();

    for (const student of people) {
      for (const step of NOTIFY_STEPS) {
        const idKey = keyOf(exam.id, student.id, step);
        const prev = prior.get(idKey);
        const locked = prev && prev.status === 'sent';
        if (locked) continue;

        const schedule = stepScheduleMs(exam, cfg, step);
        let status = 'pending';
        let error = null;
        const classSteps = student?.steps;
        const stepOn = classSteps ? classSteps[step] !== false : stepEnabled(cfg, step);
        if (stopped || !stepOn || student?.active === false) {
          status = 'cancelled';
          error = stopped ? 'sinav_iptal' : student?.active === false ? 'sinif_kapali' : 'adim_kapali';
        } else if (step === 'karne' && schedule != null && nowMs >= schedule && !attended.has(student.id)) {
          status = 'skipped';
          error = 'katilmadi';
        } else if (schedule != null && nowMs >= schedule && !stepIsDue(step, schedule, nowMs, start)) {
          status = 'cancelled';
          error = 'pencere_kapandi';
        }

        const scheduled_for = schedule != null ? new Date(schedule).toISOString() : null;
        const keepFailed = prev?.status === 'failed';
        const nextStatus = keepFailed ? 'failed' : status;
        const write =
          !prev
            ? status === 'pending' || status === 'skipped'
            : prev.status !== nextStatus ||
              (nextStatus === 'pending' && String(prev.scheduled_for || '') !== String(scheduled_for || ''));
        if (write) {
          upserts.push({
            exam_id: exam.id,
            student_id: student.id,
            step,
            status: nextStatus,
            error: keepFailed ? prev.error : error,
            scheduled_for,
            phone: student.phone || null
          });
        }

        const effective = nextStatus;
        if (effective !== 'pending') continue;
        if (!masterEnabled) continue;
        if (!stepIsDue(step, schedule, nowMs, start)) continue;
        if (step === 'karne' && !attended.has(student.id)) continue;

        let result = null;
        if (step === 'karne') {
          result = pickPublishedResult(resultsByStudent[student.id] || [], exam);
          if (!result) continue;
        }

        const karneLink = step === 'karne' && karneUrlFor ? karneUrlFor(exam.id, student.id) : '';
        const studentRoom = student.room || room;
        const studentSection = ACADEMIC_EXAM_ROOM_LABELS[studentRoom] || section;
        const studentLink = String(student.join_link || linksByRoom[studentRoom] || link || '').trim();
        const phones = [...new Set((student.phones || [student.phone]).map((p) => String(p || '').trim()).filter(Boolean))];
        const vars = {
          ogrenci: student.name || 'Öğrenci',
          sinav_adi: title,
          tarih: formatTrDate(exam.exam_date),
          saat: clock,
          bolum: studentSection,
          link: studentLink || 'Akademik Merkez',
          karne_link: karneLink
        };
        sends.push({
          exam_id: exam.id,
          student_id: student.id,
          step,
          phone: phones[0] || student.phone || null,
          phones,
          message: renderNotifyTemplate(templateFor(cfg, step), vars),
          scheduled_for,
          result_id: result?.id || null
        });
      }
    }
  }

  return { upserts, sends };
}
