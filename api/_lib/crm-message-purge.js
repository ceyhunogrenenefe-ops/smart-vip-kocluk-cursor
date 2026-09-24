/**
 * CRM'den silinen sohbet / mesaj, günlük rapora da yansımasın.
 *
 * Gelen kutusundaki sohbet `crm_conversations` + `crm_messages` tablolarında,
 * raporun saydığı kayıtlar ise `registration_channel_messages` tablosunda durur.
 * İkisi `external_message_id` ↔ `message_id` ile eşleşir. Silinen mesajlar
 * burada `deleted_at` ile işaretlenir; kayıt durur ama rapora girmez.
 */
import { supabaseAdmin } from './supabase-admin.js';
import { errorMessage } from './error-msg.js';

/** Verilen dış mesaj kimliklerini rapor dışına çıkarır. */
export async function markChannelMessagesDeleted(externalMessageIds = []) {
  const ids = [...new Set((externalMessageIds || []).map((x) => String(x || '').trim()).filter(Boolean))];
  if (!ids.length) return { marked: 0 };
  try {
    const { data, error } = await supabaseAdmin
      .from('registration_channel_messages')
      .update({ deleted_at: new Date().toISOString() })
      .in('external_message_id', ids)
      .is('deleted_at', null)
      .select('id');
    if (error) {
      // Sütun henüz yoksa silme yine de başarılı sayılır
      if (/deleted_at/i.test(error.message || '')) return { marked: 0, skipped: 'column_missing' };
      throw error;
    }
    return { marked: (data || []).length };
  } catch (e) {
    console.warn('[crm-message-purge] işaretlenemedi:', errorMessage(e));
    return { marked: 0, error: errorMessage(e) };
  }
}

/** Sohbetteki tüm mesajları rapor dışına çıkarır (sohbet silinmeden ÖNCE çağrılır). */
export async function markConversationMessagesDeleted(conversationId) {
  const id = String(conversationId || '').trim();
  if (!id) return { marked: 0 };
  try {
    const { data, error } = await supabaseAdmin
      .from('crm_messages')
      .select('message_id')
      .eq('conversation_id', id)
      .not('message_id', 'is', null);
    if (error) throw error;
    return await markChannelMessagesDeleted((data || []).map((m) => m.message_id));
  } catch (e) {
    console.warn('[crm-message-purge] sohbet mesajları:', errorMessage(e));
    return { marked: 0, error: errorMessage(e) };
  }
}

/** Tek mesaj silinince (silme işleminden ÖNCE çağrılır). */
export async function markSingleMessageDeleted(messageRow) {
  const externalId = String(messageRow?.message_id || '').trim();
  if (!externalId) return { marked: 0 };
  return markChannelMessagesDeleted([externalId]);
}
