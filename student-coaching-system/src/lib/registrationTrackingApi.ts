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
  created_at: string;
  updated_at: string;
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
  return rtFetch<{ data: Record<string, unknown> }>('staff-performance', { method: 'GET' });
}

export function rtSuggestions() {
  return rtFetch<{ data: Record<string, RegLead[]> }>('suggestions', { method: 'GET' });
}
