import { apiFetch } from './session';
import {
  PLATFORM_PRIMARY_INSTITUTION_ID,
  readActiveInstitutionIdForRole,
  readActiveInstitutionIdFromStorage
} from './activeInstitutionScope';

/**
 * Açık olan kurum. Platform kurumunda boş bırakılır (süper admin tüm CRM'i görsün),
 * diğer kurumlarda her CRM isteğine eklenir; böylece bir kurumun paneline geçildiğinde
 * başka kurumun konuşmaları / Meta hesabı görünmez.
 */
let explicitCrmInstitutionId: string | null | undefined;

export function setCrmInstitutionScope(institutionId?: string | null) {
  explicitCrmInstitutionId = String(institutionId || '').trim() || null;
}

/** Bileşen henüz kurumu bildirmediyse depodaki açık kurumu kullan. */
export function crmInstitutionScope(): string | null {
  const raw =
    explicitCrmInstitutionId !== undefined
      ? explicitCrmInstitutionId
      : readActiveInstitutionIdForRole('super_admin') || readActiveInstitutionIdFromStorage();
  const v = String(raw || '').trim();
  return v && v !== PLATFORM_PRIMARY_INSTITUTION_ID ? v : null;
}

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
  metadata?: {
    tags?: string[];
    /** Gelen mesaj öğretmen başvurusu gibi göründü (şablon otomatik gönderilmez) */
    teacher_application?: boolean;
    teacher_application_confidence?: string;
  } | null;
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
  const scopeId = crmInstitutionScope();
  if (scopeId && !sp.get('institution_id')) sp.set('institution_id', scopeId);
  const res = await apiFetch(`/api/crm-inbox?${sp}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message || json?.error || `crm_${op}_failed`);
  return json as T;
}

async function inboxPost<T>(op: string, body: Record<string, unknown> = {}) {
  const scopeId = crmInstitutionScope();
  const scoped = scopeId && !body.institution_id ? { institution_id: scopeId, ...body } : body;
  const res = await apiFetch(`/api/crm-inbox?op=${encodeURIComponent(op)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op, ...scoped })
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
  const scopeId = crmInstitutionScope();
  if (scopeId && !sp.get('institution_id')) sp.set('institution_id', scopeId);
  const res = await apiFetch(`/api/crm-admin?${sp}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message || json?.error || `crm_admin_${op}_failed`);
  return json as T;
}

async function adminPost<T>(op: string, body: Record<string, unknown> = {}) {
  const adminScopeId = crmInstitutionScope();
  const scopedBody =
    adminScopeId && !body.institution_id ? { institution_id: adminScopeId, ...body } : body;
  const res = await apiFetch(`/api/crm-admin?op=${encodeURIComponent(op)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op, ...scopedBody })
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

/** Önbellek kurum başına: kurum değişince önceki kurumun durumu görünmesin */
function inboundCacheKey() {
  const scopeId = crmInstitutionScope();
  return scopeId ? `${INBOUND_CACHE_KEY}:${scopeId}` : INBOUND_CACHE_KEY;
}

/** Son bilinen bağlantı durumu: Meta’dan cevap gelene kadar “kopmuş” görünmesin */
export function readCachedInboundStatus(): CrmInboundStatus | null {
  try {
    const raw = localStorage.getItem(inboundCacheKey());
    return raw ? (JSON.parse(raw) as CrmInboundStatus) : null;
  } catch {
    return null;
  }
}

function writeCachedInboundStatus(value: CrmInboundStatus | null | undefined) {
  if (!value) return;
  try {
    localStorage.setItem(inboundCacheKey(), JSON.stringify(value));
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

/** FAZ 6 — Bugünkü İşlerim / satış paneli */
export type CrmSla = 'green' | 'yellow' | 'orange' | 'red';
export type CrmBoardWaiting = {
  conversation_id: string;
  contact_name?: string | null;
  contact_username?: string | null;
  contact_identifier?: string | null;
  channel: string;
  assigned_user_id?: string | null;
  assigned_name?: string | null;
  lead_id?: string | null;
  preview?: string | null;
  waiting_since: string;
  waiting_minutes: number;
  sla: CrmSla;
  is_ad: boolean;
  ad_label?: string | null;
};
export type CrmBoardTask = {
  id: string;
  lead_id?: string | null;
  lead_name?: string;
  lead_stage?: string | null;
  title: string;
  task_type?: string | null;
  priority?: string | null;
  due_at: string;
  assigned_to?: string | null;
  auto_generated?: boolean;
  review_required?: boolean;
};
export type CrmBoardAgent = {
  user_id: string | null;
  name: string;
  waiting: number;
  green: number;
  yellow: number;
  orange: number;
  red: number;
  replied_today: number;
  /** null = vardiya tanımlı değil */
  on_duty?: boolean | null;
  avg_response_min: number | null;
  overdue_tasks: number;
  today_tasks: number;
  new_leads_today: number;
};
export type CrmTodayBoard = {
  generated_at: string;
  sla_thresholds: number[];
  scope: 'team' | 'self';
  is_admin: boolean;
  on_duty?: string[] | null;
  /** CRM canlı kullanım başlangıcı — öncesi listelenmez */
  go_live_date?: string | null;
  totals: Omit<CrmBoardAgent, 'user_id' | 'name'>;
  waiting: CrmBoardWaiting[];
  tasks: { overdue: CrmBoardTask[]; today: CrmBoardTask[] };
  new_leads: Array<{
    id: string;
    full_name?: string | null;
    parent_full_name?: string | null;
    source?: string | null;
    stage?: string | null;
    assigned_user_id?: string | null;
    created_at: string;
  }>;
  agents: CrmBoardAgent[];
};

export function crmTodayBoard(filters: { agent?: string; channel?: string; ad?: string } = {}) {
  return inboxGet<{ data: CrmTodayBoard }>('today_board', filters);
}

/** FAZ 7 — personel WhatsApp bildirimi (süper admin QR hattı) */
export type CrmStaffAlerts = {
  enabled: boolean;
  admin_user_id: string | null;
  channel?: string;
  gateway_connected?: boolean;
  gateway_status?: string | null;
  template_status: string | null;
  template_checked_at: string | null;
  template_error: string | null;
  sent_this_month: number;
  agents: Array<{ user_id: string; name: string; has_phone: boolean; wa_alerts_enabled: boolean }>;
  log: Array<{
    id: string;
    user_id: string;
    user_name: string;
    event_type: string;
    summary: string | null;
    status: string;
    error: string | null;
    created_at: string;
  }>;
};

export function crmAdminStaffAlerts(body?: Record<string, unknown>) {
  return body
    ? adminPost<{ data: CrmStaffAlerts }>('staff_alerts', body)
    : adminGet<{ data: CrmStaffAlerts }>('staff_alerts');
}

/** Vardiya (nöbet) — kim hangi gün/saat görevde */
export type CrmShift = {
  id: string;
  user_id: string;
  user_name?: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
  note?: string | null;
};

export function crmAdminShifts(body?: Record<string, unknown>) {
  return body
    ? adminPost<{ data: { shifts: CrmShift[]; on_duty: string[] | null } }>('shifts', body)
    : adminGet<{ data: { shifts: CrmShift[]; on_duty: string[] | null } }>('shifts');
}

/** Kurum bazlı Meta bağlantısı (WhatsApp Cloud API + Instagram) */
export type CrmMetaConnection = {
  source: 'platform' | 'institution' | 'none';
  is_platform: boolean;
  whatsapp: {
    connected: boolean;
    phone_number_id: string | null;
    waba_id: string | null;
    display_phone: string | null;
    token_masked: string;
  };
  instagram: {
    connected: boolean;
    ig_user_id: string | null;
    page_id: string | null;
    username: string | null;
    token_masked: string;
  };
  last_verified_at: string | null;
  last_verify_error: string | null;
  updated_at: string | null;
};

export function crmGetMetaConnection() {
  return inboxGet<{ data: CrmMetaConnection }>('meta_connection');
}

export function crmSaveMetaConnection(payload: {
  wa_token?: string;
  wa_phone_number_id?: string;
  wa_waba_id?: string;
  ig_page_token?: string;
  ig_page_id?: string;
  ig_user_id?: string;
  ig_username?: string;
}) {
  return inboxPost<{ ok: boolean; data: CrmMetaConnection }>('save_meta_connection', payload);
}

export function crmVerifyMetaConnection() {
  return inboxPost<{
    ok: boolean;
    result: { ok: boolean; error?: string; display_phone_number?: string | null; verified_name?: string | null };
    data: CrmMetaConnection;
  }>('verify_meta_connection');
}

/** Öğretmen başvurusuna gönderilecek Meta onaylı şablon (kurum ayarı). */
export function crmGetTeacherTemplate() {
  return inboxGet<{ data: { template_name: string | null; language: string } }>('teacher_template');
}

export function crmSaveTeacherTemplate(templateName: string, language = 'tr') {
  return inboxPost<{ ok: boolean; data: { template_name: string | null; language: string } }>(
    'save_teacher_template',
    { template_name: templateName, language }
  );
}

/** Otomatik Karşılama modülü — kurum ayarları */
export type CrmAutoGreetingSettings = {
  institution_id: string;
  is_active: boolean;
  /** Öğretmen Başvuru Otomasyonu — öğrenci akışından bağımsız */
  teacher_flow_active: boolean;
  teacher_channel_whatsapp: boolean;
  teacher_channel_instagram: boolean;
  teacher_channel_facebook: boolean;
  teacher_message: string | null;
  teacher_application_url: string | null;
  channel_whatsapp: boolean;
  channel_instagram: boolean;
  channel_facebook: boolean;
  run_mode: 'always' | 'after_hours' | 'custom_window';
  business_start: string;
  business_end: string;
  custom_start: string | null;
  custom_end: string | null;
  greeting_text: string | null;
  call_time_text: string | null;
  closing_text: string | null;
  call_slots: string[];
  updated_at?: string;
};

export type CrmAutoGreetingLog = {
  id: string;
  conversation_id: string | null;
  lead_id: string | null;
  event: string;
  detail: Record<string, unknown> | null;
  created_at: string;
};

export function crmGetAutoGreetingSettings() {
  return inboxGet<{
    data: CrmAutoGreetingSettings | null;
    defaults: { grade_options: { key: string; label: string }[]; call_slots: string[] };
    institution_id: string;
  }>('auto_greeting_settings');
}

export function crmSaveAutoGreetingSettings(patch: Partial<CrmAutoGreetingSettings>) {
  return inboxPost<{ ok: boolean; data: CrmAutoGreetingSettings }>(
    'save_auto_greeting_settings',
    patch as Record<string, unknown>
  );
}

export function crmAutoGreetingLogs(limit = 50) {
  return inboxGet<{ data: CrmAutoGreetingLog[] }>('auto_greeting_logs', { limit: String(limit) });
}

export type CrmAutoFlowState = {
  step: string;
  grade_program: string | null;
  call_slot: string | null;
  call_date: string | null;
  human_takeover_at: string | null;
  completed_at: string | null;
} | null;

export function crmAutoFlowState(conversationId: string) {
  return inboxGet<{ data: CrmAutoFlowState }>('auto_flow_state', { conversation_id: conversationId });
}

export function crmResumeAutoFlow(conversationId: string) {
  return inboxPost<{ ok: boolean }>('resume_auto_flow', { conversation_id: conversationId });
}

/** Öğretmen Başvuru Otomasyonu — hazır şablon ve manuel gönderim */
export function crmTeacherFlowTemplate() {
  return inboxGet<{
    data: { text: string; has_url: boolean; statuses: { key: string; label: string }[] };
  }>('teacher_flow_template');
}

export function crmSendTeacherTemplate(conversationId: string, text?: string) {
  return inboxPost<{ ok: boolean; data: { text: string } }>('send_teacher_template', {
    conversation_id: conversationId,
    ...(text ? { text } : {})
  });
}
