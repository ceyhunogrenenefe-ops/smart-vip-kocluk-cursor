import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { buildJuniorVipStudentContext } from '../api/_lib/junior-vip-context.js';
import { juniorVipChatTurn } from '../api/_lib/junior-vip-chat.js';
import { juniorVipTranscribeFromBase64 } from '../api/_lib/junior-vip-transcribe.js';

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

function isStudentActor(actor) {
  return String(actor?.role || '').toLowerCase() === 'student' && Boolean(actor?.student_id);
}

export default async function handler(req, res) {
  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch {
    return res.status(401).json({ error: 'Missing token' });
  }

  if (!isStudentActor(actor)) {
    return res.status(403).json({ error: 'student_only' });
  }

  const studentId = String(actor.student_id);
  const opRaw = req.query?.op;
  const op = String((Array.isArray(opRaw) ? opRaw[0] : opRaw) || '').trim();

  try {
    if (req.method === 'GET' && (op === 'context' || !op)) {
      const ctx = await buildJuniorVipStudentContext(studentId);
      return res.status(200).json({ data: ctx });
    }

    if (req.method === 'POST' && op === 'transcribe') {
      const body = parseBody(req);
      try {
        const text = await juniorVipTranscribeFromBase64({
          audio_base64: body.audio_base64,
          mime: body.mime
        });
        return res.status(200).json({ text });
      } catch (e) {
        const code = e?.code || '';
        if (code === 'transcribe_unavailable') {
          return res.status(503).json({ error: 'transcribe_unavailable' });
        }
        if (code === 'audio_too_short') {
          return res.status(400).json({ error: 'audio_too_short' });
        }
        return res.status(502).json({ error: e?.message || 'transcribe_failed' });
      }
    }

    if (req.method === 'POST' && (op === 'chat' || !op)) {
      const body = parseBody(req);
      const message = String(body.message || body.text || '').trim();
      const history = Array.isArray(body.history) ? body.history : [];
      const ctx = await buildJuniorVipStudentContext(studentId);
      const out = await juniorVipChatTurn({ userMessage: message, ctx, history });
      return res.status(200).json({
        reply: out.reply,
        actions: out.actions || [],
        proposed_study_log: out.proposed_study_log || null,
        meta: out.meta || null
      });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    console.error('[junior-vip]', errorMessage(e), e);
    return res.status(502).json({ error: errorMessage(e) || 'junior_vip_failed' });
  }
}
