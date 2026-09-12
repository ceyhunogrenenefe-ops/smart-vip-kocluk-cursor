import { apiFetch } from './session';

export type CrmChannel = 'whatsapp' | 'instagram';
export type CrmStatus = 'open' | 'pending' | 'closed';
export type CrmSenderType = 'lead' | 'agent' | 'bot' | 'system';

export type CrmConversation = {
  id: string;
  institution_id?: string | null;
  contact_identifier: string;
  channel: CrmChannel;
  contact_name?: string | null;
  assigned_user_id?: string | null;
  status: CrmStatus;
  lead_id?: string | null;
  ad_source_data?: Record<string, unknown> | null;
  last_message_at?: string | null;
  last_message_preview?: string | null;
  unread_count?: number;
  created_at?: string;
  updated_at?: string;
};

export type CrmMessage = {
  id: string;
  conversation_id: string;
  sender_type: CrmSenderType;
  sender_id?: string | null;
  body?: string | null;
  media_url?: string | null;
  message_type?: string;
  message_id?: string | null;
  delivery_status?: string | null;
  created_at: string;
};

async function inboxGet<T>(op: string, params: Record<string, string | undefined> = {}) {
  const sp = new URLSearchParams({ op });
  for (const [k, v] of Object.entries(params)) {
    if (v) sp.set(k, v);
  }
  const res = await apiFetch(`/api/crm-inbox?${sp}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message || json?.error || `crm_${op}_failed`);
  return json as T;
}

async function inboxPost<T>(op: string, body: Record<string, unknown> = {}) {
  const res = await apiFetch(`/api/crm-inbox?op=${encodeURIComponent(op)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op, ...body })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message || json?.error || `crm_${op}_failed`);
  return json as T;
}

async function adminGet<T>(op: string, params: Record<string, string | undefined> = {}) {
  const sp = new URLSearchParams({ op });
  for (const [k, v] of Object.entries(params)) {
    if (v) sp.set(k, v);
  }
  const res = await apiFetch(`/api/crm-admin?${sp}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message || json?.error || `crm_admin_${op}_failed`);
  return json as T;
}

async function adminPost<T>(op: string, body: Record<string, unknown> = {}) {
  const res = await apiFetch(`/api/crm-admin?op=${encodeURIComponent(op)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op, ...body })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message || json?.error || `crm_admin_${op}_failed`);
  return json as T;
}

export function crmListConversations(opts: {
  q?: string;
  status?: string;
  channel?: string;
  institution_id?: string;
} = {}) {
  return inboxGet<{ data: CrmConversation[] }>('list_conversations', opts);
}

export function crmListMessages(conversationId: string, since?: string) {
  return inboxGet<{ data: CrmMessage[]; conversation: CrmConversation }>('list_messages', {
    conversation_id: conversationId,
    since
  });
}

export function crmSendMessage(conversationId: string, text: string) {
  return inboxPost<{ ok: boolean; data: CrmMessage }>('send_message', {
    conversation_id: conversationId,
    body: text
  });
}

export function crmAssignConversation(conversationId: string, assignedUserId: string | null) {
  return inboxPost<{ data: CrmConversation }>('assign_conversation', {
    conversation_id: conversationId,
    assigned_user_id: assignedUserId
  });
}

export function crmUpdateStatus(conversationId: string, status: CrmStatus) {
  return inboxPost<{ data: CrmConversation }>('update_status', {
    conversation_id: conversationId,
    status
  });
}

export function crmMarkRead(conversationId: string) {
  return inboxPost<{ ok: boolean }>('mark_read', { conversation_id: conversationId });
}

export function crmPoll(since: string, conversationId?: string) {
  return inboxGet<{
    data: {
      messages?: CrmMessage[];
      conversations?: CrmConversation[];
      server_time: string;
    };
  }>('poll', { since, conversation_id: conversationId });
}

export function crmListAgents(institutionId?: string) {
  return inboxGet<{
    data: {
      assignments: Array<Record<string, unknown>>;
      role_users: Array<{ id: string; name: string; email: string; role: string }>;
    };
  }>('list_agents', { institution_id: institutionId });
}

export function crmAdminListAgents(institutionId?: string) {
  return adminGet<{
    data: {
      assignments: Array<Record<string, unknown>>;
      role_users: Array<{ id: string; name: string; email: string; role: string; roles?: string[] }>;
      coach_candidates: Array<{ id: string; name: string; email: string; role: string }>;
    };
  }>('list_agents', { institution_id: institutionId });
}

export function crmAdminCreateUser(payload: {
  name: string;
  email: string;
  password: string;
  institution_id?: string;
  can_access_unassigned_pool?: boolean;
}) {
  return adminPost<{ data: { id: string; name: string; email: string } }>('create_crm_user', payload);
}

export function crmAdminPromoteAgent(payload: {
  user_id: string;
  institution_id?: string;
  can_access_unassigned_pool?: boolean;
}) {
  return adminPost<{ data: unknown }>('promote_agent', payload);
}

export function crmAdminDemoteAgent(userId: string) {
  return adminPost<{ data: unknown }>('demote_agent', { user_id: userId });
}
