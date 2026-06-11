/**
 * WABA üzerindeki şablon listesi — onay durumu senkronu (message_templates.whatsapp_template_status).
 */

const GRAPH = () => String(process.env.META_GRAPH_API_VERSION || 'v21.0').trim() || 'v21.0';

function authHeaders(tok) {
  return { Authorization: `Bearer ${tok}` };
}

async function graphGet(url, tok) {
  const res = await fetch(url, { headers: authHeaders(tok) });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

async function resolveWabaIdFromPhone(tok) {
  const pid = process.env.META_PHONE_NUMBER_ID?.trim();
  if (!pid || !tok) return null;
  try {
    const url = `https://graph.facebook.com/${GRAPH()}/${encodeURIComponent(pid)}?fields=whatsapp_business_account`;
    const { ok, json } = await graphGet(url, tok);
    if (!ok) return null;
    const waba = json?.whatsapp_business_account;
    if (typeof waba === 'string' && waba.trim()) return waba.trim();
    if (waba && typeof waba === 'object' && waba.id) return String(waba.id).trim();
    return null;
  } catch {
    return null;
  }
}

/** Token ile erişilebilir işletmelerdeki tüm WABA kimlikleri. */
async function discoverWabaIdsFromBusinesses(tok) {
  const out = [];
  const seen = new Set();
  const add = (id) => {
    const s = String(id || '').trim();
    if (!s || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };

  const businessSeeds = [];
  const envBiz = process.env.META_BUSINESS_ID?.trim();
  if (envBiz) businessSeeds.push(envBiz);

  try {
    const meUrl = `https://graph.facebook.com/${GRAPH()}/me/businesses?fields=id,name&limit=50`;
    const me = await graphGet(meUrl, tok);
    if (me.ok) {
      for (const b of me.json.data || []) {
        if (b?.id) businessSeeds.push(String(b.id));
      }
    }
  } catch {
    /* ignore */
  }

  for (const bizId of [...new Set(businessSeeds)]) {
    try {
      const url = `https://graph.facebook.com/${GRAPH()}/${encodeURIComponent(bizId)}/owned_whatsapp_business_accounts?fields=id,name&limit=50`;
      const r = await graphGet(url, tok);
      if (!r.ok) continue;
      for (const w of r.json.data || []) {
        add(w?.id);
      }
    } catch {
      /* ignore */
    }
  }

  return out;
}

/**
 * META_WABA_ID bazen işletme kimliği olur; alt WABA'ları genişlet.
 * @param {string} id
 * @param {string} tok
 */
async function expandWabaCandidates(id, tok) {
  const root = String(id || '').trim();
  if (!root) return [];
  const out = [root];
  try {
    const url = `https://graph.facebook.com/${GRAPH()}/${encodeURIComponent(root)}/owned_whatsapp_business_accounts?fields=id&limit=50`;
    const r = await graphGet(url, tok);
    if (r.ok) {
      for (const w of r.json.data || []) {
        if (w?.id) out.push(String(w.id));
      }
    }
  } catch {
    /* ignore */
  }
  return [...new Set(out)];
}

/** Gönderim numarası WABA'sı öncelikli; ardından env + keşfedilen hesaplar. */
export async function resolveWabaIds() {
  const tok = process.env.META_WHATSAPP_TOKEN?.trim();
  const out = [];
  const seen = new Set();
  const add = (id) => {
    const s = String(id || '').trim();
    if (!s || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };

  add(await resolveWabaIdFromPhone(tok));

  const envWaba = process.env.META_WABA_ID?.trim();
  if (envWaba && tok) {
    for (const w of await expandWabaCandidates(envWaba, tok)) add(w);
  } else if (envWaba) {
    add(envWaba);
  }

  if (tok) {
    for (const w of await discoverWabaIdsFromBusinesses(tok)) add(w);
  }

  return out;
}

async function fetchTemplatesForWaba(waba, tok, { includeComponents = false } = {}) {
  const fields = includeComponents ? 'name,status,language,components' : 'name,status,language';
  const rows = [];
  let url = `https://graph.facebook.com/${GRAPH()}/${encodeURIComponent(waba)}/message_templates?fields=${fields}&limit=250`;
  while (url) {
    const { ok, json } = await graphGet(url, tok);
    if (!ok) {
      return {
        ok: false,
        error: json?.error?.message || 'fetch_failed',
        templates: rows
      };
    }
    for (const row of json.data || []) rows.push(row);
    url = json.paging?.next || null;
  }
  return { ok: true, templates: rows };
}

/** Meta ad filtresi — listede görünmeyen şablonlar için. */
async function fetchTemplateByNameFromWaba(waba, templateName, tok) {
  const name = String(templateName || '').trim();
  if (!waba || !name || !tok) return [];
  const q = new URLSearchParams({
    fields: 'name,status,language',
    limit: '50',
    name
  });
  const url = `https://graph.facebook.com/${GRAPH()}/${encodeURIComponent(waba)}/message_templates?${q}`;
  const { ok, json } = await graphGet(url, tok);
  if (!ok) return [];
  return json.data || [];
}

function templateKey(row) {
  return `${String(row.name || '').trim().toLowerCase()}|${normalizeLangKey(row.language || '')}`;
}

export async function fetchAllMetaMessageTemplates(opts = {}) {
  const includeComponents = opts.includeComponents === true;
  const tok = process.env.META_WHATSAPP_TOKEN?.trim();
  const wabaIds = await resolveWabaIds();
  if (!wabaIds.length || !tok) {
    return {
      ok: false,
      error: 'missing_meta_waba_or_token',
      templates: [],
      waba_ids: wabaIds,
      waba_errors: {}
    };
  }

  const merged = [];
  const seen = new Set();
  /** @type {Record<string, string>} */
  const waba_errors = {};

  for (const waba of wabaIds) {
    const r = await fetchTemplatesForWaba(waba, tok, { includeComponents });
    if (!r.ok) {
      waba_errors[waba] = r.error || 'fetch_failed';
      continue;
    }
    for (const row of r.templates) {
      const k = templateKey(row);
      if (seen.has(k)) continue;
      seen.add(k);
      merged.push(row);
    }
  }

  if (!merged.length) {
    const firstErr = Object.values(waba_errors)[0];
    if (Object.keys(waba_errors).length === wabaIds.length) {
      return {
        ok: false,
        error: firstErr || 'all_waba_fetch_failed',
        templates: [],
        waba_ids: wabaIds,
        waba_errors
      };
    }
    return {
      ok: false,
      error: 'no_templates_from_meta',
      templates: [],
      waba_ids: wabaIds,
      waba_errors,
      hint: 'WABA erişildi ama şablon listesi boş — META_WABA_ID doğru WhatsApp Business hesabı mı?'
    };
  }

  return { ok: true, templates: merged, waba_ids: wabaIds, waba_errors };
}

/** Belirli şablon adı için tüm WABA'larda arama (liste + ad filtresi). */
export async function fetchMetaTemplatesForName(templateName) {
  const list = await fetchAllMetaMessageTemplates();
  const name = String(templateName || '').trim();
  const fromList = findMetaTemplatesByName(list.templates, name);
  if (fromList.length) {
    return { ...list, matches: fromList, searched_name: name };
  }

  const tok = process.env.META_WHATSAPP_TOKEN?.trim();
  const extra = [];
  const seen = new Set(fromList.map(templateKey));
  for (const waba of list.waba_ids || []) {
    const rows = await fetchTemplateByNameFromWaba(waba, name, tok);
    for (const row of rows) {
      const k = templateKey(row);
      if (seen.has(k)) continue;
      seen.add(k);
      extra.push(row);
    }
  }

  const matches = [...fromList, ...extra];
  const templates = [...(list.templates || [])];
  for (const row of extra) {
    if (!templates.some((t) => templateKey(t) === templateKey(row))) templates.push(row);
  }

  return {
    ...list,
    templates,
    matches,
    searched_name: name
  };
}

function langMatches(wantLang, haveLang) {
  const a = normalizeLangKey(wantLang);
  const b = normalizeLangKey(haveLang);
  if (!a || !b) return false;
  if (a === b) return true;
  const aBase = a.split('_')[0];
  const bBase = b.split('_')[0];
  if (aBase && aBase === bBase) return true;
  return false;
}

/**
 * @param {{ name: string, language?: string }[]} templates — Graph API satırları
 * @param {string} templateName
 * @param {string} languageCode örn. tr, en_US
 */
export function findMetaTemplateStatus(templates, templateName, languageCode) {
  const wantName = String(templateName || '').trim().toLowerCase();
  const wantLang = languageCode || 'tr';
  for (const t of templates || []) {
    const n = String(t.name || '').trim().toLowerCase();
    if (n === wantName && langMatches(wantLang, t.language || '')) {
      return String(t.status || 'unknown');
    }
  }
  return null;
}

function normalizeLangKey(code) {
  return String(code || '')
    .trim()
    .replace(/-/g, '_')
    .toLowerCase();
}

export { normalizeLangKey };

/** Meta WABA’da adı eşleşen tüm şablon satırları (dil + durum). */
export function findMetaTemplatesByName(templates, templateName) {
  const wantName = String(templateName || '').trim().toLowerCase();
  if (!wantName) return [];
  return (templates || []).filter((t) => String(t.name || '').trim().toLowerCase() === wantName);
}

/** Ad tam eşleşmezse yos_deneme_snav ↔ yos_deneme_sinav gibi benzerleri bulur. */
export function findMetaTemplatesByNameLoose(templates, templateName) {
  const want = String(templateName || '').trim().toLowerCase();
  if (!want) return [];
  const exact = findMetaTemplatesByName(templates, want);
  if (exact.length) return exact;
  return (templates || []).filter((t) => {
    const n = String(t.name || '').trim().toLowerCase();
    if (!n) return false;
    return n.includes(want) || want.includes(n);
  });
}

export function findSimilarMetaTemplateNames(templates, fragment, limit = 15) {
  const q = String(fragment || '').trim().toLowerCase();
  if (!q) return [];
  const names = [...new Set((templates || []).map((t) => String(t.name || '').trim()).filter(Boolean))];
  return names.filter((n) => n.toLowerCase().includes(q)).slice(0, limit);
}

/**
 * Gönderimde denenecek dil kodları — önce paneldeki tercih, sonra Meta’daki onaylı diller.
 */
export function buildLanguageTryOrder(templates, templateName, preferredLang) {
  const rows = findMetaTemplatesByName(templates, templateName);
  const out = [];
  const seen = new Set();
  const add = (code) => {
    const raw = String(code || '').trim();
    if (!raw) return;
    const key = normalizeLangKey(raw);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(raw);
  };

  add(preferredLang);
  add('tr');
  add('tr_TR');
  add('Turkish');

  for (const row of rows) {
    if (String(row.status || '').toUpperCase() === 'APPROVED') add(row.language);
  }
  for (const row of rows) add(row.language);

  return out;
}

/** WABA listesinden gönderim için dil sırası. */
export async function resolveLanguageTryOrderForSend(templateName, preferredLang) {
  const list = await fetchMetaTemplatesForName(templateName);
  if (!list.ok) {
    return buildLanguageTryOrder([], templateName, preferredLang);
  }
  return buildLanguageTryOrder(list.templates, templateName, preferredLang);
}

/** Panel tanı: unknown nedenini göstermek için (token/WABA/şablon adı). */
export async function getMetaTemplateSyncDiagnostics(templateName, preferredLang) {
  const name = String(templateName || '').trim();
  const list = await fetchMetaTemplatesForName(name);
  const matches = list.matches || findMetaTemplatesByName(list.templates, name);
  const status =
    findMetaTemplateStatus(list.templates, name, preferredLang) ||
    (matches[0] ? String(matches[0].status || 'unknown') : null);

  const allNames = [...new Set((list.templates || []).map((t) => String(t.name || '').trim()).filter(Boolean))];
  const reportLike = allNames.filter((n) => /report|reminder|rapor/i.test(n));

  return {
    ok: list.ok,
    error: list.error || null,
    waba_ids: list.waba_ids || [],
    waba_errors: list.waba_errors || {},
    template_count: (list.templates || []).length,
    searched_name: name,
    matches,
    status,
    available_languages: matches.map((m) => ({
      language: m.language,
      status: m.status
    })),
    similar_names: reportLike.slice(0, 15),
    sample_names: allNames.slice(0, 25)
  };
}
