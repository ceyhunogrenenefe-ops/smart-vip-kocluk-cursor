import { apiFetch } from '../session';
import type {
  AIAgent,
  AIAgentConversation,
  AIAgentDocument,
  AIAgentMessage,
  AIAgentUsageSelf,
  AIUsageSummary
} from '../../types/aiAgents.types';

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await apiFetch(url, { method: 'POST', body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `request_failed_${res.status}`);
  return data as T;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await apiFetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `request_failed_${res.status}`);
  return data as T;
}

/* AJAN */
export const listAgents = () => getJson<{ data: AIAgent[] }>('/api/ai-agents?op=list').then((r) => r.data);

export const createAgent = (payload: Partial<AIAgent>) =>
  postJson<{ data: AIAgent }>('/api/ai-agents?op=create', payload).then((r) => r.data);

export const updateAgent = (payload: Partial<AIAgent> & { id: string }) =>
  postJson<{ data: AIAgent }>('/api/ai-agents?op=update', payload).then((r) => r.data);

export const deleteAgent = (id: string) =>
  postJson<{ ok: boolean }>('/api/ai-agents?op=delete', { id });

/* DÖKÜMAN */
export const listDocuments = (agentId: string) =>
  getJson<{ data: AIAgentDocument[] }>(
    `/api/ai-agents?op=documents&agent_id=${encodeURIComponent(agentId)}`
  ).then((r) => r.data);

export const initDocument = (payload: {
  agent_id: string;
  title: string;
  file_hash?: string;
  page_count?: number;
}) => postJson<{ data: AIAgentDocument }>('/api/ai-agents?op=document-init', payload).then((r) => r.data);

export const uploadDocumentChunks = (payload: {
  document_id: string;
  pages: { page: number; text: string }[];
}) =>
  postJson<{
    ok: boolean;
    inserted: number;
    total_chunks: number;
    embedding_tokens: number;
    cost_usd: number;
  }>('/api/ai-agents?op=document-chunks', payload);

export const finalizeDocument = (payload: { document_id: string; error?: string }) =>
  postJson<{ ok: boolean; status: string }>('/api/ai-agents?op=document-finalize', payload);

export const deleteDocument = (documentId: string) =>
  postJson<{ ok: boolean }>('/api/ai-agents?op=document-delete', { document_id: documentId });

/* SOHBET */
export const listConversations = () =>
  getJson<{ data: AIAgentConversation[] }>('/api/ai-agents?op=conversations').then((r) => r.data);

export const listMessages = (conversationId: string) =>
  getJson<{ data: AIAgentMessage[] }>(
    `/api/ai-agents?op=messages&conversation_id=${encodeURIComponent(conversationId)}`
  ).then((r) => r.data);

export const sendChat = (payload: {
  agent_id: string;
  text?: string;
  conversation_id?: string;
  image_base64?: string;
  image_mime?: string;
}) =>
  postJson<{
    ok: boolean;
    conversation_id: string;
    answer: string;
    model: string;
    citations: AIAgentMessage['citations'];
    usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    cost_usd: number;
  }>('/api/ai-agents?op=chat', payload);

/* KULLANIM */
export const getMyUsage = () =>
  getJson<AIAgentUsageSelf>('/api/ai-agents?op=usage');

export const getUsageSummary = (month?: string) =>
  getJson<AIUsageSummary>(
    `/api/ai-agents?op=usage-summary${month ? `&month=${encodeURIComponent(month)}` : ''}`
  );

export const getAiSettings = () =>
  getJson<{ data: { studentMonthlyChatLimit: number; monthlyUsdBudget: number } }>(
    '/api/ai-agents?op=settings'
  ).then((r) => r.data);

export const updateAiSettings = (payload: {
  student_monthly_chat_limit?: number;
  monthly_usd_budget?: number;
}) => postJson<{ ok: boolean }>('/api/ai-agents?op=settings', payload);
