/**
 * Meta'da onaylı şablon silme.
 *
 * Silme geri alınamaz: aynı ad yeniden açılabilir ama baştan incelemeye girer
 * ve Meta 30 gün boyunca aynı adı yeniden kullanmayı kısıtlayabilir. Bu yüzden
 * çağıran taraf kullanıcıya açık onay sormalı.
 *
 * Meta iki biçim kabul ediyor:
 *   - `?name=<ad>`                → şablonun TÜM dillerini siler
 *   - `?hsm_id=<id>&name=<ad>`    → yalnız o dildeki sürümü siler
 * Elimizde şablon kimliği varsa ikincisini kullanırız; tek dili silmek daha az
 * yıkıcı.
 *
 * Token yalnız burada, sunucu tarafında kullanılır.
 */
import { loadMetaWhatsAppSecretsFromDb } from './meta-whatsapp.js';
import { getPhoneWabaId, resolveWabaIds } from './meta-templates-sync.js';

const GRAPH = () => String(process.env.META_GRAPH_API_VERSION || 'v21.0').trim() || 'v21.0';

function graphErrorText(json, status) {
  const e = json?.error || {};
  const parts = [String(e.message || `http_${status}`)];
  if (e.code != null) parts.push(`#${e.code}`);
  if (e.error_subcode != null) parts.push(`sub:${e.error_subcode}`);
  return parts.join(' ');
}

/**
 * Şablonu Meta'dan siler.
 *
 * Şablon hangi WABA'da olduğu bilinmediği için önce gönderim numarasının
 * WABA'sı, sonra erişilebilen diğerleri denenir; ilk başarı yeter.
 *
 * @param {{ name: string, metaTemplateId?: string|null }} args
 * @returns {Promise<{ ok: boolean, waba?: string, error?: string, detail?: object }>}
 */
export async function deleteMetaMessageTemplate({ name, metaTemplateId = null } = {}) {
  await loadMetaWhatsAppSecretsFromDb();
  const token = String(process.env.META_WHATSAPP_TOKEN || '').trim();
  const templateName = String(name || '').trim();
  if (!token) return { ok: false, error: 'Meta erişim anahtarı tanımlı değil.' };
  if (!templateName) return { ok: false, error: 'Şablon adı gerekli.' };

  const candidates = [];
  const seen = new Set();
  const add = (w) => {
    const s = String(w || '').trim();
    if (s && !seen.has(s)) {
      seen.add(s);
      candidates.push(s);
    }
  };
  try {
    add(await getPhoneWabaId());
  } catch {
    /* numaradan WABA çözülemezse aşağıdaki liste yeter */
  }
  for (const w of await resolveWabaIds()) add(w);
  if (!candidates.length) return { ok: false, error: 'WhatsApp Business hesabı bulunamadı.' };

  /** @type {Record<string, string>} */
  const errors = {};
  for (const waba of candidates) {
    const q = new URLSearchParams({ name: templateName });
    const hsm = String(metaTemplateId || '').trim();
    if (hsm) q.set('hsm_id', hsm);
    const url = `https://graph.facebook.com/${GRAPH()}/${encodeURIComponent(waba)}/message_templates?${q}`;
    let res;
    let json = {};
    try {
      res = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      json = await res.json().catch(() => ({}));
    } catch (e) {
      errors[waba] = e instanceof Error ? e.message : String(e);
      continue;
    }
    if (res.ok && json?.success !== false) return { ok: true, waba };
    errors[waba] = graphErrorText(json, res.status);
  }

  console.warn('[template-delete] silinemedi', { name: templateName, errors });
  return {
    ok: false,
    error: Object.values(errors)[0] || 'Meta şablonu silmedi.',
    detail: { errors }
  };
}
