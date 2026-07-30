import { supabaseAdmin } from './supabase-admin.js';

export const EDU_ANIMATIONS_BUCKET = 'edu-animations';
export const EDU_SUBMISSIONS_BUCKET = 'edu-homework-submissions';
export const EDU_HOMEWORK_ATTACHMENTS_BUCKET = 'edu-homework-attachments';

/** 2 dk telefon videoları 30 MB’ı aşabilir — bucket eski 30 MB limitini yükselt */
export const EDU_SUBMISSIONS_FILE_SIZE_LIMIT = 500 * 1024 * 1024;

const EDU_SUBMISSIONS_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'video/mp4',
  'video/webm',
  'video/quicktime'
];

let submissionsBucketEnsurePromise = null;

/**
 * Storage bucket file_size_limit’i yükselt (413 EntityTooLarge önlemi).
 * Service role gerekir; hata olursa sessizce geçilir (SQL ile de güncellenebilir).
 */
export async function ensureEduSubmissionsBucketLimits() {
  if (submissionsBucketEnsurePromise) return submissionsBucketEnsurePromise;
  submissionsBucketEnsurePromise = (async () => {
    try {
      const { error } = await supabaseAdmin.storage.updateBucket(EDU_SUBMISSIONS_BUCKET, {
        public: false,
        fileSizeLimit: EDU_SUBMISSIONS_FILE_SIZE_LIMIT,
        allowedMimeTypes: EDU_SUBMISSIONS_MIME_TYPES
      });
      if (error) {
        // Bucket yoksa oluşturmayı dene
        const created = await supabaseAdmin.storage.createBucket(EDU_SUBMISSIONS_BUCKET, {
          public: false,
          fileSizeLimit: EDU_SUBMISSIONS_FILE_SIZE_LIMIT,
          allowedMimeTypes: EDU_SUBMISSIONS_MIME_TYPES
        });
        if (created.error && !String(created.error.message || '').toLowerCase().includes('already')) {
          console.warn('[edu-storage] bucket limit update failed:', error.message || error);
        }
      }
    } catch (e) {
      console.warn('[edu-storage] ensureEduSubmissionsBucketLimits:', e?.message || e);
      submissionsBucketEnsurePromise = null;
    }
  })();
  return submissionsBucketEnsurePromise;
}

export async function uploadEduBuffer({ bucket, path, buffer, contentType }) {
  if (bucket === EDU_SUBMISSIONS_BUCKET) {
    await ensureEduSubmissionsBucketLimits();
  }
  const { error } = await supabaseAdmin.storage.from(bucket).upload(path, buffer, {
    contentType: contentType || 'application/octet-stream',
    cacheControl: '3600',
    upsert: true
  });
  if (error) throw error;
}

/** Tarayıcıdan doğrudan Storage’a yükleme (Vercel 4.5MB body limitini aşar). */
export async function createEduSignedUploadUrl({ bucket, path, upsert = true }) {
  if (bucket === EDU_SUBMISSIONS_BUCKET) {
    await ensureEduSubmissionsBucketLimits();
  }
  let result = await supabaseAdmin.storage.from(bucket).createSignedUploadUrl(path, { upsert });
  if (result.error) {
    // Bazı supabase-js sürümlerinde 2. argüman yok
    result = await supabaseAdmin.storage.from(bucket).createSignedUploadUrl(path);
  }
  if (result.error) throw result.error;
  const data = result.data;
  return {
    path: data?.path || path,
    token: data?.token || null,
    signedUrl: data?.signedUrl || null
  };
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
