/**
 * Instagram yorum otomasyonu — yürütme katmanı.
 *
 * Seçilen gönderiye anahtar kelime yazan kişiye otomatik özel mesaj (ör. PDF
 * linki) gider, istenirse yorumun altına da herkese açık kısa bir yanıt yazılır.
 *
 * GÜVENLİK / SINIRLAR
 * - Otomasyonlar VARSAYILAN KAPALI; yönetici açmadan tek mesaj gitmez.
 * - Meta'nın resmî "private reply" ucu kullanılır: bir yoruma yalnız BİR kez ve
 *   7 gün içinde. Gönderim comment_id bazında tekilleştirilir.
 * - once_per_user açıkken aynı kişiye aynı otomasyondan bir daha gönderilmez.
 * - Kendi hesabımızın yorumlarına yanıt verilmez (bot kendine yazmasın).
 * - Hata hâlinde sessizce geçilir; mevcut yorum → CRM akışı hiçbir şekilde
 *   bozulmaz.
 */
import { supabaseAdmin } from './supabase-admin.js';
import { yorumIcinPlan } from './ig-takip-kapisi.js';
import { errorMessage } from './error-msg.js';
import { mesajdakiBagi, pickAutomation, renderAutomationText } from './crm-comment-automation-core.js';

const TABLE = 'crm_comment_automations';
const LOG_TABLE = 'crm_comment_automation_logs';

function tableMissing(error) {
  const msg = String(error?.message || '');
  return /does not exist|schema cache|PGRST205/i.test(msg);
}

/** Kurumun açık otomasyonları. */
export async function loadActiveCommentAutomations(institutionId) {
  try {
    let q = supabaseAdmin.from(TABLE).select('*').eq('platform', 'instagram').eq('is_active', true);
    if (institutionId) q = q.eq('institution_id', institutionId);
    const { data, error } = await q;
    if (error) {
      if (tableMissing(error)) return [];
      throw error;
    }
    return data || [];
  } catch (e) {
    console.warn('[comment-automation] liste:', errorMessage(e));
    return [];
  }
}

async function alreadyHandled({ commentId, automationId, igUserId, oncePerUser, sentLink }) {
  try {
    const { data: byComment } = await supabaseAdmin
      .from(LOG_TABLE)
      .select('id')
      .eq('comment_id', String(commentId))
      .maybeSingle();
    if (byComment?.id) return 'comment_already_handled';

    if (oncePerUser && igUserId) {
      const { data: byUser } = await supabaseAdmin
        .from(LOG_TABLE)
        .select('id')
        .eq('automation_id', automationId)
        .eq('ig_user_id', String(igUserId))
        .eq('dm_status', 'sent')
        .limit(1);
      if (Array.isArray(byUser) && byUser.length) return 'user_already_received';

      /**
       * AYNI BAĞLANTI BAŞKA BIR OTOMASYONDAN GITTIYSE TEKRAR GONDERME.
       * Uretimde goruldu: ayni kisi iki ayri gonderiye "LGS" yazdi, iki
       * otomasyon ayni Drive bagini gonderdi. once_per_user yalniz kendi
       * otomasyonu icinde koruyordu.
       */
      if (sentLink) {
        const { data: byLink } = await supabaseAdmin
          .from(LOG_TABLE)
          .select('id')
          .eq('ig_user_id', String(igUserId))
          .eq('sent_link', sentLink)
          .eq('dm_status', 'sent')
          .limit(1);
        if (Array.isArray(byLink) && byLink.length) return 'link_already_sent';
      }
    }
  } catch (e) {
    if (!tableMissing(e)) console.warn('[comment-automation] tekillik:', errorMessage(e));
  }
  return null;
}

/**
 * Bir Instagram yorumu için otomasyonu çalıştırır.
 *
 * @param {object} args
 * @param {object} args.comment normalizeInstagramCommentChange çıktısı
 * @param {string} [args.institutionId]
 * @returns {Promise<{ ran: boolean, reason?: string, automationId?: string }>}
 */
export async function runCommentAutomationForComment({ comment, institutionId }) {
  try {
    const commentId = String(comment?.commentId || '').trim();
    const text = String(comment?.rawText || '').trim();
    const mediaId = String(comment?.mediaId || '').trim();
    const igUserId = String(comment?.fromId || '').trim();
    if (!commentId || !text) return { ran: false, reason: 'no_comment_text' };
    if (comment?.isLive) return { ran: false, reason: 'live_comment_skipped' };

    const automations = await loadActiveCommentAutomations(institutionId);
    if (!automations.length) return { ran: false, reason: 'no_active_automation' };

    const hit = pickAutomation(automations, { mediaId, text });
    if (!hit) return { ran: false, reason: 'no_keyword_match' };
    const { automation, keyword } = hit;

    const dup = await alreadyHandled({
      commentId,
      automationId: automation.id,
      igUserId,
      oncePerUser: automation.once_per_user !== false,
      sentLink: mesajdakiBagi(automation.dm_text)
    });
    if (dup) return { ran: false, reason: dup, automationId: automation.id };

    // Kaydı önce at: aynı yorum iki webhook'ta gelirse ikinci gönderim olmasın
    const { error: logErr } = await supabaseAdmin.from(LOG_TABLE).insert({
      automation_id: automation.id,
      institution_id: institutionId || automation.institution_id || null,
      comment_id: commentId,
      media_id: mediaId || null,
      ig_user_id: igUserId || null,
      username: comment?.fromUsername || null,
      matched_keyword: keyword,
      // Otomasyonlar arasi tekillestirme anahtari
      sent_link: mesajdakiBagi(automation.dm_text),
      dm_status: 'pending'
    });
    if (logErr) {
      if (/duplicate|unique/i.test(logErr.message || '')) {
        return { ran: false, reason: 'comment_already_handled', automationId: automation.id };
      }
      if (tableMissing(logErr)) return { ran: false, reason: 'log_table_missing' };
      throw logErr;
    }

    const inbox = await import('./crm-inbox.js');
    const vars = { username: comment?.fromUsername || '', keyword };
    const patch = { dm_status: 'sent', dm_error: null };

    /**
     * TAKIP KAPISI
     * Kapali (varsayilan): plan.aksiyon='send_pdf' -> mevcut davranis aynen.
     * Acik: PDF yerine DAVET mesaji gider; PDF bagi burada GECMEZ ve
     * yorum altina "PDF gonderdik" yaniti verilmez.
     */
    const plan = yorumIcinPlan(automation);
    const takipKapisi = plan.aksiyon === 'send_invite';
    if (takipKapisi) patch.follow_state = 'invite_sent';

    const dmText = takipKapisi
      ? renderAutomationText(plan.text, vars)
      : renderAutomationText(automation.dm_text, vars);
    if (!dmText) {
      patch.dm_status = 'skipped';
      patch.dm_error = takipKapisi ? 'follow_invite_text_empty' : 'dm_text_empty';
    } else {
      try {
        await inbox.sendInstagramPrivateReply({
          commentId,
          text: dmText,
          quickReply: takipKapisi ? { title: plan.buttonText, payload: plan.payload } : undefined
        });
        // Temsilci gelen kutusunda görsün
        if (igUserId) {
          await inbox
            .upsertCrmMessage({
              channel: 'instagram',
              contactIdentifier: igUserId,
              contactName: comment?.fromUsername || null,
              body: dmText,
              direction: 'outbound',
              senderType: 'bot',
              institutionId: institutionId || automation.institution_id || null
            })
            .catch(() => null);
        }
      } catch (e) {
        patch.dm_status = 'failed';
        patch.dm_error = errorMessage(e).slice(0, 500);
      }
    }

    /**
     * Spec: "PDF henuz gonderilmemisse 'PDF gonderdik' yaniti verilmesin."
     * Takip kapisi acikken yorum yaniti, PDF dogrulama sonrasi
     * gonderildiginde verilir (bkz. ig-takip-kapisi akisi).
     */
    const replyText = takipKapisi ? '' : renderAutomationText(automation.reply_comment_text, vars);
    if (replyText) {
      try {
        await inbox.replyToInstagramComment({ commentId, text: replyText });
        patch.reply_status = 'sent';
      } catch (e) {
        patch.reply_status = 'failed';
        patch.reply_error = errorMessage(e).slice(0, 500);
      }
    }

    await supabaseAdmin.from(LOG_TABLE).update(patch).eq('comment_id', commentId);

    if (patch.dm_status === 'sent') {
      await supabaseAdmin
        .from(TABLE)
        .update({
          sent_count: (Number(automation.sent_count) || 0) + 1,
          last_sent_at: new Date().toISOString()
        })
        .eq('id', automation.id);
    }

    return {
      ran: patch.dm_status === 'sent',
      reason: patch.dm_status,
      automationId: automation.id,
      keyword
    };
  } catch (e) {
    console.warn('[comment-automation] akış:', errorMessage(e));
    return { ran: false, reason: 'error', error: errorMessage(e) };
  }
}
