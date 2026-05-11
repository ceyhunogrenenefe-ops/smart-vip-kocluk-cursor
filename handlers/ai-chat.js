import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { handleAiExamAnalyze } from '../api/_lib/ai-exam-analyze.js';

function parseBody(req) {
  const b = req.body;
  if (b && typeof b === 'object') return b;
  if (typeof b === 'string') {
    try {
      return JSON.parse(b || '{}');
    } catch {
      return {};
    }
  }
  return {};
}

function normalizeRole(role) {
  return String(role || '')
    .toLowerCase()
    .trim();
}

function canUseAiChat(actor) {
  const r = normalizeRole(actor.role);
  return r === 'admin' || r === 'super_admin' || r === 'coach';
}

/** Model adı enjeksiyonuna karşı sıkı whitelist */
function safeOpenAiModel(raw) {
  const s = String(raw || '').trim();
  const allowed = new Set([
    'gpt-4o-mini',
    'gpt-4o',
    'gpt-4-turbo',
    'gpt-4',
    'gpt-3.5-turbo',
    'o1-mini',
    'o1-preview'
  ]);
  if (allowed.has(s)) return s;
  return 'gpt-4o-mini';
}

async function handleAiChatPost(req, res, body) {
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) {
    return res.status(400).json({ error: 'prompt is required' });
  }

  const studentContext = typeof body.studentContext === 'string' ? body.studentContext.trim() : '';
  const model = safeOpenAiModel(body.model);

  const serverKey = (process.env.OPENAI_API_KEY || process.env.OPEN_API_KEY || '').trim();
  const clientKey =
    typeof body.openai_api_key === 'string' && body.openai_api_key.trim().length >= 20
      ? body.openai_api_key.trim()
      : '';
  /** Önce sunucu ortamı; yoksa (BYOK) istek gövdesindeki anahtar — yalnızca kimliği doğrulanmış koç/admin */
  const apiKey = serverKey || clientKey;

  if (!apiKey) {
    const fallbackContent = [
      'AI servisi şu an kullanılamıyor (OpenAI API anahtarı tanımlı değil).',
      '',
      'Seçenekler:',
      '• Vercel / sunucu ortamına OPENAI_API_KEY ekleyin, veya',
      '• Ayarlar sayfasında tarayıcı için API anahtarı kaydedin (BYOK).'
    ].join('\n');
    return res.status(200).json({ content: fallbackContent, meta: { reason: 'no_api_key' } });
  }

  const systemPrompt =
    'Sen bir eğitim koçu asistanısın. Türkçe cevap ver. Cevapların net, uygulanabilir ve öğrenci odaklı olsun.';
  const userPrompt = ['Öğrenci bağlamı:', studentContext || 'Bağlam yok', '', 'Kullanıcının sorusu:', prompt].join(
    '\n'
  );

  const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })
  });

  const payload = await aiResponse.json().catch(() => ({}));
  if (!aiResponse.ok) {
    const errMsg = payload?.error?.message || payload?.error || `HTTP ${aiResponse.status}`;
    return res.status(502).json({ error: String(errMsg) });
  }

  const content = payload?.choices?.[0]?.message?.content;
  return res.status(200).json({ content: content || 'Yanıt üretilemedi.', meta: { model } });
}

export default async function handler(req, res) {
  const sidRaw = req.query?.student_id;
  const sid = Array.isArray(sidRaw) ? sidRaw[0] : sidRaw;
  const scopeRaw = req.query?.scope;
  const scopeStr = String((Array.isArray(scopeRaw) ? scopeRaw[0] : scopeRaw) || '').trim();

  if (req.method === 'GET' && scopeStr === 'openai-status') {
    let actor;
    try {
      actor = requireAuthenticatedActor(req);
    } catch {
      return res.status(401).json({ error: 'Missing token' });
    }
    if (!canUseAiChat(actor)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    const k = (process.env.OPENAI_API_KEY || process.env.OPEN_API_KEY || '').trim();
    return res.status(200).json({
      data: {
        server_configured: Boolean(k)
      }
    });
  }

  if (req.method === 'GET' && String(sid || '').trim()) {
    return handleAiExamAnalyze(req, res);
  }

  if (req.method === 'POST') {
    const body = parseBody(req);
    if (body.op === 'analyze_exam' || body.analyze_exam === true) {
      return handleAiExamAnalyze(req, res);
    }

    let actor;
    try {
      actor = requireAuthenticatedActor(req);
    } catch {
      return res.status(401).json({ error: 'Missing token' });
    }
    if (!canUseAiChat(actor)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    return handleAiChatPost(req, res, body);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
