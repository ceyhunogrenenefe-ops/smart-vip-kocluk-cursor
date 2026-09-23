/**
 * Kurum modül anahtarları — /api/institution-features
 *
 * GET  : açık olan kurumda ödev modülü açık mı (her oturum açmış kullanıcı okuyabilir)
 * POST : süper admin kurumun modülünü açar / kapatır
 */
import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { actorRoleSet } from '../api/_lib/actor-roles.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { describeHomeworkModule, setHomeworkModule } from '../api/_lib/homework-module.js';

function parseBody(req) {
  const b = req.body;
  if (b && typeof b === 'object' && !Buffer.isBuffer(b)) return b;
  if (typeof b === 'string') {
    try {
      return JSON.parse(b || '{}');
    } catch {
      return {};
    }
  }
  return {};
}

/** İsteğin kurumu: yönetici açıkça seçebilir, diğerleri kendi kurumu. */
async function resolveInstitution(actor, roleSet, asked) {
  const q = String(asked || '').trim();
  if (q && (roleSet.has('super_admin') || roleSet.has('admin'))) return q;
  const own = String(actor.institution_id || '').trim();
  if (own) return own;
  const { data } = await supabaseAdmin
    .from('users')
    .select('institution_id')
    .eq('id', actor.sub)
    .maybeSingle();
  return String(data?.institution_id || '').trim();
}

export default async function handler(req, res) {
  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    const roleSet = await actorRoleSet(actor);
    const body = req.method === 'GET' ? {} : parseBody(req);
    const institutionId = await resolveInstitution(
      actor,
      roleSet,
      req.query?.institution_id || body.institution_id
    );

    if (req.method === 'GET') {
      return res.status(200).json({ data: await describeHomeworkModule(institutionId) });
    }

    if (req.method === 'POST' || req.method === 'PATCH') {
      if (!roleSet.has('super_admin')) {
        return res.status(403).json({ error: 'forbidden', hint: 'Modülü yalnız süper admin açar.' });
      }
      if (body.homework_module === undefined) {
        return res.status(400).json({ error: 'homework_module_required' });
      }
      try {
        const data = await setHomeworkModule(institutionId, body.homework_module, actor.sub);
        return res.status(200).json({ ok: true, data });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === 'module_not_available_for_institution') {
          return res.status(400).json({
            error: msg,
            message: 'Ödev modülü Online VIP Dershane ve Ders & Koçluk kurumlarında kullanılmaz.'
          });
        }
        return res.status(400).json({ error: 'save_failed', message: msg });
      }
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    console.error('[institution-features]', e instanceof Error ? e.message : e);
    return res.status(500).json({ error: 'server_error' });
  }
}
