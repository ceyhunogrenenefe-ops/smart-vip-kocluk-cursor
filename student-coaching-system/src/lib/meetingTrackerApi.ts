import { apiFetch } from './session';

export type MtMeetingType = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  audience_role?: string | null;
  is_board?: boolean;
  sort_order?: number;
};

export type MtAgendaItem = {
  id: string;
  meeting_id: string;
  title: string;
  description?: string | null;
  sort_order: number;
  priority: string;
  status: string;
  discussion_note?: string | null;
  decision_text?: string | null;
  created_by?: string | null;
  related_user_ids?: string[] | null;
  is_carried_forward?: boolean;
  carried_from_meeting_id?: string | null;
  carried_from_agenda_id?: string | null;
};

export type MtTask = {
  id: string;
  meeting_id: string;
  agenda_item_id?: string | null;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  start_date?: string | null;
  due_date?: string | null;
  reviewer_user_id?: string | null;
  completion_note?: string | null;
  assignees?: { user_id: string }[];
  mt_task_assignees?: { user_id: string }[];
  carried_to_meeting_id?: string | null;
};

export type MtMeeting = {
  id: string;
  title: string;
  description?: string | null;
  meeting_date: string;
  start_time?: string | null;
  end_time?: string | null;
  location_or_link?: string | null;
  manager_user_id?: string | null;
  open_to_role?: boolean;
  status: string;
  meeting_type_id: string;
  reminder_at?: string | null;
  type?: MtMeetingType;
  mt_meeting_types?: MtMeetingType;
};

export type MtMeetingBundle = {
  meeting: MtMeeting;
  type: MtMeetingType | null;
  participants: { id: string; user_id: string | null; role_scope?: string | null }[];
  agenda: MtAgendaItem[];
  decisions: { id: string; title: string; body?: string | null; agenda_item_id?: string | null }[];
  tasks: MtTask[];
  notes: { id: string; body: string; created_by?: string | null; created_at: string }[];
  attachments: { id: string; file_name: string; file_url: string }[];
  activity: {
    id: string;
    action: string;
    actor_user_id?: string | null;
    old_value?: unknown;
    new_value?: unknown;
    created_at: string;
  }[];
};

export type MtDashboard = {
  upcoming: MtMeeting[];
  this_month: number;
  open_tasks: number;
  overdue_tasks: number;
  done_tasks: number;
  deferred_agenda: number;
  tasks: MtTask[];
  meetings: MtMeeting[];
};

export type MtUser = { id: string; name?: string | null; email?: string | null; role?: string; roles?: string[] };

export type MtTemplate = {
  id: string;
  name: string;
  description?: string | null;
  meeting_type_id?: string | null;
  agenda_json: { title: string; description?: string }[];
};

async function mtFetch(op: string, init?: RequestInit & { query?: Record<string, string> }) {
  const qs = new URLSearchParams({ op, ...(init?.query || {}) });
  const res = await apiFetch(`/api/meeting-tracker?${qs.toString()}`, {
    method: init?.method || 'GET',
    body: init?.body,
    headers: init?.headers
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.error || 'İstek başarısız') as Error & {
      status?: number;
      warnings?: unknown;
      payload?: unknown;
    };
    err.status = res.status;
    err.warnings = json?.warnings;
    err.payload = json;
    throw err;
  }
  return json;
}

export async function mtGetTypes(): Promise<MtMeetingType[]> {
  const j = await mtFetch('types');
  return j.data || [];
}

export async function mtGetDashboard(): Promise<MtDashboard> {
  const j = await mtFetch('dashboard');
  return j.data;
}

export async function mtGetMeeting(id: string): Promise<MtMeetingBundle> {
  const j = await mtFetch('meeting', { query: { id } });
  return j.data;
}

export async function mtGetReports() {
  const j = await mtFetch('reports');
  return j.data;
}

export async function mtGetTemplates(): Promise<MtTemplate[]> {
  const j = await mtFetch('templates');
  return j.data || [];
}

export async function mtGetUsers(): Promise<MtUser[]> {
  const j = await mtFetch('users');
  return j.data || [];
}

export async function mtParseAgenda(text: string): Promise<{ title: string; description: string }[]> {
  const j = await mtFetch('parse-agenda', { method: 'POST', body: JSON.stringify({ text }) });
  return j.data || [];
}

export async function mtCreateMeeting(body: Record<string, unknown>): Promise<MtMeetingBundle> {
  const j = await mtFetch('create-meeting', { method: 'POST', body: JSON.stringify(body) });
  return j.data;
}

export async function mtUpdateMeeting(body: Record<string, unknown>) {
  const j = await mtFetch('update-meeting', { method: 'PATCH', body: JSON.stringify(body) });
  return j.data;
}

export async function mtCloseMeeting(id: string, force = false) {
  const j = await mtFetch('close-meeting', {
    method: 'PATCH',
    body: JSON.stringify({ id, force })
  });
  return j;
}

export async function mtArchiveMeeting(id: string) {
  await mtFetch('archive-meeting', { method: 'DELETE', query: { id } });
}

export async function mtAddAgenda(meetingId: string, items: { title: string; description?: string; priority?: string }[]) {
  const j = await mtFetch('add-agenda', {
    method: 'POST',
    body: JSON.stringify({ meeting_id: meetingId, items })
  });
  return j.data;
}

export async function mtUpdateAgenda(body: Record<string, unknown>) {
  const j = await mtFetch('update-agenda', { method: 'PATCH', body: JSON.stringify(body) });
  return j.data;
}

export async function mtReorderAgenda(meetingId: string, orderedIds: string[]) {
  await mtFetch('reorder-agenda', {
    method: 'PATCH',
    body: JSON.stringify({ meeting_id: meetingId, ordered_ids: orderedIds })
  });
}

export async function mtCreateTask(body: Record<string, unknown>) {
  const j = await mtFetch('create-task', { method: 'POST', body: JSON.stringify(body) });
  return j.data;
}

export async function mtUpdateTask(body: Record<string, unknown>) {
  const j = await mtFetch('update-task', { method: 'PATCH', body: JSON.stringify(body) });
  return j.data;
}

export async function mtAddNote(meetingId: string, body: string) {
  const j = await mtFetch('add-note', {
    method: 'POST',
    body: JSON.stringify({ meeting_id: meetingId, body })
  });
  return j.data;
}

export async function mtAddDecision(body: Record<string, unknown>) {
  const j = await mtFetch('add-decision', { method: 'POST', body: JSON.stringify(body) });
  return j.data;
}

export async function mtCarryForward(body: {
  target_meeting_id: string;
  agenda_item_id?: string;
  task_id?: string;
}) {
  const j = await mtFetch('carry-forward', { method: 'POST', body: JSON.stringify(body) });
  return j.data;
}

export async function mtSaveTemplate(body: Record<string, unknown>) {
  const j = await mtFetch('save-template', { method: 'POST', body: JSON.stringify(body) });
  return j.data;
}
