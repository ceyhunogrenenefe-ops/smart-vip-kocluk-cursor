import { requireAuth, hasInstitutionAccess } from '../api/_lib/auth.js';
import { enrichStudentActor } from '../api/_lib/enrich-student-actor.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { runBulkUserImport } from '../api/_lib/user-bulk-import.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  try {
    let actor = requireAuth(req);
    actor = await enrichStudentActor(actor);

    if (!(actor.role === 'super_admin' || actor.role === 'admin')) {
      return res.status(403).json({ error: 'forbidden' });
    }

    const body = req.body || {};
    const rows = Array.isArray(body.rows) ? body.rows : null;
    if (!rows || rows.length === 0) {
      return res.status(400).json({ error: 'rows_required', hint: 'En az bir satır gönderilmelidir.' });
    }
    if (rows.length > 500) {
      return res.status(400).json({ error: 'too_many_rows', hint: 'Tek seferde en fazla 500 satır yüklenebilir.' });
    }

    const requestedInstitutionId =
      body.institution_id != null ? String(body.institution_id).trim() : actor.institution_id || null;

    if (actor.role === 'admin' && !hasInstitutionAccess(actor, requestedInstitutionId)) {
      return res.status(403).json({ error: 'institution_forbidden' });
    }

    const summary = await runBulkUserImport(actor, rows, requestedInstitutionId);
    return res.status(200).json({ ok: true, ...summary });
  } catch (e) {
    const msg = errorMessage(e);
    if (
      msg === 'Missing token' ||
      msg === 'Invalid token' ||
      msg === 'Invalid signature' ||
      msg === 'Token expired'
    ) {
      return res.status(401).json({ error: msg });
    }
    console.error('[users-bulk-import]', msg, e);
    return res.status(500).json({ error: msg || 'bulk_import_failed' });
  }
}
