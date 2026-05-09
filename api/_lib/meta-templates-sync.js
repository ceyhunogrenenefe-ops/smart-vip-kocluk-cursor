/**
 * WABA üzerindeki şablon listesi — onay durumu senkronu (message_templates.whatsapp_template_status).
 */

const GRAPH = () => String(process.env.META_GRAPH_API_VERSION || 'v21.0').trim() || 'v21.0';

export async function fetchAllMetaMessageTemplates() {
  const waba = process.env.META_WABA_ID?.trim();
  const tok = process.env.META_WHATSAPP_TOKEN?.trim();
  if (!waba || !tok) {
    return { ok: false, error: 'missing_meta_waba_or_token', templates: [] };
  }

  const out = [];
  let url = `https://graph.facebook.com/${GRAPH()}/${encodeURIComponent(waba)}/message_templates?fields=name,status,language&limit=100`;

  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        error: json?.error?.message || `http_${res.status}`,
        templates: out
      };
    }
    for (const row of json.data || []) {
      out.push(row);
    }
    url = json.paging?.next || null;
  }

  return { ok: true, templates: out };
}

/**
 * @param {{ name: string, language?: string }[]} templates — Graph API satırları
 * @param {string} templateName
 * @param {string} languageCode örn. tr, en_US
 */
export function findMetaTemplateStatus(templates, templateName, languageCode) {
  const wantName = String(templateName || '').trim().toLowerCase();
  const wantLang = normalizeLangKey(languageCode || 'tr');
  for (const t of templates || []) {
    const n = String(t.name || '').trim().toLowerCase();
    const lang = normalizeLangKey(t.language || '');
    if (n === wantName && lang === wantLang) {
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
