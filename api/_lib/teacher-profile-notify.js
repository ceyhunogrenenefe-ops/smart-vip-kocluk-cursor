/**
 * Öğretmen vitrin profil olay bildirimleri (uygulama içi).
 * WhatsApp/sendNotification başarısız olsa bile ana işlem devam eder.
 */
import { supabaseAdmin } from './supabase-admin.js';
import { errorMessage } from './error-msg.js';

const EVENTS = {
  editing_enabled: {
    title: 'Profiliniz düzenlemeye açıldı',
    body: 'Öğretmen vitrin profilinizi düzenleyebilirsiniz. Tamamlayınca Onaya Gönderin.',
    link: '/profilimi-duzenle'
  },
  submitted: {
    title: 'Profiliniz yönetici onayına gönderildi',
    body: 'Başvurunuz incelenecek. Sonuç size bildirilecek.',
    link: '/profilimi-duzenle'
  },
  approved: {
    title: 'Profiliniz onaylandı',
    body: 'Özel ders vitrininiz yayında.',
    link: '/profilimi-duzenle'
  },
  rejected: {
    title: 'Profiliniz reddedildi',
    body: 'Gerekçeyi profil sayfanızda görebilirsiniz. Düzenleme açıldığında tekrar gönderebilirsiniz.',
    link: '/profilimi-duzenle'
  },
  passive: {
    title: 'Profiliniz pasife alındı',
    body: 'Profiliniz özel ders vitrininden kaldırıldı. Hesabınız silinmedi.',
    link: '/profilimi-duzenle'
  },
  republished: {
    title: 'Profiliniz yeniden yayına alındı',
    body: 'Özel ders vitrininiz tekrar görünür.',
    link: '/profilimi-duzenle'
  },
  deleted: {
    title: 'Profiliniz silindi',
    body: 'Vitrin profiliniz kaldırıldı. Kullanıcı hesabınız silinmedi.',
    link: '/profilimi-duzenle'
  },
  restored: {
    title: 'Profiliniz geri yüklendi',
    body: 'Profil pasif durumda. Yeniden yayın için düzenleme ve onay gerekir.',
    link: '/profilimi-duzenle'
  },
  admin_queue: {
    title: 'Yeni öğretmen profil onayı',
    body: 'Onay bekleyen bir öğretmen profili var.',
    link: '/ogretmen-profil-onaylari'
  }
};

export async function notifyTeacherProfileEvent({
  event,
  targetUserId,
  senderUserId = null,
  extraBody = '',
  notifyAdmins = false,
  institutionId = null
} = {}) {
  const cfg = EVENTS[event];
  if (!cfg || !targetUserId) return { ok: false, skipped: true };

  try {
    const body = extraBody ? `${cfg.body}\n${extraBody}` : cfg.body;
    const { error } = await supabaseAdmin.from('platform_notifications').insert({
      sender_user_id: senderUserId || targetUserId,
      sender_role: 'admin',
      sender_name: 'Sistem',
      institution_id: institutionId,
      title: cfg.title,
      body,
      target_type: 'user',
      target_user_id: targetUserId,
      target_role: null,
      target_institution_id: null,
      priority: 'normal',
      link_url: cfg.link
    });
    if (error) throw error;
  } catch (e) {
    console.warn('[teacher-profile-notify]', event, errorMessage(e));
  }

  if (notifyAdmins) {
    try {
      let q = supabaseAdmin
        .from('users')
        .select('id')
        .or('role.eq.admin,role.eq.super_admin')
        .eq('is_active', true)
        .limit(50);
      if (institutionId) q = q.eq('institution_id', institutionId);
      const { data: admins } = await q;
      const adminCfg = EVENTS.admin_queue;
      for (const a of admins || []) {
        if (String(a.id) === String(targetUserId)) continue;
        await supabaseAdmin.from('platform_notifications').insert({
          sender_user_id: senderUserId || targetUserId,
          sender_role: 'system',
          sender_name: 'Sistem',
          institution_id: institutionId,
          title: adminCfg.title,
          body: adminCfg.body,
          target_type: 'user',
          target_user_id: a.id,
          priority: 'high',
          link_url: adminCfg.link
        });
      }
    } catch (e) {
      console.warn('[teacher-profile-notify] admins', errorMessage(e));
    }
  }

  return { ok: true };
}
