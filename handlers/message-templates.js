import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { fetchAllMetaMessageTemplates, findMetaTemplateStatus, findMetaTemplatesByName, fetchMetaTemplatesForName, getMetaTemplateSyncDiagnostics } from '../api/_lib/meta-templates-sync.js';
import { buildTemplatePreview } from '../api/_lib/whatsapp-outbound.js';

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

function normalizeBindings(v) {
  if (v === undefined || v === null) return undefined;
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
    if (body.twilio_variable_bindings !== undefined) {
      const b = normalizeBindings(body.twilio_variable_bindings);
      if (b === null) return res.status(400).json({ error: 'invalid_twilio_variable_bindings' });
      if (b !== undefined) patch.twilio_variable_bindings = b;
    }
    if (body.meta_template_name !== undefined) {
      patch.meta_template_name =
        body.meta_template_name === null ? null : String(body.meta_template_name || '').trim() || null;
    }
    if (body.meta_template_language !== undefined) {
      patch.meta_template_language =
        body.meta_template_language === null
          ? null
          : String(body.meta_template_language || '').trim() || 'tr';
    }
    if (body.meta_named_body_parameters !== undefined) {
      patch.meta_named_body_parameters = Boolean(body.meta_named_body_parameters);
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

  if (req.method === 'POST') {
    const body = parseBody(req);
    const action = String(body.action || '').trim();

    if (action === 'sync_meta_templates') {
      const list = await fetchAllMetaMessageTemplates();
      if (!list.ok) {
        return res.status(400).json({ ok: false, error: list.error || 'sync_failed' });
      }

      const { data: rows, error: qErr } = await supabaseAdmin
        .from('message_templates')
        .select('id,meta_template_name,meta_template_language')
        .not('meta_template_name', 'is', null);
      if (qErr) return res.status(500).json({ error: qErr.message });

      const results = [];
      for (const row of rows || []) {
        const name = String(row.meta_template_name || '').trim();
        if (!name) continue;
        const lang = String(row.meta_template_language || 'tr').trim() || 'tr';
        const status = findMetaTemplateStatus(list.templates, name, lang);
        await supabaseAdmin
          .from('message_templates')
          .update({
            whatsapp_template_status: status || 'unknown',
            whatsapp_template_synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', row.id);
        results.push({
          id: row.id,
          meta_template_name: name,
          status: status || 'unknown'
        });
      }
      return res.status(200).json({ ok: true, synced: results.length, results });
    }

    if (action === 'preview_template') {
      const templateType = String(body.template_type || '').trim();
      if (!templateType) return res.status(400).json({ error: 'template_type_required' });
      const vars =
        body.variables && typeof body.variables === 'object' && !Array.isArray(body.variables)
          ? body.variables
          : {};
      const strVars = {};
      for (const [k, v] of Object.entries(vars)) {
        strVars[String(k)] = v == null ? '' : String(v);
      }
      const { data: row, error: rowErr } = await supabaseAdmin
        .from('message_templates')
        .select('*')
        .eq('type', templateType)
        .maybeSingle();
      if (rowErr) return res.status(500).json({ error: rowErr.message });
      if (!row) return res.status(404).json({ error: 'template_not_found' });
      const preview = buildTemplatePreview(row, strVars);
      return res.status(200).json({ preview, template_type: templateType });
    }

    if (action === 'sync_meta_template') {
      const id = typeof body.id === 'string' ? body.id.trim() : '';
      if (!id) return res.status(400).json({ error: 'id_required' });
      const { data: row, error: oneErr } = await supabaseAdmin
        .from('message_templates')
        .select('id,meta_template_name,meta_template_language,type')
        .eq('id', id)
        .maybeSingle();
      if (oneErr) return res.status(500).json({ error: oneErr.message });
      const name = String(row?.meta_template_name || row?.type || '').trim();
      if (!name) return res.status(400).json({ error: 'meta_template_name_missing' });
      const lang = String(row?.meta_template_language || 'tr').trim() || 'tr';

      const diag = await getMetaTemplateSyncDiagnostics(name, lang);
      if (!diag.ok) {
        return res.status(400).json({
          ok: false,
          error: diag.error || 'sync_failed',
          waba_ids: diag.waba_ids,
          waba_errors: diag.waba_errors,
          hint:
            'Meta API şablon listesi alınamadı. Vercel’de META_WHATSAPP_TOKEN geçerli mi? META_WABA_ID, WhatsApp Manager’daki waba_id ile aynı mı? (İşletme kimliği değil, WABA kimliği olmalı.)'
        });
      }

      const matches = diag.matches || [];
      const available_languages = diag.available_languages || [];
      let resolvedLang = lang;
      if (!findMetaTemplateStatus(matches, name, lang) && matches.length === 1 && matches[0].language) {
        resolvedLang = String(matches[0].language).trim();
      } else if (!findMetaTemplateStatus(matches, name, lang) && matches.length > 1) {
        const approved = matches.find((m) => String(m.status || '').toUpperCase() === 'APPROVED');
        if (approved?.language) resolvedLang = String(approved.language).trim();
      }

      const finalStatus =
        findMetaTemplateStatus(matches, name, lang) ||
        findMetaTemplateStatus(matches, name, resolvedLang) ||
        (matches[0] ? String(matches[0].status || 'unknown') : 'unknown');

      const patch = {
        whatsapp_template_status: finalStatus,
        whatsapp_template_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      if (resolvedLang !== lang) {
        patch.meta_template_language = resolvedLang;
      }
      await supabaseAdmin.from('message_templates').update(patch).eq('id', row.id);

      let hint = null;
      if (finalStatus === 'unknown' || !matches.length) {
        const parts = [
          `Meta API’de "${name}" bulunamadı (${diag.template_count} şablon tarandı, WABA: ${(diag.waba_ids || []).join(', ') || 'yok'}).`,
          diag.similar_names?.length
            ? `Benzer adlar: ${diag.similar_names.join(', ')}`
            : 'Benzer isimli şablon yok — Meta BM’deki adı birebir meta_template_name alanına yazın.',
          diag.waba_errors && Object.keys(diag.waba_errors).length
            ? `WABA hataları: ${Object.entries(diag.waba_errors).map(([k, v]) => `${k}=${v}`).join('; ')}`
            : null
        ].filter(Boolean);
        hint = parts.join(' ');
      } else if (!findMetaTemplateStatus(matches, name, lang) && matches.length > 0) {
        hint = `Dil güncellendi veya Meta'da şu diller var: ${available_languages.map((x) => `${x.language} (${x.status})`).join(', ')}`;
      }

      return res.status(200).json({
        ok: true,
        template_id: row.id,
        status: patch.whatsapp_template_status,
        meta_template_language: patch.meta_template_language || lang,
        available_languages,
        waba_ids: diag.waba_ids,
        template_count: diag.template_count,
        similar_names: diag.similar_names,
        hint
      });
    }

    if (action === 'debug_meta_waba') {
      const diag = await getMetaTemplateSyncDiagnostics(
        String(body.template_name || 'report_reminder').trim(),
        String(body.language || 'tr').trim() || 'tr'
      );
      return res.status(diag.ok ? 200 : 400).json(diag);
    }

    return res.status(400).json({ error: 'unknown_action' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
