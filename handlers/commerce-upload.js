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

const ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function err(res, status, message) {
  return res.status(status).json({ error: message });
}

function stripDataUrl(base64str) {
  if (!base64str) return '';
  const comma = base64str.indexOf(',');
  return comma >= 0 ? base64str.slice(comma + 1) : base64str;
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

    const body = req.body ?? {};
    const { op, file_base64, mime_type, book_id, vendor_id, save_to_db } = body;

    if (!file_base64) return err(res, 400, 'file_base64 gerekli');
    if (!ALLOWED_MIME.includes(mime_type)) return err(res, 400, 'Desteklenmeyen dosya türü (jpeg/png/webp)');

    const rawBase64 = stripDataUrl(String(file_base64));
    const buffer = Buffer.from(rawBase64, 'base64');
    if (buffer.byteLength > MAX_BYTES) return err(res, 400, 'Dosya 10 MB sınırını aşıyor');

    const ext = mime_type === 'image/png' ? 'png' : mime_type === 'image/webp' ? 'webp' : 'jpg';
    const ts = Date.now();

    // ── Book cover ─────────────────────────────────────────────
    if (op === 'book_cover') {
      if (!book_id) return err(res, 400, 'book_id gerekli');

      // vendor_admin: yalnızca kendi teklifinin olduğu kitabı güncelleyebilir
      if (isVendorAdmin && !isSuperAdmin && !isAdmin) {
        const { data } = await supabaseAdmin
          .from('commerce_vendor_offers')
          .select('id')
          .eq('book_id', book_id)
          .in('vendor_id', await vendorIdsForUser(actor.sub))
          .maybeSingle();
        // Yeni kitap oluşturuyorsa (henüz teklif yok) da izin ver — created_by kontrolü
        const { data: bookRow } = await supabaseAdmin
          .from('commerce_books')
          .select('created_by')
          .eq('id', book_id)
          .maybeSingle();
        if (!data && bookRow?.created_by !== actor.sub) {
          return err(res, 403, 'Bu kitabın kapağını değiştirme yetkiniz yok');
        }
      }

      const path = `books/${book_id}/cover-${ts}.${ext}`;
      const { error: upErr } = await supabaseAdmin.storage
        .from('commerce-book-covers')
        .upload(path, buffer, { contentType: mime_type, upsert: true, cacheControl: '31536000' });
      if (upErr) throw new Error(`Storage upload hatası: ${upErr.message}`);

      const { data: pub } = supabaseAdmin.storage
        .from('commerce-book-covers')
        .getPublicUrl(path);
      const url = pub?.publicUrl;
      if (!url) throw new Error('Public URL alınamadı');

      // DB güncelle
      if (save_to_db !== false) {
        await supabaseAdmin
          .from('commerce_books')
          .update({ cover_image_url: url, updated_at: new Date().toISOString() })
          .eq('id', book_id);
      }

      return res.status(200).json({ ok: true, url });
    }

    // ── Vendor logo ────────────────────────────────────────────
    if (op === 'vendor_logo') {
      if (!vendor_id) return err(res, 400, 'vendor_id gerekli');

      if (isVendorAdmin && !isSuperAdmin && !isAdmin) {
        const ids = await vendorIdsForUser(actor.sub);
        if (!ids.includes(vendor_id)) return err(res, 403, 'Bu satıcı size ait değil');
      }

      const path = `vendors/${vendor_id}/logo-${ts}.${ext}`;
      const { error: upErr } = await supabaseAdmin.storage
        .from('commerce-vendor-assets')
        .upload(path, buffer, { contentType: mime_type, upsert: true, cacheControl: '31536000' });
      if (upErr) throw new Error(`Storage upload hatası: ${upErr.message}`);

      const { data: pub } = supabaseAdmin.storage
        .from('commerce-vendor-assets')
        .getPublicUrl(path);
      const url = pub?.publicUrl;
      if (!url) throw new Error('Public URL alınamadı');

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
