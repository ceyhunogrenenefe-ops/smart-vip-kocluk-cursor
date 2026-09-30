import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { normalizedUserRolesFromDb } from '../api/_lib/user-roles-fetch.js';
import {
  HEADER_TYPES,
  TEMPLATE_LIMITS,
  buildMetaTemplateCreatePayload,
  normalizeMetaTemplateName
} from '../api/_lib/meta-template-payload.js';
import { createOrReuseMetaMessageTemplate } from '../api/_lib/meta-template-create.js';
import { loadMetaWhatsAppSecretsFromDb } from '../api/_lib/meta-whatsapp.js';
import { HEADER_MEDIA_RULES, uploadTemplateHeaderMedia } from '../api/_lib/meta-template-media.js';
import {
  fetchAllMetaMessageTemplates,
  invalidateCrmTemplateCache
} from '../api/_lib/meta-templates-sync.js';

const TABLE = 'message_templates';

/** Meta durumlarının Türkçe karşılığı — UI tek yerden okusun. */
export const STATUS_LABELS = {
  DRAFT: 'Taslak',
  PENDING: 'İncelemede',
  IN_APPEAL: 'İtirazda',
  APPROVED: 'Onaylandı',
  REJECTED: 'Reddedildi',
  PAUSED: 'Duraklatıldı',
  DISABLED: 'Devre dışı',
  PENDING_DELETION: 'Silinmeyi bekliyor'
};

/**
 * CRM alanları — {{1}} → Veli Adı eşlemesi için.
 * Toplu mesajda bu anahtarlar gerçek değerlerle doldurulur.
 */
export const CRM_VARIABLE_FIELDS = [
  { id: 'veli_adi', label: 'Veli Adı' },
  { id: 'ogrenci_adi', label: 'Öğrenci Adı' },
  { id: 'sinif', label: 'Sınıf' },
  { id: 'temsilci_adi', label: 'Temsilci Adı' },
  { id: 'kurum_adi', label: 'Kurum Adı' },
  { id: 'tarih', label: 'Tarih' },
  { id: 'saat', label: 'Saat' },
  { id: 'serbest', label: 'Serbest metin (elle yazılır)' }
];

/**
 * Sablon yonetimi yetkisi.
 *
 * Eski gelen kutusu modalinda yetki kontrolu yoktu; CRM temsilcileri de sablon
 * acabiliyordu. Yeni ekran o yetkiyi daraltmasin diye crm_agent da kabul edilir.
 */
function canManageTemplates(actor, tags) {
  const r = String(actor?.role || '').toLowerCase();
  const t = Array.isArray(tags) ? tags : [];
  const allowed = ['admin', 'super_admin', 'crm_agent'];
  return allowed.includes(r) || t.some((x) => allowed.includes(String(x)));
}

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function rowToTemplate(row) {
  return {
    id: row.id,
    name: row.name,
    meta_template_name: row.meta_template_name,
    language: row.meta_template_language || 'tr',
    category: row.category || null,
    status: row.whatsapp_template_status || 'DRAFT',
    status_label: STATUS_LABELS[String(row.whatsapp_template_status || 'DRAFT')] || row.whatsapp_template_status,
    header_type: row.header_type || 'NONE',
    header_text: row.header_text || null,
    header_media_url: row.header_media_url || null,
    header_media_handle: row.header_media_handle || null,
    body: row.content || '',
    footer_text: row.footer_text || null,
    buttons: parseJson(row.buttons, []),
    variable_map: parseJson(row.variable_map, {}),
    body_examples: parseJson(row.body_examples, {}),
    meta_template_id: row.meta_template_id || null,
    rejected_reason: row.rejected_reason || null,
    updated_at: row.updated_at,
    submitted_at: row.submitted_at || null,
    source: 'crm'
  };
}

/** Meta'daki şablonları CRM kaydıyla birleştirir — başka sistemlerde açılanlar da görünsün. */
function graphToTemplate(g) {
  const comps = Array.isArray(g.components) ? g.components : [];
  const header = comps.find((c) => String(c.type).toUpperCase() === 'HEADER');
  const bodyC = comps.find((c) => String(c.type).toUpperCase() === 'BODY');
  const footer = comps.find((c) => String(c.type).toUpperCase() === 'FOOTER');
  const buttons = comps.find((c) => String(c.type).toUpperCase() === 'BUTTONS');
  const status = String(g.status || '').toUpperCase();
  return {
    id: `meta:${g.name}:${g.language}`,
    name: g.name,
    meta_template_name: g.name,
    language: g.language || 'tr',
    category: g.category || null,
    status,
    status_label: STATUS_LABELS[status] || status,
    header_type: header ? String(header.format || 'TEXT').toUpperCase() : 'NONE',
    header_text: header?.text || null,
    header_media_url: null,
    header_media_handle: null,
    body: bodyC?.text || '',
    footer_text: footer?.text || null,
    buttons: Array.isArray(buttons?.buttons) ? buttons.buttons : [],
    variable_map: {},
    body_examples: {},
    meta_template_id: g.id || null,
    rejected_reason: g.rejected_reason || null,
    updated_at: null,
    submitted_at: null,
    source: 'meta'
  };
}

/**
 * WhatsApp şablon yöneticisi.
 * Token ve Meta çağrıları yalnız burada; istemciye hiçbir zaman gönderilmez.
 */
export default async function handler(req, res) {
  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch {
    return res.status(401).json({ error: 'Missing token' });
  }
  const tags = await normalizedUserRolesFromDb(actor.sub).catch(() => []);
  if (!canManageTemplates(actor, tags)) return res.status(403).json({ error: 'forbidden' });

  // Token ve WABA kimligi panel ayarlarinda tutulabiliyor; ortam degiskeni tek
  // basina yeterli degil. Diger Meta uclari gibi once bunlari yukle, yoksa
  // Graph listesi bos donuyor.
  await loadMetaWhatsAppSecretsFromDb().catch((e) => {
    console.warn('[whatsapp-templates] meta ayarlari:', errorMessage(e));
  });

  const op = String(req.query?.op || '').trim();
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};

  try {
    /** Liste: CRM kayıtları + WABA'daki tüm şablonlar */
    if (req.method === 'GET' && (op === '' || op === 'list')) {
      const { data: rows } = await supabaseAdmin
        .from(TABLE)
        .select('*')
        .not('meta_template_name', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(500);
      const crm = (rows || []).map(rowToTemplate);

      let meta = [];
      let metaError = null;
      try {
        const live = await fetchAllMetaMessageTemplates({ includeComponents: true });
        if (live.ok) {
          meta = (live.templates || []).map(graphToTemplate);
        } else {
          metaError = [live.error, live.hint].filter(Boolean).join(' — ') || null;
          // Hangi WABA'ya bakildigi ve her birinin ne dondugu yalniz sunucu
          // gunlugunde; istemciye kimlik bilgisi sizdirmayalim.
          console.warn('[whatsapp-templates] Graph listesi bos', {
            waba_ids: live.waba_ids || [],
            waba_errors: live.waba_errors || {},
            error: live.error || null
          });
        }
      } catch (e) {
        metaError = errorMessage(e);
      }

      // Aynı ad+dil varsa Meta'daki durum esas alınır; taslak kolonları korunur
      const byKey = new Map();
      for (const t of crm) byKey.set(`${t.meta_template_name}:${t.language}`, t);
      for (const m of meta) {
        const key = `${m.meta_template_name}:${m.language}`;
        const existing = byKey.get(key);
        byKey.set(key, existing ? { ...existing, ...m, source: 'crm+meta', id: existing.id } : m);
      }
      const drafts = (rows || [])
        .filter((r) => String(r.whatsapp_template_status || '') === 'DRAFT' && !r.meta_template_name)
        .map(rowToTemplate);

      return res.status(200).json({
        ok: true,
        items: [...drafts, ...byKey.values()],
        meta_error: metaError,
        meta: {
          statuses: STATUS_LABELS,
          limits: TEMPLATE_LIMITS,
          header_types: HEADER_TYPES,
          media_rules: HEADER_MEDIA_RULES,
          variable_fields: CRM_VARIABLE_FIELDS,
          categories: [
            { id: 'UTILITY', label: 'Hizmet / Bilgilendirme', hint: 'Sipariş, randevu, hatırlatma' },
            { id: 'MARKETING', label: 'Pazarlama', hint: 'Kampanya, duyuru, tanıtım' }
          ]
        }
      });
    }

    /** Taslak kaydet — Meta'ya gönderilmez */
    if (req.method === 'POST' && op === 'save-draft') {
      const row = {
        name: String(body.name || '').trim().slice(0, 120) || 'Adsız şablon',
        type: `crm_draft_${normalizeMetaTemplateName(body.name || 'taslak')}`.slice(0, 80),
        content: String(body.body || '').slice(0, TEMPLATE_LIMITS.bodyMax),
        category: String(body.category || 'UTILITY').toUpperCase(),
        meta_template_language: String(body.language || 'tr'),
        header_type: String(body.header_type || 'NONE').toUpperCase(),
        header_text: String(body.header_text || '').trim() || null,
        header_media_handle: String(body.header_media_handle || '').trim() || null,
        header_media_url: String(body.header_media_url || '').trim() || null,
        footer_text: String(body.footer_text || '').trim() || null,
        buttons: Array.isArray(body.buttons) ? body.buttons : [],
        variable_map: body.variable_map && typeof body.variable_map === 'object' ? body.variable_map : {},
        body_examples: body.body_examples && typeof body.body_examples === 'object' ? body.body_examples : {},
        whatsapp_template_status: 'DRAFT',
        institution_id: actor.institution_id || null,
        created_by: actor.sub || null,
        updated_at: new Date().toISOString()
      };
      const id = String(body.id || '').trim();
      if (id) {
        const { data, error } = await supabaseAdmin.from(TABLE).update(row).eq('id', id).select('*').maybeSingle();
        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json({ ok: true, item: data ? rowToTemplate(data) : null });
      }
      const { data, error } = await supabaseAdmin.from(TABLE).insert(row).select('*').maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true, item: data ? rowToTemplate(data) : null });
    }

    /** Başlık için örnek medya — Meta Resumable Upload, handle döner */
    if (req.method === 'POST' && op === 'upload-media') {
      const headerType = String(body.header_type || '').toUpperCase();
      const dataUrl = String(body.file_data || '');
      const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!m) return res.status(400).json({ error: 'file_required', message: 'Dosya okunamadı.' });
      const mimeType = m[1];
      const buffer = Buffer.from(m[2], 'base64');

      const r = await uploadTemplateHeaderMedia({ buffer, mimeType, headerType });
      if (!r.ok) {
        console.warn('[whatsapp-templates] medya yukleme', r.detail || null);
        return res.status(400).json({ error: 'upload_failed', message: r.error });
      }
      return res.status(200).json({ ok: true, handle: r.handle });
    }

    /** Meta'ya inceleme için gönder */
    if (req.method === 'POST' && op === 'submit') {
      const displayName = String(body.name || '').trim();
      const bodyText = String(body.body || '').trim();
      if (!displayName) return res.status(400).json({ error: 'name_required', message: 'Şablon adı gerekli.' });
      if (!bodyText) return res.status(400).json({ error: 'body_required', message: 'Şablon metni gerekli.' });

      const headerType = String(body.header_type || 'NONE').toUpperCase();
      const headerHandle = String(body.header_media_handle || '').trim();
      if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerType) && !headerHandle) {
        return res.status(400).json({
          error: 'header_media_required',
          message: 'Başlık görseli/dosyası için Meta’ya örnek medya yüklenmeli. Dosyayı seçip bekleyin.'
        });
      }

      let payload;
      try {
        payload = buildMetaTemplateCreatePayload({
          name: displayName,
          language: String(body.language || 'tr'),
          category: String(body.category || 'UTILITY').toUpperCase(),
          bodyText,
          examples: body.body_examples || {},
          headerType,
          headerText: body.header_text || '',
          headerHandle,
          headerExample: body.header_example || '',
          footerText: body.footer_text || '',
          buttons: Array.isArray(body.buttons) ? body.buttons : []
        });
      } catch (e) {
        return res.status(400).json({ error: 'payload_invalid', message: errorMessage(e) });
      }

      const submitted = await createOrReuseMetaMessageTemplate(payload);
      invalidateCrmTemplateCache();

      if (!submitted.ok) {
        console.warn('[whatsapp-templates] Meta reddetti', {
          name: payload.name,
          error: submitted.error,
          raw: submitted.raw || null
        });
        return res.status(400).json({
          ok: false,
          error: 'meta_rejected',
          message: `Şablon Meta’ya gönderilemedi. ${submitted.error || ''}`.trim()
        });
      }

      const row = {
        name: displayName.slice(0, 120),
        type: `crm_${payload.name}`.slice(0, 80),
        content: bodyText.slice(0, TEMPLATE_LIMITS.bodyMax),
        category: payload.category,
        meta_template_name: submitted.name,
        meta_template_language: submitted.language || payload.language,
        meta_template_id: submitted.id || null,
        whatsapp_template_status: submitted.status,
        meta_named_body_parameters: payload.parameter_format === 'NAMED',
        header_type: headerType,
        header_text: body.header_text || null,
        header_media_handle: headerHandle || null,
        header_media_url: String(body.header_media_url || '').trim() || null,
        footer_text: body.footer_text || null,
        buttons: Array.isArray(body.buttons) ? body.buttons : [],
        variable_map: body.variable_map || {},
        body_examples: body.body_examples || {},
        rejected_reason: null,
        institution_id: actor.institution_id || null,
        created_by: actor.sub || null,
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      const draftId = String(body.id || '').trim();
      try {
        if (draftId) await supabaseAdmin.from(TABLE).update(row).eq('id', draftId);
        else await supabaseAdmin.from(TABLE).insert(row);
      } catch (e) {
        console.warn('[whatsapp-templates] kayit:', errorMessage(e));
      }

      return res.status(200).json({
        ok: true,
        data: submitted,
        message: submitted.reused
          ? `Şablon WABA’da zaten vardı — durum: ${STATUS_LABELS[submitted.status] || submitted.status}`
          : `Meta’ya inceleme için gönderildi — durum: ${STATUS_LABELS[submitted.status] || submitted.status}`
      });
    }

    if (req.method === 'DELETE') {
      const id = String(req.query?.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id_required' });
      // Yalnız taslak silinir; Meta'daki şablona dokunulmaz
      const { data: row } = await supabaseAdmin.from(TABLE).select('whatsapp_template_status').eq('id', id).maybeSingle();
      if (String(row?.whatsapp_template_status || '') !== 'DRAFT') {
        return res.status(400).json({ error: 'only_draft', message: 'Yalnız taslak silinebilir.' });
      }
      const { error } = await supabaseAdmin.from(TABLE).delete().eq('id', id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: errorMessage(e) });
  }
}
