import { requireAuthenticatedActor } from '../api/_lib/auth.js';
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

function assertWrite(actor) {
  const r = String(actor.role || '');
  return r === 'super_admin' || r === 'admin';
}

function assertRead(actor) {
  const r = String(actor.role || '');
  return r === 'super_admin' || r === 'admin' || r === 'coach' || r === 'teacher';
}

export default async function handler(req, res) {
  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch {
    return res.status(401).json({ error: 'Missing token' });
  }
  if (!assertRead(actor)) return res.status(403).json({ error: 'forbidden' });

  try {
    if (req.method === 'GET') {
      let q = supabaseAdmin.from('program_packages').select('*').order('name', { ascending: true });
      if (actor.role !== 'super_admin' && actor.institution_id) {
        q = q.eq('institution_id', actor.institution_id);
      }
      const { data, error } = await q;
      if (error) throw error;
      return res.status(200).json({ data: data || [] });
    }

    if (!assertWrite(actor)) return res.status(403).json({ error: 'forbidden_write' });

    if (req.method === 'POST') {
      const body = parseBody(req);
      const institutionId =
        actor.role === 'super_admin' ? String(body.institution_id || '').trim() : String(actor.institution_id || '').trim();
      if (!institutionId) return res.status(400).json({ error: 'institution_required' });
      const name = String(body.name || '').trim();
      if (!name) return res.status(400).json({ error: 'name_required' });

      const row = {
        institution_id: institutionId,
        name,
        grade_label: String(body.grade_label || '').trim(),
        field_domain: String(body.field_domain || '').trim(),
        subjects_json: Array.isArray(body.subjects_json) ? body.subjects_json : [],
        weekly_hours: Number(body.weekly_hours) || 0,
        feature_coaching: Boolean(body.feature_coaching !== false),
        feature_trials: Boolean(body.feature_trials !== false),
        feature_etut: Boolean(body.feature_etut),
        feature_discipline: Boolean(body.feature_discipline),
        camera_required: Boolean(body.camera_required),
        price_numeric: Number(body.price_numeric) || 0,
        contract_start_date: body.contract_start_date || null,
        contract_end_date: body.contract_end_date || null,
        pdf_template_id: body.pdf_template_id || null,
        contract_template_id: body.contract_template_id || null,
        rules_template_id: body.rules_template_id || null,
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      };
      const { data, error } = await supabaseAdmin.from('program_packages').insert(row).select().single();
      if (error) throw error;
      return res.status(200).json({ data });
    }

    if (req.method === 'PATCH') {
      const id = String(req.query.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id_required' });
      const { data: existing, error: exErr } = await supabaseAdmin.from('program_packages').select('*').eq('id', id).maybeSingle();
      if (exErr) throw exErr;
      if (!existing) return res.status(404).json({ error: 'not_found' });
      if (actor.role === 'admin' && String(existing.institution_id) !== String(actor.institution_id)) {
        return res.status(403).json({ error: 'forbidden' });
      }

      const body = parseBody(req);
      const patch = { updated_at: new Date().toISOString() };
      const fields = [
        'name',
        'grade_label',
        'field_domain',
        'weekly_hours',
        'feature_coaching',
        'feature_trials',
        'feature_etut',
        'feature_discipline',
        'camera_required',
        'price_numeric',
        'contract_start_date',
        'contract_end_date',
        'pdf_template_id',
        'contract_template_id',
        'rules_template_id'
      ];
      for (const f of fields) {
        if (body[f] !== undefined) patch[f] = body[f];
      }
      if (body.subjects_json !== undefined) {
        patch.subjects_json = Array.isArray(body.subjects_json) ? body.subjects_json : existing.subjects_json;
      }

      const { data, error } = await supabaseAdmin.from('program_packages').update(patch).eq('id', id).select().single();
      if (error) throw error;
      return res.status(200).json({ data });
    }

    if (req.method === 'DELETE') {
      const id = String(req.query.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id_required' });
      const { data: existing } = await supabaseAdmin.from('program_packages').select('institution_id').eq('id', id).maybeSingle();
      if (!existing) return res.status(404).json({ error: 'not_found' });
      if (actor.role === 'admin' && String(existing.institution_id) !== String(actor.institution_id)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const { error } = await supabaseAdmin.from('program_packages').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    console.error('[program-packages]', errorMessage(e), e);
    return res.status(500).json({ error: errorMessage(e) });
  }
}
