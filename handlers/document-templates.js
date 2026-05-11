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
  if (r === 'super_admin' || r === 'admin') return true;
  return false;
}

function assertRead(actor) {
  const r = String(actor.role || '');
  return r === 'super_admin' || r === 'admin' || r === 'coach';
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
      let q = supabaseAdmin.from('document_templates').select('*').order('updated_at', { ascending: false });
      const kind = String(req.query.kind || '').trim();
      if (kind && ['program_pdf', 'contract', 'rules'].includes(kind)) q = q.eq('kind', kind);
      if (actor.role === 'admin' && actor.institution_id) {
        q = q.or(
          `institution_id.eq.${actor.institution_id},institution_id.is.null`
        );
      } else if (actor.role === 'coach' && actor.institution_id) {
        q = q.eq('is_active', true).or(
          `institution_id.eq.${actor.institution_id},institution_id.is.null`
        );
      }
      const { data, error } = await q;
      if (error) throw error;
      return res.status(200).json({ data: data || [] });
    }

    if (!assertWrite(actor)) return res.status(403).json({ error: 'forbidden_write' });

    if (req.method === 'POST') {
      const body = parseBody(req);
      if (body.copy_from_id) {
        const fromId = String(body.copy_from_id || '').trim();
        if (!fromId) return res.status(400).json({ error: 'copy_from_id_required' });
        const { data: src, error: sErr } = await supabaseAdmin.from('document_templates').select('*').eq('id', fromId).maybeSingle();
        if (sErr) throw sErr;
        if (!src) return res.status(404).json({ error: 'not_found' });
        if (actor.role === 'admin' && src.institution_id && src.institution_id !== actor.institution_id) {
          return res.status(403).json({ error: 'forbidden' });
        }
        const institutionId =
          actor.role === 'super_admin'
            ? body.institution_id != null
              ? String(body.institution_id).trim()
              : src.institution_id
            : actor.institution_id;
        const name = String(body.name || `${src.name} (kopya)`).trim();
        const row = {
          institution_id: institutionId,
          kind: src.kind,
          name,
          academic_year_label: String(body.academic_year_label || src.academic_year_label || ''),
          grade_label: String(body.grade_label || src.grade_label || ''),
          body: src.body,
          is_active: true,
          copied_from_id: src.id,
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        };
        const { data, error } = await supabaseAdmin.from('document_templates').insert(row).select().single();
        if (error) throw error;
        return res.status(200).json({ data });
      }

      const institutionId =
        actor.role === 'super_admin' ? (body.institution_id != null ? String(body.institution_id).trim() : null) : actor.institution_id || null;
      if (actor.role === 'admin' && !actor.institution_id) {
        return res.status(400).json({ error: 'institution_required' });
      }
      const kind = String(body.kind || '').trim();
      if (!['program_pdf', 'contract', 'rules'].includes(kind)) {
        return res.status(400).json({ error: 'invalid_kind' });
      }
      const name = String(body.name || '').trim();
      if (!name) return res.status(400).json({ error: 'name_required' });

      const row = {
        institution_id: institutionId,
        kind,
        name,
        academic_year_label: String(body.academic_year_label || '').trim(),
        grade_label: String(body.grade_label || '').trim(),
        body: String(body.body || ''),
        is_active: body.is_active !== false,
        copied_from_id: body.copied_from_id || null,
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      };

      const { data, error } = await supabaseAdmin.from('document_templates').insert(row).select().single();
      if (error) throw error;
      return res.status(200).json({ data });
    }

    if (req.method === 'PATCH') {
      const id = String(req.query.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id_required' });
      const { data: existing, error: exErr } = await supabaseAdmin
        .from('document_templates')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (exErr) throw exErr;
      if (!existing) return res.status(404).json({ error: 'not_found' });
      if (actor.role === 'admin' && existing.institution_id && existing.institution_id !== actor.institution_id) {
        return res.status(403).json({ error: 'forbidden' });
      }
      if (actor.role === 'admin' && !existing.institution_id) {
        return res.status(403).json({ error: 'platform_template_admin_cannot_edit' });
      }

      const body = parseBody(req);
      const patch = { updated_at: new Date().toISOString() };
      if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim();
      if (typeof body.academic_year_label === 'string') patch.academic_year_label = body.academic_year_label.trim();
      if (typeof body.grade_label === 'string') patch.grade_label = body.grade_label.trim();
      if (typeof body.body === 'string') patch.body = body.body;
      if (typeof body.kind === 'string' && ['program_pdf', 'contract', 'rules'].includes(body.kind)) patch.kind = body.kind;
      if (typeof body.is_active === 'boolean') patch.is_active = body.is_active;

      const { data, error } = await supabaseAdmin.from('document_templates').update(patch).eq('id', id).select().single();
      if (error) throw error;
      return res.status(200).json({ data });
    }

    if (req.method === 'DELETE') {
      const id = String(req.query.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id_required' });
      const { data: existing } = await supabaseAdmin.from('document_templates').select('id,institution_id').eq('id', id).maybeSingle();
      if (!existing) return res.status(404).json({ error: 'not_found' });
      if (actor.role === 'admin' && existing.institution_id !== actor.institution_id) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const { error } = await supabaseAdmin.from('document_templates').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    console.error('[document-templates]', errorMessage(e), e);
    return res.status(500).json({ error: errorMessage(e) });
  }
}
