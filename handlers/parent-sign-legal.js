import { requireAuthenticatedActor, hasInstitutionAccess } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';

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

function resolveInstitutionId(actor, raw) {
  const role = String(actor.role || '');
  const id = String(raw || '').trim();
  const actorId = String(actor.institution_id || '').trim();
  if (role === 'super_admin') return id || actorId;
  if (id && hasInstitutionAccess(actor, id)) return id;
  return actorId;
}

const EMPTY = {
  satis_sozlesmesi: '',
  kullanici_sozlesmesi: '',
  gizlilik_politikasi: '',
  kvkk_aydinlatma: '',
  kvkk_doc_url: '',
  satis_doc_url: ''
};

export default async function handler(req, res) {
  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch {
    return res.status(401).json({ error: 'Missing token' });
  }

  const role = String(actor.role || '');
  if (!['super_admin', 'admin', 'coach'].includes(role)) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const institutionId = resolveInstitutionId(actor, req.query?.institution_id || parseBody(req).institution_id);
  if (!institutionId) {
    return res.status(400).json({ error: 'institution_required' });
  }
  if ((role === 'admin' || role === 'coach') && !hasInstitutionAccess(actor, institutionId)) {
    return res.status(403).json({ error: 'forbidden' });
  }

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from('parent_sign_institution_legal')
        .select('*')
        .eq('institution_id', institutionId)
        .maybeSingle();
      if (error) {
        if (String(error.code || '') === '42P01') {
          return res.status(200).json({
            data: { institution_id: institutionId, ...EMPTY },
            hint: 'sql/2026-06-13-parent-sign-currency-legal.sql çalıştırın.'
          });
        }
        throw error;
      }
      return res.status(200).json({
        data: data || { institution_id: institutionId, ...EMPTY }
      });
    }

    if (req.method === 'PATCH' || req.method === 'POST') {
      const body = parseBody(req);
      const { data: prev } = await supabaseAdmin
        .from('parent_sign_institution_legal')
        .select('*')
        .eq('institution_id', institutionId)
        .maybeSingle();
      const base = prev || { institution_id: institutionId, ...EMPTY };
      const row = {
        institution_id: institutionId,
        satis_sozlesmesi:
          body.satis_sozlesmesi !== undefined
            ? String(body.satis_sozlesmesi ?? '').trim()
            : String(base.satis_sozlesmesi || '').trim(),
        kullanici_sozlesmesi:
          body.kullanici_sozlesmesi !== undefined
            ? String(body.kullanici_sozlesmesi ?? '').trim()
            : String(base.kullanici_sozlesmesi || '').trim(),
        gizlilik_politikasi:
          body.gizlilik_politikasi !== undefined
            ? String(body.gizlilik_politikasi ?? '').trim()
            : String(base.gizlilik_politikasi || '').trim(),
        kvkk_aydinlatma:
          body.kvkk_aydinlatma !== undefined
            ? String(body.kvkk_aydinlatma ?? '').trim()
            : String(base.kvkk_aydinlatma || '').trim(),
        kvkk_doc_url:
          body.kvkk_doc_url !== undefined
            ? String(body.kvkk_doc_url ?? '').trim().slice(0, 2000)
            : String(base.kvkk_doc_url || '').trim().slice(0, 2000),
        satis_doc_url:
          body.satis_doc_url !== undefined
            ? String(body.satis_doc_url ?? '').trim().slice(0, 2000)
            : String(base.satis_doc_url || '').trim().slice(0, 2000),
        updated_at: new Date().toISOString(),
        updated_by: actor.sub || null
      };
      const { data, error } = await supabaseAdmin
        .from('parent_sign_institution_legal')
        .upsert(row, { onConflict: 'institution_id' })
        .select('*')
        .single();
      if (error) {
        if (String(error.code || '') === '42P01') {
          return res.status(400).json({
            error: 'schema_missing',
            hint: 'sql/2026-06-13-parent-sign-currency-legal.sql çalıştırın.'
          });
        }
        throw error;
      }
      return res.status(200).json({ data });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    console.error('[parent-sign-legal]', errorMessage(e), e);
    return res.status(500).json({ error: errorMessage(e) });
  }
}
