import { apiFetch } from './session';
import { crmInstitutionScope } from './crmInboxApi';

/** AI Satış Asistanı — /api/crm-ai-assistant */

export type AiScheduleRange = { start: string; end: string };
export type AiSchedule = Record<string, AiScheduleRange[]>;

export type AiAssistantSettings = {
  institution_id: string;
  is_active: boolean;
  channel_whatsapp: boolean;
  channel_instagram: boolean;
  primary_ig_only: boolean;
  schedule: AiSchedule;
  model: string;
  effort: string;
  kvkk_url: string | null;
  site_urls: string[];
  consultant_user_ids: string[];
  slot_minutes: number;
  days_ahead: number;
  min_lead_minutes: number;
  max_bot_replies: number;
  debounce_seconds: number;
  extra_instructions: string | null;
  tone_guide: string | null;
  tone_guide_updated_at: string | null;
  table_missing?: boolean;
};

export type AiSettingsResponse = {
  data: AiAssistantSettings;
  claude_configured: boolean;
  defaults: {
    site_urls: string[];
    kvkk_url: string;
    schedule: AiSchedule;
    models: string[];
    efforts: string[];
    kvkk_notice: string;
  };
};

export type AiKbPage = {
  id: string;
  url: string;
  title: string | null;
  status: string;
  error: string | null;
  fetched_at: string;
  chars: number;
  preview: string;
};

export type AiToneSource = {
  id: string;
  file_name: string | null;
  source_kind: string | null;
  message_count: number;
  excerpt: string | null;
  created_at: string;
};

export type AiConsultant = {
  user_id: string;
  name: string;
  shifts: { day_of_week: number; start_time: string; end_time: string }[];
};

export type AiSlot = { start_iso: string; label: string; user_ids: string[] };

export type AiLog = {
  id: string;
  conversation_id: string | null;
  lead_id: string | null;
  event: string;
  detail: Record<string, unknown> | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: string;
};

export type AiChatTurn = { role: 'user' | 'assistant'; text: string };

export type AiTestResult = {
  reply: string;
  stop_reason: string;
  tools: { tool: string; input: unknown }[];
  kvkk_notice: string | null;
};

export type AiConversationState = {
  data: {
    state: 'active' | 'handover' | 'completed';
    summary: string | null;
    collected: Record<string, unknown> | null;
    bot_reply_count: number;
    appointment_at: string | null;
    handover_at: string | null;
    handover_reason: string | null;
  } | null;
  module_active: boolean;
};

async function aiGet<T>(op: string, params: Record<string, string | undefined> = {}) {
  const sp = new URLSearchParams({ op });
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const scope = crmInstitutionScope();
  if (scope && !sp.get('institution_id')) sp.set('institution_id', scope);
  const res = await apiFetch(`/api/crm-ai-assistant?${sp}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message || json?.hint || json?.error || `ai_${op}_failed`);
  return json as T;
}

async function aiPost<T>(op: string, body: Record<string, unknown> = {}) {
  const scope = crmInstitutionScope();
  const res = await apiFetch(`/api/crm-ai-assistant?op=${encodeURIComponent(op)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op, ...(scope ? { institution_id: scope } : {}), ...body })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message || json?.hint || json?.error || `ai_${op}_failed`);
  return json as T;
}

export const aiGetSettings = () => aiGet<AiSettingsResponse>('settings');
export const aiSaveSettings = (settings: Partial<AiAssistantSettings>) =>
  aiPost<{ ok: boolean; data: AiAssistantSettings }>('save_settings', { settings });
export const aiKbPages = () => aiGet<{ data: AiKbPage[]; table_missing?: boolean }>('kb_pages');
export const aiKbRefresh = () => aiPost<{ ok: boolean; data: { ok: number; failed: number } }>('kb_refresh');
export const aiToneSources = () => aiGet<{ data: AiToneSource[] }>('tone_sources');
export const aiToneUpload = (fileName: string, content: string, businessAuthor?: string) =>
  aiPost<{ ok: boolean; data: AiToneSource & { business_author: string } }>('tone_upload', {
    file_name: fileName,
    content,
    business_author: businessAuthor || ''
  });
export const aiToneDelete = (id: string) => aiPost<{ ok: boolean }>('tone_delete', { id });
export const aiToneRebuild = () => aiPost<{ ok: boolean; data: { tone_guide: string } }>('tone_rebuild');
export const aiConsultants = () => aiGet<{ data: AiConsultant[] }>('consultants');
export const aiSlotsPreview = () => aiGet<{ data: AiSlot[] }>('slots_preview');
export const aiTestChat = (turns: AiChatTurn[]) => aiPost<{ ok: boolean; data: AiTestResult }>('test_chat', { turns });
export const aiLogs = (limit = 60) => aiGet<{ data: AiLog[] }>('logs', { limit: String(limit) });
export const aiConversationState = (conversationId: string) =>
  aiGet<AiConversationState>('state', { conversation_id: conversationId });
export const aiHandover = (conversationId: string) => aiPost<{ ok: boolean }>('handover', { conversation_id: conversationId });
export const aiResume = (conversationId: string) => aiPost<{ ok: boolean }>('resume', { conversation_id: conversationId });

/** Hazır cevap: bu mesajlardan biri gelince model çağrılmadan bu cevap gider. */
export type AiQuickAnswer = {
  id: string;
  patterns: string[];
  answer: string;
  first_message_only: boolean;
  is_active: boolean;
  hit_count: number;
  last_hit_at: string | null;
  updated_at: string;
};

export const aiQuickAnswers = () => aiGet<{ data: AiQuickAnswer[]; table_missing?: boolean }>('quick_answers');
export const aiQuickAnswerSave = (row: Partial<AiQuickAnswer>) =>
  aiPost<{ ok: boolean; data: AiQuickAnswer }>('quick_answer_save', row as Record<string, unknown>);
export const aiQuickAnswerDelete = (id: string) => aiPost<{ ok: boolean }>('quick_answer_delete', { id });
