/**
 * Eski WABA'daki (ör. kapanan 0850) mesaj şablonlarını şu anki gönderim WABA'sına (0506) kopyalar.
 *
 * Şablonlar WABA'ya bağlıdır; numara değişince yeni hesapta yeniden oluşturulup
 * Meta onayına gönderilmeleri gerekir. Bu modül:
 *   - kaynak WABA'yı (verilen kimlik ya da eski numaranın bağlı olduğu WABA) bulur,
 *   - hedefte aynı ad+dilde olmayan şablonları sırayla oluşturur,
 *   - medya başlıklarının örnek dosyasını indirip Meta'ya yeniden yükler,
 *   - metin/buton içindeki eski numarayı yenisiyle değiştirir.
 *
 * Vercel süre sınırı nedeniyle her çağrı en çok `limit` şablon işler; istemci
 * `remaining` 0 olana kadar tekrar çağırır.
 */
import { supabaseAdmin } from './supabase-admin.js';
import { loadMetaWhatsAppSecretsFromDb } from './meta-whatsapp.js';
import { fetchTemplatesForWaba, resolvePrimaryWabaId, invalidateCrmTemplateCache } from './meta-templates-sync.js';
import { uploadTemplateHeaderMedia } from './meta-template-media.js';

const GRAPH = () => String(process.env.META_GRAPH_API_VERSION || 'v21.0').trim() || 'v21.0';
const g = (path) => `https://graph.facebook.com/${GRAPH()}/${path}`;

/** Kapanan 0850 hattının Cloud API numara kimliği (webhook kayıtlarından). */
export const LEGACY_0850_PHONE_NUMBER_ID = '1054510234403732';

const SKIP_STATUSES = new Set(['REJECTED', 'DELETED', 'PENDING_DELETION']);

const OLD_NUMBER_RE = /(?:\+?\s?90[\s-]?)?\(?0?\s?850\)?[\s-]?303[\s-]?40[\s-]?14/g;
const NEW_NUMBER_DISPLAY = '0506 187 74 94';

/** Metindeki eski numarayı yenisiyle değiştirir (wa.me / tel bağlantıları dahil). */
export function replaceLegacyNumber(text) {
  if (typeof text !== 'string' || !text) return text;
  return text
    .replace(/908503034014/g, '905061877494')
    .replace(/08503034014/g, '05061877494')
    .replace(OLD_NUMBER_RE, NEW_NUMBER_DISPLAY);
}

function graphErr(json, status) {
  const e = json?.error || {};
  const msg = String(e.error_user_msg || e.message || `http_${status}`);
  return e.error_subcode ? `${msg} (#${e.code}/${e.error_subcode})` : e.code ? `${msg} (#${e.code})` : msg;
}

async function graphGet(url, tok) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

/** Token'ın gördüğü işletmelerde, verilen numarayı içeren WABA'yı bulur. */
async function findWabaForPhone(phoneNumberId, tok) {
  const direct = await graphGet(g(`${encodeURIComponent(phoneNumberId)}?fields=whatsapp_business_account{id}`), tok);
  const directId = direct.ok ? direct.json?.whatsapp_business_account?.id : null;
  if (directId) return String(directId);

  const wabas = new Set();
  const biz = await graphGet(g('me/businesses?fields=id&limit=50'), tok);
  const bizIds = (biz.ok ? biz.json.data || [] : []).map((b) => String(b.id));
  if (process.env.META_BUSINESS_ID) bizIds.push(String(process.env.META_BUSINESS_ID).trim());
  for (const b of new Set(bizIds)) {
    for (const edge of ['owned_whatsapp_business_accounts', 'client_whatsapp_business_accounts']) {
      const r = await graphGet(g(`${encodeURIComponent(b)}/${edge}?fields=id&limit=100`), tok);
      for (const w of r.ok ? r.json.data || [] : []) wabas.add(String(w.id));
    }
  }
  for (const w of wabas) {
    const r = await graphGet(g(`${encodeURIComponent(w)}/phone_numbers?fields=id&limit=100`), tok);
    if (r.ok && (r.json.data || []).some((p) => String(p.id) === String(phoneNumberId))) return w;
  }
  return null;
}

async function reuploadHeaderMedia(format, exampleUrl) {
  const res = await fetch(exampleUrl);
  if (!res.ok) return { ok: false, error: `örnek medya indirilemedi (http_${res.status})` };
  let mimeType = String(res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!mimeType || mimeType === 'application/octet-stream') {
    mimeType = format === 'IMAGE' ? 'image/jpeg' : format === 'VIDEO' ? 'video/mp4' : 'application/pdf';
  }
  if (mimeType === 'image/jpg') mimeType = 'image/jpeg';
  const buffer = Buffer.from(await res.arrayBuffer());
  const up = await uploadTemplateHeaderMedia({ buffer, mimeType, headerType: format });
  return up.ok ? { ok: true, handle: up.handle } : { ok: false, error: up.detail?.message || up.error };
}

/**
 * Graph'tan okunan şablon bileşenlerini oluşturma isteğine uygun hale getirir.
 * @returns {Promise<{ ok: boolean, components?: object[], error?: string, changed_number?: boolean }>}
 */
export async function cloneComponents(components, { reupload = reuploadHeaderMedia } = {}) {
  const out = [];
  let changed = false;
  const rep = (s) => {
    const r = replaceLegacyNumber(s);
    if (r !== s) changed = true;
    return r;
  };
  for (const c of Array.isArray(components) ? components : []) {
    const type = String(c?.type || '').toUpperCase();
    if (type === 'HEADER') {
      const format = String(c.format || 'TEXT').toUpperCase();
      const h = { type: 'HEADER', format };
      if (format === 'TEXT') {
        h.text = rep(c.text || '');
        if (c.example) h.example = c.example;
      } else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(format)) {
        const url = c.example?.header_handle?.[0];
        if (!url) return { ok: false, error: 'medya başlığının örnek dosyası yok' };
        const up = await reupload(format, url);
        if (!up.ok) return { ok: false, error: up.error };
        h.example = { header_handle: [up.handle] };
      }
      out.push(h);
    } else if (type === 'BODY') {
      const b = { type: 'BODY', text: rep(c.text || '') };
      if (c.example) b.example = c.example;
      if (c.add_security_recommendation != null) b.add_security_recommendation = c.add_security_recommendation;
      out.push(b);
    } else if (type === 'FOOTER') {
      const f = { type: 'FOOTER' };
      if (c.text != null) f.text = rep(c.text);
      if (c.code_expiration_minutes != null) f.code_expiration_minutes = c.code_expiration_minutes;
      out.push(f);
    } else if (type === 'BUTTONS') {
      const buttons = [];
      for (const btn of c.buttons || []) {
        const bt = String(btn?.type || '').toUpperCase();
        if (bt === 'FLOW') return { ok: false, error: 'Flow butonlu şablon (Flow yeni hesapta yeniden kurulmalı)' };
        const nb = { type: bt };
        if (btn.text != null) nb.text = rep(btn.text);
        if (bt === 'URL') {
          nb.url = rep(btn.url || '');
          if (btn.example) nb.example = btn.example;
        } else if (bt === 'PHONE_NUMBER') {
          nb.phone_number = rep(btn.phone_number || '');
        } else if (bt === 'COPY_CODE') {
          nb.example = btn.example;
        } else if (bt === 'OTP') {
          for (const k of ['otp_type', 'autofill_text', 'package_name', 'signature_hash', 'supported_apps']) {
            if (btn[k] != null) nb[k] = btn[k];
          }
        }
        buttons.push(nb);
      }
      out.push({ type: 'BUTTONS', buttons });
    } else if (type === 'CAROUSEL' || type === 'LIMITED_TIME_OFFER') {
      return { ok: false, error: `${type} bileşenli şablon otomatik kopyalanmıyor` };
    }
  }
  return { ok: true, components: out, changed_number: changed };
}

async function rememberSource(sourceWaba) {
  try {
    const { data } = await supabaseAdmin.from('commerce_settings').select('id, meta').is('institution_id', null).maybeSingle();
    if (!data?.id) return;
    const meta = data.meta && typeof data.meta === 'object' ? data.meta : {};
    const prev = meta.whatsapp_prev && typeof meta.whatsapp_prev === 'object' ? meta.whatsapp_prev : {};
    if (prev.waba_id === sourceWaba) return;
    await supabaseAdmin
      .from('commerce_settings')
      .update({ meta: { ...meta, whatsapp_prev: { ...prev, phone_number_id: prev.phone_number_id || LEGACY_0850_PHONE_NUMBER_ID, waba_id: sourceWaba } } })
      .eq('id', data.id);
  } catch {
    /* yalnız kolaylık kaydı */
  }
}

/**
 * @param {{ source_waba_id?: string, source_phone_number_id?: string, limit?: number, skip?: string[], dry_run?: boolean }} opts
 */
export async function copyTemplatesFromLegacyWaba(opts = {}) {
  await loadMetaWhatsAppSecretsFromDb();
  const tok = String(process.env.META_WHATSAPP_TOKEN || '').trim();
  if (!tok) return { ok: false, error: 'META_WHATSAPP_TOKEN yok' };

  const target = (await resolvePrimaryWabaId(tok)).waba_id;
  if (!target) return { ok: false, error: 'Hedef (gönderim) WABA çözülemedi' };

  let source = String(opts.source_waba_id || '').trim();
  if (!source) {
    let saved = '';
    try {
      const { data } = await supabaseAdmin.from('commerce_settings').select('meta').is('institution_id', null).maybeSingle();
      saved = String(data?.meta?.whatsapp_prev?.waba_id || '').trim();
    } catch {
      saved = '';
    }
    source = saved || (await findWabaForPhone(String(opts.source_phone_number_id || LEGACY_0850_PHONE_NUMBER_ID), tok)) || '';
  }
  if (!source) return { ok: false, error: 'Eski (0850) WABA bulunamadı — kaynak WABA kimliğini girin' };
  if (source === target) return { ok: false, error: 'Kaynak ve hedef WABA aynı' };
  await rememberSource(source);

  const [src, dst] = await Promise.all([
    fetchTemplatesForWaba(source, tok, { includeComponents: true }),
    fetchTemplatesForWaba(target, tok)
  ]);
  if (!src.ok) return { ok: false, error: `Eski hesabın şablonları okunamadı: ${src.error}` };
  if (!dst.ok) return { ok: false, error: `Yeni hesabın şablonları okunamadı: ${dst.error}` };

  const key = (t) => `${String(t.name || '').trim()}|${String(t.language || '').toLowerCase()}`;
  const have = new Set(dst.templates.map(key));
  const skip = new Set((opts.skip || []).map(String));
  const candidates = src.templates.filter((t) => !SKIP_STATUSES.has(String(t.status || '').toUpperCase()));
  const pending = candidates.filter((t) => !have.has(key(t)) && !skip.has(key(t)));
  const alreadyCopied = candidates.length - candidates.filter((t) => !have.has(key(t))).length;

  const base = {
    ok: true,
    source_waba_suffix: source.slice(-6),
    target_waba_suffix: target.slice(-6),
    total_source: src.templates.length,
    copyable: candidates.length,
    already_in_target: alreadyCopied
  };
  if (opts.dry_run) {
    return { ...base, remaining: pending.length, pending: pending.map((t) => ({ key: key(t), name: t.name, language: t.language, status: t.status })) };
  }

  const limit = Math.max(1, Math.min(Number(opts.limit) || 8, 20));
  const results = [];
  for (const t of pending.slice(0, limit)) {
    const k = key(t);
    const cloned = await cloneComponents(t.components);
    if (!cloned.ok) {
      results.push({ key: k, name: t.name, ok: false, error: cloned.error });
      continue;
    }
    const payload = { name: t.name, language: t.language, category: t.category, components: cloned.components };
    if (t.parameter_format) payload.parameter_format = t.parameter_format;
    const res = await fetch(g(`${encodeURIComponent(target)}/message_templates`), {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await res.json().catch(() => ({}));
    results.push(
      res.ok
        ? { key: k, name: t.name, ok: true, status: json.status || 'PENDING', changed_number: cloned.changed_number }
        : { key: k, name: t.name, ok: false, error: graphErr(json, res.status) }
    );
  }
  invalidateCrmTemplateCache();

  const failedKeys = results.filter((r) => !r.ok).map((r) => r.key);
  const remaining = pending.length - results.length;
  return { ...base, processed: results.length, remaining, results, failed_keys: failedKeys };
}
