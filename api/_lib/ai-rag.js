/**
 * AI Ders Ajanları için RAG yardımcıları:
 *  - OpenAI embedding (text-embedding-3-small)
 *  - pgvector kosinüs benzerlik araması (Supabase RPC veya yerel cosine)
 *  - Chat completion (text + vision)
 *  - Token + maliyet hesaplama
 */
import { supabaseAdmin } from './supabase-admin.js';

const EMBED_MODEL = 'text-embedding-3-small';
const EMBED_DIM = 1536;

/** OpenAI fiyat tablosu (USD / 1M token) — referans, değişebilir */
const PRICING = {
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4-turbo': { input: 10.0, output: 30.0 },
  'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
  'text-embedding-3-small': { input: 0.02, output: 0 },
  'text-embedding-3-large': { input: 0.13, output: 0 }
};

export function resolveOpenAIKey() {
  return (process.env.OPENAI_API_KEY || process.env.OPEN_API_KEY || '').trim();
}

export function isOpenAIConfigured() {
  return Boolean(resolveOpenAIKey());
}

export function costFor(model, promptTokens, completionTokens) {
  const p = PRICING[model] || PRICING['gpt-4o-mini'];
  const inUsd = ((promptTokens || 0) / 1_000_000) * p.input;
  const outUsd = ((completionTokens || 0) / 1_000_000) * p.output;
  return Number((inUsd + outUsd).toFixed(6));
}

/** Basit chunk: ~800 token / 400 token örtüşme yaklaşımı (4 char ≈ 1 token kural-i-başi) */
const CHUNK_CHAR_TARGET = 3200;
const CHUNK_CHAR_OVERLAP = 600;

export function chunkPages(pages) {
  /** pages: [{ page, text }] */
  const chunks = [];
  for (const page of pages || []) {
    const text = String(page?.text || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    if (text.length <= CHUNK_CHAR_TARGET) {
      chunks.push({ page: page.page, content: text });
      continue;
    }
    let start = 0;
    let idx = 0;
    while (start < text.length) {
      const end = Math.min(start + CHUNK_CHAR_TARGET, text.length);
      chunks.push({ page: page.page, content: text.slice(start, end), sub: idx });
      if (end >= text.length) break;
      start = end - CHUNK_CHAR_OVERLAP;
      idx += 1;
    }
  }
  return chunks;
}

/** OpenAI Embeddings — toplu çağrı; her parti < 100 girdi */
export async function embedTexts(texts) {
  const apiKey = resolveOpenAIKey();
  if (!apiKey) throw new Error('openai_api_key_missing');
  if (!texts.length) return { vectors: [], usage: { prompt_tokens: 0, total_tokens: 0 } };

  const BATCH = 64;
  const vectors = [];
  let totalTokens = 0;

  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({ model: EMBED_MODEL, input: batch })
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`embedding_failed: ${res.status} ${body.slice(0, 200)}`);
    }
    const j = await res.json();
    for (const row of j.data || []) {
      const v = row.embedding;
      if (!Array.isArray(v) || v.length !== EMBED_DIM) {
        throw new Error(`embedding_dimension_unexpected: got ${v?.length}`);
      }
      vectors.push(v);
    }
    totalTokens += j.usage?.total_tokens || 0;
  }
  return {
    vectors,
    usage: { prompt_tokens: totalTokens, total_tokens: totalTokens }
  };
}

/** pgvector RPC yerine yerel cosine: küçük setlerde yeterli; büyük setlerde RPC eklenebilir */
function cosineSim(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
}

/** Benzer chunkları çek — Supabase doğrudan pgvector seçim için RPC gerekir;
 *  burada güvenli yol: agent_id ile tüm chunkları çek (üst limit 5000), client'ta sırala. */
export async function searchSimilarChunks(agentId, queryVec, topK = 6) {
  const { data, error } = await supabaseAdmin
    .from('ai_agent_chunks')
    .select('id, document_id, page_no, content, embedding')
    .eq('agent_id', agentId)
    .limit(5000);
  if (error) throw error;
  const scored = [];
  for (const row of data || []) {
    if (!row.embedding) continue;
    const vec = Array.isArray(row.embedding) ? row.embedding : JSON.parse(row.embedding);
    if (!vec || vec.length !== EMBED_DIM) continue;
    scored.push({ ...row, embedding: undefined, score: cosineSim(queryVec, vec) });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

/** Chat completion: text + opsiyonel görsel (data URL veya https URL) */
export async function chatCompletion({
  model,
  systemPrompt,
  contextSnippets,
  history,
  userText,
  imageUrl
}) {
  const apiKey = resolveOpenAIKey();
  if (!apiKey) throw new Error('openai_api_key_missing');

  const ctxBlock =
    contextSnippets && contextSnippets.length
      ? `\n\n--- KAYNAK ALINTILARI (öncelikle bunları kullan) ---\n${contextSnippets
          .map(
            (c, i) =>
              `[${i + 1}] (sayfa ${c.page_no ?? '?'}) ${String(c.content).slice(0, 1200)}`
          )
          .join('\n\n')}\n--- KAYNAK SONU ---\nKaynakta yanıt yoksa açıkça belirt ve genel bilgi olarak yanıtla.`
      : '\n\n(Bu ajan için henüz yüklenmiş döküman yok; genel bilgi kullan.)';

  const messages = [{ role: 'system', content: (systemPrompt || '') + ctxBlock }];

  for (const m of history || []) {
    messages.push({ role: m.role, content: m.content });
  }

  if (imageUrl) {
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: userText || 'Bu görseldeki soruyu çöz.' },
        { type: 'image_url', image_url: { url: imageUrl } }
      ]
    });
  } else {
    messages.push({ role: 'user', content: userText });
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model || 'gpt-4o-mini',
      messages,
      temperature: 0.3
    })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`chat_failed: ${res.status} ${body.slice(0, 300)}`);
  }
  const j = await res.json();
  const choice = j.choices?.[0]?.message?.content || '';
  return {
    content: choice,
    usage: j.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    model: j.model || model
  };
}
