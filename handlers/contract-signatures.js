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

function deviceHint(ua) {
  const s = String(ua || '').slice(0, 240);
  return s;
}

/**
 * GET ?signing_token= — imza sayfası (JWT gerekmez)
 * POST — imza kaydı (JWT gerekmez)
 */
export default async function handler(req, res) {
  const signingToken = String(req.query.signing_token || '').trim();

  if (req.method === 'GET' && signingToken) {
    try {
      const { data: doc, error } = await supabaseAdmin
        .from('generated_contract_documents')
        .select('id,merged_html,status,contract_number,student_id')
        .eq('signing_token', signingToken)
        .maybeSingle();
      if (error) throw error;
      if (!doc) return res.status(404).json({ error: 'not_found' });
      const { data: existingSig } = await supabaseAdmin
        .from('contract_signatures')
        .select('id,signed_at')
        .eq('document_id', doc.id)
        .order('signed_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return res.status(200).json({
        data: {
          document_id: doc.id,
          merged_html: doc.merged_html,
          contract_number: doc.contract_number,
          already_signed: Boolean(existingSig),
          signed_at: existingSig?.signed_at || null
        }
      });
    } catch (e) {
      return res.status(500).json({ error: errorMessage(e) });
    }
  }

  if (req.method === 'POST') {
    const body = parseBody(req);
    const token = String(body.signing_token || signingToken || '').trim();
    if (!token) return res.status(400).json({ error: 'signing_token_required' });
    if (!body.accepted_terms) return res.status(400).json({ error: 'terms_required' });
    const png = typeof body.signature_png_base64 === 'string' ? body.signature_png_base64.trim() : '';
    if (!png || png.length < 100) return res.status(400).json({ error: 'signature_required' });

    try {
      const { data: doc, error: dErr } = await supabaseAdmin
        .from('generated_contract_documents')
        .select('id,status')
        .eq('signing_token', token)
        .maybeSingle();
      if (dErr) throw dErr;
      if (!doc) return res.status(404).json({ error: 'not_found' });
      if (doc.status === 'signed') {
        return res.status(200).json({ ok: true, duplicate: true });
      }

      const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
      const ua = String(req.headers['user-agent'] || '');

      const { error: insErr } = await supabaseAdmin.from('contract_signatures').insert({
        document_id: doc.id,
        signer_role: 'veli',
        signature_png_base64: png.slice(0, 500000),
        ip_address: ip || null,
        user_agent: ua || null,
        accepted_terms_at: new Date().toISOString(),
        signed_at: new Date().toISOString(),
        device_hint: deviceHint(ua)
      });
      if (insErr) throw insErr;

      const { error: upErr } = await supabaseAdmin
        .from('generated_contract_documents')
        .update({ status: 'signed', updated_at: new Date().toISOString() })
        .eq('id', doc.id);
      if (upErr) throw upErr;

      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error('[contract-signatures POST]', errorMessage(e), e);
      return res.status(500).json({ error: errorMessage(e) });
    }
  }

  /** Admin: belgeye ait imzaları listele */
  if (req.method === 'GET') {
    let actor;
    try {
      actor = requireAuthenticatedActor(req);
    } catch {
      return res.status(401).json({ error: 'Missing token' });
    }
    try {
      const documentId = String(req.query.document_id || '').trim();
      if (!documentId) return res.status(400).json({ error: 'document_id_required' });
      const { data: doc, error: de } = await supabaseAdmin
        .from('generated_contract_documents')
        .select('id,institution_id')
        .eq('id', documentId)
        .maybeSingle();
      if (de) throw de;
      if (!doc) return res.status(404).json({ error: 'not_found' });
      if (actor.role === 'admin' && String(doc.institution_id) !== String(actor.institution_id)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      if (!['super_admin', 'admin', 'coach'].includes(String(actor.role))) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const { data, error } = await supabaseAdmin.from('contract_signatures').select('*').eq('document_id', documentId);
      if (error) throw error;
      return res.status(200).json({ data: data || [] });
    } catch (e) {
      return res.status(500).json({ error: errorMessage(e) });
    }
  }

  return res.status(405).json({ error: 'method_not_allowed' });
}
