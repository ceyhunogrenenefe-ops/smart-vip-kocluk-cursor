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
import { resolvePrimaryWabaId, invalidateCrmTemplateCache } from './meta-templates-sync.js';
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

/** Meta'nın istek sınırı başlığından yeniden erişim için tahmini dakika. */
export function rateLimitWaitMinutes(headerValue) {
  try {
    const parsed = JSON.parse(String(headerValue || '{}'));
    let max = 0;
    for (const arr of Object.values(parsed)) {
      for (const u of Array.isArray(arr) ? arr : []) {
        const m = Number(u?.estimated_time_to_regain_access || 0);
        if (m > max) max = m;
      }
    }
    return max || null;
  } catch {
    return null;
  }
}

function isRateLimited(json) {
  const code = Number(json?.error?.code || 0);
  return code === 80008 || code === 4 || code === 17 || code === 32 || code === 613;
}

/** Şablon listesini okur; istek sınırına takılırsa bekleme süresini döner. */
async function listTemplates(waba, tok, withComponents) {
  const fields = withComponents
    ? 'name,status,language,category,components,parameter_format'
    : 'name,status,language';
  const rows = [];
  let url = g(`${encodeURIComponent(waba)}/message_templates?fields=${fields}&limit=250`);
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        rate_limited: isRateLimited(json),
        wait_minutes: rateLimitWaitMinutes(res.headers.get('x-business-use-case-usage')),
        error: graphErr(json, res.status)
      };
    }
    rows.push(...(json.data || []));
    url = json.paging?.next || null;
  }
  return { ok: true, templates: rows };
}

const MEDIA_HOST_RE = /(^|\.)(fbcdn\.net|fbsbx\.com|whatsapp\.net|facebook\.com|cdninstagram\.com)$/i;

/** İstemciden geri gelen şablonda medya örneği yalnız Meta sunucularından indirilebilir. */
function mediaUrlsAreMeta(components) {
  for (const c of Array.isArray(components) ? components : []) {
    for (const u of c?.example?.header_handle || []) {
      try {
        const h = new URL(String(u));
        if (h.protocol !== 'https:' || !MEDIA_HOST_RE.test(h.hostname)) return false;
      } catch {
        return false;
      }
    }
  }
  return true;
}

async function resolveSourceWaba(opts, tok) {
  let source = String(opts.source_waba_id || '').trim();
  if (source) return source;
  try {
    const { data } = await supabaseAdmin.from('commerce_settings').select('meta').is('institution_id', null).maybeSingle();
    source = String(data?.meta?.whatsapp_prev?.waba_id || data?.meta?.whatsapp_prev_0850?.waba_id || '').trim();
  } catch {
    source = '';
  }
  return source || (await findWabaForPhone(String(opts.source_phone_number_id || LEGACY_0850_PHONE_NUMBER_ID), tok)) || '';
}

/** Otomasyonların kullandığı, kesintisi doğrudan veliye/koça yansıyan şablonlar. */
export const URGENT_TEMPLATE_NAMES = [
  'veli_kayit_admin_notify',
  'class_absent_notice_v2',
  'class_lesson_reminder',
  'class_camera_off_notice',
  'attendance_status_update',
  'attendance_coach_late_update',
  'lesson_reminder_parent',
  'lesson_reminder',
  'report_reminder',
  'daily_report_reminder',
  'parent_pdf_link_kurum',
  'parent_pdf_link',
  'teacher_lesson_reminder',
  'toplant_hatrlatma',
  'coach_lesson_attendance_summary',
  'coach_daily_reminder',
  'instant_absent_alert',
  'etkinlik_hatirlatma_link_891bes',
  'veli_sign_ready_notify',
  'ogretmen_yorum_daveti'
];

/** Sabit liste + son 30 günde gerçekten gönderim yapılmış şablon adları. */
async function urgentNames() {
  const names = new Set(URGENT_TEMPLATE_NAMES);
  try {
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data } = await supabaseAdmin
      .from('message_logs')
      .select('meta_template_name')
      .not('meta_template_name', 'is', null)
      .gte('sent_at', since)
      .limit(5000);
    for (const r of data || []) if (r.meta_template_name) names.add(String(r.meta_template_name));
  } catch {
    /* sabit liste yeter */
  }
  return names;
}

const keyOf = (t) => `${String(t.name || '').trim()}|${String(t.language || '').toLowerCase()}`;

/**
 * İki aşamalı:
 *   - dry_run: iki hesabın listesini BİR KEZ okur, kopyalanacak şablonları bileşenleriyle döner.
 *   - templates[]: istemcinin plandan gönderdiği şablonları liste okumadan oluşturur.
 * Böylece Meta'nın WABA başına saatlik istek sınırı oluşturma isteklerine kalır.
 *
 * @param {{ source_waba_id?: string, source_phone_number_id?: string, dry_run?: boolean, scope?: 'urgent' | 'all', templates?: object[] }} opts
 */
export async function copyTemplatesFromLegacyWaba(opts = {}) {
  await loadMetaWhatsAppSecretsFromDb();
  const tok = String(process.env.META_WHATSAPP_TOKEN || '').trim();
  if (!tok) return { ok: false, error: 'META_WHATSAPP_TOKEN yok' };

  const target = String(process.env.META_WABA_ID || '').trim() || (await resolvePrimaryWabaId(tok)).waba_id;
  if (!target) return { ok: false, error: 'Hedef (gönderim) WABA çözülemedi' };

  if (opts.dry_run) {
    const source = await resolveSourceWaba(opts, tok);
    if (!source) return { ok: false, error: 'Eski (0850) WABA bulunamadı — kaynak WABA kimliğini girin' };
    if (source === target) return { ok: false, error: 'Kaynak ve hedef WABA aynı' };
    await rememberSource(source);

    const src = await listTemplates(source, tok, true);
    if (!src.ok) return { ok: false, rate_limited: src.rate_limited, wait_minutes: src.wait_minutes, error: `Eski hesabın şablonları okunamadı: ${src.error}` };
    const dst = await listTemplates(target, tok, false);
    if (!dst.ok) return { ok: false, rate_limited: dst.rate_limited, wait_minutes: dst.wait_minutes, error: `Yeni hesabın şablonları okunamadı: ${dst.error}` };

    const have = new Set(dst.templates.map(keyOf));
    const only = opts.scope === 'urgent' ? await urgentNames() : null;
    const candidates = src.templates.filter(
      (t) => !SKIP_STATUSES.has(String(t.status || '').toUpperCase()) && (!only || only.has(String(t.name || '')))
    );
    const pending = candidates.filter((t) => !have.has(keyOf(t)));
    return {
      ok: true,
      source_waba_suffix: source.slice(-6),
      target_waba_suffix: target.slice(-6),
      total_source: src.templates.length,
      copyable: candidates.length,
      already_in_target: candidates.length - pending.length,
      remaining: pending.length,
      pending: pending.map((t) => ({
        key: keyOf(t),
        name: t.name,
        language: t.language,
        category: t.category,
        status: t.status,
        parameter_format: t.parameter_format || null,
        components: t.components || []
      }))
    };
  }

  const list = (Array.isArray(opts.templates) ? opts.templates : []).slice(0, 10);
  const results = [];
  let rateLimited = null;
  for (const t of list) {
    const k = keyOf(t);
    const name = String(t?.name || '').trim();
    if (!/^[a-z0-9_]{1,512}$/.test(name) || !t?.language || !t?.category) {
      results.push({ key: k, name, ok: false, error: 'geçersiz şablon verisi' });
      continue;
    }
    if (!mediaUrlsAreMeta(t.components)) {
      results.push({ key: k, name, ok: false, error: 'medya örneği Meta dışı bir adreste' });
      continue;
    }
    const cloned = await cloneComponents(t.components);
    if (!cloned.ok) {
      results.push({ key: k, name, ok: false, error: cloned.error });
      continue;
    }
    const payload = { name, language: t.language, category: t.category, components: cloned.components };
    if (t.parameter_format) payload.parameter_format = t.parameter_format;
    const res = await fetch(g(`${encodeURIComponent(target)}/message_templates`), {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      results.push({ key: k, name, ok: true, status: json.status || 'PENDING', changed_number: cloned.changed_number });
      continue;
    }
    if (isRateLimited(json)) {
      rateLimited = { wait_minutes: rateLimitWaitMinutes(res.headers.get('x-business-use-case-usage')) };
      break;
    }
    const msg = graphErr(json, res.status);
    const exists = /already exists|zaten mevcut|duplicate/i.test(msg) || [2388023, 2388024].includes(Number(json?.error?.error_subcode));
    results.push(exists ? { key: k, name, ok: true, status: 'EXISTS' } : { key: k, name, ok: false, error: msg });
  }
  if (results.some((r) => r.ok)) invalidateCrmTemplateCache();

  return {
    ok: true,
    processed: results.length,
    results,
    rate_limited: Boolean(rateLimited),
    wait_minutes: rateLimited?.wait_minutes ?? null
  };
}
