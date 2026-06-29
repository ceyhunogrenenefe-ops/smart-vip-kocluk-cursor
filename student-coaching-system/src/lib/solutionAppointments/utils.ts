/** Soru çözüm randevu — istemci yardımcıları (sunucu doğrulaması esas). */

export function isSolutionLessonSubject(subject: string | null | undefined): boolean {
  const s = String(subject || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i');
  return s.includes('soru cozum') || s.includes('soru çözüm');
}

export type SolutionSlot = {
  slot_start: string;
  slot_end: string;
  slot_start_display?: string;
  slot_end_display?: string;
  available: boolean;
  appointment_id?: string | null;
  taken_by_me?: boolean;
};

export type SolutionMyAppointment = {
  id: string;
  slot_start: string;
  slot_end: string;
  status: string;
  status_label?: string;
  question_count: string;
  student_name?: string;
  student_class_level?: string;
  can_join?: boolean;
  can_upload?: boolean;
  note?: { student_note?: string | null; teacher_note?: string | null; solved?: boolean } | null;
  files?: Array<{ id: string; file_url?: string | null; mime_type?: string | null; original_name?: string | null }>;
};

export type SolutionLessonPayload = {
  is_solution_lesson: boolean;
  booking_open?: boolean;
  booking_deadline_passed?: boolean;
  lesson?: {
    id: string;
    subject: string;
    lesson_date: string;
    start_time: string;
    end_time: string;
    teacher_id: string;
    teacher_name?: string;
  };
  slots?: SolutionSlot[];
  my_appointment?: SolutionMyAppointment | null;
};

export type TeacherAppointmentRow = {
  id: string;
  slot_start: string;
  slot_end: string;
  status: string;
  status_label?: string;
  student_name: string;
  student_class_level: string;
  question_count: string;
  lesson_subject?: string;
  lesson_start?: string;
  lesson_end?: string;
  session_remaining_seconds?: number;
  note?: { student_note?: string | null; teacher_note?: string | null; solved?: boolean } | null;
  files?: Array<{ id: string; file_url?: string | null; mime_type?: string | null; original_name?: string | null }>;
};

export function slotTimeLabel(t: string): string {
  return String(t || '').slice(0, 5);
}

export function slotRangeLabel(start: string, end: string): string {
  return `${slotTimeLabel(start)}-${slotTimeLabel(end)}`;
}
