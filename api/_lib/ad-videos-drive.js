/**
 * Reklam Videoları — Google Drive (Paylaşılan Drive) bağlantısı.
 *
 * Kimlik: Google Cloud hizmet hesabı (service account). Dosyalar kurumun Paylaşılan
 * Drive'ındaki hedef klasöre yazılır; hizmet hesabı o Paylaşılan Drive'a "İçerik yöneticisi"
 * olarak eklenmelidir. Dosyalar herkese açık paylaşılmaz: yalnız Paylaşılan Drive üyeleri açar.
 *
 * Ortam değişkenleri:
 *   GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON  hizmet hesabı JSON anahtarı (düz JSON veya base64)
 *   GOOGLE_DRIVE_IMPERSONATE_USER      (isteğe bağlı) alan çapında yetki devriyle kullanıcı adına yazmak için
 *
 * Yükleme akışı (Vercel gövde sınırına takılmamak için dosya sunucudan geçmez):
 *   1) Sunucu resumable oturum açar (Location = oturum adresi), tarayıcıya verir.
 *   2) Tarayıcı dosyayı parça parça doğrudan Google'a PUT eder; kesintide kaldığı yerden sürer.
 *   3) Sunucu oturumun durumunu Google'a kendisi sorar, dosyayı doğrular, teslimi kaydeder.
 */
import crypto from 'crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/drive';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const FILES_URL = 'https://www.googleapis.com/drive/v3/files';

/** Tarayıcı parça boyutu — 256 KiB katı olmalı */
export const UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;

let tokenCache = null;
let fetchImpl = (...a) => fetch(...a);

/** Testler için */
export function __setDriveFetch(fn) {
  fetchImpl = fn || ((...a) => fetch(...a));
  tokenCache = null;
}

export function readServiceAccount(env = process.env) {
  const raw = String(env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON || '').trim();
  if (!raw) return null;
  let text = raw;
  if (!raw.startsWith('{')) {
    try {
      text = Buffer.from(raw, 'base64').toString('utf8');
    } catch {
      return null;
    }
  }
  try {
    const j = JSON.parse(text);
    if (!j.client_email || !j.private_key) return null;
    return {
      clientEmail: j.client_email,
      privateKey: String(j.private_key).replace(/\\n/g, '\n'),
      subject: String(env.GOOGLE_DRIVE_IMPERSONATE_USER || '').trim() || null
    };
  } catch {
    return null;
  }
}

export function driveCredentialsConfigured(env = process.env) {
  return Boolean(readServiceAccount(env));
}

/** Ayar + kimlik: doğrudan yükleme gerçekten kullanılabilir mi? */
export function effectiveUploadEnabled(settings, env = process.env) {
  return Boolean(settings?.drive_upload_enabled && settings?.drive_folder_id && driveCredentialsConfigured(env));
}

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

export async function getDriveAccessToken(env = process.env) {
  const sa = readServiceAccount(env);
  if (!sa) throw new Error('drive_not_configured');
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.exp - 60 > now && tokenCache.email === sa.clientEmail) return tokenCache.token;
  const claims = { iss: sa.clientEmail, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 };
  if (sa.subject) claims.sub = sa.subject;
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify(claims))}`;
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.privateKey);
  const assertion = `${unsigned}.${b64url(sig)}`;
  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString()
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`drive_token_failed: ${data.error_description || data.error || res.status}`);
  }
  tokenCache = { token: data.access_token, exp: now + Number(data.expires_in || 3600), email: sa.clientEmail };
  return tokenCache.token;
}

/** Drive dosya adında sorun çıkaracak karakterleri temizler */
export function safeDriveName(s) {
  return String(s || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

export function buildDriveFileName({ teacherName, title, version, dateKey, originalName }) {
  const ext = (String(originalName || '').split('.').pop() || 'mp4').toLowerCase();
  return `${safeDriveName(`${dateKey} - ${teacherName} - ${title} - v${version}`)}.${ext}`;
}

/**
 * Resumable yükleme oturumu açar. `origin` tarayıcının Origin başlığıdır;
 * Google, oturum adresine sonraki tarayıcı PUT'larında CORS'u buna göre açar.
 */
export async function createResumableSession({ folderId, name, mimeType, size, origin, description }) {
  const token = await getDriveAccessToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json; charset=UTF-8',
    'X-Upload-Content-Type': mimeType,
    'X-Upload-Content-Length': String(size)
  };
  if (origin) headers.Origin = origin;
  const url = `${UPLOAD_URL}?uploadType=resumable&supportsAllDrives=true&fields=id,name,mimeType,size,parents,driveId,webViewLink`;
  const res = await fetchImpl(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name, mimeType, parents: [folderId], description: description || undefined })
  });
  const location = res.headers.get('location') || res.headers.get('Location');
  if (!res.ok || !location) {
    const t = await res.text().catch(() => '');
    throw new Error(`drive_session_failed: ${res.status} ${t.slice(0, 300)}`);
  }
  return location;
}

/**
 * Oturum durumunu sunucu tarafında sorgular.
 * Dönüş: { state: 'complete', file } | { state: 'incomplete', received } | { state: 'expired' }
 */
export async function querySessionStatus(sessionUri, size) {
  const res = await fetchImpl(sessionUri, {
    method: 'PUT',
    headers: { 'Content-Range': `bytes */${size}`, 'Content-Length': '0' }
  });
  if (res.status === 200 || res.status === 201) {
    const file = await res.json().catch(() => null);
    return { state: 'complete', file };
  }
  if (res.status === 308) {
    const range = res.headers.get('range') || res.headers.get('Range') || '';
    const m = range.match(/bytes=0-(\d+)/);
    return { state: 'incomplete', received: m ? Number(m[1]) + 1 : 0 };
  }
  if (res.status === 404 || res.status === 410) return { state: 'expired' };
  const t = await res.text().catch(() => '');
  throw new Error(`drive_status_failed: ${res.status} ${t.slice(0, 200)}`);
}

export async function getDriveFile(fileId) {
  const token = await getDriveAccessToken();
  const res = await fetchImpl(
    `${FILES_URL}/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=id,name,mimeType,size,parents,driveId,webViewLink,trashed`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (res.status === 404) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`drive_get_failed: ${res.status} ${data?.error?.message || ''}`);
  return data;
}

/** Yüklenen dosya beklenen klasörde ve boyutta mı? */
export function verifyUploadedFile(file, { folderId, size, sharedDriveId }) {
  if (!file?.id) return 'Drive dosyası bulunamadı';
  if (file.trashed) return 'Drive dosyası çöp kutusunda';
  if (folderId && !(file.parents || []).includes(folderId)) return 'Dosya hedef klasörde değil';
  if (sharedDriveId && file.driveId && file.driveId !== sharedDriveId) return 'Dosya kurumun Paylaşılan Drive alanında değil';
  if (size && file.size && Number(file.size) !== Number(size)) return 'Dosya eksik yüklenmiş (boyut uyuşmuyor)';
  return null;
}

export function driveViewUrl(fileId) {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
}

/** Yönetici "Drive bağlantısını test et": hizmet hesabı klasörü görebiliyor mu? */
export async function checkDriveAccess({ folderId, sharedDriveId }) {
  const out = { credentials: driveCredentialsConfigured(), token: false, folder: null, error: null };
  if (!out.credentials) return { ...out, error: 'GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON tanımlı değil' };
  try {
    await getDriveAccessToken();
    out.token = true;
  } catch (e) {
    return { ...out, error: e instanceof Error ? e.message : String(e) };
  }
  if (!folderId) return { ...out, error: 'Hedef klasör kimliği girilmemiş' };
  try {
    const f = await getDriveFile(folderId);
    if (!f) return { ...out, error: 'Klasör bulunamadı veya hizmet hesabının erişimi yok' };
    if (f.mimeType !== 'application/vnd.google-apps.folder') return { ...out, error: 'Kimlik bir klasöre ait değil' };
    out.folder = { id: f.id, name: f.name, driveId: f.driveId || null };
    if (sharedDriveId && f.driveId !== sharedDriveId) out.error = 'Klasör belirtilen Paylaşılan Drive içinde değil';
    if (!f.driveId && !readServiceAccount()?.subject) {
      out.error = 'Klasör bir Paylaşılan Drive içinde değil (hizmet hesabının kendi Drive kotası yoktur)';
    }
  } catch (e) {
    out.error = e instanceof Error ? e.message : String(e);
  }
  return out;
}
