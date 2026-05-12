import { requireAuthenticatedActor, hasInstitutionAccess } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { normalizeDersSatirlari, normalizeSozlesmeTuru, sumDersHours } from '../api/_lib/parent-sign-defaults.js';

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

function resolveWriteInstitutionId(actor, bodyInstitutionId) {
  const role = String(actor.role || '');
  const bodyId = String(bodyInstitutionId || '').trim();
  const actorId = String(actor.institution_id || '').trim();
  if (role === 'super_admin') return bodyId || actorId;
  if (bodyId && hasInstitutionAccess(actor, bodyId)) return bodyId;
  return actorId;
}

function resolveReadInstitutionId(actor, queryInstitutionId) {
  const role = String(actor.role || '');
  const q = String(queryInstitutionId || '').trim();
  const actorId = String(actor.institution_id || '').trim();
  if (role === 'super_admin') return q;
  if (q && hasInstitutionAccess(actor, q)) return q;
  return actorId;
}

function clampNum(n, min, max, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

export default async function handler(req, res) {
  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch {
    return res.status(401).json({ error: 'Missing token' });
  }

  const role = String(actor.role || '');
  const canManage = role === 'super_admin' || role === 'admin' || role === 'coach';
  if (!canManage) return res.status(403).json({ error: 'forbidden' });

  try {
    if (req.method === 'GET') {
      const institutionId = resolveReadInstitutionId(actor, req.query.institution_id);
      if (!institutionId) {
        if (role === 'super_admin') return res.status(400).json({ error: 'institution_id_query_required' });
        return res.status(400).json({ error: 'institution_required' });
      }
      if ((role === 'admin' || role === 'coach') && !hasInstitutionAccess(actor, institutionId)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      let q = supabaseAdmin
        .from('parent_sign_class_presets')
        .select('*')
        .order('sinif', { ascending: true })
        .order('program_adi', { ascending: true })
        .limit(500);
      if (institutionId) q = q.eq('institution_id', institutionId);
      const { data, error } = await q;
      if (error) {
        if (String(error.message || '').includes('relation') || error.code === '42P01') {
          return res.status(200).json({
            data: [],
            hint: 'parent_sign_class_presets için 2026-05-12-parent-sign-class-presets.sql çalıştırın.'
          });
        }
        throw error;
      }
      return res.status(200).json({ data: data || [] });
    }

    if (req.method === 'POST') {
      const body = parseBody(req);
      const institutionId = resolveWriteInstitutionId(actor, body.institution_id);
      if (!institutionId) return res.status(400).json({ error: 'institution_required' });
      if (role === 'admin' || role === 'coach') {
        if (!hasInstitutionAccess(actor, institutionId)) return res.status(403).json({ error: 'forbidden' });
      }

      const sinif = String(body.sinif || '').trim();
      const program_adi = String(body.program_adi || '').trim();
      if (!sinif || !program_adi) return res.status(400).json({ error: 'sinif_program_required' });

      const ders_satirlari = normalizeDersSatirlari(body.ders_satirlari);
      if (!ders_satirlari.length) return res.status(400).json({ error: 'ders_satirlari_required' });

      const sumHours = sumDersHours(ders_satirlari);
      const haftalik_ders_saati = Math.min(80, Math.max(0, sumHours));

      const sozlesme_turu = normalizeSozlesmeTuru(body.sozlesme_turu);
      const sozlesme_ozel_baslik = String(body.sozlesme_ozel_baslik || '').trim().slice(0, 200);
      const sablon_ek_detay = String(body.sablon_ek_detay || '').trim().slice(0, 20000);

      const now = new Date().toISOString();
      const row = {
        institution_id: institutionId,
        sinif,
        program_adi,
        haftalik_ders_saati,
        ders_satirlari,
        ucret: 0,
        taksit_sayisi: 1,
        sozlesme_turu,
        sozlesme_ozel_baslik,
        sablon_ek_detay,
        created_at: now,
        updated_at: now
      };

      const { data: created, error: insErr } = await supabaseAdmin.from('parent_sign_class_presets').insert(row).select().single();
      if (insErr) {
        console.error('[parent-sign-class-presets POST]', insErr);
        return res.status(500).json({
          error: errorMessage(insErr),
          hint: String(insErr.message || '').includes('ders_satirlari') ? '2026-05-15-parent-sign-preset-ders-programi.sql çalıştırın.' : undefined
        });
      }
      return res.status(200).json({ data: created });
    }

    if (req.method === 'PATCH') {
      const body = parseBody(req);
      const id = String(body.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id_required' });

      const { data: existing, error: fErr } = await supabaseAdmin.from('parent_sign_class_presets').select('*').eq('id', id).maybeSingle();
      if (fErr) throw fErr;
      if (!existing) return res.status(404).json({ error: 'not_found' });
      if (role !== 'super_admin' && !hasInstitutionAccess(actor, existing.institution_id)) {
        return res.status(403).json({ error: 'forbidden' });
      }

      const nextSinif = body.sinif !== undefined ? String(body.sinif || '').trim() : String(existing.sinif || '').trim();
      const nextProgram =
        body.program_adi !== undefined ? String(body.program_adi || '').trim() : String(existing.program_adi || '').trim();
      if (!nextSinif || !nextProgram) return res.status(400).json({ error: 'sinif_program_required' });

      let ders_satirlari = normalizeDersSatirlari(existing.ders_satirlari);
      if (!ders_satirlari.length && Number(existing.haftalik_ders_saati) > 0) {
        ders_satirlari = [{ ders_adi: 'Genel', haftalik_saat: Number(existing.haftalik_ders_saati) }];
      }
      if (body.ders_satirlari !== undefined) {
        ders_satirlari = normalizeDersSatirlari(body.ders_satirlari);
        if (!ders_satirlari.length) return res.status(400).json({ error: 'ders_satirlari_required' });
      }

      const patch = {
        updated_at: new Date().toISOString(),
        sinif: nextSinif,
        program_adi: nextProgram,
        ders_satirlari,
        haftalik_ders_saati: Math.min(80, Math.max(0, sumDersHours(ders_satirlari))),
        ucret: 0,
        taksit_sayisi: 1
      };

      if (body.sozlesme_turu !== undefined) patch.sozlesme_turu = normalizeSozlesmeTuru(body.sozlesme_turu);
      else patch.sozlesme_turu = normalizeSozlesmeTuru(existing.sozlesme_turu);
      if (body.sozlesme_ozel_baslik !== undefined) patch.sozlesme_ozel_baslik = String(body.sozlesme_ozel_baslik || '').trim().slice(0, 200);
      else patch.sozlesme_ozel_baslik = String(existing.sozlesme_ozel_baslik || '');
      if (body.sablon_ek_detay !== undefined) patch.sablon_ek_detay = String(body.sablon_ek_detay || '').trim().slice(0, 20000);
      else patch.sablon_ek_detay = String(existing.sablon_ek_detay || '');

      const { data: updated, error: uErr } = await supabaseAdmin
        .from('parent_sign_class_presets')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (uErr) throw uErr;
      return res.status(200).json({ data: updated });
    }

    if (req.method === 'DELETE') {
      const id = String(req.query.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id_required' });

      const { data: existing, error: fErr } = await supabaseAdmin.from('parent_sign_class_presets').select('id,institution_id').eq('id', id).maybeSingle();
      if (fErr) throw fErr;
      if (!existing) return res.status(404).json({ error: 'not_found' });
      if (role !== 'super_admin' && !hasInstitutionAccess(actor, existing.institution_id)) {
        return res.status(403).json({ error: 'forbidden' });
      }

      const { error: dErr } = await supabaseAdmin.from('parent_sign_class_presets').delete().eq('id', id);
      if (dErr) throw dErr;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    console.error('[parent-sign-class-presets]', errorMessage(e), e);
    return res.status(500).json({ error: errorMessage(e) });
  }
}
