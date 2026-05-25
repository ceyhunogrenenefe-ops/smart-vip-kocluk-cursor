import { supabaseAdmin } from './supabase-admin.js';

export const EDU_ANIMATIONS_BUCKET = 'edu-animations';
export const EDU_SUBMISSIONS_BUCKET = 'edu-homework-submissions';

export async function uploadEduBuffer({ bucket, path, buffer, contentType }) {
  const { error } = await supabaseAdmin.storage.from(bucket).upload(path, buffer, {
    contentType: contentType || 'application/octet-stream',
    cacheControl: '3600',
    upsert: true
  });
  if (error) throw error;
}

export async function downloadEduBuffer(bucket, path) {
  const { data, error } = await supabaseAdmin.storage.from(bucket).download(path);
  if (error) throw error;
  if (Buffer.isBuffer(data)) return data;
  if (data && typeof data.arrayBuffer === 'function') {
    return Buffer.from(await data.arrayBuffer());
  }
  return Buffer.from(data);
}

export async function signedEduUrl(bucket, path, expiresSec = 3600) {
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(path, expiresSec);
  if (error) throw error;
  return data?.signedUrl || null;
}

export async function removeEduObject(bucket, path) {
  if (!path) return;
  await supabaseAdmin.storage.from(bucket).remove([path]);
}
