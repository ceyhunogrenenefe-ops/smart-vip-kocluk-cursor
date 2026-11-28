/**
 * Kurumsal Paylaşılan Drive. Kimlik bilgisi yalnız sunucuda kalır.
 * Öğretmen Google hesabı açmaz; dosya herkese açık yapılmaz.
 */

import { google } from 'googleapis';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';

export function readDriveConfig(env = process.env) {
  const sharedDriveId = String(env.AD_VIDEO_SHARED_DRIVE_ID || '').trim();
  const folderId = String(env.AD_VIDEO_FOLDER_ID || '').trim();
  const rawFolderId = String(env.AD_VIDEO_RAW_FOLDER_ID || '').trim() || folderId;
  const editFolderId = String(env.AD_VIDEO_EDIT_FOLDER_ID || '').trim() || folderId;
  let credentials = null;
  const rawJson = String(env.GOOGLE_SERVICE_ACCOUNT_JSON || '').trim();
  if (rawJson) {
    try {
      credentials = JSON.parse(rawJson);
    } catch {
      credentials = null;
    }
  }
  if (!credentials?.client_email || !credentials?.private_key) {
    const email = String(env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '').trim();
    const key = String(env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
    if (email && key) credentials = { client_email: email, private_key: key };
  }
  const missing = [];
  if (!sharedDriveId) missing.push('AD_VIDEO_SHARED_DRIVE_ID');
  if (!rawFolderId) missing.push('AD_VIDEO_FOLDER_ID');
  if (!credentials?.client_email || !credentials?.private_key) missing.push('GOOGLE_SERVICE_ACCOUNT_JSON');
  return {
    ready: missing.length === 0,
    missing,
    sharedDriveId,
    rawFolderId,
    editFolderId,
    credentials: credentials?.client_email ? credentials : null
  };
}

export function publicDriveStatus(config) {
  return {
    ready: Boolean(config?.ready),
    missing: config?.missing || [],
    hint: config?.ready
      ? ''
      : 'Kurumsal Paylaşılan Drive bağlı değil. Yeni teslim kişisel Drive bağlantısı olarak kaydedilmez ve yükleme başarılı sayılmaz.'
  };
}

export function safeDriveError(text) {
  return String(text || '')
    .replace(/ya29\.[A-Za-z0-9_\-]+/g, '[token]')
    .replace(/private_key["']?\s*:\s*["'][^"']+["']/gi, 'private_key:[gizli]')
    .slice(0, 300);
}

export async function getDriveAccessToken(credentials) {
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: [DRIVE_SCOPE]
  });
  const token = await auth.getAccessToken();
  const value = typeof token === 'string' ? token : token?.token;
  if (!value) throw new Error('drive_jeton_yok');
  return value;
}

export async function startResumableUpload({
  token,
  name,
  mime,
  size,
  parentId,
  fetchImpl = fetch
}) {
  const res = await fetchImpl(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mime || 'application/octet-stream',
        'X-Upload-Content-Length': String(size)
      },
      body: JSON.stringify({
        name,
        mimeType: mime || 'application/octet-stream',
        parents: [parentId]
      })
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`drive_oturum_${res.status}: ${safeDriveError(text)}`);
  }
  const location = res.headers.get('location');
  if (!location) throw new Error('drive_oturum_adresi_yok');
  return location;
}

export async function queryResumeOffset(sessionUrl, total, fetchImpl = fetch) {
  const res = await fetchImpl(sessionUrl, {
    method: 'PUT',
    headers: { 'Content-Range': `bytes */${total}` }
  });
  if (res.status === 308) {
    const range = res.headers.get('range') || '';
    const match = /bytes=0-(\d+)/i.exec(range);
    return { ok: true, offset: match ? Number(match[1]) + 1 : 0, done: false };
  }
  if (res.status === 200 || res.status === 201) {
    const file = typeof res.json === 'function' ? await res.json().catch(() => null) : null;
    return { ok: true, offset: Number(total) || 0, done: true, file };
  }
  const text = await res.text();
  return { ok: false, offset: 0, done: false, error: `drive_devam_${res.status}: ${safeDriveError(text)}` };
}

export async function putDriveChunk({ sessionUrl, start, buffer, total, fetchImpl = fetch }) {
  const end = start + buffer.length - 1;
  const res = await fetchImpl(sessionUrl, {
    method: 'PUT',
    headers: {
      'Content-Length': String(buffer.length),
      'Content-Range': `bytes ${start}-${end}/${total}`
    },
    body: buffer
  });
  if (res.status === 308) return { ok: true, done: false, offset: end + 1 };
  if (res.status === 200 || res.status === 201) {
    const file = typeof res.json === 'function' ? await res.json().catch(() => null) : null;
    return { ok: true, done: true, offset: end + 1, file };
  }
  const text = await res.text();
  return { ok: false, done: false, offset: start, error: `drive_parca_${res.status}: ${safeDriveError(text)}` };
}

export async function verifyDriveFile({ token, fileId, fetchImpl = fetch }) {
  const url =
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}` +
    '?supportsAllDrives=true&fields=id,name,mimeType,size,parents,driveId,trashed';
  const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: `drive_dogrulama_${res.status}: ${safeDriveError(text)}` };
  }
  const file = await res.json();
  return { ok: true, file };
}

export function ffmpegAvailable(env = process.env) {
  return Boolean(String(env.FFMPEG_BIN || '').trim());
}
