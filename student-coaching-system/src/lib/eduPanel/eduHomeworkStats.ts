import type { EduHomework, EduHomeworkSubmission } from '../../types/eduPanel.types';

export type HomeworkDeliveryStatus = 'submitted' | 'pending' | 'late';

export type HomeworkAssigneeHint = {
  id: string;
  name: string;
  user_id?: string | null;
};

export type HomeworkStatCounts = {
  submitted: number;
  pending: number;
  late: number;
  total: number;
  rate: number;
};

export type HomeworkTeacherAnalytics = HomeworkStatCounts & {
  earliest?: { name: string; at: string } | null;
  latest?: { name: string; at: string } | null;
  missingNames: string[];
  photoCount: number;
  videoCount: number;
};

function dayEndMs(dueDate: string | null | undefined): number | null {
  const d = String(dueDate || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  return new Date(`${d}T23:59:59.999+03:00`).getTime();
}

export function isHomeworkPastDue(dueDate: string | null | undefined, now = Date.now()): boolean {
  const end = dayEndMs(dueDate);
  return end != null && now > end;
}

export function submissionDeliveryStatus(
  dueDate: string | null | undefined,
  submitted: boolean,
  now = Date.now()
): HomeworkDeliveryStatus {
  if (submitted) return 'submitted';
  if (isHomeworkPastDue(dueDate, now)) return 'late';
  return 'pending';
}

export function statusTone(status: HomeworkDeliveryStatus): {
  text: string;
  bg: string;
  label: string;
  emoji: string;
} {
  if (status === 'submitted') {
    return { text: 'text-green-800', bg: 'bg-green-50', label: 'Teslim etti', emoji: '🟢' };
  }
  if (status === 'late') {
    return { text: 'text-red-800', bg: 'bg-red-50', label: 'Gecikti', emoji: '🔴' };
  }
  return { text: 'text-amber-800', bg: 'bg-amber-50', label: 'Bekliyor', emoji: '🟡' };
}

export function computeHomeworkStats(opts: {
  homework: Pick<EduHomework, 'due_date' | 'assignee_mode' | 'assignee_student_ids' | 'submissions'>;
  roster?: HomeworkAssigneeHint[];
  submissions?: EduHomeworkSubmission[];
  now?: number;
}): HomeworkStatCounts {
  const now = opts.now ?? Date.now();
  const subs = opts.submissions || opts.homework.submissions || [];
  const submittedUserIds = new Set(
    subs.map((s) => String(s.student_user_id || '').trim()).filter(Boolean)
  );
  const submittedStudentIds = new Set(
    subs.map((s) => String(s.student_id || '').trim()).filter(Boolean)
  );

  const mode = opts.homework.assignee_mode === 'students' ? 'students' : 'class';
  let total = 0;
  let submitted = 0;

  if (mode === 'students') {
    const ids = (opts.homework.assignee_student_ids || []).map(String).filter(Boolean);
    total = ids.length;
    for (const id of ids) {
      if (submittedStudentIds.has(id)) submitted += 1;
    }
  } else if (opts.roster?.length) {
    total = opts.roster.length;
    for (const st of opts.roster) {
      const uid = String(st.user_id || '').trim();
      if (submittedStudentIds.has(st.id) || (uid && submittedUserIds.has(uid))) submitted += 1;
    }
  } else {
    total = Math.max(subs.length, 0);
    submitted = subs.length;
  }

  const pendingOrLate = Math.max(0, total - submitted);
  const late = isHomeworkPastDue(opts.homework.due_date, now) ? pendingOrLate : 0;
  const pending = isHomeworkPastDue(opts.homework.due_date, now) ? 0 : pendingOrLate;
  const rate = total > 0 ? Math.round((submitted / total) * 100) : 0;
  return { submitted, pending, late, total, rate };
}

export function computeHomeworkTeacherAnalytics(opts: {
  homework: Pick<EduHomework, 'due_date' | 'assignee_mode' | 'assignee_student_ids'>;
  roster: HomeworkAssigneeHint[];
  submissions: EduHomeworkSubmission[];
  now?: number;
}): HomeworkTeacherAnalytics {
  const base = computeHomeworkStats({
    homework: opts.homework,
    roster: opts.roster,
    submissions: opts.submissions,
    now: opts.now
  });
  const sorted = [...opts.submissions].sort(
    (a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime()
  );
  const earliest = sorted[0]
    ? { name: sorted[0].student_name || 'Öğrenci', at: sorted[0].submitted_at }
    : null;
  const latest = sorted.length
    ? {
        name: sorted[sorted.length - 1].student_name || 'Öğrenci',
        at: sorted[sorted.length - 1].submitted_at
      }
    : null;

  const submittedStudentIds = new Set(
    opts.submissions.map((s) => String(s.student_id || '').trim()).filter(Boolean)
  );
  const submittedUserIds = new Set(
    opts.submissions.map((s) => String(s.student_user_id || '').trim()).filter(Boolean)
  );

  const mode = opts.homework.assignee_mode === 'students' ? 'students' : 'class';
  const pool =
    mode === 'students'
      ? opts.roster.filter((r) => (opts.homework.assignee_student_ids || []).includes(r.id))
      : opts.roster;

  const missingNames = pool
    .filter((st) => {
      const uid = String(st.user_id || '').trim();
      return !(submittedStudentIds.has(st.id) || (uid && submittedUserIds.has(uid)));
    })
    .map((st) => st.name);

  let photoCount = 0;
  let videoCount = 0;
  for (const s of opts.submissions) {
    const photos = Array.isArray(s.photo_paths) ? s.photo_paths.filter(Boolean) : [];
    if (photos.length || s.storage_path || (s.photo_urls && s.photo_urls.length)) photoCount += 1;
    if (s.video_path || s.video_url) videoCount += 1;
  }

  return { ...base, earliest, latest, missingNames, photoCount, videoCount };
}

/** Ödeve bağlı animasyon id’leri (çoklu + eski tekil alan). */
export function homeworkPoolAnimationIds(hw: {
  pool_animation_id?: string | null;
  pool_animation_ids?: string[] | null;
}): string[] {
  const fromArr = Array.isArray(hw.pool_animation_ids)
    ? hw.pool_animation_ids.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
  if (fromArr.length) return [...new Set(fromArr)];
  const one = String(hw.pool_animation_id || '').trim();
  return one ? [one] : [];
}
