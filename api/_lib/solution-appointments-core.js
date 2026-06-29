/** Soru çözümü randevu — zaman kuralları ve slot üretimi (sunucu doğrulaması). */

export const SLOT_MINUTES = 10;
export const BOOKING_HOURS_BEFORE = 12;
export const FILE_UPLOAD_MINUTES_BEFORE = 30;
export const JOIN_MINUTES_BEFORE = 10;
export const SESSION_DURATION_MINUTES = 10;

const IST_OFFSET = '+03:00';

export function isSolutionLessonSubject(subject) {
  const s = String(subject || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i');
  return s.includes('soru cozum') || s.includes('soru çözüm');
}

export function normalizeTime(t) {
  const raw = String(t || '').trim();
  if (!raw) return '00:00:00';
  const parts = raw.split(':');
  const h = String(Number(parts[0]) || 0).padStart(2, '0');
  const m = String(Number(parts[1]) || 0).padStart(2, '0');
  return `${h}:${m}:00`;
}

export function timeToMinutes(t) {
  const n = normalizeTime(t);
  const [h, m] = n.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(mins) {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

export function combineIstanbulDateTime(isoDate, timeStr) {
  const d = String(isoDate || '').trim();
  const t = normalizeTime(timeStr).slice(0, 8);
  return new Date(`${d}T${t}${IST_OFFSET}`);
}

export function buildTenMinuteSlots(startTime, endTime) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  const slots = [];
  for (let t = start; t + SLOT_MINUTES <= end; t += SLOT_MINUTES) {
    slots.push({
      slot_start: minutesToTime(t),
      slot_end: minutesToTime(t + SLOT_MINUTES)
    });
  }
  return slots;
}

export function isBookingOpen(lessonDate, lessonStartTime, now = new Date()) {
  const lessonStart = combineIstanbulDateTime(lessonDate, lessonStartTime);
  const deadline = new Date(lessonStart.getTime() - BOOKING_HOURS_BEFORE * 60 * 60 * 1000);
  return now.getTime() <= deadline.getTime();
}

export function canUploadFiles(lessonDate, slotStart, now = new Date()) {
  const slotAt = combineIstanbulDateTime(lessonDate, slotStart);
  const deadline = new Date(slotAt.getTime() - FILE_UPLOAD_MINUTES_BEFORE * 60 * 1000);
  return now.getTime() <= deadline.getTime();
}

export function canJoinAppointment(lessonDate, slotStart, now = new Date()) {
  const slotAt = combineIstanbulDateTime(lessonDate, slotStart);
  const openAt = new Date(slotAt.getTime() - JOIN_MINUTES_BEFORE * 60 * 1000);
  return now.getTime() >= openAt.getTime() && now.getTime() < slotAt.getTime() + SESSION_DURATION_MINUTES * 60 * 1000;
}

export function appointmentStatusLabel(status) {
  const map = {
    scheduled: 'Planlandı',
    in_progress: 'Devam ediyor',
    completed: 'Tamamlandı',
    cancelled: 'İptal'
  };
  return map[String(status || '')] || String(status || '');
}
