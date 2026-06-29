import { supabaseAdmin } from './supabase-admin.js';

export const SOLUTION_APPOINTMENT_BUCKET = 'solution-appointments';

export async function uploadSolutionAppointmentFile({ base64, mime, path, originalName }) {
  const buf = Buffer.from(String(base64 || ''), 'base64');
  if (!buf.length) throw new Error('empty_file');
  const contentType = mime || 'application/octet-stream';
  const { error } = await supabaseAdmin.storage.from(SOLUTION_APPOINTMENT_BUCKET).upload(path, buf, {
    contentType,
    upsert: false
  });
  if (error) throw error;
  const { data: signed } = await supabaseAdmin.storage
    .from(SOLUTION_APPOINTMENT_BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 7);
  return {
    storage_path: path,
    file_url: signed?.signedUrl || null,
    mime_type: contentType,
    original_name: originalName || null
  };
}

export async function refreshSignedUrl(storagePath) {
  const { data: signed } = await supabaseAdmin.storage
    .from(SOLUTION_APPOINTMENT_BUCKET)
    .createSignedUrl(storagePath, 60 * 60 * 24);
  return signed?.signedUrl || null;
}
