import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';

/** Telefon rakamları — Online VIP ana hat korunur */
function phoneDigits(phone) {
  return String(phone || '').replace(/\D/g, '');
}

/** Silinmemesi gereken kurum (resmi VIP adı veya ana hat) */
function isProtectedInstitution(row) {
  const name = String(row.name || '')
    .toLowerCase()
    .trim();
  if (name === 'online vip ders ve koçluk') return true;
  const d = phoneDigits(row.phone);
  return d === '08503034014' || d === '8503034014';
}

async function collectUsedInstitutionIds() {
  const used = new Set();
  const tables = ['users', 'students', 'coaches'];
  for (const t of tables) {
    const { data, error } = await supabaseAdmin.from(t).select('institution_id').not('institution_id', 'is', null);
    if (error) throw error;
    for (const r of data || []) {
      const id = r.institution_id != null ? String(r.institution_id).trim() : '';
      if (id) used.add(id);
    }
  }
  return used;
}

/**
 * Süper admin: users/students/coaches tarafından referanslanmayan kurumları listeler veya siler.
 * POST { dryRun: true } → önizleme
 * POST { execute: true } → silme (önce önizleme önerilir)
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch {
    return res.status(401).json({ error: 'Missing token' });
  }
  if (String(actor.role || '').toLowerCase() !== 'super_admin') {
    return res.status(403).json({ error: 'forbidden' });
  }

  const body = req.body || {};
  const isPreview = body.dryRun === true || body.dry_run === true || body.preview === true;
  const isExecute = body.execute === true;

  if (isPreview && isExecute) {
    return res.status(400).json({ error: 'dryRun ve execute aynı istekte olamaz' });
  }
  if (!isPreview && !isExecute) {
    return res.status(400).json({
      error: 'Gövde: önizleme için { "dryRun": true } veya silmek için { "execute": true } gönderin.',
      code: 'missing_mode'
    });
  }

  try {
    const { data: instRows, error: instErr } = await supabaseAdmin.from('institutions').select('id,name,phone');
    if (instErr) throw instErr;

    const used = await collectUsedInstitutionIds();
    const candidates = (instRows || []).filter((row) => {
      const id = String(row.id || '').trim();
      if (!id || used.has(id)) return false;
      if (isProtectedInstitution(row)) return false;
      return true;
    });

    const ids = candidates.map((r) => String(r.id));

    if (isPreview) {
      return res.status(200).json({
        data: {
          dry_run: true,
          candidate_count: ids.length,
          sample_ids: ids.slice(0, 20)
        }
      });
    }

    const CHUNK = 80;
    let deleted = 0;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const { error: delErr } = await supabaseAdmin.from('institutions').delete().in('id', slice);
      if (delErr) throw delErr;
      deleted += slice.length;
    }

    return res.status(200).json({
      data: {
        dry_run: false,
        deleted,
        deleted_ids_sample: ids.slice(0, 20)
      }
    });
  } catch (e) {
    console.error('[institutions-purge]', errorMessage(e), e);
    return res.status(500).json({ error: errorMessage(e) });
  }
}
