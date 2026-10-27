/**
 * /api/meta/wa-coexistence
 *   GET                         → kurulum durumu (app_id, config_id, hazır mı)
 *   POST { op: 'save_config' }  → Embedded Signup yapılandırma kimliğini kaydet (süper admin)
 *   POST { op: 'complete' }     → FB.login kodu + WABA/numara → CRM’e bağla (yönetici)
 */
import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { actorIsAdminLike, actorRoleSet } from '../api/_lib/actor-roles.js';
import {
  completeCoexistenceOnboarding,
  describeCoexistenceSetup,
  saveCoexistenceConfigId
} from '../api/_lib/meta-wa-coexistence.js';

function parseBody(req) {
  const raw = req.body;
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw || '{}');
    } catch {
      return {};
    }
  }
  return raw && typeof raw === 'object' ? raw : {};
}

export default async function handler(req, res) {
  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const roleSet = await actorRoleSet(actor);
  if (!actorIsAdminLike(actor, roleSet)) {
    return res.status(403).json({ error: 'forbidden', hint: 'WhatsApp hattını yalnızca yönetici bağlar.' });
  }

  try {
    if (req.method === 'GET') {
      return res.status(200).json({ data: await describeCoexistenceSetup() });
    }
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'method_not_allowed' });
    }

    const b = parseBody(req);
    const op = String(b.op || '').trim();

    if (op === 'save_config') {
      try {
        await saveCoexistenceConfigId(b.config_id);
      } catch (e) {
        return res.status(400).json({
          error: e instanceof Error ? e.message : 'config_id_invalid',
          hint: 'Meta Uygulama Paneli → Facebook Login for Business → Yapılandırmalar → WhatsApp Embedded Signup yapılandırmasının kimliği (yalnızca rakam).'
        });
      }
      return res.status(200).json({ ok: true, data: await describeCoexistenceSetup() });
    }

    if (op === 'complete') {
      const code = String(b.code || '').trim();
      if (!code) return res.status(400).json({ error: 'code_missing' });
      const result = await completeCoexistenceOnboarding({
        code,
        waba_id: String(b.waba_id || '').trim(),
        phone_number_id: String(b.phone_number_id || '').trim(),
        event: String(b.event || '').trim()
      });
      return res.status(result.ok ? 200 : 400).json(result);
    }

    return res.status(400).json({ error: 'unknown_op' });
  } catch (e) {
    console.error('[meta-wa-coexistence]', e);
    return res.status(500).json({ error: e instanceof Error ? e.message : 'internal_error' });
  }
}
