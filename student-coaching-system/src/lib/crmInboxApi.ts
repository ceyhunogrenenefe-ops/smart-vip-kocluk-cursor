import { apiFetch } from './session';

export type CrmChannel = 'whatsapp' | 'instagram' | 'facebook';
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
  metadata?: { tags?: string[] } | null;
  ad_source_data?: Record<string, unknown> | null;
  last_message_at?: string | null;
  last_message_preview?: string | null;
  unread_count?: number;
  created_at?: string;
  updated_at?: string;
  /** Mevcut öğrenci / veli / personel — raporlara girmez */
  is_internal?: boolean;
  internal_reason?: string | null;
  /** FAZ 1: Instagram kullanıcı adı / profil fotoğrafı */
  contact_username?: string | null;
  contact_avatar_url?: string | null;
  profile_error?: string | null;
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
  /** exclude (adaylar, varsayılan) | only (kurum içi) | all */
  internal?: 'exclude' | 'only' | 'all';
  /** FAZ 2: mine (benimkiler) | unassigned (atanmamış) */
  assigned?: 'mine' | 'unassigned';
} = {}) {
  return inboxGet<{ data: CrmConversation[] }>('list_conversations', opts);
}

export function crmListMessages(conversationId: string, since?: string) {
  return inboxGet<{ data: CrmMessage[]; conversation: CrmConversation }>('list_messages', {
    conversation_id: conversationId,
    since
  });
}

export type CrmMetaTemplate = {
  id: string;
  kind: 'meta_template';
  name: string;
  language: string;
  category?: string;
  status: string;
  body: string;
  variableCount: number;
  variableFormat?: 'named' | 'positional';
  variableNames?: string[];
  headerFormat?: string | null;
  sendable?: boolean;
  mediaHeader?: boolean;
  qualityScore?: string | null;
};

export function crmSendMessage(
  conversationId: string,
  text: string,
  template?: {
    template_name: string;
    template_language?: string;
    template_params?: string[];
    template_param_names?: string[];
    template_body?: string;
  }
) {
  return inboxPost<{ ok: boolean; data: CrmMessage }>('send_message', {
    conversation_id: conversationId,
    body: text,
    ...(template || {})
  });
}

export function crmListMetaTemplates(refresh = false) {
  return inboxGet<{
    data: CrmMetaTemplate[];
    pending?: CrmMetaTemplate[];
    source?: string;
    hint?: string | null;
  }>('list_meta_templates', refresh ? { refresh: '1' } : {});
}

export function crmCreateMetaTemplate(payload: {
  name: string;
  body: string;
  category?: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
  language?: string;
}) {
  return inboxPost<{
    ok: boolean;
    data: {
      name?: string;
      status?: string;
      created?: boolean;
      reused?: boolean;
      approved?: boolean;
    };
    message?: string;
  }>('create_meta_template', payload);
}

export function crmAssignConversation(conversationId: string, assignedUserId: string | null) {
  return inboxPost<{ data: CrmConversation }>('assign_conversation', {
    conversation_id: conversationId,
    assigned_user_id: assignedUserId
  });
}

export function crmTakeConversation(conversationId: string) {
  return inboxPost<{ data: CrmConversation }>('take_conversation', {
    conversation_id: conversationId
  });
}

export function crmSetTags(conversationId: string, tags: string[]) {
  return inboxPost<{ data: CrmConversation }>('set_tags', {
    conversation_id: conversationId,
    tags
  });
}

/** Sohbeti kalıcı siler (mesajları dahil; aday kartı kalır). Yalnız yönetici. */
export function crmDeleteConversation(conversationId: string) {
  return inboxPost<{ ok: boolean; data: { deleted_id: string } }>('delete_conversation', {
    conversation_id: conversationId
  });
}

export function crmSetInternal(conversationId: string, internal: boolean) {
  return inboxPost<{ data: CrmConversation }>('set_internal', {
    conversation_id: conversationId,
    internal
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

export function crmDeleteMessage(messageId: string) {
  return inboxPost<{ ok: boolean; data: { deleted_id: string; conversation?: CrmConversation } }>('delete_message', {
    message_id: messageId
  });
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

export type CrmInboundStatus = {
  ok: boolean;
  bound_to_production: boolean;
  company_line: string;
  company_digits: string;
  display_phone?: string | null;
  verified_name?: string | null;
  webhook_url?: string;
  subscribed_app_name?: string | null;
  hint?: string | null;
  applied?: boolean;
  callbacks_ours?: boolean;
  real_inbound_seen?: boolean;
  last_webhook_at?: string | null;
  social?: {
    ok?: boolean;
    token_present?: boolean;
    token_source?: string | null;
    token_kind?: string | null;
    page_name?: string | null;
    hint?: string | null;
    env?: {
      token_present?: boolean;
      token_source?: string | null;
      token_suffix?: string | null;
    };
  };
  website_form?: { ok?: boolean; endpoint?: string };
};

export function crmListNotes(conversationId: string) {
  return inboxGet<{ data: Array<{ id: string; body: string; created_at: string; author_user_id?: string | null }> }>(
    'list_notes',
    { conversation_id: conversationId }
  );
}

export function crmAddNote(conversationId: string, body: string) {
  return inboxPost<{ data: { id: string; body: string; created_at: string } }>('add_note', {
    conversation_id: conversationId,
    body
  });
}

export type CrmCannedReply = {
  id: string;
  category: string;
  title: string;
  body: string;
  channel?: string | null;
  sort_order: number;
  is_active: boolean;
  updated_at?: string;
};

/** FAZ 5 — hazır mesaj kategorileri (sıra = gösterim sırası) */
export const CANNED_CATEGORIES = [
  'Genel',
  'LGS',
  '5. Sınıf',
  '6. Sınıf',
  '7. Sınıf',
  'Özel Ders',
  'Eğitim Koçluğu',
  'Deneme Kulübü',
  'Fiyat Bilgisi',
  'Program Bilgisi',
  'Kayıt',
  'Ödeme',
  'Düşünecek',
  'Eşiyle Görüşecek',
  'Cevap Vermeyen'
];

export function crmListCanned(opts: { all?: boolean } = {}) {
  return inboxGet<{ data: CrmCannedReply[] }>('list_canned', { all: opts.all ? '1' : undefined });
}

export function crmSaveCanned(row: Partial<CrmCannedReply>) {
  return inboxPost<{ data: CrmCannedReply }>('save_canned', row as Record<string, unknown>);
}

export function crmDeleteCanned(id: string) {
  return inboxPost<{ ok: boolean }>('delete_canned', { id });
}

/** {ad}, {temsilci} gibi alanları doldurur; bilinmeyenleri olduğu gibi bırakır (temsilci düzenler) */
export function fillCannedVars(body: string, vars: Record<string, string | null | undefined>) {
  return body.replace(/\{([a-z_ığüşöç]+)\}/gi, (m, key: string) => {
    const v = vars[key.toLowerCase()];
    return v && String(v).trim() ? String(v).trim() : m;
  });
}

const INBOUND_CACHE_KEY = 'crm_inbound_status_v1';

/** Son bilinen bağlantı durumu: Meta’dan cevap gelene kadar “kopmuş” görünmesin */
export function readCachedInboundStatus(): CrmInboundStatus | null {
  try {
    const raw = localStorage.getItem(INBOUND_CACHE_KEY);
    return raw ? (JSON.parse(raw) as CrmInboundStatus) : null;
  } catch {
    return null;
  }
}

function writeCachedInboundStatus(value: CrmInboundStatus | null | undefined) {
  if (!value) return;
  try {
    localStorage.setItem(INBOUND_CACHE_KEY, JSON.stringify(value));
  } catch {
    /* depolama kapalı olabilir */
  }
}

export async function crmInboundStatus() {
  const res = await inboxGet<{ data: CrmInboundStatus }>('inbound_status');
  writeCachedInboundStatus(res?.data);
  return res;
}

export function crmEnsureInbound() {
  return inboxPost<{ ok: boolean; data: CrmInboundStatus; error?: string | null }>('ensure_inbound');
}

export type CrmMetaDiagnostics = Record<string, unknown>;

export function crmMetaDiagnostics() {
  return inboxGet<{ data: CrmMetaDiagnostics }>('meta_diagnostics');
}

export function crmSavePageToken(payload: {
  page_access_token?: string;
  user_access_token?: string;
  page_id?: string;
}) {
  return inboxPost<{ ok: boolean; data: CrmInboundStatus; error?: string | null; hint?: string | null }>(
    'save_page_token',
    payload
  );
}

export type CrmFacebookLoginStart = {
  app_id: string;
  config_id: string;
  uses_slim_config?: boolean;
  blocked_asset_ids?: string[];
  config_permissions?: string[];
  graph_version: string;
  widget_redirect_uri: string;
  oauth_redirect_uri: string;
  whitelist_uris?: string[];
  authorize_url: string;
  code_authorize_url?: string | null;
  config_authorize_url?: string | null;
  has_app_secret: boolean;
  hint?: string;
};

export function crmFacebookLoginStart() {
  return inboxGet<{ data: CrmFacebookLoginStart }>('facebook_login_start');
}

export function crmSaveMetaAppSecret(appSecret: string) {
  return inboxPost<{ ok: boolean; data: { saved: boolean; suffix?: string } }>('save_meta_app_secret', {
    app_secret: appSecret
  });
}

export function crmSaveMetaConfigurationId(configurationId: string) {
  return inboxPost<{
    ok: boolean;
    data: { saved: boolean; configuration_id?: string; uses_slim_config?: boolean };
  }>('save_meta_configuration_id', {
    configuration_id: configurationId
  });
}

export function crmListAgents(institutionId?: string) {
  return inboxGet<{
    data: {
      assignments: Array<Record<string, unknown>>;
      role_users: Array<{ id: string; name: string; email: string; role: string }>;
    };
  }>('list_agents', { institution_id: institutionId });
}

export type CrmAssignmentSettings = {
  round_robin_enabled: boolean;
  next_after_user_id: string | null;
  pool: Array<{ id: string; name: string }>;
  unassigned_leads: number;
  unassigned_conversations: number;
};

/** FAZ 2: otomatik dağıtım ayarı (enabled verilirse kaydeder) */
export function crmAdminAssignmentSettings(enabled?: boolean) {
  return enabled === undefined
    ? adminGet<{ data: CrmAssignmentSettings }>('assignment_settings')
    : adminPost<{ data: CrmAssignmentSettings }>('assignment_settings', { round_robin_enabled: enabled });
}

export function crmAdminSetRoundRobin(userId: string, inRoundRobin: boolean) {
  return adminPost<{ ok: boolean }>('set_round_robin', { user_id: userId, in_round_robin: inRoundRobin });
}

export function crmAdminDistributeUnassigned() {
  return adminPost<{
    data: {
      leads_assigned: number;
      conversations_assigned: number;
      per_agent: Array<{ id: string; name: string; count: number }>;
    };
  }>('distribute_unassigned', {});
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

export type CrmPresenceAgent = {
  user_id: string;
  name: string;
  email?: string | null;
  role?: string | null;
  roles?: string[];
  phone?: string | null;
  last_seen_at?: string | null;
  page_path?: string | null;
  online: boolean;
};

export function crmHeartbeat(pagePath?: string) {
  return inboxPost<{ ok: boolean; data?: { ok?: boolean; last_seen_at?: string; error?: string } }>('heartbeat', {
    page_path: pagePath || (typeof window !== 'undefined' ? window.location.pathname : '')
  });
}

export function crmListPresence(onlineOnly = false) {
  return inboxGet<{
    data: { ok?: boolean; items?: CrmPresenceAgent[]; online_count?: number; error?: string };
  }>('list_presence', onlineOnly ? { online_only: '1' } : undefined);
}
