import { errorMessage } from '../api/_lib/error-msg.js';
import { buildJuniorVipContext } from '../api/_lib/junior-vip-context.js';
import { juniorVipChatTurn } from '../api/_lib/junior-vip-chat.js';
import { juniorVipTranscribeFromBase64 } from '../api/_lib/junior-vip-transcribe.js';
import { resolveJuniorVipScope } from '../api/_lib/junior-vip-access.js';

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

export default async function handler(req, res) {
  const opRaw = req.query?.op;
  const op = String((Array.isArray(opRaw) ? opRaw[0] : opRaw) || '').trim();

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
      const hasKey = Boolean((process.env.OPENAI_API_KEY || process.env.OPEN_API_KEY || '').trim());
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
        if (code === 'audio_too_large') {
          return res.status(413).json({ error: 'audio_too_large' });
        }
        console.error('[junior-vip] transcribe', errorMessage(e));
        return res.status(502).json({ error: e?.message || 'transcribe_failed' });
      }
    }

    if (req.method === 'POST' && (op === 'chat' || !op)) {
      const body = parseBody(req);
      const message = String(body.message || body.text || '').trim();
      const history = Array.isArray(body.history) ? body.history : [];
      const ctx = await buildJuniorVipContext(scope);
      const out = await juniorVipChatTurn({ userMessage: message, ctx, history, panel: scope.panel });
      return res.status(200).json({
        panel: scope.panel,
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
