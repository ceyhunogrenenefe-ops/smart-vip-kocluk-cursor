import { errorMessage } from '../api/_lib/error-msg.js';
import { buildJuniorVipContext } from '../api/_lib/junior-vip-context.js';
import { juniorVipChatTurn } from '../api/_lib/junior-vip-chat.js';
import { juniorVipTranscribeFromBase64 } from '../api/_lib/junior-vip-transcribe.js';
import { resolveJuniorVipScope } from '../api/_lib/junior-vip-access.js';
import { juniorVipStudentTurn } from '../api/_lib/junior-vip-assistant.js';
import { juniorVipOpenAiKey } from '../api/_lib/junior-vip-openai.js';
import { JuniorVipBudgetError, budgetOverview } from '../api/_lib/junior-vip-budget.js';
import { eventsOverview, logJuniorVipEvent } from '../api/_lib/junior-vip-events.js';
import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { assertStudentPlannerWrite, buildAccessContext } from '../api/_lib/student-access-gate.js';
import { roleSetHasSuperAdmin } from '../api/_lib/actor-roles.js';

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

/**
 * Yönetici görünümü: Junior VIP aylık bütçe (tüm kurumlar için tek havuz) + hata/geri bildirim özetleri.
 * Bütçe platform geneli olduğundan yalnız süper admin görür.
 */
async function adminOverview(req, res) {
  let ctx;
  try {
    ctx = await buildAccessContext(requireAuthenticatedActor(req));
  } catch {
    return res.status(401).json({ error: 'Missing token' });
  }
  if (!roleSetHasSuperAdmin(ctx.roleSet)) return res.status(403).json({ error: 'forbidden' });
  const month = String(req.query?.month || '').trim();
  const out = { budget: null, events: null, errors: [] };
  try {
    out.budget = await budgetOverview({ month: /^\d{4}-\d{2}$/.test(month) ? month : undefined });
  } catch (e) {
    out.errors.push({ part: 'budget', error: errorMessage(e) });
  }
  try {
    out.events = await eventsOverview({ days: 30 });
  } catch (e) {
    out.errors.push({ part: 'events', error: errorMessage(e) });
  }
  out.provider_key = juniorVipOpenAiKey()
    ? process.env.JUNIOR_VIP_OPENAI_API_KEY
      ? 'dedicated'
      : 'shared'
    : 'missing';
  return res.status(200).json(out);
}

export default async function handler(req, res) {
  const opRaw = req.query?.op;
  const op = String((Array.isArray(opRaw) ? opRaw[0] : opRaw) || '').trim();

  if (req.method === 'GET' && op === 'admin-overview') return adminOverview(req, res);

  let scope;
  try {
    const body = req.method === 'POST' ? parseBody(req) : {};
    scope = await resolveJuniorVipScope(req, body);
  } catch (e) {
    const status = e?.status || 401;
    if (status === 401) return res.status(401).json({ error: 'Missing token' });
    return res.status(status).json({
      error: e?.message || 'forbidden',
      hint: e?.hint || undefined
    });
  }

  try {
    if (req.method === 'GET' && op === 'capabilities') {
      const hasKey = Boolean(juniorVipOpenAiKey());
      return res.status(200).json({ panel: scope.panel, server_transcribe: hasKey, ai_chat: hasKey });
    }

    if (req.method === 'GET' && (op === 'context' || !op)) {
      const ctx = await buildJuniorVipContext(scope);
      return res.status(200).json({ data: ctx, panel: scope.panel });
    }

    if (req.method === 'POST' && op === 'transcribe') {
      const body = parseBody(req);
      try {
        const text = await juniorVipTranscribeFromBase64({
          audio_base64: body.audio_base64,
          mime: body.mime,
          panel: scope.panel
        });
        return res.status(200).json({ text });
      } catch (e) {
        if (e instanceof JuniorVipBudgetError) {
          void logJuniorVipEvent({ type: 'budget_blocked', intent: 'transcribe', code: e.reason, panel: scope.panel });
          return res.status(429).json({ error: 'budget_exhausted', reason: e.reason });
        }
        const code = e?.code || '';
        if (code === 'transcribe_unavailable') {
          return res.status(503).json({ error: 'transcribe_unavailable' });
        }
        if (code === 'audio_too_short') {
          return res.status(400).json({ error: 'audio_too_short' });
        }
        if (code === 'audio_too_large') {
          return res.status(413).json({ error: 'audio_too_large' });
        }
        console.error('[junior-vip] transcribe', errorMessage(e));
        return res.status(502).json({ error: e?.message || 'transcribe_failed' });
      }
    }

    if (req.method === 'POST' && (op === 'chat' || !op)) {
      const body = parseBody(req);
      const message = String(body.message || body.text || '').trim().slice(0, 1000);
      const history = Array.isArray(body.history) ? body.history.slice(-10) : [];

      if (scope.panel === 'student') {
        // Kayıt yapan araçlar için yazma yetkisi ayrıca doğrulanır (okuma yetkisi yetmez)
        const write = await assertStudentPlannerWrite(scope.accessCtx, scope.studentId);
        if (!write.ok) return res.status(write.status || 403).json({ error: 'forbidden' });
        // Öğrenci kimliği oturumdan (scope); gövdedeki student_id yalnız yetki kontrolünden geçmiş kapsamdır.
        const out = await juniorVipStudentTurn({
          scope,
          message,
          history,
          stateToken: body.state_token,
          requestId: body.request_id,
          buildContext: () => buildJuniorVipContext(scope)
        });
        return res.status(200).json({ panel: scope.panel, ...out });
      }

      const ctx = await buildJuniorVipContext(scope);
      const out = await juniorVipChatTurn({ userMessage: message, ctx, history, panel: scope.panel });
      return res.status(200).json({
        panel: scope.panel,
        reply: out.reply,
        actions: out.actions || [],
        proposed_study_log: null,
        meta: out.meta || null
      });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    console.error('[junior-vip]', errorMessage(e), e);
    return res.status(502).json({ error: errorMessage(e) || 'junior_vip_failed' });
  }
}
