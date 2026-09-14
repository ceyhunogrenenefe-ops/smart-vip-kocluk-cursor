import { apiFetch } from './session';

export type RegLead = {
  id: string;
  institution_id: string;
  academic_period_id?: string | null;
  academic_period_key?: string | null;
  linked_student_id?: string | null;
  first_name: string;
  last_name: string;
  full_name?: string;
  parent_full_name?: string | null;
  phone?: string | null;
  normalized_phone?: string | null;
  alternate_phone?: string | null;
  email?: string | null;
  grade_program: string;
  interested_package?: string | null;
  primary_status: 'tracking' | 'confirmed' | 'lost';
  stage: string;
  temperature: 'hot' | 'warm' | 'cold';
  probability?: number | null;
  source?: string | null;
  assigned_user_id?: string | null;
  first_contact_at?: string | null;
  last_contact_at?: string | null;
  next_action_at?: string | null;
  next_action_type?: string | null;
  parent_expectations?: string | null;
  registration_obstacles?: string | null;
  offered_price?: number | null;
  discount_amount?: number | null;
  final_offer_amount?: number | null;
  notes?: string | null;
  lost_reason?: string | null;
  lost_description?: string | null;
  confirmed_at?: string | null;
  confirmed_by?: string | null;
  last_inbound_channel?: 'whatsapp' | 'instagram' | string | null;
  last_inbound_snippet?: string | null;
  last_inbound_at?: string | null;
  instagram_scoped_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type RegChannelMessage = {
  id: string;
  channel: 'whatsapp' | 'instagram' | string;
  direction: 'inbound' | 'outbound' | string;
  body?: string | null;
  message_type?: string | null;
  contact_name?: string | null;
  phone?: string | null;
  occurred_at: string;
  external_message_id?: string | null;
  created_at?: string;
};

export type RegDashboard = {
  total_tracking: number;
  total_confirmed: number;
  new_this_week: number;
  confirmed_this_week: number;
  confirmed_this_month: number;
  payment_pending: number;
  call_today: number;
  overdue: number;
  lost_count: number;
  conversion_rate: number;
  by_grade: Record<string, { label: string; tracking: number; confirmed: number }>;
  stage_distribution: Record<string, number>;
};

export type RegLeadDetail = {
  lead: RegLead;
  interactions: Array<Record<string, unknown>>;
  tasks: Array<Record<string, unknown>>;
  meeting_links: Array<Record<string, unknown>>;
  audit_logs: Array<Record<string, unknown>>;
  tags: Array<{ id: string; name: string; color?: string | null }>;
  channel_messages?: RegChannelMessage[];
};

async function rtFetch<T>(op: string, init: RequestInit & { query?: Record<string, string> } = {}): Promise<T> {
  const sp = new URLSearchParams({ op });
  if (init.query) {
    for (const [k, v] of Object.entries(init.query)) {
      if (v != null && v !== '') sp.set(k, v);
    }
  }
  const res = await apiFetch(`/api/registration-tracking?${sp.toString()}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) }
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(j.message || j.error || `HTTP ${res.status}`);
  }
  return j as T;
}

export function rtGetConfig() {
  return rtFetch<{ grade_programs: Array<{ code: string; label: string }> }>('config', { method: 'GET' });
}

export function rtGetDashboard(query: Record<string, string> = {}) {
  return rtFetch<{ data: RegDashboard }>('dashboard', { method: 'GET', query });
}

export function rtListLeads(query: Record<string, string>) {
  return rtFetch<{ items: RegLead[]; total: number; page: number; page_size: number }>('list', {
    method: 'GET',
    query
  });
}

export function rtGetLead(leadId: string) {
  return rtFetch<{ data: RegLeadDetail }>('get', { method: 'GET', query: { lead_id: leadId } });
}

export function rtCheckDuplicates(body: Record<string, unknown>) {
  return rtFetch<{ duplicates: RegLead[] }>('check-duplicates', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export function rtCreateLead(body: Record<string, unknown>) {
  return rtFetch<{ data: RegLead }>('create', { method: 'POST', body: JSON.stringify(body) });
}

export function rtUpdateLead(leadId: string, body: Record<string, unknown>) {
  return rtFetch<{ data: RegLead }>('update', {
    method: 'PATCH',
    body: JSON.stringify({ ...body, lead_id: leadId })
  });
}

export function rtConfirmLead(body: Record<string, unknown>) {
  return rtFetch<{ data: Record<string, unknown> }>('confirm', { method: 'POST', body: JSON.stringify(body) });
}

export function rtMarkLost(body: Record<string, unknown>) {
  return rtFetch<{ data: RegLead }>('mark-lost', { method: 'POST', body: JSON.stringify(body) });
}

export function rtReopenLead(body: Record<string, unknown>) {
  return rtFetch<{ data: RegLead }>('reopen', { method: 'POST', body: JSON.stringify(body) });
}

export function rtRevertConfirmed(body: Record<string, unknown>) {
  return rtFetch<{ data: RegLead }>('revert-confirmed', { method: 'POST', body: JSON.stringify(body) });
}

export function rtAddInteraction(body: Record<string, unknown>) {
  return rtFetch<{ data: Record<string, unknown> }>('add-interaction', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export function rtCreateTask(body: Record<string, unknown>) {
  return rtFetch<{ data: Record<string, unknown> }>('create-task', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export function rtCompleteTask(body: Record<string, unknown>) {
  return rtFetch<{ data: Record<string, unknown> }>('complete-task', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export function rtBulk(body: Record<string, unknown>) {
  return rtFetch<{ data: { updated: number } }>('bulk', { method: 'POST', body: JSON.stringify(body) });
}

export function rtAddToMeeting(body: Record<string, unknown>) {
  return rtFetch<{ data: { links: unknown[] } }>('add-to-meeting', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export function rtExport(query: Record<string, string>) {
  return rtFetch<{ rows: RegLead[] }>('export', { method: 'GET', query });
}

export function rtImportPreview(body: Record<string, unknown>) {
  return rtFetch<{ data: Record<string, unknown> }>('import-preview', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export function rtImportCommit(body: Record<string, unknown>) {
  return rtFetch<{ data: Record<string, unknown> }>('import-commit', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export function rtStaffPerformance() {
  return rtFetch<{ data: { by_user?: Record<string, unknown>; agents?: RegAgentLoad[] } }>(
    'staff-performance',
    { method: 'GET' }
  );
}

export function rtDeleteLead(leadId: string) {
  return rtFetch<{ data: { ok: boolean; lead_id: string } }>('delete', {
    method: 'POST',
    body: JSON.stringify({ lead_id: leadId })
  });
}

export function rtSuggestions() {
  return rtFetch<{ data: Record<string, RegLead[]> }>('suggestions', { method: 'GET' });
}

export type RegCoach = {
  id: string;
  name: string;
  email?: string | null;
  kind?: 'coach' | 'crm_agent' | 'admin' | string;
};

export type RegAgentLoad = {
  id: string;
  name: string;
  kind?: string;
  assigned: number;
  tracking: number;
  confirmed: number;
  conversion_rate?: number;
};

export function rtListCoaches() {
  return rtFetch<{ data: RegCoach[] }>('coaches', { method: 'GET' });
}

export function rtLookupPhone(phone: string) {
  return rtFetch<{
    data: {
      phone: string | null;
      coach: RegCoach | null;
      parent_full_name: string | null;
      linked_student_id: string | null;
    };
  }>('lookup-phone', { method: 'GET', query: { phone } });
}

export type CrmOpsAgentRow = {
  id: string;
  name: string;
  leads: number;
  contacts?: number;
  trial_lessons: number;
  confirmed: number;
  response_ms?: number | null;
  response_label: string;
  conversion_rate: number;
};

export type CrmOpsDashboard = {
  range: { from: string; to: string; preset: string };
  contacts: number;
  trial_lessons: number;
  confirmed: number;
  avg_first_response_ms: number | null;
  avg_first_response_label: string;
  first_response_samples?: number;
  agents: CrmOpsAgentRow[];
  coaches: RegCoach[];
  series: Array<{ day: string; contacts: number; confirmed: number }>;
  segments?: Array<{ id: string; label: string }>;
};

export type CrmOpsTask = {
  id: string;
  lead_id: string;
  assigned_to?: string | null;
  title: string;
  description?: string | null;
  task_type?: string | null;
  priority?: string | null;
  status: string;
  due_at?: string | null;
  completed_at?: string | null;
  lead_name: string;
  lead_phone?: string | null;
  lead_stage?: string | null;
};

export function rtOpsDashboard(query: Record<string, string> = {}) {
  return rtFetch<{ data: CrmOpsDashboard }>('ops-dashboard', { method: 'GET', query });
}

export function rtListOpsTasks(query: Record<string, string> = {}) {
  return rtFetch<{ data: { items: CrmOpsTask[]; range: { from: string; to: string } } }>('list-tasks', {
    method: 'GET',
    query
  });
}

export function rtDueAlarms() {
  return rtFetch<{ data: { items: CrmOpsTask[] } }>('due-alarms', { method: 'GET' });
}

export function rtSnoozeTask(taskId: string, minutes = 5) {
  return rtFetch<{ data: Record<string, unknown> }>('snooze-task', {
    method: 'POST',
    body: JSON.stringify({ task_id: taskId, minutes })
  });
}

export function rtSegmentLeads(query: Record<string, string> = {}) {
  return rtFetch<{
    data: {
      items: Array<{
        id: string;
        full_name?: string;
        first_name?: string;
        last_name?: string;
        phone?: string | null;
        normalized_phone?: string | null;
        stage?: string;
        assigned_user_id?: string | null;
      }>;
      segment?: { id: string; label: string };
    };
  }>('segment-leads', { method: 'GET', query });
}

export function rtBulkTemplateSend(body: {
  lead_ids: string[];
  template_name?: string;
  template_language?: string;
  template_params?: string[];
  template_body?: string;
  body?: string;
  channel?: string;
}) {
  return rtFetch<{
    data: { sent: number; failed: number; results: Array<{ lead_id: string; ok: boolean; status: string; error?: string | null }> };
  }>('bulk-template-send', { method: 'POST', body: JSON.stringify(body) });
}

export function rtSendChannelMessage(body: {
  lead_id: string;
  channel: 'whatsapp' | 'instagram' | string;
  body: string;
  template_name?: string;
  template_language?: string;
  template_params?: string[];
  template_param_names?: string[];
  template_body?: string;
}) {
  return rtFetch<{
    data: {
      message: RegChannelMessage;
      send: { ok: boolean; provider?: string | null; error?: string | null };
      warning?: string | null;
    };
  }>('send-channel-message', { method: 'POST', body: JSON.stringify(body) });
}
