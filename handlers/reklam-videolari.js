import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import {
  addComment,
  approveFile,
  completeUpload,
  editorIdsFor,
  enrichActor,
  issueTicket,
  loadBoard,
  openReview,
  relayChunk,
  requestRevision,
  resumeUpload,
  saveEditor,
  saveTask,
  setShootDate,
  setupFailure,
  startUpload,
  streamMedia
} from '../api/_lib/ad-video-service.js';

function readBody(req) {
  const body = req.body;
  if (body && typeof body === 'object') return body;
  if (typeof body === 'string') {
    try {
      return JSON.parse(body || '{}');
    } catch {
      return {};
    }
  }
  return {};
}

function queryOp(req) {
  const value = req.query?.op;
  return String(Array.isArray(value) ? value[0] : value || '').trim();
}

export default async function handler(req, res) {
  const op = queryOp(req);
  if (req.method === 'GET' && op === 'media') {
    try {
      await streamMedia(req, res);
    } catch (error) {
      if (!res.headersSent) {
        const failed = setupFailure(error);
        res.status(failed.status).json(failed.body);
      }
    }
    return;
  }

  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch (error) {
    res.status(401).json({ error: errorMessage(error) || 'Missing token' });
    return;
  }

  try {
    const enriched = await enrichActor(actor);
    const institutionId =
      enriched.actor.role === 'super_admin'
        ? String(readBody(req).institutionId || req.query?.institutionId || enriched.institutionId || '').trim()
        : enriched.institutionId;
    if (!institutionId) {
      res.status(400).json({ error: 'Kurum seçilemedi.' });
      return;
    }
    const body = { ...readBody(req), institutionId };
    const editorIds = op === 'set-shoot-date' ? await editorIdsFor(institutionId) : null;
    let result;
    if (req.method === 'GET' && !op) result = await loadBoard(enriched.actor, institutionId);
    else if (req.method === 'POST' && op === 'save-task') result = await saveTask(enriched.actor, institutionId, body);
    else if (req.method === 'POST' && op === 'set-shoot-date') {
      result = await setShootDate(enriched.actor, institutionId, body, editorIds);
    } else if (req.method === 'POST' && op === 'start-upload') result = await startUpload(enriched.actor, institutionId, body);
    else if (req.method === 'POST' && op === 'resume') result = await resumeUpload(enriched.actor, institutionId, body);
    else if (req.method === 'POST' && op === 'relay') result = await relayChunk(enriched.actor, institutionId, body);
    else if (req.method === 'POST' && op === 'complete') result = await completeUpload(enriched.actor, institutionId, body);
    else if (req.method === 'POST' && op === 'ticket') result = await issueTicket(enriched.actor, institutionId, body);
    else if (req.method === 'POST' && op === 'comment') result = await addComment(enriched.actor, institutionId, body);
    else if (req.method === 'POST' && op === 'open-review') result = await openReview(enriched.actor, institutionId, body);
    else if (req.method === 'POST' && op === 'request-revision') result = await requestRevision(enriched.actor, institutionId, body);
    else if (req.method === 'POST' && op === 'approve') result = await approveFile(enriched.actor, institutionId, body);
    else if (req.method === 'POST' && op === 'editor') result = await saveEditor(enriched.actor, institutionId, body, false);
    else if (req.method === 'POST' && op === 'remove-editor') result = await saveEditor(enriched.actor, institutionId, body, true);
    else {
      res.status(405).json({ error: 'Bu işlem yok.' });
      return;
    }
    res.status(result.status).json(result.body);
  } catch (error) {
    const failed = setupFailure(error);
    res.status(failed.status).json(failed.body);
  }
}
