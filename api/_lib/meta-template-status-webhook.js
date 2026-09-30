/**
 * Meta şablon durumu webhook'u — `message_template_status_update`.
 *
 * Eskiden durum yalnız Graph yoklamasıyla öğreniliyordu: onay ya da ret ancak
 * biri şablon ekranını açtığında görünüyordu. Bu alan abone edildiğinde Meta
 * kararı anında bildiriyor, red gerekçesi de geliyor.
 *
 * Değişiklik yalnızca message_templates tablosundaki durum/gerekçe alanlarını
 * günceller; hiçbir mesaj akışına dokunmaz. Eşleşen kayıt yoksa sessizce geçer
 * (Meta Business Manager'dan açılmış, CRM'de karşılığı olmayan şablonlar).
 */
import { supabaseAdmin } from './supabase-admin.js';
import { errorMessage } from './error-msg.js';

export const TEMPLATE_STATUS_FIELDS = new Set([
  'message_template_status_update',
  'template_status_update'
]);

/** Bu webhook değişikliği şablon durumu mu? */
export function isTemplateStatusChange(change) {
  return TEMPLATE_STATUS_FIELDS.has(String(change?.field || '').trim());
}

/**
 * Meta'nın gönderdiği gerekçeyi okunur hâle getirir.
 * `reason` çoğu zaman NONE/INCORRECT_CATEGORY gibi bir kod olarak gelir.
 */
export function readableRejectionReason(value) {
  const reason = String(value?.reason || '').trim();
  const other = String(value?.other_info?.description || value?.disable_info?.description || '').trim();
  const map = {
    INCORRECT_CATEGORY: 'Kategori yanlış seçilmiş — Meta farklı bir kategori bekliyor.',
    INVALID_FORMAT: 'Biçim hatalı — değişken, başlık veya buton kuralına uymuyor.',
    SCAM: 'İçerik yanıltıcı bulundu.',
    ABUSIVE_CONTENT: 'İçerik kurallara aykırı bulundu.',
    PROMOTIONAL: 'Hizmet kategorisinde pazarlama metni kullanılmış.',
    TAG_CONTENT_MISMATCH: 'Etiket ile içerik uyuşmuyor.',
    NONE: ''
  };
  const mapped = map[reason] ?? '';
  return [mapped || (reason && reason !== 'NONE' ? reason : ''), other].filter(Boolean).join(' — ') || null;
}

/**
 * Durum güncellemesini CRM'e yazar.
 * @returns {Promise<{ updated: number, name?: string, status?: string }>}
 */
export async function applyTemplateStatusUpdate(change) {
  try {
    const value = change?.value && typeof change.value === 'object' ? change.value : {};
    const name = String(value.message_template_name || value.template_name || '').trim();
    const language = String(value.message_template_language || value.template_language || '').trim();
    const status = String(value.event || value.new_template_status || value.status || '').trim().toUpperCase();
    if (!name || !status) return { updated: 0 };

    const patch = {
      whatsapp_template_status: status,
      whatsapp_template_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    // Ret gerekçesi yalnız REJECTED'da anlamlı; onaylanınca eski gerekçe silinir
    patch.rejected_reason = status === 'REJECTED' ? readableRejectionReason(value) : null;
    if (value.message_template_id) patch.meta_template_id = String(value.message_template_id);

    let q = supabaseAdmin.from('message_templates').update(patch).eq('meta_template_name', name);
    if (language) q = q.eq('meta_template_language', language);
    const { data, error } = await q.select('id');
    if (error) {
      if (/column|does not exist|schema cache/i.test(error.message || '')) return { updated: 0 };
      throw error;
    }
    const updated = (data || []).length;
    console.info('[template-status] guncellendi', { name, language: language || null, status, updated });
    return { updated, name, status };
  } catch (e) {
    console.warn('[template-status] guncelleme:', errorMessage(e));
    return { updated: 0 };
  }
}
