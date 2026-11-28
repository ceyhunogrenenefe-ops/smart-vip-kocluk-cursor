import { apiFetch } from '../../lib/session';

export type AdVideoStatus = 'planned' | 'shot' | 'submitted' | 'revision_requested' | 'approved';
export type AdVideoDisplayStatus = AdVideoStatus | 'overdue';

export interface AdVideoTask {
  id: string;
  institution_id: string | null;
  teacher_id: string;
  teacher_name: string;
  title: string;
  idea: string | null;
  theme: string | null;
  shoot_note: string | null;
  reference_url: string | null;
  planned_shoot_at: string | null;
  due_at: string | null;
  actual_shoot_date: string | null;
  actual_shoot_recorded_at: string | null;
  status: AdVideoStatus;
  display_status: AdVideoDisplayStatus;
  status_label: string;
  is_overdue: boolean;
  first_submitted_at: string | null;
  last_uploaded_at: string | null;
  current_submission_id: string | null;
  approved_at: string | null;
  review_note: string | null;
  review_note_at: string | null;
  created_at: string;
}

export interface AdVideoComment {
  id: string;
  body: string;
  author_name: string;
  created_at: string;
}

export interface AdVideoSubmission {
  id: string;
  version: number;
  kind: 'raw' | 'edit';
  source: 'drive_upload' | 'drive_link';
  legacy_link?: boolean;
  archive?: boolean;
  drive_url: string | null;
  file_name: string | null;
  mime_type?: string | null;
  size_bytes: number | null;
  is_revision: boolean;
  uploaded_at: string;
  review_status: 'pending' | 'approved' | 'revision_requested' | 'superseded';
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  review_note: string | null;
  open_for_comments?: boolean;
  opened_at?: string | null;
  preview_status?: 'not_needed' | 'unavailable' | 'ready' | null;
  preview_note?: string | null;
  playable?: boolean;
  comments?: AdVideoComment[];
}

export interface AdVideoEvent {
  id: string;
  kind: string;
  note: string | null;
  actor_name: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
}

export interface AdVideoDetail {
  task: AdVideoTask;
  submissions: AdVideoSubmission[];
  events: AdVideoEvent[];
  can: { manage: boolean; review: boolean; mark_shot: boolean; submit: boolean; upload_edit?: boolean; open_review?: boolean };
}

export interface AdVideoMe {
  access: { manager: boolean; editor: boolean; reviewer: boolean; has_tasks: boolean };
  upload: {
    enabled: boolean;
    credentials?: boolean;
    folder?: boolean;
    shared_drive?: boolean;
    enabled_flag?: boolean;
    chunk_bytes: number;
  };
  today: string;
}

export interface BriefTask {
  id: string;
  title: string;
  teacher_id?: string;
  teacher_name?: string;
  due_at: string | null;
  planned_shoot_at: string | null;
  actual_shoot_date?: string | null;
  last_uploaded_at: string | null;
  is_revision?: boolean;
  status?: AdVideoStatus;
}

export interface TeacherStatRow {
  teacher_id: string;
  teacher_name: string;
  last_shoot_date: string | null;
  week: { planned: number; shot: number; first_submitted: number; approved: number };
  shot_awaiting_submission: BriefTask[];
  awaiting_review: BriefTask[];
  edits_waiting?: BriefTask[];
  open_for_comments?: BriefTask[];
  revision_requested: BriefTask[];
  overdue: BriefTask[];
  upcoming_shoots: BriefTask[];
  total_tasks: number;
}

export interface AdVideoStats {
  week: { start: string; end: string };
  rows: TeacherStatRow[];
  totals: {
    week: { planned: number; shot: number; first_submitted: number; approved: number };
    shot_awaiting_submission: number;
    awaiting_review: number;
    edits_waiting?: number;
    open_for_comments?: number;
    revision_requested: number;
    overdue: number;
    upcoming_shoots: number;
    videos: number;
  };
}

export interface DailySummary {
  date: string;
  tomorrow: string;
  delivered: BriefTask[];
  awaiting_review: BriefTask[];
  open_for_comments?: BriefTask[];
  overdue: BriefTask[];
  tomorrow_shoots: BriefTask[];
}

export interface AdVideoSettings {
  institution_id: string;
  editor_user_ids: string[];
  drive_upload_enabled: boolean;
  drive_shared_drive_id: string | null;
  drive_folder_id: string | null;
  link_folder_url: string | null;
  daily_summary_enabled: boolean;
  daily_summary_time: string;
  daily_summary_days: number[];
}

export interface PersonOption {
  id: string;
  name: string;
  email?: string | null;
  is_coach?: boolean;
  role?: string;
}

async function call<T>(op: string, opts: { method?: 'GET' | 'POST'; query?: Record<string, string | undefined>; body?: unknown } = {}): Promise<T> {
  const params = new URLSearchParams({ op });
  for (const [k, v] of Object.entries(opts.query || {})) if (v) params.set(k, v);
  const res = await apiFetch(`/api/ad-videos?${params.toString()}`, {
    method: opts.method || 'GET',
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false) {
    const err = new Error(json?.error || `İstek başarısız (${res.status})`) as Error & { status?: number; data?: unknown };
    err.status = res.status;
    err.data = json;
    throw err;
  }
  return json as T;
}

export const adVideosApi = {
  me: () => call<AdVideoMe>('me'),
  list: (q: Record<string, string | undefined>) => call<{ tasks: AdVideoTask[] }>('list', { query: q }),
  get: (id: string) => call<AdVideoDetail>('get', { query: { id } }),
  teachers: () => call<{ teachers: PersonOption[] }>('teachers'),
  staff: () => call<{ staff: PersonOption[] }>('staff'),
  create: (body: Record<string, unknown>) => call<{ tasks: AdVideoTask[] }>('create', { method: 'POST', body }),
  update: (body: Record<string, unknown>) => call<{ task: AdVideoTask }>('update', { method: 'POST', body }),
  remove: (id: string) => call<{ ok: true }>('delete', { method: 'POST', body: { id } }),
  markShot: (id: string, date: string) => call<{ task: AdVideoTask }>('mark_shot', { method: 'POST', body: { id, date } }),
  uploadStart: (body: { id: string; file_name: string; mime_type: string; size: number; actual_shoot_date?: string; kind?: 'raw' | 'edit' }) =>
    call<{ session_id: string; session_uri: string; chunk_bytes: number; resumed: boolean }>('upload_start', { method: 'POST', body }),
  uploadPending: (id: string) =>
    call<{ session: { id: string; file_name: string; size_bytes: number; created_at: string } | null }>('upload_pending', { query: { id } }),
  uploadFinalize: (session_id: string) => call<{ task: AdVideoTask; already?: boolean }>('upload_finalize', { method: 'POST', body: { session_id } }),
  review: (id: string, action: 'approve' | 'revision', note: string, submission_id?: string) =>
    call<{ task: AdVideoTask & { approved_version?: number; approved_kind?: string } }>('review', { method: 'POST', body: { id, action, note, submission_id } }),
  ticket: (submission_id: string) => call<{ ticket: string; url: string }>('ticket', { method: 'POST', body: { submission_id } }),
  reviews: () => call<{ items: Array<{ submission_id: string; task_id: string; title: string; teacher_name: string; version: number; opened_at: string | null; review_status: string }> }>('reviews'),
  reviewGet: (id: string) => call<{ item: AdVideoSubmission & { title: string; teacher_name: string } }>('review_get', { query: { id } }),
  openReview: (submission_id: string) => call<{ submission: AdVideoSubmission }>('open_review', { method: 'POST', body: { submission_id } }),
  comment: (submission_id: string, body: string) => call<{ comment: AdVideoComment }>('comment', { method: 'POST', body: { submission_id, body } }),
  stats: (week: string, teacher_id?: string) => call<AdVideoStats>('stats', { query: { week, teacher_id } }),
  daily: (date: string) => call<{ summary: DailySummary }>('daily_summary', { query: { date } }),
  settings: () =>
    call<{ settings: AdVideoSettings; editors: PersonOption[]; drive: { credentials_configured: boolean; upload_effective: boolean } }>('settings'),
  saveSettings: (body: Partial<AdVideoSettings>) => call<{ settings: AdVideoSettings }>('settings', { method: 'POST', body }),
  driveCheck: () =>
    call<{ ok: boolean; credentials: boolean; token: boolean; folder: { id: string; name: string; driveId: string | null } | null; error: string | null }>(
      'drive_check',
      { method: 'POST', body: {} }
    )
};
