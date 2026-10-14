/**
 * Instagram otomasyonu — tekil gönderim kilidi (idempotency).
 *
 * NEDEN GEREKTİ (üretimde ölçüldü)
 * Aynı buton basışı iki kez işleniyordu, çünkü:
 *   1. collectEntryMessagingEvents aynı olayı `messaging[]`, `standby[]` ve
 *      `changes[field=messages]` kaynaklarından birden çok kez döndürebiliyor.
 *   2. Meta yanıt gecikirse webhook'u yeniden gönderiyor.
 *   3. Eski koruma (tekrarEngeli) log satırını OKUYUP sonra YAZIYORDU;
 *      iki çalışma aynı anda okursa ikisi de "gönderebilirim" diyordu.
 *      Klasik oku-sonra-yaz yarışı.
 *
 * ÇÖZÜM: göndermeden ÖNCE veritabanına benzersiz anahtarla satır atılır.
 * Birincil anahtar çakışması olursa o işlemi başkası üstlenmiştir ve
 * bu çalışma hiçbir şey göndermez. Koruma süreç belleğinde değil
 * veritabanında olduğu için sunucu yeniden başlasa da, iki ayrı örnek
 * aynı anda çalışsa da geçerlidir.
 */
import { supabaseAdmin } from './supabase-admin.js';
import { errorMessage } from './error-msg.js';

const TABLE = 'crm_ig_send_locks';

/** Adımlar: her biri ayrı bir "en fazla bir mesaj" garantisi taşır */
export const ADIMLAR = {
  INVITE: 'invite',
  VERIFY_RESULT: 'verify_result',
  PDF: 'pdf'
};

/**
 * İşlem anahtarı.
 *
 * - invite        : yorum başına bir davet  -> comment_id
 * - verify_result : her buton basışı için bir yanıt -> mesaj kimliği (mid)
 *   Kullanıcı sonra bilinçli olarak tekrar basarsa mid değişir ve YENİ bir
 *   kontrol sayılır (spec 5), ama aynı basışın tekrarı tek yanıt üretir.
 * - pdf           : otomasyon + kullanıcı başına ÖMÜRLÜK bir kez.
 *   Böylece tekrar kontrolde PDF ikinci kez gönderilmez.
 */
export function islemAnahtari({ step, automationId, igUserId, commentId, eventId }) {
  const a = String(automationId || '').trim();
  const u = String(igUserId || '').trim();
  if (step === ADIMLAR.INVITE) {
    return `invite:${a}:${String(commentId || '').trim()}`;
  }
  if (step === ADIMLAR.PDF) {
    return `pdf:${a}:${u}`;
  }
  if (step === ADIMLAR.VERIFY_RESULT) {
    const e = String(eventId || '').trim();
    // Olay kimliği yoksa kullanıcı+otomasyon bazına düş: mesaj kaybolmaz
    // ama tekrar da etmez.
    return e ? `verify:${a}:${u}:${e}` : `verify:${a}:${u}`;
  }
  return `${String(step || 'step')}:${a}:${u}`;
}

/**
 * Gönderim hakkını üstlenir.
 * @returns {{alindi: boolean, mevcutDurum?: string}} alindi=false ise GÖNDERME
 */
export async function gonderimHakkiAl({ dedupKey, automationId, igUserId, step }) {
  const key = String(dedupKey || '').trim();
  if (!key) return { alindi: false };
  try {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .upsert(
        {
          dedup_key: key,
          automation_id: automationId || null,
          ig_user_id: igUserId || null,
          step: step || 'step',
          status: 'sending',
          updated_at: new Date().toISOString()
        },
        { onConflict: 'dedup_key', ignoreDuplicates: true }
      )
      .select('dedup_key');
    if (error) {
      // Tablo yoksa akışı durdurmayalım; eski davranışa düşülür
      if (/does not exist|schema cache|PGRST205/i.test(errorMessage(error))) {
        return { alindi: true, kilitYok: true };
      }
      throw error;
    }
    // ignoreDuplicates: satır zaten varsa boş dizi döner -> hak alınamadı
    const alindi = Array.isArray(data) && data.length > 0;
    if (alindi) return { alindi: true };

    const { data: mevcut } = await supabaseAdmin
      .from(TABLE)
      .select('status')
      .eq('dedup_key', key)
      .maybeSingle();
    return { alindi: false, mevcutDurum: mevcut?.status || 'sending' };
  } catch (e) {
    console.warn('[ig-send-lock] hak alinamadi:', errorMessage(e));
    // Kilit okunamıyorsa GÖNDERME: çift mesaj, eksik mesajdan kötüdür
    return { alindi: false, mevcutDurum: 'unknown' };
  }
}

/** Gönderim sonucunu işaretler. */
export async function gonderimSonucu({ dedupKey, status, messageId, error }) {
  try {
    await supabaseAdmin
      .from(TABLE)
      .update({
        status,
        message_id: messageId || null,
        error: error ? String(error).slice(0, 500) : null,
        updated_at: new Date().toISOString()
      })
      .eq('dedup_key', String(dedupKey || ''));
  } catch (e) {
    console.warn('[ig-send-lock] sonuc yazilamadi:', errorMessage(e));
  }
}

/**
 * Sonucu belirsiz kalan gönderim (zaman aşımı / ağ hatası).
 * Mesaj Meta'ya ulaşmış olabilir; körlemesine tekrar göndermek yerine
 * 'review' işaretlenir ve anahtar KORUNUR, böylece ikinci deneme engellenir.
 */
export async function gonderimIncelemeyeAl({ dedupKey, error }) {
  await gonderimSonucu({ dedupKey, status: 'review', error });
}
