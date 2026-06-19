import { supabaseAdmin } from './supabase-admin.js';
import {
  fetchAllMetaMessageTemplates,
  fetchMetaTemplatesForName,
  fetchMetaTemplatesFromPhoneWaba,
  fetchTemplatesForWaba,
  findMetaTemplatesByName,
  findMetaTemplatesByNameLoose,
  findSimilarMetaTemplateNames,
  isMetaTemplateSendableStatus,
  resolveWabaIds,
  templateBodyUsesNamedParams
} from './meta-templates-sync.js';

const GRAPH = () => String(process.env.META_GRAPH_API_VERSION || 'v21.0').trim() || 'v21.0';

const NUM_VAR_ALIASES = ['ad', 'isim', 'name', 'ogrenci', 'student_name', 'veli'];

function authHeaders(tok) {
  return { Authorization: `Bearer ${tok}` };
}

async function graphGet(url, tok) {
  const res = await fetch(url, { headers: authHeaders(tok) });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

/** Meta BODY metnindeki {{ad}} veya {{1}} değişkenlerini sırayla çıkarır. */
export function parseBodyVariablesFromText(text) {
  const vars = [];
  const seen = new Set();
  const add = (v) => {
    const k = String(v || '').trim().toLowerCase();
    if (!k || seen.has(k)) return;
    seen.add(k);
    vars.push(k);
  };

  const t = String(text || '');
  for (const m of t.matchAll(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g)) {
    add(m[1]);
  }

  const nums = [...t.matchAll(/\{\{(\d+)\}\}/g)]
    .map((m) => parseInt(m[1], 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (nums.length && vars.length === 0) {
    const max = Math.max(...nums);
    for (let i = 1; i <= max; i++) {
      add(NUM_VAR_ALIASES[i - 1] || `param_${i}`);
    }
  }
  return vars;
}

export function extractBodyFromComponents(components) {
  const body = (components || []).find((c) => String(c.type || '').toUpperCase() === 'BODY');
  return String(body?.text || '').trim();
}

/** Meta gövdesi yalnızca {{1}}, {{2}} … kullanıyorsa adlandırılmış parametre gönderilmemeli. */
export function bodyUsesOnlyNumericPlaceholders(text) {
  const t = String(text || '');
  const hasNamed = /\{\{[a-zA-Z_][a-zA-Z0-9_]*\}\}/.test(t);
  const hasNumeric = /\{\{\d+\}\}/.test(t);
  return hasNumeric && !hasNamed;
}

export function slugTypeFromMetaName(name) {
  const slug = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || 'meta_template';
}

function langMatches(wantLang, haveLang) {
  const a = String(wantLang || '')
    .trim()
    .replace(/-/g, '_')
    .toLowerCase();
  const b = String(haveLang || '')
    .trim()
    .replace(/-/g, '_')
    .toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  return a.split('_')[0] === b.split('_')[0];
}

function pickTemplateRow(rows, wantLang) {
  const list = rows || [];
  if (!list.length) return null;
  return (
    list.find((r) => langMatches(wantLang, r.language)) ||
    list.find((r) => String(r.status || '').toUpperCase() === 'APPROVED') ||
    list[0]
  );
}

function pickApprovedPhoneWabaRow(matches, preferredLang) {
  const list = matches || [];
  const approved = list.filter((r) => isMetaTemplateSendableStatus(r.status));
  const pool = approved;
  if (!pool.length) return null;
  if (preferredLang) {
    const hit = pool.find((r) => langMatches(preferredLang, r.language));
    if (hit) return hit;
  }
  const tr = pool.find((r) => {
    const l = String(r.language || '')
      .trim()
      .replace(/-/g, '_')
      .toLowerCase();
    return l === 'tr' || l === 'tr_tr' || l.startsWith('tr_');
  });
  return tr || pool[0] || null;
}

/**
 * Gönderim numarasının WABA'sından message_templates satırını günceller.
 * sendAutomatedWhatsApp ile aynı dil/bağlama kaynağını kullanır (#132001 önlemi).
 * @param {{ type: string, metaName: string, displayName?: string, preferredLang?: string, canonicalBindings?: string[] | null, phoneWabaOnly?: boolean }} opts
 */
export async function syncMessageTemplateRowFromPhoneWaba(opts) {
  const type = String(opts?.type || '').trim();
  const metaName = String(opts?.metaName || '').trim();
  const preferredLang = String(opts?.preferredLang || 'tr').trim() || 'tr';
  const phoneWabaOnly = opts?.phoneWabaOnly === true;
  if (!type || !metaName) {
    return { ok: false, error: 'type_and_meta_name_required' };
  }

  let hit = null;
  let wabaId = null;
  let wabaSource = null;

  const phone = await fetchMetaTemplatesFromPhoneWaba(metaName, { includeComponents: true });
  if (phone.ok) {
    wabaId = phone.waba_id;
    wabaSource = phone.waba_source;
    hit = pickApprovedPhoneWabaRow(phone.matches, preferredLang);
  }

  if (!hit?.name && !phoneWabaOnly) {
    const detail = await fetchMetaTemplateWithComponents(metaName, preferredLang);
    if (detail.ok && detail.template) {
      hit = detail.template;
      wabaId = detail.waba_id || wabaId;
      wabaSource = wabaSource || 'waba_scan';
    }
  }

  if (!hit?.name && phone.ok && phone.matches?.length) {
    const pending = phone.matches
      .map((m) => `${m.language || '?'}: ${m.status || '?'}`)
      .join(', ');
    return {
      ok: false,
      error: 'template_not_approved',
      waba_id: wabaId,
      searched_name: metaName,
      hint: `Gönderim numarasının WABA'sında "${metaName}" var ancak henüz onaylı değil (${pending}). Meta Business Manager'da şablonu onaylayın.`,
      available_languages: phone.matches.map((m) => ({
        language: m.language,
        status: m.status
      }))
    };
  }

  if (!hit?.name) {
    let hint = phone.hint || '';
    if (!hint && phone.ok) {
      hint = `Gönderim numaranızın WABA'sında onaylı "${metaName}" şablonu yok. Meta BM'de aynı WhatsApp hesabında oluşturup onaylayın (dil: tr veya tr_TR).`;
    }
    if (!hint) {
      hint =
        'META_WABA_ID ekleyin (WhatsApp Manager → Hesap kimliği) veya token ile phone number aynı uygulamadan olsun.';
    }
    if (phone.ok && wabaId) {
      const tok = process.env.META_WHATSAPP_TOKEN?.trim();
      const full = await fetchTemplatesForWaba(wabaId, tok);
      if (full.ok) {
        const kitapLike = (full.templates || [])
          .filter((t) => /kitap/i.test(String(t.name || '')))
          .slice(0, 8)
          .map((t) => `${t.name} [${t.language}, ${t.status}]`);
        if (kitapLike.length) {
          hint += ` WABA'daki kitap şablonları: ${kitapLike.join('; ')}.`;
        }
      }
    }
    return {
      ok: false,
      error: phone.ok ? 'template_not_found_on_waba' : phone.error || 'phone_waba_unresolved',
      waba_id: wabaId,
      searched_name: metaName,
      hint
    };
  }

  const bodyText = extractBodyFromComponents(hit.components);
  const parsedVars = parseBodyVariablesFromText(bodyText);
  const numericOnly = bodyUsesOnlyNumericPlaceholders(bodyText);
  const canonical = Array.isArray(opts?.canonicalBindings)
    ? opts.canonicalBindings.map((x) => String(x || '').trim()).filter(Boolean)
    : null;
  let bindings = parsedVars;
  if (canonical?.length && canonical.length === parsedVars.length) {
    if (numericOnly) {
      bindings = canonical;
    } else {
      const parsedLc = parsedVars.map((v) => String(v || '').toLowerCase());
      const canonLc = canonical.map((v) => String(v || '').toLowerCase());
      const sameSet =
        parsedLc.length === canonLc.length && parsedLc.every((v) => canonLc.includes(v));
      bindings = sameSet ? parsedVars : canonical;
    }
  }
  const namedParams = numericOnly
    ? false
    : String(hit.parameter_format || '').toUpperCase() === 'NAMED' ||
      templateBodyUsesNamedParams(hit.components) ||
      parsedVars.some((v) => !/^param_\d+$/.test(v));

  const now = new Date().toISOString();
  const patch = {
    content: bodyText || `[Meta: ${metaName}]`,
    variables: bindings,
    twilio_variable_bindings: bindings,
    meta_template_name: String(hit.name).trim(),
    meta_template_language: String(hit.language || preferredLang).trim() || preferredLang,
    meta_named_body_parameters: namedParams,
    channel: 'whatsapp',
    is_active: true,
    whatsapp_template_status: String(hit.status || 'APPROVED'),
    whatsapp_template_synced_at: now,
    updated_at: now
  };
  const displayName = String(opts?.displayName || '').trim();
  if (displayName) patch.name = displayName;

  const { data: existing } = await supabaseAdmin
    .from('message_templates')
    .select('id, name')
    .eq('type', type)
    .maybeSingle();
  if (!patch.name && existing?.name) patch.name = existing.name;
  if (!patch.name) patch.name = metaName.replace(/_/g, ' ');

  const { data: saved, error } = await supabaseAdmin
    .from('message_templates')
    .upsert({ type, ...patch }, { onConflict: 'type' })
    .select('*')
    .single();
  if (error) throw error;

  return {
    ok: true,
    template: saved,
    bindings,
    meta_named_body_parameters: namedParams,
    waba_id: wabaId,
    waba_source: wabaSource,
    available_languages: (phone.ok ? phone.matches : [hit]).map((m) => ({
      language: m.language,
      status: m.status
    }))
  };
}

async function fetchTemplateRowByNameFromWaba(waba, name, tok) {
  const q = new URLSearchParams({
    fields: 'name,status,language,components',
    limit: '50',
    name
  });
  const url = `https://graph.facebook.com/${GRAPH()}/${encodeURIComponent(waba)}/message_templates?${q}`;
  const { ok, json } = await graphGet(url, tok);
  if (!ok) return [];
  return json.data || [];
}

/** Meta WABA'dan components dahil şablon detayı. */
export async function fetchMetaTemplateWithComponents(templateName, languageCode = 'tr') {
  const tok = process.env.META_WHATSAPP_TOKEN?.trim();
  const name = String(templateName || '').trim();
  if (!tok || !name) {
    return { ok: false, error: 'missing_meta_token_or_name', template: null };
  }

  const wabaIds = await resolveWabaIds();
  const wantLang = String(languageCode || 'tr').trim() || 'tr';

  for (const waba of wabaIds) {
    const rows = await fetchTemplateRowByNameFromWaba(waba, name, tok);
    const hit = pickTemplateRow(rows, wantLang);
    if (hit?.components) return { ok: true, template: hit, waba_id: waba };
    if (hit && !hit.components) {
      const retry = await fetchTemplateRowByNameFromWaba(waba, hit.name || name, tok);
      const hit2 = pickTemplateRow(retry, wantLang);
      if (hit2) return { ok: true, template: hit2, waba_id: waba };
    }
  }

  const list = await fetchMetaTemplatesForName(name);
  let matches = list.matches?.length ? list.matches : findMetaTemplatesByNameLoose(list.templates, name);

  if (!matches.length && list.ok) {
    const full = await fetchAllMetaMessageTemplates({ includeComponents: true });
    matches = findMetaTemplatesByNameLoose(full.templates, name);
    if (matches.length) {
      const hit = pickTemplateRow(matches, wantLang);
      if (hit?.components) {
        return { ok: true, template: hit, waba_id: (full.waba_ids || [])[0] || null };
      }
    }
  }

  if (!list.ok && !matches.length) {
    return {
      ok: false,
      error: list.error || 'template_not_found',
      template: null,
      waba_errors: list.waba_errors
    };
  }

  const hit = pickTemplateRow(matches, wantLang);
  if (!hit) {
    const similar = findSimilarMetaTemplateNames(list.templates, name.split('_')[0] || name);
    return {
      ok: false,
      error: 'template_not_found',
      template: null,
      similar_names: similar,
      template_count: (list.templates || []).length
    };
  }

  if (!hit.components) {
    for (const waba of wabaIds) {
      const rows = await fetchTemplateRowByNameFromWaba(waba, hit.name || name, tok);
      const withComponents = pickTemplateRow(rows, wantLang);
      if (withComponents?.components) {
        return { ok: true, template: withComponents, waba_id: waba };
      }
    }
  }

  return { ok: true, template: hit, waba_id: (list.waba_ids || [])[0] || null };
}

/** Meta onaylı şablonları listele; Supabase'de olanları işaretle. */
export async function listMetaTemplatesForEventsImport() {
  const list = await fetchAllMetaMessageTemplates();
  if (!list.ok) {
    return { ok: false, error: list.error || 'meta_fetch_failed', templates: [], waba_ids: list.waba_ids };
  }

  const { data: existing, error } = await supabaseAdmin
    .from('message_templates')
    .select('type, meta_template_name, meta_template_language');
  if (error) throw error;

  const imported = new Set(
    (existing || [])
      .map((r) => `${String(r.meta_template_name || r.type || '').trim().toLowerCase()}|${String(r.meta_template_language || 'tr').trim().toLowerCase()}`)
      .filter((k) => k && !k.startsWith('|'))
  );

  const templates = (list.templates || [])
    .map((t) => {
      const name = String(t.name || '').trim();
      const lang = String(t.language || 'tr').trim();
      const status = String(t.status || 'unknown').toUpperCase();
      const key = `${name.toLowerCase()}|${lang.toLowerCase()}`;
      return {
        meta_template_name: name,
        meta_template_language: lang,
        status,
        can_import: status === 'APPROVED',
        imported: imported.has(key)
      };
    })
    .sort((a, b) => a.meta_template_name.localeCompare(b.meta_template_name, 'tr'));

  return {
    ok: true,
    templates,
    template_count: templates.length,
    waba_ids: list.waba_ids,
    waba_errors: list.waba_errors
  };
}

/**
 * Meta şablonunu message_templates'e ekler — Etkinlikler dropdown'ında görünür.
 * @param {{ meta_template_name: string, meta_template_language?: string, display_name?: string }} opts
 */
export async function importMetaTemplateForEvents(opts) {
  const metaName = String(opts.meta_template_name || '').trim();
  const lang = String(opts.meta_template_language || 'tr').trim() || 'tr';
  if (!metaName) return { ok: false, error: 'meta_template_name_required' };

  const detail = await fetchMetaTemplateWithComponents(metaName, lang);
  if (!detail.ok || !detail.template) {
    return {
      ok: false,
      error: detail.error || 'template_not_found',
      similar_names: detail.similar_names,
      template_count: detail.template_count,
      waba_errors: detail.waba_errors,
      hint:
        detail.error === 'missing_meta_token_or_name'
          ? 'Vercel META_WHATSAPP_TOKEN tanımlı değil.'
          : 'Meta BM şablon adını birebir yazın (ör. yos_deneme_snav). WABA kimliği META_WABA_ID ile aynı hesap olmalı.'
    };
  }

  const row = detail.template;
  const bodyText = extractBodyFromComponents(row.components);
  const variables = parseBodyVariablesFromText(bodyText);
  const namedParams = variables.some((v) => !/^param_\d+$/.test(v));
  const type = slugTypeFromMetaName(metaName);
  const displayName = String(opts.display_name || '').trim() || metaName.replace(/_/g, ' ');

  const payload = {
    type,
    name: displayName,
    content: bodyText || `[Meta şablon: ${metaName}]`,
    variables,
    twilio_variable_bindings: variables,
    channel: 'whatsapp',
    is_active: true,
    meta_template_name: metaName,
    meta_template_language: String(row.language || lang).trim() || lang,
    meta_named_body_parameters: namedParams,
    whatsapp_template_status: String(row.status || 'APPROVED'),
    whatsapp_template_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const { data: existingRows } = await supabaseAdmin
    .from('message_templates')
    .select('id, type, meta_template_name');
  const existing =
    (existingRows || []).find(
      (r) => String(r.meta_template_name || '').trim().toLowerCase() === metaName.toLowerCase()
    ) || null;

  let saved;
  if (existing?.id) {
    const { data, error } = await supabaseAdmin
      .from('message_templates')
      .update(payload)
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) throw error;
    saved = data;
  } else {
    const { data: byType } = await supabaseAdmin
      .from('message_templates')
      .select('id')
      .eq('type', type)
      .maybeSingle();
    if (byType?.id) {
      const { data, error } = await supabaseAdmin
        .from('message_templates')
        .update(payload)
        .eq('id', byType.id)
        .select('*')
        .single();
      if (error) throw error;
      saved = data;
    } else {
      const { data, error } = await supabaseAdmin
        .from('message_templates')
        .insert({ ...payload, created_at: new Date().toISOString() })
        .select('*')
        .single();
      if (error) throw error;
      saved = data;
    }
  }

  return {
    ok: true,
    template: saved,
    variables,
    body_preview: bodyText
  };
}

function templateRegistryKey(name, lang) {
  return `${String(name || '').trim().toLowerCase()}|${String(lang || 'tr').trim().toLowerCase()}`;
}

/**
 * Meta'daki onaylı şablonları message_templates'e otomatik ekler.
 * Etkinlikler dropdown yalnızca Supabase'den okur; yeni Meta şablonları burada senkronlanır.
 */
export async function syncApprovedMetaTemplatesForEvents() {
  const list = await fetchAllMetaMessageTemplates();
  if (!list.ok) {
    return {
      ok: false,
      synced: 0,
      error: list.error || 'meta_fetch_failed',
      waba_ids: list.waba_ids || [],
      waba_errors: list.waba_errors || {}
    };
  }

  const { data: existing, error: exErr } = await supabaseAdmin
    .from('message_templates')
    .select('meta_template_name, meta_template_language, type');
  if (exErr) throw exErr;

  const known = new Set();
  for (const r of existing || []) {
    const n = String(r.meta_template_name || r.type || '').trim();
    const l = String(r.meta_template_language || 'tr').trim();
    if (n) known.add(templateRegistryKey(n, l));
  }

  const approved = (list.templates || []).filter(
    (t) => String(t.status || '').toUpperCase() === 'APPROVED'
  );

  let synced = 0;
  const errors = [];
  for (const t of approved) {
    const name = String(t.name || '').trim();
    const lang = String(t.language || 'tr').trim();
    if (!name) continue;
    const key = templateRegistryKey(name, lang);
    if (known.has(key)) continue;

    const out = await importMetaTemplateForEvents({
      meta_template_name: name,
      meta_template_language: lang
    });
    if (out.ok) {
      synced++;
      known.add(key);
    } else {
      errors.push({ name, lang, error: out.error, hint: out.hint });
    }
  }

  return {
    ok: true,
    synced,
    approved_count: approved.length,
    meta_total: (list.templates || []).length,
    waba_ids: list.waba_ids || [],
    waba_errors: list.waba_errors || {},
    errors: errors.slice(0, 8)
  };
}
