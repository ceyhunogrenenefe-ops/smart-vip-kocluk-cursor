import { supabaseAdmin } from './supabase-admin.js';
import { costFor } from './ai-rag.js';

function istanbulMonth() {
  const tz = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit'
  }).format(new Date());
  return tz.replace('-', '-').slice(0, 7);
}

export async function logUsage({
  agentId,
  userId,
  operation,
  model,
  promptTokens,
  completionTokens
}) {
  const cost = costFor(model, promptTokens, completionTokens);
  const total = (promptTokens || 0) + (completionTokens || 0);
  try {
    await supabaseAdmin.from('ai_usage_logs').insert({
      agent_id: agentId || null,
      user_id: userId || null,
      operation,
      model: model || null,
      prompt_tokens: promptTokens || 0,
      completion_tokens: completionTokens || 0,
      total_tokens: total,
      cost_usd: cost
    });
  } catch (e) {
    console.warn('[ai-usage] log failed', e?.message || e);
  }
  return { cost_usd: cost, total_tokens: total };
}

export async function getSettings() {
  const { data } = await supabaseAdmin
    .from('ai_settings')
    .select('student_monthly_chat_limit, monthly_usd_budget')
    .eq('id', 1)
    .maybeSingle();
  return {
    studentMonthlyChatLimit: data?.student_monthly_chat_limit ?? 100,
    monthlyUsdBudget: Number(data?.monthly_usd_budget || 50)
  };
}

/** Bu öğrencinin/kullanıcının bu ay attığı chat mesaj sayısı (user role mesajı) */
export async function getMonthlyChatCount(userId) {
  if (!userId) return 0;
  const month = istanbulMonth();
  const { count } = await supabaseAdmin
    .from('ai_usage_logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('operation', 'chat')
    .eq('istanbul_month', month);
  return count || 0;
}

/** Bu ay toplam USD harcaması */
export async function getMonthlyUsd() {
  const month = istanbulMonth();
  const { data } = await supabaseAdmin
    .from('ai_usage_logs')
    .select('cost_usd')
    .eq('istanbul_month', month);
  let total = 0;
  for (const r of data || []) total += Number(r.cost_usd || 0);
  return total;
}

/** Ajan / model / kullanıcı bazında özet (admin paneli) */
export async function getUsageSummary({ month } = {}) {
  const m = month || istanbulMonth();
  const { data } = await supabaseAdmin
    .from('ai_usage_logs')
    .select('agent_id, user_id, model, operation, prompt_tokens, completion_tokens, cost_usd')
    .eq('istanbul_month', m);

  const byAgent = new Map();
  const byUser = new Map();
  let totalCost = 0;
  let totalTokens = 0;
  let totalChats = 0;

  for (const r of data || []) {
    const cost = Number(r.cost_usd || 0);
    const tok = (r.prompt_tokens || 0) + (r.completion_tokens || 0);
    totalCost += cost;
    totalTokens += tok;
    if (r.operation === 'chat') totalChats += 1;

    const a = byAgent.get(r.agent_id) || { cost: 0, tokens: 0, calls: 0 };
    a.cost += cost;
    a.tokens += tok;
    a.calls += 1;
    byAgent.set(r.agent_id, a);

    const u = byUser.get(r.user_id) || { cost: 0, tokens: 0, calls: 0 };
    u.cost += cost;
    u.tokens += tok;
    u.calls += 1;
    byUser.set(r.user_id, u);
  }

  return {
    month: m,
    totalCost: Number(totalCost.toFixed(4)),
    totalTokens,
    totalChats,
    byAgent: Array.from(byAgent.entries()).map(([id, v]) => ({ agent_id: id, ...v })),
    byUser: Array.from(byUser.entries()).map(([id, v]) => ({ user_id: id, ...v }))
  };
}
