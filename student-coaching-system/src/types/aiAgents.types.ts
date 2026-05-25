export interface AIAgent {
  id: string;
  name: string;
  subject: string;
  grade_level?: string | null;
  description?: string | null;
  system_prompt?: string;
  model?: string;
  is_active?: boolean;
  created_by?: string | null;
  created_at?: string;
}

export interface AIAgentDocument {
  id: string;
  agent_id: string;
  title: string;
  source_type: string;
  page_count?: number | null;
  total_chunks?: number;
  total_tokens?: number;
  status: 'processing' | 'ready' | 'failed';
  error?: string | null;
  created_at: string;
}

export interface AIAgentConversation {
  id: string;
  agent_id: string;
  title?: string | null;
  message_count: number;
  last_message_at?: string | null;
  created_at: string;
}

export interface AIAgentMessage {
  id: number;
  role: 'system' | 'user' | 'assistant';
  content: string;
  image_url?: string | null;
  citations?: Array<{ document_id: string; page_no?: number | null; score: number; preview: string }> | null;
  model?: string | null;
  prompt_tokens?: number;
  completion_tokens?: number;
  cost_usd?: number;
  created_at: string;
}

export interface AIAgentUsageSelf {
  used: number;
  limit: number;
  remaining: number;
}

export interface AIUsageSummary {
  month: string;
  totalCost: number;
  totalTokens: number;
  totalChats: number;
  budget_usd: number;
  byAgent: Array<{ agent_id: string; cost: number; tokens: number; calls: number }>;
  byUser: Array<{ user_id: string; cost: number; tokens: number; calls: number }>;
}
