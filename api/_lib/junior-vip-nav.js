import { JUNIOR_VIP_STUDENT_NAV } from './junior-vip-student-nav.js';

/** Koç paneli menü kataloğu — Sidebar MENU_COACH ile aynı gerçek rotalar. */
export const JUNIOR_VIP_COACH_NAV = [
  { label: 'Koç Paneli', path: '/coach-dashboard', keywords: ['panel', 'ana sayfa', 'koç paneli', 'kontrol paneli'] },
  { label: 'Öğrenciler', path: '/students', keywords: ['öğrenciler', 'öğrencilerim', 'öğrenci listesi'] },
  { label: 'Haftalık plan', path: '/weekly-planner', keywords: ['haftalık plan', 'çalışma planı', 'plan'] },
  { label: 'Online görüşmeler', path: '/meetings', keywords: ['görüşme', 'online görüşme', 'veli görüşmesi'] },
  { label: 'Toplantılarım', path: '/toplantilarim', keywords: ['toplantı', 'toplantılarım'] },
  { label: 'Canlı Grup Dersi', path: '/class-live-lessons', keywords: ['canlı ders', 'grup ders', 'grup dersi'] },
  { label: 'Canlı Özel Ders', path: '/canli-ozel-ders', keywords: ['özel ders', 'canlı özel'] },
  { label: 'Akademik Merkez', path: '/academic-center', keywords: ['akademik merkez', 'etüt', 'akademik'] },
  { label: 'Konu Takibi', path: '/topic-tracking', keywords: ['konu takibi', 'konu'] },
  { label: 'Sınav Takibi', path: '/exam-tracking', keywords: ['sınav takibi', 'deneme takibi', 'denemeler'] },
  { label: 'Deneme Sınav Takvimi', path: '/deneme-takvimi', keywords: ['deneme takvimi', 'sınav takvimi'] },
  { label: 'Edesis sınav analizi', path: '/edesis-analiz', keywords: ['edesis', 'sınav analizi', 'optik'] },
  { label: 'Kitap Takibi', path: '/book-tracking', keywords: ['kitap', 'kitap takibi', 'okuma'] },
  { label: 'Yazılı Takip', path: '/written-exam', keywords: ['yazılı', 'yazılı takip'] },
  { label: 'Yazılı Hazırlık', path: '/yazili-hazirlik', keywords: ['yazılı hazırlık'] },
  { label: 'Analiz Paneli', path: '/analytics', keywords: ['analiz', 'analiz paneli', 'grafik'] },
  { label: 'Koç İstatistikleri', path: '/coach-stats', keywords: ['istatistik', 'koç istatistikleri'] },
  { label: 'Yoklama raporu', path: '/attendance-report', keywords: ['yoklama', 'devamsızlık'] },
  { label: 'Veli Memnuniyet ve Takip', path: '/veli-memnuniyet', keywords: ['veli', 'memnuniyet'] },
  { label: 'Soru Havuzu', path: '/soru-havuzu', keywords: ['soru havuzu', 'havuz'] },
  { label: 'AI Koç', path: '/ai-coach', keywords: ['ai koç', 'yapay zeka'] },
  { label: 'WhatsApp merkezi', path: '/coach-whatsapp-settings', keywords: ['whatsapp', 'mesaj'] },
  { label: 'Bildirimler', path: '/notifications', keywords: ['bildirim', 'bildirimler'] },
  { label: 'Kullanım kılavuzu', path: '/coach-kilavuz', keywords: ['kılavuz', 'kullanım kılavuzu'] },
  { label: 'Yardım', path: '/yardim', keywords: ['yardım', 'destek'] }
];

/** Öğretmen paneli menü kataloğu — Sidebar MENU_TEACHER ile aynı gerçek rotalar. */
export const JUNIOR_VIP_TEACHER_NAV = [
  { label: 'Öğretmen Paneli', path: '/teacher-panel', keywords: ['panel', 'ana sayfa', 'öğretmen paneli'] },
  { label: 'Canlı Grup Dersi', path: '/class-live-lessons', keywords: ['canlı ders', 'grup ders', 'grup dersi', 'derslerim'] },
  { label: 'Canlı Özel Ders', path: '/canli-ozel-ders', keywords: ['özel ders', 'canlı özel'] },
  { label: 'Bugünkü Randevular', path: '/teacher-solution-appointments', keywords: ['randevu', 'randevular', 'soru çözüm'] },
  { label: 'Toplantılarım', path: '/toplantilarim', keywords: ['toplantı', 'toplantılarım'] },
  { label: 'Müsaitlik takvimim', path: '/musaitlik-takvimim', keywords: ['müsaitlik', 'takvim'] },
  { label: 'Profilimi düzenle', path: '/profilimi-duzenle', keywords: ['profil', 'vitrin'] },
  { label: 'Yoklama raporu', path: '/attendance-report', keywords: ['yoklama', 'devamsızlık'] },
  { label: 'Akademik Merkez', path: '/academic-center', keywords: ['akademik merkez', 'etüt', 'akademik'] },
  { label: 'Soru Havuzu', path: '/soru-havuzu', keywords: ['soru havuzu', 'havuz'] },
  { label: 'Ödevlerim ve Animasyonlarım', path: '/edu-panel', keywords: ['ödev', 'animasyon'] },
  { label: 'Yazılı Hazırlık', path: '/yazili-hazirlik', keywords: ['yazılı hazırlık', 'yazılı'] },
  { label: 'Video Çözüm Merkezi', path: '/video-cozum-merkezi', keywords: ['video çözüm', 'video'] },
  { label: 'Edesis sınav analizi', path: '/edesis-analiz', keywords: ['edesis', 'sınav analizi'] },
  { label: 'Deneme Sınav Takvimi', path: '/deneme-takvimi', keywords: ['deneme takvimi', 'sınav takvimi'] },
  { label: 'Bildirimler', path: '/notifications', keywords: ['bildirim', 'bildirimler'] },
  { label: 'WhatsApp merkezi', path: '/coach-whatsapp-settings', keywords: ['whatsapp', 'mesaj'] },
  { label: 'Hesap ayarları', path: '/settings', keywords: ['ayarlar', 'hesap ayarları'] },
  { label: 'Yardım', path: '/yardim', keywords: ['yardım', 'destek'] }
];

export function juniorVipNavForPanel(panel) {
  if (panel === 'coach') return JUNIOR_VIP_COACH_NAV;
  if (panel === 'teacher') return JUNIOR_VIP_TEACHER_NAV;
  return JUNIOR_VIP_STUDENT_NAV;
}

/** Yalnızca paneldeki katalog rotalarına izin ver (uydurma / yetkisiz rota engeli). */
export function navPathAllowed(nav, path) {
  const p = String(path || '').trim();
  if (!p.startsWith('/')) return false;
  const pathname = p.split('?')[0].split('#')[0];
  return (nav || []).some((n) => String(n.path).split('?')[0] === pathname);
}
