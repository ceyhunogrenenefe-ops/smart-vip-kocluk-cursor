/**
 * Şablon başlığı için örnek medya yükleme — Meta Resumable Upload API.
 *
 * Medyalı şablonda Meta, inceleme sırasında göstereceği ÖRNEK dosyayı ister ve
 * bunu normal bir URL olarak kabul etmez: dosya Meta'ya yüklenip dönen
 * `header_handle` şablon gövdesine konmalıdır. Kendi sunucumuza yüklemek
 * yetmez — şablon "media example required" ile reddedilir.
 *
 * Akış (iki adım):
 *   1) POST /{app-id}/uploads?file_length&file_type  → upload session id
 *   2) POST /{session-id}  (Authorization: OAuth <token>, file_offset: 0)
 *      → { h: "<header_handle>" }
 *
 * Token yalnız burada, sunucu tarafında kullanılır.
 */
import { loadMetaWhatsAppSecretsFromDb } from './meta-whatsapp.js';

const GRAPH = () => String(process.env.META_GRAPH_API_VERSION || 'v21.0').trim() || 'v21.0';

/** Meta'nın şablon başlığında kabul ettiği türler ve boyut sınırları. */
export const HEADER_MEDIA_RULES = {
  IMAGE: { types: ['image/jpeg', 'image/png'], maxBytes: 5 * 1024 * 1024, label: 'JPG veya PNG, en çok 5 MB' },
  VIDEO: { types: ['video/mp4', 'video/3gpp'], maxBytes: 16 * 1024 * 1024, label: 'MP4, en çok 16 MB' },
  DOCUMENT: { types: ['application/pdf'], maxBytes: 100 * 1024 * 1024, label: 'PDF, en çok 100 MB' }
};

/** Dosya seçilen başlık türüne uygun mu? Kullanıcıya Türkçe sebep döner. */
export function validateHeaderMedia({ headerType, mimeType, size }) {
  const rule = HEADER_MEDIA_RULES[String(headerType || '').toUpperCase()];
  if (!rule) return { ok: false, error: 'Başlık türü medya kabul etmiyor.' };
  const mime = String(mimeType || '').toLowerCase().split(';')[0].trim();
  if (!rule.types.includes(mime)) {
    return { ok: false, error: `Dosya türü uygun değil. Beklenen: ${rule.label}.` };
  }
  if (Number(size) > rule.maxBytes) {
    return { ok: false, error: `Dosya çok büyük. Sınır: ${rule.label}.` };
  }
  if (!Number(size)) return { ok: false, error: 'Dosya boş görünüyor.' };
  return { ok: true };
}

function appIdFromEnv() {
  return String(
    process.env.META_APP_ID || process.env.FACEBOOK_APP_ID || process.env.VITE_META_APP_ID || ''
  ).trim();
}

/** Süreç ömrü boyunca bir kez çözülür — her yüklemede Graph'a sormayalım. */
let cachedAppId = '';

/**
 * Uygulama kimliği.
 *
 * Ortamda META_APP_ID tanımlı değilse mevcut token'ın kendisinden okunur:
 * `debug_token` token'ın hangi uygulamaya ait olduğunu söylüyor. Böylece
 * yükleme için yeni bir ortam değişkeni veya yeni token gerekmiyor.
 */
async function resolveAppId(token) {
  const fromEnv = appIdFromEnv();
  if (fromEnv) return fromEnv;
  if (cachedAppId) return cachedAppId;
  try {
    const url =
      `https://graph.facebook.com/${GRAPH()}/debug_token` +
      `?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    const json = await res.json().catch(() => ({}));
    const id = String(json?.data?.app_id || '').trim();
    if (id) {
      cachedAppId = id;
      console.info('[template-media] app id token uzerinden cozuldu');
      return id;
    }
    console.warn('[template-media] app id cozulemedi', { status: res.status, error: json?.error || null });
  } catch (e) {
    console.warn('[template-media] app id cozulemedi:', e instanceof Error ? e.message : e);
  }
  return '';
}

function graphError(json, status) {
  const e = json?.error || {};
  const parts = [String(e.message || `http_${status}`)];
  if (e.code != null) parts.push(`#${e.code}`);
  if (e.error_subcode != null) parts.push(`sub:${e.error_subcode}`);
  if (e.fbtrace_id) parts.push(`trace:${e.fbtrace_id}`);
  return parts.join(' ');
}

/**
 * Dosyayı Meta'ya yükler ve `header_handle` döner.
 *
 * @param {{ buffer: Buffer, mimeType: string, headerType: string }} args
 * @returns {Promise<{ ok: boolean, handle?: string, error?: string, detail?: object }>}
 */
export async function uploadTemplateHeaderMedia({ buffer, mimeType, headerType }) {
  await loadMetaWhatsAppSecretsFromDb();
  const token = String(process.env.META_WHATSAPP_TOKEN || '').trim();
  if (!token) {
    return { ok: false, error: 'Meta erişim anahtarı tanımlı değil.', detail: { code: 'ENV_TOKEN' } };
  }
  const app = await resolveAppId(token);
  if (!app) {
    return {
      ok: false,
      error:
        'Meta uygulama kimliği bulunamadı — örnek medya yüklenemiyor. ' +
        'Vercel ortamına META_APP_ID ekleyin.',
      detail: { code: 'ENV_APP_ID' }
    };
  }

  const size = buffer?.length || 0;
  const check = validateHeaderMedia({ headerType, mimeType, size });
  if (!check.ok) return { ok: false, error: check.error, detail: { code: 'VALIDATION' } };

  // 1) Yükleme oturumu
  const startUrl =
    `https://graph.facebook.com/${GRAPH()}/${encodeURIComponent(app)}/uploads` +
    `?file_length=${size}&file_type=${encodeURIComponent(mimeType)}&access_token=${encodeURIComponent(token)}`;
  let res = await fetch(startUrl, { method: 'POST' });
  let json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.id) {
    console.warn('[template-media] oturum acilamadi', { status: res.status, error: json?.error });
    return {
      ok: false,
      error: 'Meta örnek medya yükleme oturumu açılamadı.',
      detail: { step: 'session', status: res.status, meta: json?.error || null }
    };
  }

  // 2) Dosyayı gönder
  const sessionId = String(json.id);
  res = await fetch(`https://graph.facebook.com/${GRAPH()}/${encodeURIComponent(sessionId)}`, {
    method: 'POST',
    headers: {
      Authorization: `OAuth ${token}`,
      file_offset: '0',
      'Content-Type': 'application/octet-stream'
    },
    body: buffer
  });
  json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.h) {
    console.warn('[template-media] yukleme basarisiz', { status: res.status, error: json?.error });
    return {
      ok: false,
      error: 'Örnek medya Meta’ya yüklenemedi.',
      detail: { step: 'upload', status: res.status, meta: json?.error || null, message: graphError(json, res.status) }
    };
  }

  return { ok: true, handle: String(json.h) };
}
