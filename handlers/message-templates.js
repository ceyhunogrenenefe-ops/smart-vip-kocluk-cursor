import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';

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

function normalizeVariables(v) {
  if (!Array.isArray(v)) return null;
  const out = v.map((x) => String(x || '').trim()).filter(Boolean);
  if (out.length > 40) return null;
  return out;
}

export default async function handler(req, res) {
  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch {
    return res.status(401).json({ error: 'Missing token' });
  }

  const role = String(actor.role || '').trim();
  if (role !== 'super_admin' && role !== 'admin') {
    return res.status(403).json({ error: 'forbidden', hint: 'Yalnızca süper admin ve kurum yöneticisi.' });
  }

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin.from('message_templates').select('*').order('type', { ascending: true });
    if (error) {
      return res.status(500).json({
        error: error.message,
        hint: 'Supabase: message_templates tablosu (sql/2026-05-03-whatsapp-automation-templates-logs.sql).'
      });
    }
    return res.status(200).json({ templates: data || [] });
  }

  if (req.method === 'PATCH') {
    const body = parseBody(req);
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    if (!id) return res.status(400).json({ error: 'id_required' });

    const patch = { updated_at: new Date().toISOString() };

    if (typeof body.content === 'string') {
      if (!body.content.trim()) return res.status(400).json({ error: 'content_empty' });
      patch.content = body.content;
    }
    if (typeof body.name === 'string') {
      const n = body.name.trim();
      if (n) patch.name = n;
    }
    if (body.variables !== undefined) {
      const vars = normalizeVariables(body.variables);
      if (vars === null) return res.status(400).json({ error: 'invalid_variables', hint: 'variables: string dizisi, en fazla 40 öğe.' });
      patch.variables = vars;
    }

    if (Object.keys(patch).length <= 1) {
      return res.status(400).json({ error: 'nothing_to_update' });
    }

    const { data, error } = await supabaseAdmin.from('message_templates').update(patch).eq('id', id).select('*').maybeSingle();
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    if (!data) {
      return res.status(404).json({ error: 'template_not_found' });
    }
    return res.status(200).json({ template: data });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
