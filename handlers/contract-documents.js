import { requireAuthenticatedActor, hasInstitutionAccess } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import {
  applyTemplateVariables,
  buildContractVariableMap,
  contractNumberFromInstitution,
  randomToken
} from '../api/_lib/merge-document-variables.js';

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

function publicBaseUrl() {
  const u = process.env.PUBLIC_APP_URL || process.env.VITE_APP_URL;
  if (u && String(u).trim()) return String(u).replace(/\/+$/, '');
  if (process.env.VERCEL_URL) return `https://${String(process.env.VERCEL_URL).replace(/^https?:\/\//, '')}`;
  return 'http://localhost:5173';
}

async function loadTemplatesByIds(ids) {
  const clean = [...new Set((ids || []).filter(Boolean))];
  if (!clean.length) return [];
  const { data, error } = await supabaseAdmin.from('document_templates').select('*').in('id', clean);
  if (error) throw error;
  return data || [];
}

export default async function handler(req, res) {
  /** Genel doğrulama (JWT yok) */
  const verify = String(req.query.verify || '').trim();
  if (req.method === 'GET' && verify) {
    try {
      const { data: doc, error } = await supabaseAdmin
        .from('generated_contract_documents')
        .select('id,contract_number,status,created_at,institution_id,student_id')
        .eq('verify_token', verify)
        .maybeSingle();
      if (error) throw error;
      if (!doc) return res.status(404).json({ ok: false, error: 'not_found' });
      const { data: sig } = await supabaseAdmin
        .from('contract_signatures')
        .select('signed_at')
        .eq('document_id', doc.id)
        .order('signed_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      let instName = '';
      if (doc.institution_id) {
        const { data: inst } = await supabaseAdmin.from('institutions').select('name').eq('id', doc.institution_id).maybeSingle();
        instName = inst?.name || '';
      }
      return res.status(200).json({
        ok: true,
        contract_number: doc.contract_number,
        status: doc.status,
        signed_at: sig?.signed_at || null,
        institution_name: instName,
        issued_at: doc.created_at
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: errorMessage(e) });
    }
  }

  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch {
    return res.status(401).json({ error: 'Missing token' });
  }

  try {
    if (req.method === 'GET') {
      const id = String(req.query.id || '').trim();
      const studentId = String(req.query.student_id || '').trim();
      let q = supabaseAdmin.from('generated_contract_documents').select('*').order('created_at', { ascending: false });
      if (id) {
        q = q.eq('id', id);
      } else if (studentId) {
        if (actor.role === 'student' && String(actor.student_id) !== studentId) {
          return res.status(403).json({ error: 'forbidden' });
        }
        q = q.eq('student_id', studentId);
      } else {
        if (actor.role === 'coach' && actor.coach_id) {
          const { data: studs, error: se } = await supabaseAdmin
            .from('students')
            .select('id')
            .eq('coach_id', actor.coach_id);
          if (se) throw se;
          const ids = (studs || []).map((r) => r.id);
          if (!ids.length) return res.status(200).json({ data: [] });
          q = q.in('student_id', ids);
        } else if (actor.role === 'admin' && actor.institution_id) {
          q = q.eq('institution_id', actor.institution_id);
        } else if (actor.role !== 'super_admin') {
          return res.status(403).json({ error: 'forbidden' });
        }
      }
      const { data, error } = await q.limit(id ? 1 : 200);
      if (error) throw error;
      if (id && (!data || !data.length)) return res.status(404).json({ error: 'not_found' });
      if (id) {
        const row = data[0];
        if (actor.role === 'admin' && !hasInstitutionAccess(actor, row.institution_id)) {
          return res.status(403).json({ error: 'forbidden' });
        }
        return res.status(200).json({ data: row });
      }
      return res.status(200).json({ data: data || [] });
    }

    if (req.method === 'POST') {
      const body = parseBody(req);
      const studentId = String(body.student_id || '').trim();
      if (!studentId) return res.status(400).json({ error: 'student_id_required' });
      const { data: student, error: sErr } = await supabaseAdmin.from('students').select('*').eq('id', studentId).maybeSingle();
      if (sErr) throw sErr;
      if (!student) return res.status(404).json({ error: 'student_not_found' });
      if (actor.role === 'admin' && !hasInstitutionAccess(actor, student.institution_id)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      if (actor.role === 'coach' && String(student.coach_id || '') !== String(actor.coach_id || '')) {
        return res.status(403).json({ error: 'forbidden' });
      }
      if (actor.role !== 'super_admin' && actor.role !== 'admin' && actor.role !== 'coach') {
        return res.status(403).json({ error: 'forbidden' });
      }

      const pkgId = String(body.program_package_id || student.program_package_id || '').trim();
      let pkg = null;
      if (pkgId) {
        const { data: p } = await supabaseAdmin.from('program_packages').select('*').eq('id', pkgId).maybeSingle();
        pkg = p;
      }

      const templateIds = [];
      if (body.template_ids && Array.isArray(body.template_ids)) templateIds.push(...body.template_ids);
      if (pkg) {
        if (pkg.contract_template_id) templateIds.push(pkg.contract_template_id);
        if (pkg.rules_template_id) templateIds.push(pkg.rules_template_id);
        if (body.include_program_pdf && pkg.pdf_template_id) templateIds.push(pkg.pdf_template_id);
      }
      const templates = await loadTemplatesByIds(templateIds);
      if (!templates.length) return res.status(400).json({ error: 'no_templates_resolved' });

      const institutionId = String(student.institution_id || '').trim();
      let institution = null;
      if (institutionId) {
        const { data: inst } = await supabaseAdmin.from('institutions').select('*').eq('id', institutionId).maybeSingle();
        institution = inst;
      }
      let coach = null;
      if (student.coach_id) {
        const { data: ch } = await supabaseAdmin.from('coaches').select('name').eq('id', student.coach_id).maybeSingle();
        coach = ch;
      }

      const contractNumber = contractNumberFromInstitution(institutionId);
      const verifyToken = randomToken(20);
      const signingToken = randomToken(32);
      const base = publicBaseUrl();
      const verifyUrl = `${base}/verify-document?t=${encodeURIComponent(verifyToken)}`;
      const signUrl = `${base}/sign-contract/${encodeURIComponent(signingToken)}`;

      const map = await buildContractVariableMap({
        student,
        programPackage: pkg,
        institution,
        coach,
        extras: {
          sozlesme_numarasi: contractNumber,
          qr_dogrulama_linki: verifyUrl,
          imza_baglantisi: signUrl
        }
      });

      const parts = templates.map((t) => {
        const title = `<h2 style="color:#1e3a8a;margin:12px 0 8px;">${escapeHtmlAttr(t.name)}</h2>`;
        const bodyHtml = applyTemplateVariables(t.body, map);
        return `<section class="doc-block">${title}<div class="body">${bodyHtml}</div></section>`;
      });

      const logo = map.kurum_logo_url
        ? `<div style="text-align:center;margin-bottom:12px"><img src="${escapeHtmlAttr(map.kurum_logo_url)}" alt="" style="max-height:56px"/></div>`
        : '';
      const mergedHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
        body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;line-height:1.45;padding:24px;max-width:800px;margin:0 auto}
        .body p{margin:0.5em 0}.doc-block{border-bottom:1px solid #e2e8f0;padding-bottom:16px;margin-bottom:16px}
        .meta{font-size:12px;color:#64748b;margin-top:24px;border-top:1px solid #e2e8f0;padding-top:12px}
      </style></head><body>${logo}${parts.join('<hr style="border:none;border-top:1px solid #cbd5e1;margin:20px 0"/>')}
      <div class="meta">Sözleşme no: <strong>${escapeHtmlAttr(contractNumber)}</strong> · Doğrulama: <a href="${escapeHtmlAttr(verifyUrl)}">${escapeHtmlAttr(verifyUrl)}</a></div>
      </body></html>`;

      const row = {
        institution_id: institutionId,
        student_id: studentId,
        program_package_id: pkg?.id || null,
        primary_kind: String(body.primary_kind || 'contract'),
        source_template_ids: templates.map((t) => t.id),
        merged_html: mergedHtml,
        contract_number: contractNumber,
        verify_token: verifyToken,
        signing_token: signingToken,
        status: 'draft',
        meta: { sign_url: signUrl, verify_url: verifyUrl },
        created_by: actor.sub || null,
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      };

      const { data: created, error: insErr } = await supabaseAdmin.from('generated_contract_documents').insert(row).select().single();
      if (insErr) throw insErr;
      return res.status(200).json({ data: created });
    }

    if (req.method === 'PATCH') {
      const id = String(req.query.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id_required' });
      const { data: existing, error: exErr } = await supabaseAdmin.from('generated_contract_documents').select('*').eq('id', id).maybeSingle();
      if (exErr) throw exErr;
      if (!existing) return res.status(404).json({ error: 'not_found' });
      if (actor.role === 'admin' && !hasInstitutionAccess(actor, existing.institution_id)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const body = parseBody(req);
      const patch = { updated_at: new Date().toISOString() };
      if (typeof body.status === 'string' && ['draft', 'sent', 'signed', 'void'].includes(body.status)) {
        patch.status = body.status;
      }
      const { data, error } = await supabaseAdmin.from('generated_contract_documents').update(patch).eq('id', id).select().single();
      if (error) throw error;
      return res.status(200).json({ data });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    console.error('[contract-documents]', errorMessage(e), e);
    return res.status(500).json({ error: errorMessage(e) });
  }
}

function escapeHtmlAttr(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
