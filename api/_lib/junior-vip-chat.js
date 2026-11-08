import { juniorVipLocalIntent } from './junior-vip-local-intent.js';
import { juniorVipNavForPanel, navPathAllowed } from './junior-vip-nav.js';
import { budgetedChatCompletion, juniorVipOpenAiKey } from './junior-vip-openai.js';
import { JuniorVipBudgetError } from './junior-vip-budget.js';

function parseModelJson(text) {
  try {
    const j = JSON.parse(String(text || '').trim());
    return {
      reply: String(j.reply || '').trim(),
      actions: Array.isArray(j.actions) ? j.actions : [],
      intent: typeof j.intent === 'string' ? j.intent : null,
      slots: j.slots && typeof j.slots === 'object' ? j.slots : null
    };
  } catch {
    return null;
  }
}

export function sanitizeActions(actions, nav) {
  const out = [];
  for (const a of actions || []) {
    if (!a || a.type !== 'navigate') continue;
    const path = String(a.path || '').trim();
    if (!navPathAllowed(nav, path)) continue;
    out.push({ type: 'navigate', path, label: String(a.label || '').trim() || path });
  }
  return out.slice(0, 3);
}

const PANEL_LABEL = { student: 'öğrenci', coach: 'koç', teacher: 'öğretmen' };

/** Bağlamı modele gönderilecek boyuta indirir (maliyet + kişisel veri azaltımı). */
function compactContext(ctx) {
  const c = { ...(ctx || {}) };
  c.nav = (c.nav || []).map((n) => ({ label: n.label, path: n.path }));
  if (Array.isArray(c.students)) c.students = c.students.slice(0, 40).map((s) => ({ name: s.name, week_solved_questions: s.week_solved_questions }));
  if (Array.isArray(c.week_entries_sample)) c.week_entries_sample = c.week_entries_sample.slice(0, 8);
  if (Array.isArray(c.week_planner_blocks)) c.week_planner_blocks = c.week_planner_blocks.slice(0, 12);
  if (c.student) c.student = { name: c.student.name, class_level: c.student.class_level };
  return c;
}

function systemPromptFor(panel, ctx) {
  const data = JSON.stringify(compactContext(ctx));
  if (panel === 'coach' || panel === 'teacher') {
    const who = panel === 'coach' ? 'koçu' : 'öğretmeni';
    return [
      `Sen "Junior VIP", Online VIP Dershane ${who} için panel asistanısın. Yalnızca Türkçe konuş.`,
      'Üslup: profesyonel, samimi, kısa ve net (en fazla 3-4 cümle).',
      `Kullanıcı ${PANEL_LABEL[panel]} panelinde. SADECE verilen bağlam verisini kullan; uydurma yapma.`,
      'Veride olmayan bir bilgi istenirse bunu açıkça söyle ve ilgili sayfaya yönlendir.',
      'Kayıt oluşturma, silme veya değiştirme işlemi yapamazsın; bu işlemler için ilgili sayfaya yönlendir.',
      'Çıktın TEK bir JSON nesnesi olsun (markdown yok):',
      '{ "reply": string, "actions": [{ "type":"navigate", "path": string, "label": string }] }',
      'Menü yönlendirmesinde actions içine yalnızca nav kataloğundaki path değerlerini kullan.',
      `Veri: ${data}`
    ].join('\n');
  }

  const classLevel = ctx?.student?.class_level != null ? String(ctx.student.class_level) : '';
  const n = Number(classLevel);
  const tone = Number.isFinite(n) && n <= 4 ? 'ilkokul: çok kısa, sevimli, motive edici' : 'ortaokul/lise: samimi, kısa, net';
  return [
    'Sen "Junior VIP", Online VIP Dershane öğrenci asistanısın. Yalnızca Türkçe konuş.',
    `Üslup: ${tone}. En fazla 3 cümle.`,
    'SADECE verilen öğrenci verisini kullan; uydurma yapma. Kayıt yaptığını ASLA söyleme — kayıtları sunucu yapar.',
    'Öğrenci plana çalışma eklemek, çözdüğü soruları kaydetmek ya da canlı derslerini öğrenmek istiyorsa',
    'intent alanını doldur: "add_plan" | "log_study" | "live_lessons"; bilinen alanları slots içine yaz.',
    'Emin olmadığın alanı boş bırak; saat veya sayı uydurma.',
    'Çıktın TEK bir JSON nesnesi olsun (markdown yok):',
    '{ "reply": string, "actions": [{ "type":"navigate","path":string,"label":string }], "intent": null|string,',
    '  "slots": { "subject"?: string, "topic"?: string, "quantity"?: number, "date_text"?: string, "time"?: "HH:MM" } }',
    'Menü yönlendirmesinde actions içine yalnızca nav kataloğundaki path değerlerini kullan.',
    `Veri: ${data}`
  ].join('\n');
}

function buildMessages(panel, ctx, history, userMessage) {
  const messages = [{ role: 'system', content: systemPromptFor(panel, ctx) }];
  for (const h of (history || []).slice(-6)) {
    const role = h.role === 'assistant' ? 'assistant' : 'user';
    const content = String(h.content || '').trim().slice(0, 500);
    if (content) messages.push({ role, content });
  }
  messages.push({ role: 'user', content: String(userMessage || '').slice(0, 800) });
  return messages;
}

/**
 * Serbest sohbet / niyet çıkarma için TEK ücretli çağrı (bütçe kontrollü). Model hiçbir kaydı
 * doğrudan yapamaz; döndürdüğü intent/slots sunucuda yeniden doğrulanır.
 * @returns {Promise<{ reply: string, actions: object[], intent: string|null, slots: object|null, meta: object }>}
 */
export async function juniorVipAiTurn({ userMessage, ctx, history = [], panel }) {
  const nav = juniorVipNavForPanel(panel);
  const out = await budgetedChatCompletion({ messages: buildMessages(panel, ctx, history, userMessage), panel });
  const parsed = parseModelJson(out.content);
  if (!parsed?.reply) throw new Error('invalid_model_json');
  return {
    reply: parsed.reply.slice(0, 600),
    actions: sanitizeActions(parsed.actions, nav),
    intent: panel === 'student' && ['add_plan', 'log_study', 'live_lessons'].includes(parsed.intent) ? parsed.intent : null,
    slots: panel === 'student' ? parsed.slots : null,
    meta: { engine: 'openai', model: out.model }
  };
}

/** Koç / öğretmen paneli turu: önce ücretsiz yerel niyet, gerekirse bütçeli model. */
export async function juniorVipChatTurn({ userMessage, ctx, history = [], panel: panelArg }) {
  const panel = panelArg || ctx?.panel || 'student';
  const trimmed = String(userMessage || '').trim();
  if (!trimmed) {
    return { reply: 'Merhaba! Bana yazabilir veya mikrofonla konuşabilirsin.', actions: [], meta: { engine: 'local' } };
  }

  // Ekran açma ve tarihli sorgular modelsiz çalışır
  const local = juniorVipLocalIntent(trimmed, ctx);
  if (local) return { reply: local.reply, actions: local.actions || [], meta: { engine: 'local' } };

  if (!juniorVipOpenAiKey()) {
    return {
      reply: 'Şu an zekâ motoru hazır değil. Yine de "öğrencileri aç", "bugün neler var" gibi kısa komutlarla sayfalara yönlendirebilirim.',
      actions: [],
      meta: { engine: 'local', reason: 'no_api_key' }
    };
  }
  try {
    const ai = await juniorVipAiTurn({ userMessage: trimmed, ctx, history, panel });
    return { reply: ai.reply, actions: ai.actions, meta: ai.meta };
  } catch (e) {
    if (e instanceof JuniorVipBudgetError) {
      return {
        reply: 'Bu ayın yapay zekâ kullanım sınırına ulaşıldı. Kısa komutlarla (ör. "öğrencileri aç", "bugün neler var") yine yardımcı olabilirim.',
        actions: [],
        meta: { engine: 'local', reason: 'budget', budget_reason: e.reason }
      };
    }
    throw e;
  }
}
