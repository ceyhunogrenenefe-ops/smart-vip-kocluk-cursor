/**
 * /api/commerce-upload — Kitap kapağı ve satıcı logo yükleme
 *
 * POST body (JSON):
 *   op: "book_cover" | "vendor_logo"
 *   file_base64: string  — data:image/...;base64,... veya saf base64
 *   mime_type: "image/jpeg" | "image/png" | "image/webp"
 *   book_id?: string     — book_cover için
 *   vendor_id?: string   — vendor_logo için
 *   save_to_db?: boolean — true → commerce_books.cover_image_url güncelle
 *
 * Yanıt: { ok: true, url: string }
 */

import { requireAuth } from '../api/_lib/auth.js';
import { actorRoleSet, roleSetHasSuperAdmin, roleSetHasAdmin } from '../api/_lib/actor-roles.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const MAX_BYTES = 4.2 * 1024 * 1024; // Vercel JSON body ~4.5 MB; sıkıştırılmış kapak bu sınırın altında olmalı
const COVER_BUCKET = 'commerce-book-covers';
const LOGO_BUCKET = 'commerce-vendor-assets';

function err(res, status, message) {
  return res.status(status).json({ error: message });
}

function parseBody(req) {
  const raw = req.body;
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw;
}

function stripDataUrl(base64str) {
  if (!base64str) return '';
  const comma = base64str.indexOf(',');
  return comma >= 0 ? base64str.slice(comma + 1) : base64str;
}

function sniffMime(buffer, hinted) {
  const hint = String(hinted || '').toLowerCase().trim();
  if (ALLOWED_MIME.has(hint)) return hint === 'image/jpg' ? 'image/jpeg' : hint;
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png';
  if (buffer.length >= 12 && buffer.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}

function extForMime(mime) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

const bucketEnsureCache = new Map();

async function ensurePublicImageBucket(name, sizeLimit) {
  if (bucketEnsureCache.get(name)) return;
  const mimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const { error } = await supabaseAdmin.storage.updateBucket(name, {
    public: true,
    fileSizeLimit: sizeLimit,
    allowedMimeTypes: mimeTypes,
  });
  if (!error) {
    bucketEnsureCache.set(name, true);
    return;
  }
  const created = await supabaseAdmin.storage.createBucket(name, {
    public: true,
    fileSizeLimit: sizeLimit,
    allowedMimeTypes: mimeTypes,
  });
  if (created.error && !String(created.error.message || '').toLowerCase().includes('already')) {
    console.warn('[commerce-upload] bucket ensure', name, created.error.message || created.error);
  } else {
    bucketEnsureCache.set(name, true);
  }
}

async function uploadPublic(bucket, path, buffer, contentType) {
  await ensurePublicImageBucket(bucket, bucket === COVER_BUCKET ? 10 * 1024 * 1024 : 5 * 1024 * 1024);
  const { error: upErr } = await supabaseAdmin.storage.from(bucket).upload(path, buffer, {
    contentType,
    upsert: true,
    cacheControl: '31536000',
  });
  if (upErr) throw new Error(`Storage upload hatası: ${upErr.message}`);
  const { data: pub } = supabaseAdmin.storage.from(bucket).getPublicUrl(path);
  const url = pub?.publicUrl;
  if (!url) throw new Error('Public URL alınamadı');
  return url;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return err(res, 405, 'Method Not Allowed');
  try {
    const actor = requireAuth(req);
    const roleSet = await actorRoleSet(actor);
    const isSuperAdmin = roleSetHasSuperAdmin(roleSet);
    const isAdmin = roleSetHasAdmin(roleSet);
    const isVendorAdmin = roleSet.has('vendor_admin');

    if (!isSuperAdmin && !isAdmin && !isVendorAdmin) {
      return err(res, 403, 'Yetki yok');
    }

    const body = parseBody(req);
    const { op, file_base64, mime_type, book_id, vendor_id, save_to_db } = body;

    if (!file_base64) return err(res, 400, 'file_base64 gerekli');

    const rawBase64 = stripDataUrl(String(file_base64));
    const buffer = Buffer.from(rawBase64, 'base64');
    if (!buffer.length) return err(res, 400, 'Görsel okunamadı');
    if (buffer.byteLength > MAX_BYTES) return err(res, 400, 'Dosya çok büyük. Lütfen 2 MB altı bir kapak kullanın.');

    const mime = sniffMime(buffer, mime_type);
    if (!mime) return err(res, 400, 'Desteklenmeyen dosya türü (jpeg/png/webp)');
    const ext = extForMime(mime);
    const ts = Date.now();

    if (op === 'book_cover') {
      if (!book_id) return err(res, 400, 'book_id gerekli');

      if (isVendorAdmin && !isSuperAdmin && !isAdmin) {
        const vendorIds = await vendorIdsForUser(actor.sub);
        let ownsOffer = false;
        if (vendorIds.length) {
          const { data } = await supabaseAdmin
            .from('commerce_vendor_offers')
            .select('id')
            .eq('book_id', book_id)
            .in('vendor_id', vendorIds)
            .maybeSingle();
          ownsOffer = Boolean(data);
        }
        const { data: bookRow } = await supabaseAdmin
          .from('commerce_books')
          .select('created_by')
          .eq('id', book_id)
          .maybeSingle();
        if (!ownsOffer && bookRow?.created_by !== actor.sub) {
          return err(res, 403, 'Bu kitabın kapağını değiştirme yetkiniz yok');
        }
      }

      const path = `books/${book_id}/cover-${ts}.${ext}`;
      const url = await uploadPublic(COVER_BUCKET, path, buffer, mime);

      if (save_to_db !== false) {
        const { error: dbErr } = await supabaseAdmin
          .from('commerce_books')
          .update({ cover_image_url: url, updated_at: new Date().toISOString() })
          .eq('id', book_id);
        if (dbErr) throw new Error(`Kapak kaydedilemedi: ${dbErr.message}`);
      }

      return res.status(200).json({ ok: true, url });
    }

    if (op === 'vendor_logo') {
      if (!vendor_id) return err(res, 400, 'vendor_id gerekli');

      if (isVendorAdmin && !isSuperAdmin && !isAdmin) {
        const ids = await vendorIdsForUser(actor.sub);
        if (!ids.includes(vendor_id)) return err(res, 403, 'Bu satıcı size ait değil');
      }

      const path = `vendors/${vendor_id}/logo-${ts}.${ext}`;
      const url = await uploadPublic(LOGO_BUCKET, path, buffer, mime);

      if (save_to_db !== false) {
        await supabaseAdmin
          .from('commerce_vendors')
          .update({ logo_url: url, updated_at: new Date().toISOString() })
          .eq('id', vendor_id);
      }

      return res.status(200).json({ ok: true, url });
    }

    return err(res, 400, `Bilinmeyen op: ${op}`);
  } catch (e) {
    console.error('[commerce-upload]', e?.message || e);
    return err(res, 500, e?.message || 'sunucu_hatası');
  }
}

async function vendorIdsForUser(userId) {
  const { data } = await supabaseAdmin
    .from('commerce_vendor_users')
    .select('vendor_id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .is('deleted_at', null);
  return (data ?? []).map((r) => r.vendor_id);
}
