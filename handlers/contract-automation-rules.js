import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';

const DEFAULT_TRIGGERS = [
  'registration_contract',
  'unsigned_reminder',
  'absence_notice',
  'camera_off',
  'low_discipline',
  'payment_reminder',
  'trial_absence'
];

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

export default async function handler(req, res) {
  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch {
    return res.status(401).json({ error: 'Missing token' });
  }
  if (!['super_admin', 'admin'].includes(String(actor.role || ''))) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const institutionId =
    actor.role === 'super_admin' ? String(req.query.institution_id || '').trim() : String(actor.institution_id || '').trim();
  if (!institutionId) return res.status(400).json({ error: 'institution_required' });

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from('contract_automation_rules')
        .select('*')
        .eq('institution_id', institutionId)
        .order('trigger_type', { ascending: true });
      if (error) {
        if (String(error.message || '').includes('relation') || String(error.code) === '42P01') {
          return res.status(200).json({ data: [], hint: 'contract_automation_rules tablosu SQL ile oluşturulmalı.' });
        }
        throw error;
      }
      const existing = new Map((data || []).map((r) => [r.trigger_type, r]));
      const merged = DEFAULT_TRIGGERS.map((trigger_type) => {
        const row = existing.get(trigger_type);
        if (row) return row;
        return {
          id: null,
          institution_id: institutionId,
          trigger_type,
          channels: ['whatsapp', 'email', 'in_app'],
          message_template: '',
          enabled: false
        };
      });
      return res.status(200).json({ data: merged });
    }

    if (req.method === 'PATCH' || req.method === 'POST') {
      const body = parseBody(req);
      const trigger_type = String(body.trigger_type || '').trim();
      if (!DEFAULT_TRIGGERS.includes(trigger_type)) return res.status(400).json({ error: 'invalid_trigger' });
      const now = new Date().toISOString();
      const row = {
        institution_id: institutionId,
        trigger_type,
        channels: Array.isArray(body.channels) ? body.channels : ['whatsapp'],
        message_template: String(body.message_template || ''),
        enabled: Boolean(body.enabled),
        updated_at: now
      };
      const { data: ex } = await supabaseAdmin
        .from('contract_automation_rules')
        .select('id')
        .eq('institution_id', institutionId)
        .eq('trigger_type', trigger_type)
        .maybeSingle();
      if (ex?.id) {
        const { data: upd, error } = await supabaseAdmin
          .from('contract_automation_rules')
          .update(row)
          .eq('id', ex.id)
          .select()
          .single();
        if (error) throw error;
        return res.status(200).json({ data: upd });
      }
      const { data: ins, error } = await supabaseAdmin
        .from('contract_automation_rules')
        .insert({ ...row, created_at: now })
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json({ data: ins });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    console.error('[contract-automation-rules]', errorMessage(e), e);
    return res.status(500).json({ error: errorMessage(e) });
  }
}
