import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';

export default async function handler(req, res) {
  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch {
    return res.status(401).json({ error: 'Missing token' });
  }

  const role = String(actor.role || '').trim();
  if (role !== 'super_admin' && role !== 'admin') {
    return res.status(403).json({ error: 'forbidden' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const limit = Math.min(200, Math.max(10, Number(req.query.limit) || 80));

  const { data, error } = await supabaseAdmin
    .from('message_logs')
    .select(
      'id,student_id,kind,related_id,message,status,sent_at,log_date,error,phone,twilio_sid,twilio_error_code,twilio_content_sid,meta_message_id,meta_template_name'
    )
    .order('sent_at', { ascending: false })
    .limit(limit);

  if (error) {
    return res.status(500).json({
      error: error.message,
      hint: 'message_logs için sql/2026-05-07-whatsapp-production-templates.sql ve sql/2026-05-17-meta-whatsapp-cloud-api.sql çalıştırın.'
    });
  }

  return res.status(200).json({ data: data || [] });
}
