import { apiFetch } from '../session';
import type { SolutionLessonPayload, TeacherAppointmentRow } from './utils';

async function parseJson(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = String((data as { error?: string }).error || '');
    const messages: Record<string, string> = {
      already_booked: 'Bu ders için zaten randevunuz var.',
      slot_taken: 'Bu saat dilimi dolu.',
      booking_deadline_passed: 'Bu ders için randevu süresi dolmuştur.',
      upload_deadline_passed: 'Dosya yükleme süresi doldu.',
      student_profile_required: 'Öğrenci profili bulunamadı.',
      schema_missing: 'Randevu sistemi henüz kurulmamış. Yöneticiye bildirin.'
    };
    const msg =
      (data as { message?: string }).message ||
      messages[code] ||
      code ||
      res.statusText;
    throw new Error(msg);
  }
  return data;
}

export async function fetchSolutionLesson(lessonId: string): Promise<SolutionLessonPayload> {
  const res = await apiFetch(`/api/solution-appointments?lesson_id=${encodeURIComponent(lessonId)}`);
  return parseJson(res);
}

export async function fetchSolutionLessonsBatch(lessonIds: string[]): Promise<Record<string, SolutionLessonPayload>> {
  if (!lessonIds.length) return {};
  const res = await apiFetch(
    `/api/solution-appointments?scope=student&lesson_ids=${encodeURIComponent(lessonIds.join(','))}`
  );
  const data = await parseJson(res);
  return (data as { lessons?: Record<string, SolutionLessonPayload> }).lessons || {};
}

export type CreateAppointmentInput = {
  lesson_id: string;
  slot_start: string;
  slot_end: string;
  question_count: string;
  student_name: string;
  student_class_level: string;
  student_note?: string;
  files?: Array<{ data: string; mime: string; filename?: string }>;
};

export async function createSolutionAppointment(input: CreateAppointmentInput) {
  const res = await apiFetch('/api/solution-appointments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });
  return parseJson(res);
}

export async function patchSolutionAppointment(
  id: string,
  body: { student_note?: string; files?: Array<{ data: string; mime: string; filename?: string }> }
) {
  const res = await apiFetch(`/api/solution-appointments?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return parseJson(res);
}

export async function fetchTeacherAppointments(date?: string): Promise<TeacherAppointmentRow[]> {
  const q = date ? `&date=${encodeURIComponent(date)}` : '';
  const res = await apiFetch(`/api/solution-appointments?scope=teacher${q}`);
  const data = await parseJson(res);
  return (data as { appointments?: TeacherAppointmentRow[] }).appointments || [];
}

export async function startTeacherSession(appointmentId: string) {
  const res = await apiFetch('/api/solution-appointments?op=start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appointment_id: appointmentId })
  });
  return parseJson(res);
}

export async function completeTeacherSession(appointmentId: string) {
  const res = await apiFetch('/api/solution-appointments?op=complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appointment_id: appointmentId })
  });
  return parseJson(res);
}

export async function patchTeacherAppointmentNote(
  id: string,
  body: { teacher_note?: string; solved?: boolean }
) {
  const res = await apiFetch(`/api/solution-appointments?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return parseJson(res);
}

export async function fileToBase64(file: File): Promise<{ data: string; mime: string; filename: string }> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  const data = btoa(binary);
  return { data, mime: file.type || 'application/octet-stream', filename: file.name };
}
