/**
 * Junior VIP — OpenAI çağrıları YALNIZ bu modülden yapılır; her çağrı bütçe ayırma + mutabakattan geçer.
 * Otomatik yeniden deneme YOKTUR (yeniden denemeler bütçeyi aşamaz). Çıktı uzunluğu sınırlıdır.
 *
 * Anahtar: JUNIOR_VIP_OPENAI_API_KEY (önerilen: ayrı OpenAI projesi + proje sabit harcama limiti)
 *          yoksa OPENAI_API_KEY / OPEN_API_KEY. Anahtar istemciye hiç gönderilmez.
 */
import {
  chatCostUsd,
  estimateMaxInputTokens,
  JuniorVipBudgetError,
  maxAudioSecondsForBytes,
  releaseBudget,
  reserveBudget,
  settleBudget,
  transcribeCostUsd
} from './junior-vip-budget.js';

export const JV_CHAT_MODEL = () => String(process.env.JUNIOR_VIP_CHAT_MODEL || 'gpt-4o-mini').trim();
export const JV_TRANSCRIBE_MODEL = () => String(process.env.JUNIOR_VIP_TRANSCRIBE_MODEL || 'whisper-1').trim();
export const JV_MAX_OUTPUT_TOKENS = 320;
const CHAT_TIMEOUT_MS = 20000;
const TRANSCRIBE_TIMEOUT_MS = 30000;

export function juniorVipOpenAiKey() {
  return (
    process.env.JUNIOR_VIP_OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.OPEN_API_KEY ||
    ''
  ).trim();
}

function spendLimitCode(payload) {
  const c = String(payload?.error?.code || payload?.error?.type || '');
  return /spend_limit_exceeded|insufficient_quota|billing_hard_limit/.test(c) ? c : '';
}

async function fetchWithTimeout(url, init, ms) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

/**
 * @returns {Promise<{ content: string, usage: { prompt_tokens: number, completion_tokens: number }, cost_usd: number }>}
 */
export async function budgetedChatCompletion({ messages, panel = null, maxTokens = JV_MAX_OUTPUT_TOKENS, json = true }) {
  const key = juniorVipOpenAiKey();
  if (!key) throw new JuniorVipBudgetError('no_api_key');
  const model = JV_CHAT_MODEL();
  const outCap = Math.min(Math.max(32, maxTokens), JV_MAX_OUTPUT_TOKENS);
  const maxIn = estimateMaxInputTokens(messages);
  const maxCost = chatCostUsd(model, maxIn, outCap);
  if (maxCost == null) throw new JuniorVipBudgetError('unknown_model_price', { model });

  const reservation = await reserveBudget({ service: 'chat', model, amountUsd: maxCost, panel });
  let res;
  try {
    res = await fetchWithTimeout(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          temperature: 0.3,
          max_tokens: outCap,
          ...(json ? { response_format: { type: 'json_object' } } : {}),
          messages
        })
      },
      CHAT_TIMEOUT_MS
    );
  } catch (e) {
    // Sonuç bilinmiyor: rezerve tutar harcanmış sayılır
    await settleBudget(reservation.id, { actualUsd: null, errorCode: 'network' });
    throw new Error(`openai_network: ${e?.message || e}`);
  }
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Başarısız istekler OpenAI'de ücretlendirilmez
    await settleBudget(reservation.id, { actualUsd: 0, errorCode: `http_${res.status}` });
    if (spendLimitCode(payload)) throw new JuniorVipBudgetError('provider_spend_limit');
    throw new Error(payload?.error?.message || `openai_http_${res.status}`);
  }
  const usage = payload?.usage || {};
  const inTok = Number(usage.prompt_tokens) || 0;
  const outTok = Number(usage.completion_tokens) || 0;
  const actual = chatCostUsd(model, inTok, outTok);
  await settleBudget(reservation.id, { actualUsd: actual, inputTokens: inTok, outputTokens: outTok });
  return {
    content: String(payload?.choices?.[0]?.message?.content || ''),
    usage: { prompt_tokens: inTok, completion_tokens: outTok },
    cost_usd: actual,
    model
  };
}

/** Ses → metin. Azami süre bayt boyutundan hesaplanıp ayrılır; gerçek süre ile mutabakat yapılır. */
export async function budgetedTranscribe({ buf, mime, name, panel = null }) {
  const key = juniorVipOpenAiKey();
  if (!key) throw new JuniorVipBudgetError('no_api_key');
  const model = JV_TRANSCRIBE_MODEL();
  const maxSeconds = maxAudioSecondsForBytes(buf.length);
  const maxCost = transcribeCostUsd(model, maxSeconds);
  if (maxCost == null) throw new JuniorVipBudgetError('unknown_model_price', { model });

  const reservation = await reserveBudget({ service: 'transcribe', model, amountUsd: maxCost, panel });
  const form = new FormData();
  form.append('file', new Blob([buf], { type: mime }), name);
  form.append('model', model);
  form.append('language', 'tr');
  // whisper-1: verbose_json gerçek süreyi döndürür (mutabakat için)
  form.append('response_format', model === 'whisper-1' ? 'verbose_json' : 'json');

  let res;
  try {
    res = await fetchWithTimeout(
      'https://api.openai.com/v1/audio/transcriptions',
      { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form },
      TRANSCRIBE_TIMEOUT_MS
    );
  } catch (e) {
    await settleBudget(reservation.id, { actualUsd: null, errorCode: 'network' });
    const err = new Error(`whisper_network: ${e?.message || e}`);
    err.code = 'whisper_failed';
    throw err;
  }
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    await settleBudget(reservation.id, { actualUsd: 0, errorCode: `http_${res.status}` });
    if (spendLimitCode(payload)) throw new JuniorVipBudgetError('provider_spend_limit');
    const err = new Error(payload?.error?.message || `whisper_${res.status}`);
    err.code = 'whisper_failed';
    throw err;
  }
  const duration = Number(payload?.duration);
  if (Number.isFinite(duration) && duration > 0) {
    await settleBudget(reservation.id, {
      actualUsd: transcribeCostUsd(model, duration),
      audioSeconds: Math.round(duration * 100) / 100
    });
  } else {
    // Süre bilinmiyor → azami tutar harcanmış sayılır (güvenli taraf)
    await settleBudget(reservation.id, { actualUsd: null, errorCode: 'duration_unknown' });
  }
  return String(payload?.text || '').trim();
}

export { releaseBudget };
