/**
 * Takip kapısı — buton yanıtı geldiğinde çalışan akış.
 *
 * Kullanıcı "Takip Ettim" / "Tekrar Kontrol Et" butonuna bastığında:
 *   1) beyan kaydedilir ('user_claimed') — DOĞRULAMA DEĞİLDİR
 *   2) Meta'dan takip durumu okunur
 *   3) sonuca göre PDF veya hatırlatma gönderilir
 *
 * PDF bağlantısı yalnız 2. adım 'verified' dönerse gönderilir.
 */
import { supabaseAdmin } from './supabase-admin.js';
import { errorMessage } from './error-msg.js';
import { butonYukunuCoz, dogrulamaSonrasiPlan, tekrarEngeli } from './ig-takip-kapisi.js';
import { takipDurumunuOku } from './ig-takip-dogrula.js';
import {
  ADIMLAR,
  gonderimHakkiAl,
  gonderimIncelemeyeAl,
  gonderimSonucu,
  islemAnahtari
} from './ig-gonderim-kilidi.js';

const LOG_TABLE = 'crm_comment_automation_logs';
const AUTO_TABLE = 'crm_comment_automations';

/**
 * @returns {{handled: boolean, state?: string, reason?: string}}
 */
export async function takipButonunuIsle({ payload, igUserId, institutionId, eventId }) {
  const coz = butonYukunuCoz(payload);
  if (!coz) return { handled: false };

  const kullanici = String(igUserId || '').trim();
  if (!kullanici) return { handled: true, reason: 'ig_user_missing' };

  try {
    const { data: automation } = await supabaseAdmin
      .from(AUTO_TABLE)
      .select('*')
      .eq('id', coz.automationId)
      .maybeSingle();
    if (!automation) return { handled: true, reason: 'automation_not_found' };
    if (automation.follow_gate_enabled !== true) {
      return { handled: true, reason: 'follow_gate_disabled' };
    }

    // Bu kullanıcının bu otomasyondaki son kaydı
    const { data: loglar } = await supabaseAdmin
      .from(LOG_TABLE)
      .select('*')
      .eq('automation_id', automation.id)
      .eq('ig_user_id', kullanici)
      .order('created_at', { ascending: false })
      .limit(1);
    const log = loglar?.[0] || null;
    if (!log) return { handled: true, reason: 'log_not_found' };

    const engel = tekrarEngeli(log, coz.adim);
    if (engel.engelle) return { handled: true, reason: engel.neden, state: log.follow_state };

    // 1) Beyan: doğrulama DEĞİL
    await supabaseAdmin
      .from(LOG_TABLE)
      .update({ follow_state: 'user_claimed' })
      .eq('id', log.id);

    // 2) Meta'dan oku
    const sonuc = await takipDurumunuOku({
      institutionId: institutionId || automation.institution_id || null,
      igsid: kullanici
    });

    const plan = dogrulamaSonrasiPlan(sonuc, automation);
    const yama = {
      follow_state: plan.durum,
      follow_checked_at: new Date().toISOString(),
      follow_check_error: sonuc?.hata ? String(sonuc.hata).slice(0, 500) : null
    };

    const inbox = await import('./crm-inbox.js');

    if (plan.aksiyon === 'send_pdf' && String(plan.text || '').trim()) {
      /**
       * PDF anahtari otomasyon+kullanici basina OMURLUKTUR: tekrar
       * kontrolde veya webhook tekrarinda ikinci kez gonderilmez.
       */
      const pdfKey = islemAnahtari({
        step: ADIMLAR.PDF,
        automationId: automation.id,
        igUserId: kullanici
      });
      const hak = await gonderimHakkiAl({
        dedupKey: pdfKey,
        automationId: automation.id,
        igUserId: kullanici,
        step: ADIMLAR.PDF
      });
      if (!hak.alindi) {
        await supabaseAdmin
          .from(LOG_TABLE)
          .update({ ...yama, follow_state: 'pdf_sent' })
          .eq('id', log.id);
        return { handled: true, state: 'pdf_sent', reason: 'pdf_zaten_gonderildi' };
      }
      try {
        await inbox.sendCrmInstagramDm({ igScopedId: kullanici, text: plan.text });
        await gonderimSonucu({ dedupKey: pdfKey, status: 'sent' });
        yama.follow_state = 'pdf_sent';
        yama.dm_status = 'sent';

        /**
         * Yorum yanıtı ancak PDF GERÇEKTEN gittikten sonra verilir
         * (spec 3: yanıltıcı "PDF gönderdik" yanıtı yasak).
         */
        const replyText = String(automation.reply_comment_text || '').trim();
        if (replyText && log.comment_id) {
          try {
            await inbox.replyToInstagramComment({ commentId: log.comment_id, text: replyText });
            yama.reply_status = 'sent';
          } catch (e) {
            yama.reply_status = 'failed';
            yama.reply_error = errorMessage(e).slice(0, 500);
          }
        }
      } catch (e) {
        /**
         * Sonuc belirsiz olabilir (zaman asimi): mesaj Meta'ya ulasmis
         * olabilir. Korlemesine tekrar gondermek yerine anahtar KORUNUR
         * ve 'review' isaretlenir.
         */
        await gonderimIncelemeyeAl({ dedupKey: pdfKey, error: errorMessage(e) });
        yama.follow_state = 'failed';
        yama.dm_status = 'failed';
        yama.dm_error = errorMessage(e).slice(0, 500);
      }
    } else if (plan.aksiyon === 'send_retry') {
      // Her buton basisi en fazla BIR yanit uretir (spec 5)
      const retryKey = islemAnahtari({
        step: ADIMLAR.VERIFY_RESULT,
        automationId: automation.id,
        igUserId: kullanici,
        eventId
      });
      const hakR = await gonderimHakkiAl({
        dedupKey: retryKey,
        automationId: automation.id,
        igUserId: kullanici,
        step: ADIMLAR.VERIFY_RESULT
      });
      if (!hakR.alindi) {
        await supabaseAdmin.from(LOG_TABLE).update(yama).eq('id', log.id);
        return { handled: true, state: yama.follow_state, reason: 'uyari_zaten_gonderildi' };
      }
      try {
        await inbox.sendCrmInstagramQuickReplies({
          igScopedId: kullanici,
          text: plan.text,
          quickReplies: [{ title: plan.buttonText, payload: plan.payload }]
        });
        await gonderimSonucu({ dedupKey: retryKey, status: 'sent' });
      } catch (e) {
        await gonderimIncelemeyeAl({ dedupKey: retryKey, error: errorMessage(e) });
        yama.follow_check_error = errorMessage(e).slice(0, 500);
      }
    }
    // plan.aksiyon === 'none' -> hiçbir mesaj gönderilmez (unsupported)

    await supabaseAdmin.from(LOG_TABLE).update(yama).eq('id', log.id);
    return { handled: true, state: yama.follow_state };
  } catch (e) {
    return { handled: true, reason: errorMessage(e) };
  }
}
