import crypto from 'crypto';
import { supabaseAdmin } from './supabase-admin.js';

/** Veliye giden PDF'ler — question-help bucket (zaten servis rolü erişimi var). */
const BUCKET = String(process.env.META_DOCUMENT_BUCKET || 'question-help').trim() || 'question-help';
const PREFIX = 'wa-parent-pdf';

export async function uploadParentPdfForMeta({
  buffer,
  filename,
  mimeType = 'application/pdf',
  expiresSec,
  prefix = PREFIX,
  maxTtl
}) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (!buf.length) throw new Error('empty_document_buffer');

  const id = crypto.randomUUID();
  const safeName =
    String(filename || 'document.pdf')
      .trim()
      .replace(/[^\w.\-() ]+/g, '_')
      .slice(0, 80) || 'document.pdf';
  const folder = String(prefix || PREFIX).replace(/^\/+|\/+$/g, '') || PREFIX;
  const path = `${folder}/${id}/${safeName}`;
  const contentType = String(mimeType || 'application/pdf').trim() || 'application/pdf';

  const { error: uploadErr } = await supabaseAdmin.storage.from(BUCKET).upload(path, buf, {
    contentType,
    upsert: false
  });
  if (uploadErr) {
    const err = new Error(uploadErr.message || 'meta_document_storage_upload_failed');
    err.code = 'STORAGE';
    throw err;
  }

  const ceiling = Math.min(365 * 24 * 3600, Math.max(3600, Number(maxTtl) || 7 * 24 * 3600));
  const ttl = Math.min(
    ceiling,
    Math.max(600, Number(expiresSec) || Number(process.env.META_DOCUMENT_SIGNED_URL_SEC) || ceiling)
  );
  const { data: signed, error: signErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(path, ttl);
  if (signErr || !signed?.signedUrl) {
    const err = new Error(signErr?.message || 'meta_document_signed_url_failed');
    err.code = 'STORAGE';
    throw err;
  }

  return {
    bucket: BUCKET,
    path,
    signedUrl: signed.signedUrl,
    filename: safeName
  };
}

/** Gelen kutusu eki. Kovada tür yoksa gönderim sürer, önizleme bağlantısı boş kalır. */
export async function uploadCrmOutboundFile({ buffer, filename, mimeType }) {
  try {
    return await uploadParentPdfForMeta({
      buffer,
      filename,
      mimeType,
      prefix: 'crm-outbound',
      expiresSec: 30 * 24 * 3600,
      maxTtl: 30 * 24 * 3600
    });
  } catch (e) {
    console.warn('[crm-media] depolama:', e instanceof Error ? e.message : e);
    return null;
  }
}
