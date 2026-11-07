import { juniorVipLocalIntent } from './junior-vip-local-intent.js';
import { juniorVipNavForPanel, navPathAllowed } from './junior-vip-nav.js';

function safeOpenAiModel() {
  return 'gpt-4o-mini';
}

function parseModelJson(text) {
  try {
    const j = JSON.parse(String(text || '').trim());
    return {
      reply: String(j.reply || '').trim(),
      actions: Array.isArray(j.actions) ? j.actions : [],
      proposed_study_log: j.proposed_study_log || null
    };
  } catch {
    return null;
  }
}

function sanitizeActions(actions, nav) {
  const out = [];
  for (const a of actions || []) {
    if (!a || a.type !== 'navigate') continue;
    const path = String(a.path || '').trim();
    if (!navPathAllowed(nav, path)) continue;
    out.push({ type: 'navigate', path, label: String(a.label || '').trim() || path });
  }
  return out.slice(0, 3);
}

function sanitizeStudyLog(raw, today) {
  if (!raw || typeof raw !== 'object') return null;
  const subject = String(raw.subject || '').trim().slice(0, 80);
  const topic = String(raw.topic || '').trim().slice(0, 120);
  const solved = Math.round(Number(raw.solved_questions) || 0);
  if (!subject || !topic || solved < 1 || solved > 500) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(raw.date || '')) ? String(raw.date) : today;
  return {
    date,
    subject,
    topic,
    solved_questions: solved,
    target_questions: Math.round(Number(raw.target_questions) || solved) || solved,
    correct: Math.max(0, Math.round(Number(raw.correct) || 0)),
    wrong: Math.max(0, Math.round(Number(raw.wrong) || 0)),
    blank: Math.max(0, Math.round(Number(raw.blank) || 0))
  };
}

const PANEL_LABEL = { student: 'öğrenci', coach: 'koç', teacher: 'öğretmen' };

function systemPromptFor(panel, ctx) {
  if (panel === 'coach' || panel === 'teacher') {
    const who = panel === 'coach' ? 'koçu' : 'öğretmeni';
    return [
      `Sen "Junior VIP", Online VIP Dershane ${who} için panel asistanısın. Yalnızca Türkçe konuş.`,
      'Üslup: profesyonel, samimi, kısa ve net (en fazla 3-4 cümle).',
      `Kullanıcı ${PANEL_LABEL[panel]} panelinde. SADECE verilen bağlam verisini kullan; uydurma yapma.`,
      'Veride olmayan bir bilgi istenirse bunu açıkça söyle ve ilgili sayfaya yönlendir.',
      'Kayıt oluşturma, silme veya değiştirme işlemi yapamazsın; bu işlemler için ilgili sayfaya yönlendir.',
      'Çıktın TEK bir JSON nesnesi olsun (markdown yok):',
      '{ "reply": string, "actions": [{ "type":"navigate", "path": string, "label": string }], "proposed_study_log": null }',
      'Menü yönlendirmesinde actions içine yalnızca nav kataloğundaki path değerlerini kullan.',
      'nav kataloğu ve veri:',
      JSON.stringify(ctx)
    ].join('\n');
  }

  const classLevel = ctx?.student?.class_level != null ? String(ctx.student.class_level) : '';
  const tone =
    Number(classLevel) <= 4 || classLevel === '1' || classLevel === '2' || classLevel === '3' || classLevel === '4'
      ? 'ilkokul: çok kısa, sevimli, motive edici cümleler'
      : 'ortaokul/lise: samimi, kısa, net';

  return [
    'Sen "Junior VIP", Online VIP Dershane öğrenci asistanısın. Yalnızca Türkçe konuş.',
    `Üslup: ${tone}.`,
    'SADECE verilen öğrenci verisini kullan; uydurma yapma.',
    'Çıktın TEK bir JSON nesnesi olsun (markdown yok):',
    '{ "reply": string, "actions": [{ "type":"navigate", "path": string, "label": string }], "proposed_study_log": null | { "date":"YYYY-MM-DD", "subject", "topic", "solved_questions", "target_questions", "correct", "wrong", "blank" } }',
    'Öğrenci çalışma kaydı önerirken proposed_study_log doldur; kayıt için öğrenci onayı şart — reply içinde onay iste.',
    'Menü yönlendirmesinde actions içine nav.path kullan.',
    'nav kataloğu ve veri:',
    JSON.stringify(ctx)
  ].join('\n');
}

export async function juniorVipChatTurn({ userMessage, ctx, history = [], panel: panelArg }) {
  const panel = panelArg || ctx?.panel || 'student';
  const nav = juniorVipNavForPanel(panel);
  const trimmed = String(userMessage || '').trim();
  if (!trimmed) {
    return { reply: 'Merhaba! Bana yazabilir veya mikrofonla konuşabilirsin.', actions: [], proposed_study_log: null };
  }

  const apiKey = (process.env.OPENAI_API_KEY || process.env.OPEN_API_KEY || '').trim();
  if (!apiKey) {
    const local = juniorVipLocalIntent(trimmed, ctx);
    if (local) return { ...local, meta: { engine: 'local' } };
    return {
      reply:
        panel === 'student'
          ? 'Şu an zekâ motoru hazır değil (sunucu anahtarı yok). Yine de menüden Akademik Merkez ve Haftalık plana gidebilirsin. Biraz sonra tekrar dene!'
          : 'Şu an zekâ motoru hazır değil (sunucu anahtarı yok). Yine de "öğrencileri aç", "bugün neler var" gibi kısa komutlarla sayfalara yönlendirebilirim.',
      actions: [],
      proposed_study_log: null,
      meta: { engine: 'local', reason: 'no_api_key' }
    };
  }

  const system = systemPromptFor(panel, ctx);

  const messages = [{ role: 'system', content: system }];
  for (const h of (history || []).slice(-8)) {
    const role = h.role === 'assistant' ? 'assistant' : 'user';
    const content = String(h.content || '').trim();
    if (content) messages.push({ role, content });
  }
  messages.push({ role: 'user', content: trimmed });

  const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: safeOpenAiModel(),
      temperature: 0.35,
      response_format: { type: 'json_object' },
      messages
    })
  });

  const payload = await aiResponse.json().catch(() => ({}));
  if (!aiResponse.ok) {
    const local = juniorVipLocalIntent(trimmed, ctx);
    if (local) return { ...local, meta: { engine: 'local', reason: 'openai_error' } };
    const errMsg = payload?.error?.message || `HTTP ${aiResponse.status}`;
    throw new Error(String(errMsg));
  }

  const content = payload?.choices?.[0]?.message?.content;
  const parsed = parseModelJson(content);
  if (!parsed?.reply) {
    const local = juniorVipLocalIntent(trimmed, ctx);
    if (local) return { ...local, meta: { engine: 'local' } };
    throw new Error('invalid_model_json');
  }

  return {
    reply: parsed.reply,
    actions: sanitizeActions(parsed.actions, nav),
    proposed_study_log: panel === 'student' ? sanitizeStudyLog(parsed.proposed_study_log, ctx?.today) : null,
    meta: { engine: 'openai', model: safeOpenAiModel() }
  };
}
