import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { isUuid } from '../api/_lib/uuid.js';

function phoneDigits(phone) {
  return String(phone || '').replace(/\D/g, '');
}

/** `institutions-purge` ile aynı koruma — Online VIP ana hat */
function isProtectedInstitution(row) {
  const name = String(row.name || '')
    .toLowerCase()
    .trim();
  if (name === 'online vip ders ve koçluk') return true;
  const d = phoneDigits(row.phone);
  return d === '08503034014' || d === '8503034014';
}

/**
 * Süper admin: tek kurum sil (service role — RLS’den bağımsız).
 * DELETE /api/institutions?id=<uuid>
 */
export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch {
    return res.status(401).json({ error: 'Missing token' });
  }
  if (String(actor.role || '').toLowerCase() !== 'super_admin') {
    return res.status(403).json({ error: 'Sadece süper admin kurum silebilir' });
  }

  const id = String(req.query?.id ?? '').trim();
  if (!isUuid(id)) {
    return res.status(400).json({ error: 'Geçersiz kurum kimliği' });
  }

  try {
    const { data: row, error: fetchErr } = await supabaseAdmin
      .from('institutions')
      .select('id,name,phone')
      .eq('id', id)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!row) {
      return res.status(404).json({ error: 'Kurum bulunamadı' });
    }
    if (isProtectedInstitution(row)) {
      return res.status(403).json({ error: 'Bu kurum ana kayıt olduğu için silinemez' });
    }

    const { count, error: countErr } = await supabaseAdmin
      .from('institutions')
      .select('id', { count: 'exact', head: true });
    if (countErr) throw countErr;
    if (typeof count === 'number' && count <= 1) {
      return res.status(400).json({ error: 'Son kurum silinemez' });
    }

    const { error: delErr } = await supabaseAdmin.from('institutions').delete().eq('id', id);
    if (delErr) {
      const code = delErr.code || '';
      const msg = String(delErr.message || delErr);
      if (code === '23503' || /foreign key/i.test(msg)) {
        return res.status(409).json({
          error:
            'Bu kuruma bağlı öğrenci, koç veya kullanıcı kaydı var. Önce ilgili kayıtları taşıyın veya silin.'
        });
      }
      throw delErr;
    }

    return res.status(200).json({ data: { ok: true } });
  } catch (e) {
    console.error('[institutions]', errorMessage(e), e);
    return res.status(500).json({ error: errorMessage(e) });
  }
}
