import { apiFetch } from './session';

export type PrivatePaymentStatus = 'paid' | 'partial' | 'overdue' | 'unpaid' | 'waived';

export type PrivateLessonPackage = {
  id: string;
  institution_id?: string | null;
  name: string;
  lesson_count?: number | null;
  is_unlimited?: boolean;
  price?: number;
  discount?: number;
  duration_minutes?: number;
  active?: boolean;
  sort_order?: number;
  notes?: string | null;
};

export type EnrollmentStats = {
  used_units: number;
  remaining_units: number | null;
  credits_total: number | null;
  total_lessons: number;
  completed: number;
  cancelled: number;
  pending: number;
  makeup: number;
  absent: number;
};

export type PrivateEnrollment = {
  id: string;
  student_id: string;
  teacher_id: string;
  student_name?: string | null;
  teacher_name?: string | null;
  credits_total?: number | null;
  package_id?: string | null;
  package_label?: string | null;
  coach_id?: string | null;
  subject?: string | null;
  class_level?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  weekly_lesson_count?: number | null;
  duration_minutes?: number | null;
  amount_total?: number;
  amount_paid?: number;
  discount?: number;
  payment_status?: PrivatePaymentStatus;
  due_date?: string | null;
  enrollment_notes?: string | null;
  stats?: EnrollmentStats;
  used_units?: number;
  remaining_units?: number | null;
};

export type PrivateLiveDashboard = {
  today: Array<Record<string, unknown>>;
  tomorrow: Array<Record<string, unknown>>;
  student_count: number;
  active_packages: number;
  upcoming_payments: PrivateEnrollment[];
  low_credits: PrivateEnrollment[];
  cancelled_recent: number;
  pending_makeups: number;
};

export type LessonSessionMeta = {
  lesson_id: string;
  attendance_status?: 'present' | 'absent' | 'late' | 'cancelled' | 'makeup' | null;
  topic?: string | null;
  gains?: string | null;
  gaps?: string | null;
  homework?: string | null;
  next_plan?: string | null;
  notes?: string | null;
  coach_note?: string | null;
};

export const PRIVATE_LIVE_SQL_HINT =
  'Supabase SQL henüz uygulanmamış. SQL Editor’da şu dosyayı çalıştırın:\nstudent-coaching-system/sql/2026-07-12-private-live-pro.sql';

export function formatPrivateLiveError(raw: unknown): string {
  const msg = String(raw || '');
  if (/private_live_pro_sql_missing/i.test(msg)) return PRIVATE_LIVE_SQL_HINT;
  return msg || 'İşlem başarısız';
}

async function plFetch<T extends { hint?: string }>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(formatPrivateLiveError(json?.error || `private_live_pro_${res.status}`));
  }
  if (json?.hint && /private_live_pro_sql_missing/i.test(String(json.hint))) {
    (json as { __sqlMissing?: boolean }).__sqlMissing = true;
  }
  return json;
}

export function privateLiveApi() {
  return {
    dashboard: () =>
      plFetch<{ data: PrivateLiveDashboard }>('/api/private-live-pro?scope=dashboard').then((r) => r.data),
    packages: async () => {
      const r = await plFetch<{ data: PrivateLessonPackage[]; hint?: string; __sqlMissing?: boolean }>(
        '/api/private-live-pro?scope=packages'
      );
      return {
        data: r.data || [],
        sqlMissing: Boolean(r.__sqlMissing || r.hint)
      };
    },
    enrollments: (qs = '') =>
      plFetch<{ data: PrivateEnrollment[] }>(`/api/private-live-pro?scope=enrollments${qs}`).then(
        (r) => r.data
      ),
    payments: () =>
      plFetch<{ data: PrivateEnrollment[] }>('/api/private-live-pro?scope=payments').then((r) => r.data),
    lowCredits: () =>
      plFetch<{ data: PrivateEnrollment[] }>('/api/private-live-pro?scope=low-credits').then((r) => r.data),
    history: (studentId?: string) =>
      plFetch<{ data: Array<Record<string, unknown>>; hint?: string }>(
        `/api/private-live-pro?scope=history${studentId ? `&student_id=${encodeURIComponent(studentId)}` : ''}`
      ).then((r) => ({ rows: r.data || [], sqlMissing: Boolean(r.hint) })),
    reports: () =>
      plFetch<{ data: Record<string, unknown> }>('/api/private-live-pro?scope=reports').then((r) => r.data),
    lessonMeta: (lessonId: string) =>
      plFetch<{
        data: {
          lesson: Record<string, unknown>;
          meta: LessonSessionMeta | null;
          files: Array<Record<string, unknown>>;
        };
      }>(
        `/api/private-live-pro?scope=lesson-meta&lesson_id=${encodeURIComponent(lessonId)}`
      ).then((r) => r.data),
    createPackage: (body: Partial<PrivateLessonPackage>) =>
      plFetch<{ data: PrivateLessonPackage }>('/api/private-live-pro?op=package', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }).then((r) => r.data),
    patchPackage: (body: Partial<PrivateLessonPackage> & { id: string }) =>
      plFetch<{ data: PrivateLessonPackage }>('/api/private-live-pro?op=package', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }).then((r) => r.data),
    createEnrollment: (body: Record<string, unknown>) =>
      plFetch<{ data: PrivateEnrollment }>('/api/private-live-pro?op=enrollment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }).then((r) => r.data),
    patchEnrollment: (body: Record<string, unknown>) =>
      plFetch<{ data: PrivateEnrollment }>('/api/private-live-pro?op=enrollment', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }).then((r) => r.data),
    deleteEnrollment: (id: string) =>
      plFetch<{ ok: boolean }>(`/api/private-live-pro?op=enrollment&id=${encodeURIComponent(id)}`, {
        method: 'DELETE'
      }).then((r) => r),
    saveLessonMeta: (body: Partial<LessonSessionMeta> & { lesson_id: string }) =>
      plFetch<{ data: LessonSessionMeta }>('/api/private-live-pro?op=lesson-meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }).then((r) => r.data),
    addFile: (body: { lesson_id: string; title: string; url: string; file_type?: string }) =>
      plFetch<{ data: Record<string, unknown> }>('/api/private-live-pro?op=file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }).then((r) => r.data)
  };
}

export function paymentStatusLabel(s?: string | null): string {
  switch (s) {
    case 'paid':
      return 'Ödendi';
    case 'partial':
      return 'Kısmi';
    case 'overdue':
      return 'Gecikmiş';
    case 'waived':
      return 'Muaf';
    default:
      return 'Ödenmedi';
  }
}

export function paymentStatusClass(s?: string | null): string {
  switch (s) {
    case 'paid':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'partial':
      return 'bg-amber-100 text-amber-900 border-amber-200';
    case 'overdue':
      return 'bg-rose-100 text-rose-800 border-rose-200';
    case 'waived':
      return 'bg-slate-100 text-slate-700 border-slate-200';
    default:
      return 'bg-slate-50 text-slate-600 border-slate-200';
  }
}

/** Ders başlamadan 15 dk önce / bitişten 30 dk sonra katılım penceresi */
export function isPrivateLessonJoinWindowOpen(opts: {
  date: string;
  start_time: string;
  end_time?: string;
  openMinutesBefore?: number;
  closeMinutesAfter?: number;
}): boolean {
  const openBefore = opts.openMinutesBefore ?? 15;
  const closeAfter = opts.closeMinutesAfter ?? 30;
  const startRaw = String(opts.start_time || '00:00').slice(0, 5);
  const endRaw = String(opts.end_time || opts.start_time || '00:00').slice(0, 5);
  const start = new Date(`${opts.date}T${startRaw}:00+03:00`).getTime();
  const end = new Date(`${opts.date}T${endRaw}:00+03:00`).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return true;
  const now = Date.now();
  return now >= start - openBefore * 60_000 && now <= end + closeAfter * 60_000;
}
