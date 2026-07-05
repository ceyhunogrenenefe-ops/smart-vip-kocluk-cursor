/** Koç paneli kullanım kılavuzu — zengin statik içerik (Türkçe) */

export type GuideVisualKind =
  | 'dashboard'
  | 'students'
  | 'planner'
  | 'academic'
  | 'lessons'
  | 'whatsapp'
  | 'ai'
  | 'questions'
  | 'veli'
  | 'notify'
  | 'routine';

export type GuideStep = {
  title: string;
  detail: string;
  /** Menü yolu veya ekran konumu */
  where?: string;
};

export type CoachGuideSection = {
  id: string;
  category: 'baslangic' | 'ogrenci' | 'akademik' | 'ders' | 'iletisim' | 'kurum';
  categoryLabel: string;
  title: string;
  summary: string;
  /** Lucide icon adı — CoachGuideVisuals.GUIDE_ICON_MAP */
  icon: string;
  accent: 'violet' | 'blue' | 'emerald' | 'amber' | 'rose' | 'indigo' | 'sky';
  visual: GuideVisualKind;
  visualCaption: string;
  steps: GuideStep[];
  tips?: string[];
  linkPath?: string;
  linkLabel?: string;
  relatedLinks?: { path: string; label: string }[];
};

export type GuideMenuGroup = {
  id: string;
  title: string;
  icon: string;
  gradient: string;
  items: string[];
  note?: string;
};

export type GuideWorkflowBlock = {
  id: string;
  timeLabel: string;
  title: string;
  icon: string;
  gradient: string;
  tasks: string[];
};

export const COACH_GUIDE_CATEGORIES: { id: CoachGuideSection['category']; label: string }[] = [
  { id: 'baslangic', label: 'Başlangıç' },
  { id: 'ogrenci', label: 'Öğrenci & plan' },
  { id: 'akademik', label: 'Akademik takip' },
  { id: 'ders', label: 'Ders & görüşme' },
  { id: 'iletisim', label: 'İletişim & AI' },
  { id: 'kurum', label: 'Kurum süreçleri' }
];

export const COACH_GUIDE_INTRO = {
  title: 'Koç Paneli Kullanım Kılavuzu',
  subtitle:
    'Panelin tüm modüllerini ekran ekran tanıyan, günlük iş akışınızı netleştiren görsel rehber. İlk kez kullanan koçlar için “İlk 7 gün” planı da dahildir.',
  stats: [
    { label: 'Modül', value: '11+' },
    { label: 'Günlük rutin', value: '3 adım' },
    { label: 'Menü grubu', value: '6 alan' }
  ]
};

/** Sol menü — koçların gördüğü gruplar */
export const COACH_MENU_GROUPS: GuideMenuGroup[] = [
  {
    id: 'panel',
    title: 'Panel',
    icon: 'LayoutDashboard',
    gradient: 'from-violet-600 to-indigo-600',
    items: ['Koç Paneli', 'Kullanım kılavuzu'],
    note: 'Güne buradan başlayın; özet istatistikler ve riskli öğrenciler burada.'
  },
  {
    id: 'lessons',
    title: 'Ders & Görüşmeler',
    icon: 'Video',
    gradient: 'from-blue-600 to-cyan-600',
    items: ['Canlı Grup Dersi', 'Canlı özel dersler', 'Online görüşmeler', 'Ödevler & animasyonlar', 'AI Ders Ajanları']
  },
  {
    id: 'team',
    title: 'Ekip',
    icon: 'Users',
    gradient: 'from-emerald-600 to-teal-600',
    items: ['Öğrenciler', 'Öğretmenler']
  },
  {
    id: 'academic',
    title: 'Akademik Takip',
    icon: 'Sparkles',
    gradient: 'from-amber-500 to-orange-500',
    items: [
      'Haftalık plan',
      'Akademik Merkez',
      'Kitap / Sınav / Konu / Yazılı',
      'Analiz Paneli',
      'Yoklama raporu'
    ]
  },
  {
    id: 'whatsapp',
    title: 'WhatsApp',
    icon: 'MessageCircle',
    gradient: 'from-green-600 to-emerald-600',
    items: ['WhatsApp merkezi']
  },
  {
    id: 'org',
    title: 'Kurum',
    icon: 'FileText',
    gradient: 'from-rose-600 to-pink-600',
    items: ['Veli onayı & e-imza', 'Bildirimler', 'Etkinlikler', 'AI KOÇ', 'Soru Havuzu / Analitik']
  }
];

export const COACH_ONBOARDING_DAYS = [
  { day: 1, title: 'Panele alış', action: 'Koç panelini açın, öğrenci sayınızı ve riskli listeyi inceleyin.' },
  { day: 2, title: 'Öğrenci kontrolü', action: 'Öğrenciler sayfasında eksik veli telefonu / sınıf bilgisini tamamlayın.' },
  { day: 3, title: 'Haftalık plan', action: 'Her öğrenci için bu haftanın hedeflerini haftalık plana girin.' },
  { day: 4, title: 'WhatsApp', action: 'Merkezde bağlantıyı doğrulayın; plan hatırlatma şablonunu test edin.' },
  { day: 5, title: 'Akademik merkez', action: 'Kitap, deneme ve konu kartlarını birer öğrencide doldurun.' },
  { day: 6, title: 'Ders / görüşme', action: 'Bir canlı ders veya veli görüşmesi planlayın; linki paylaşın.' },
  { day: 7, title: 'Veli & rapor', action: 'Veli onayı bekleyenleri listeleyin; günlük rapor alışkanlığını oturtun.' }
];

export const COACH_DAILY_WORKFLOW: GuideWorkflowBlock[] = [
  {
    id: 'morning',
    timeLabel: 'Sabah · 09:00',
    title: 'Durum tespiti',
    icon: 'LayoutDashboard',
    gradient: 'from-violet-600 to-indigo-600',
    tasks: [
      'Koç panelinde riskli öğrencileri ve dünkü soru/okuma verilerini kontrol edin.',
      'Bugünkü canlı ders ve görüşme takvimine bakın.',
      'Günlük rapor girmeyen öğrencileri not alın.'
    ]
  },
  {
    id: 'midday',
    timeLabel: 'Öğlen · 13:00',
    title: 'Müdahale & iletişim',
    icon: 'MessageCircle',
    gradient: 'from-green-600 to-emerald-600',
    tasks: [
      'Haftalık planda eksik kalan hedefler için hatırlatma gönderin.',
      'Soru havuzunda bekleyen soruları önceliklendirin.',
      'Veli onayı / taksit bekleyen kayıtları kontrol edin.'
    ]
  },
  {
    id: 'evening',
    timeLabel: 'Akşam · 20:00',
    title: 'Kapanış & plan',
    icon: 'Target',
    gradient: 'from-amber-500 to-orange-500',
    tasks: [
      'Gün sonu verilerini analiz panelinde özetleyin.',
      'Yarınki ders ve grup oturumlarını onaylayın.',
      'Ertesi gün mesajı için WhatsApp şablonunu hazırlayın.'
    ]
  }
];

export const COACH_GUIDE_SECTIONS: CoachGuideSection[] = [
  {
    id: 'panel',
    category: 'baslangic',
    categoryLabel: 'Başlangıç',
    title: 'Koç Paneli — Ana ekran',
    summary:
      'Tüm koçluk gününüzün nabzı burada atar. Atanan öğrenci sayısı, soru çözüm oranı, okuma dakikaları, yazılı ortalamaları ve “riskli öğrenci” uyarıları tek ekranda toplanır.',
    icon: 'LayoutDashboard',
    accent: 'violet',
    visual: 'dashboard',
    visualCaption: 'Mor üst kart: hoş geldin alanı, öğrenci sayısı ve hızlı eylem butonları.',
    steps: [
      {
        title: 'Hoş geldin kartını okuyun',
        where: 'Sol menü → Koç Paneli',
        detail:
          'Üstteki mor bölümde toplam öğrenci sayınız görünür. “Öğrenci ekle”, “Kullanım kılavuzu” ve “WhatsApp merkezi” kısayolları buradan açılır.'
      },
      {
        title: 'Özet istatistik kartları',
        where: 'Panel ortası — 4’lü kart grid',
        detail:
          'Toplam öğrenci, genel başarı oranı, hedef gerçekleşme ve okuma dakikalarını karşılaştırın. Haftalık düşüş varsa ilgili öğrenciye odaklanın.'
      },
      {
        title: 'Riskli öğrenciler listesi',
        where: 'Panel alt bölüm — kırmızı / sarı uyarılar',
        detail:
          'Başarı oranı %70’in altındaki öğrenciler otomatik listelenir. Önce bu listeyi haftalık plan ve WhatsApp hatırlatması ile eşleştirin.'
      },
      {
        title: 'Günlük rapor takibi',
        where: 'Panel — Günlük Rapor bölümü',
        detail:
          'Öğrencilerin günlük çalışma raporu girişlerini gün gün görün. Giriş yapmayanları aynı gün mesajla uyarın.'
      }
    ],
    tips: ['Panele her sabah 2–3 dakika ayırmak, haftalık müdahale ihtiyacını erken gösterir.'],
    linkPath: '/coach-dashboard',
    linkLabel: 'Koç panelini aç',
    relatedLinks: [{ path: '/analytics', label: 'Analiz Paneli' }]
  },
  {
    id: 'students',
    category: 'ogrenci',
    categoryLabel: 'Öğrenci & plan',
    title: 'Öğrenci yönetimi',
    summary:
      'Size atanmış öğrencileri listeler, yeni kayıt eklemenizi sağlar. Veli telefonu, sınıf seviyesi ve koç eşleşmesi doğru olmazsa WhatsApp ve raporlar çalışmaz.',
    icon: 'Users',
    accent: 'emerald',
    visual: 'students',
    visualCaption: 'Öğrenci tablosu: ad, sınıf, veli iletişimi ve durum sütunları.',
    steps: [
      {
        title: 'Yeni öğrenci ekleyin',
        where: 'Ekip → Öğrenciler → Öğrenci Ekle',
        detail:
          'Ad, soyad, sınıf, veli telefonu ve e-posta alanlarını eksiksiz doldurun. Kayıt otomatik olarak kurumunuza ve size bağlanır.'
      },
      {
        title: 'Listeyi filtreleyin',
        where: 'Öğrenciler — arama ve sınıf filtresi',
        detail:
          'Sınıf veya isimle arama yapın. Mezun / 12. sınıf gibi gruplara toplu mesaj göndermeden önce filtreyi kullanın.'
      },
      {
        title: 'Öğrenci detayına geçin',
        where: 'Satıra tıklayın veya detay butonu',
        detail:
          'Profilden haftalık plan, kitap takibi ve analiz sayfalarına kısayol alın. Koç olarak yalnızca size atanmış öğrenciler görünür.'
      },
      {
        title: 'Öğretmen listesini kontrol edin',
        where: 'Ekip → Öğretmenler',
        detail:
          'Canlı ders veya soru havuzu ataması için kurumunuzdaki öğretmenleri görün; gerekirse yönetici ile koordinasyon sağlayın.'
      }
    ],
    tips: [
      'Veli telefonu +90 formatında ve WhatsApp’a kayıtlı olmalı.',
      'Öğrenci listesi boşsa yönetici koç atamanızı kontrol etmelidir.'
    ],
    linkPath: '/students',
    linkLabel: 'Öğrencilere git',
    relatedLinks: [{ path: '/teachers', label: 'Öğretmenler' }]
  },
  {
    id: 'weekly',
    category: 'ogrenci',
    categoryLabel: 'Öğrenci & plan',
    title: 'Haftalık plan & hedef takibi',
    summary:
      'Her öğrencinin haftalık soru hedefi, ders dağılımı ve okuma planını buradan kurarsınız. Öğrenci uygulamasından girilen veriler anında yansır.',
    icon: 'Calendar',
    accent: 'blue',
    visual: 'planner',
    visualCaption: 'Haftalık takvim: gün seçimi ve ders bazlı görev kartları.',
    steps: [
      {
        title: 'Öğrenci ve hafta seçin',
        where: 'Akademik Takip → Haftalık plan',
        detail:
          'Üstten öğrenciyi seçin, takvimden ilgili haftaya gidin. Pazartesi–Pazar arası her gün için ayrı plan yapılabilir.'
      },
      {
        title: 'Ders bazlı hedef girin',
        where: 'Plan kartları — Matematik, Fizik, vb.',
        detail:
          'Soru sayısı, konu tekrarı veya okuma dakikası hedeflerini yazın. Tamamlanan maddeler öğrenci tarafından işaretlenebilir.'
      },
      {
        title: 'Gerçekleşmeyi izleyin',
        where: 'Aynı ekran — tamamlanma yüzdesi',
        detail:
          'Hafta ortasında %50 altındaki planlar için WhatsApp hatırlatması gönderin. Analiz panelinde trend grafikleri de vardır.'
      },
      {
        title: 'Planı kopyalayın / güncelleyin',
        where: 'Haftalık plan — hafta geçişi',
        detail:
          'Önceki haftanın planını referans alarak yeni haftayı hızlı oluşturun; tekrarlayan rutinler için zaman kazanın.'
      }
    ],
    linkPath: '/weekly-planner',
    linkLabel: 'Haftalık plana git',
    relatedLinks: [{ path: '/analytics', label: 'Analiz Paneli' }]
  },
  {
    id: 'academic',
    category: 'akademik',
    categoryLabel: 'Akademik takip',
    title: 'Akademik Merkez & takip modülleri',
    summary:
      'Kitap ilerlemesi, deneme netleri, konu kazanımları, yazılı notları ve yoklama — hepsi öğrenci bazlı modüllerde. Akademik Merkez hepsine tek kapıdan gider.',
    icon: 'Sparkles',
    accent: 'amber',
    visual: 'academic',
    visualCaption: 'Akademik özet kartları: kitap %, deneme neti, konu sayacı, yazılı ortalaması.',
    steps: [
      {
        title: 'Akademik Merkez’den başlayın',
        where: 'Akademik Takip → Akademik Merkez',
        detail:
          'Öğrenci seçtikten sonra kitap, deneme, konu ve yazılı modüllerine tek tıkla geçin. Yeni koçlar için en pratik giriş noktasıdır.'
      },
      {
        title: 'Kitap takibi',
        where: 'Kitap Takibi',
        detail:
          'Kaynak kitap adı, okunan sayfa ve test sonuçlarını girin. Öğrencinin kaynak bitirme hızını grafiklerle izleyin.'
      },
      {
        title: 'Deneme & sınav takibi',
        where: 'Sınav Takibi (Denemelerim)',
        detail:
          'TYT/AYT deneme sonuçlarını net bazında kaydedin. Edesis entegrasyonu varsa sonuçlar otomatik de gelebilir.'
      },
      {
        title: 'Konu & yazılı',
        where: 'Konu Takibi · Yazılı Takip',
        detail:
          'Müfredat kazanımlarını işaretleyin; okul yazılı not ortalamalarını dönem bazında tutun.'
      }
    ],
    linkPath: '/academic-center',
    linkLabel: 'Akademik Merkeze git',
    relatedLinks: [
      { path: '/book-tracking', label: 'Kitap Takibi' },
      { path: '/exam-tracking', label: 'Sınav Takibi' },
      { path: '/topic-tracking', label: 'Konu Takibi' }
    ]
  },
  {
    id: 'lessons',
    category: 'ders',
    categoryLabel: 'Ders & görüşme',
    title: 'Canlı dersler & online görüşmeler',
    summary:
      'Birebir canlı ders, sınıf bazlı grup dersi ve Google Meet görüşmelerini planlayın. Katılım ve yoklama raporları otomatik tutulur.',
    icon: 'Video',
    accent: 'indigo',
    visual: 'lessons',
    visualCaption: 'Bugünkü oturumlar: canlı ders, grup dersi ve veli görüşmesi satırları.',
    steps: [
      {
        title: 'Canlı özel ders oluşturun',
        where: 'Ders & Görüşmeler → Canlı özel dersler',
        detail:
          'Tarih, saat ve öğrenci seçin. Sistem katılım linkini üretir; öğrenci panelinde “Canlı derslerim” altında görünür.'
      },
      {
        title: 'Grup dersi planlayın',
        where: 'Canlı Grup Dersi',
        detail:
          'Sınıf veya grup seçerek toplu oturum açın. Yoklama raporundan kimlerin katıldığını sonradan kontrol edin.'
      },
      {
        title: 'Online görüşme (Meet)',
        where: 'Online görüşmeler',
        detail:
          'Veli veya öğrenci görüşmesi için randevu oluşturun. Meet linki otomatik gelir; takvime ekleyebilirsiniz.'
      },
      {
        title: 'Ödev & animasyon paylaşın',
        where: 'Ödevlerim ve Animasyonlarım',
        detail:
          'Ders sonrası ödev ve interaktif içerik atamak için edu panelini kullanın.'
      }
    ],
    linkPath: '/meetings',
    linkLabel: 'Görüşmelere git',
    relatedLinks: [
      { path: '/live-lessons', label: 'Canlı özel dersler' },
      { path: '/class-live-lessons', label: 'Canlı Grup Dersi' },
      { path: '/attendance-report', label: 'Yoklama raporu' }
    ]
  },
  {
    id: 'whatsapp',
    category: 'iletisim',
    categoryLabel: 'İletişim & AI',
    title: 'WhatsApp merkezi',
    summary:
      'Toplu ve bireysel mesaj, otomatik hatırlatmalar ve şablonlar. Plan, ders ve veli süreçlerinde en çok kullanılan iletişim kanalıdır.',
    icon: 'MessageCircle',
    accent: 'emerald',
    visual: 'whatsapp',
    visualCaption: 'Örnek mesaj balonları: koç hatırlatması ve öğrenci yanıtı.',
    steps: [
      {
        title: 'Bağlantı durumunu kontrol edin',
        where: 'WhatsApp → WhatsApp merkezi — üst durum çubuğu',
        detail:
          'Yeşil / bağlı görünmüyorsa mesaj gitmez. Yöneticiden gateway ve kurum kotasını doğrulatın.'
      },
      {
        title: 'Şablon seçin veya yazın',
        where: 'Merkez — Mesaj şablonları sekmesi',
        detail:
          'Haftalık plan, deneme hatırlatması, veli bilgilendirme gibi hazır şablonları kullanın; kişiselleştirilmiş metin ekleyin.'
      },
      {
        title: 'Hedef kitleyi filtreleyin',
        where: 'Alıcı seçimi — sınıf / öğrenci listesi',
        detail:
          'Toplu gönderimden önce alıcı sayısını kontrol edin. Yanlış gruba gönderimi önlemek için test mesajı atın.'
      },
      {
        title: 'Gönderim geçmişini izleyin',
        where: 'Merkez — gönderim logları',
        detail:
          'İletilmeyen numaraları not alın; veli telefonu güncellemesi gerekebilir.'
      }
    ],
    tips: ['Mesajları yoğun saatlerde (08:00–21:00) gönderin; gece otomatik hatırlatmalar veli şikayetine yol açabilir.'],
    linkPath: '/coach-whatsapp-settings',
    linkLabel: 'WhatsApp merkezini aç'
  },
  {
    id: 'ai',
    category: 'iletisim',
    categoryLabel: 'İletişim & AI',
    title: 'AI Koç & ders ajanları',
    summary:
      'Öğrenci verisine dayalı yapay zeka önerileri ve ders bazlı etkileşimli ajanlar. Kurumunuzda API anahtarı tanımlı olmalıdır.',
    icon: 'Brain',
    accent: 'violet',
    visual: 'ai',
    visualCaption: 'AI öneri kartı ve atanmış ders ajanları etiketleri.',
    steps: [
      {
        title: 'AI Koç ile analiz alın',
        where: 'Kurum → AI KOÇ',
        detail:
          'Öğrenci seçin; son haftaların soru, deneme ve plan verisine göre metin önerisi üretilir. Sonucu haftalık görüşmede kullanın.'
      },
      {
        title: 'Ders ajanı atayın',
        where: 'Ders & Görüşmeler → AI Ders Ajanları',
        detail:
          'Matematik, paragraf vb. ajanları sınıf seviyesine göre seçin. Öğrenci panelinde “AI Koçlarım” altında görünür.'
      },
      {
        title: 'API uyarısı alırsanız',
        where: 'AI KOÇ — üst bilgi bandı',
        detail:
          '“OPENAI_API_KEY tanımlanmalı” uyarısı kurum yöneticisine iletilmelidir; koç tarafında çözülmez.'
      }
    ],
    linkPath: '/ai-coach',
    linkLabel: 'AI Koça git',
    relatedLinks: [{ path: '/ai-agents-admin', label: 'AI Ders Ajanları' }]
  },
  {
    id: 'questions',
    category: 'iletisim',
    categoryLabel: 'İletişim & AI',
    title: 'Soru havuzu & analitik',
    summary:
      'Öğrencilerin sorduğu soruları takip edin; çözüm süresi ve konu dağılımını koç bazında analiz edin.',
    icon: 'CircleHelp',
    accent: 'sky',
    visual: 'questions',
    visualCaption: 'Bekleyen soru sayısı, günlük çözüm ve ortalama yanıt süresi.',
    steps: [
      {
        title: 'Bekleyen soruları görün',
        where: 'Kurum → Soru Havuzu',
        detail:
          'Fotoğraflı sorular öğretmen havuzuna düşer; koç olarak genel durumu ve gecikmeleri izlersiniz.'
      },
      {
        title: 'Analitik özeti inceleyin',
        where: 'Soru Analitiği',
        detail:
          'Hangi derslerde yoğunluk var, ortalama yanıt süresi ne — haftalık koç toplantısında raporlayın.'
      }
    ],
    linkPath: '/soru-analitik',
    linkLabel: 'Soru analitiğine git',
    relatedLinks: [{ path: '/soru-havuzu', label: 'Soru Havuzu' }]
  },
  {
    id: 'veli',
    category: 'kurum',
    categoryLabel: 'Kurum süreçleri',
    title: 'Veli onayı, e-imza & taksit',
    summary:
      'Kayıt sözleşmesi oluşturma, veli imza linki paylaşma ve taksit vadelerini izleme. Ücret girildikten sonra aylık taksit kartları otomatik oluşur.',
    icon: 'FileText',
    accent: 'rose',
    visual: 'veli',
    visualCaption: 'Süreç: Taslak → Ücret → Veli imza → Aktif kayıt.',
    steps: [
      {
        title: 'Sözleşme oluşturun',
        where: 'Kurum → Veli onayı & e-imza',
        detail:
          'Öğrenci ve program bilgilerini girin; taslak kayıt oluşur. Yönetici ücret onayı gerekebilir.'
      },
      {
        title: 'Veli imza linkini paylaşın',
        where: 'Sözleşme satırı — Link kopyala',
        detail:
          'Linki WhatsApp veya SMS ile veliye gönderin. Veli mobilde imzalar; durum “İmzalandı” olunca kayıt aktifleşir.'
      },
      {
        title: 'Taksit ödemelerini işaretleyin',
        where: 'Veli onayı — taksit kartları',
        detail:
          'Her taksitte vade tarihi ve “Ödendi” kutusu vardır. Vadesi geçenler kırmızı uyarı ile listelenir.'
      }
    ],
    tips: ['Link tek seferlik ve kişiye özeldir; başka veliyle paylaşmayın.'],
    linkPath: '/veli-onay',
    linkLabel: 'Veli onayına git'
  },
  {
    id: 'notify',
    category: 'kurum',
    categoryLabel: 'Kurum süreçleri',
    title: 'Bildirimler & etkinlikler',
    summary:
      'Uygulama içi duyurular ve kurum takvim etkinlikleri. Deneme günü, veli toplantısı veya kamp duyuruları için kullanın.',
    icon: 'Bell',
    accent: 'indigo',
    visual: 'notify',
    visualCaption: 'Bildirim kartı ve takvim etkinliği örneği.',
    steps: [
      {
        title: 'Bildirim oluşturun',
        where: 'Kurum → Bildirimler → Yeni',
        detail:
          'Başlık ve mesaj yazın; hedef olarak öğrencileri seçin. Anlık push / uygulama içi görünür.'
      },
      {
        title: 'Etkinlik ekleyin',
        where: 'Etkinlikler — takvim',
        detail:
          'Tarih, saat ve açıklama girin. Öğrenci panellerinde takvimde görünür.'
      }
    ],
    linkPath: '/notifications',
    linkLabel: 'Bildirimlere git',
    relatedLinks: [{ path: '/events', label: 'Etkinlikler' }]
  },
  {
    id: 'daily',
    category: 'baslangic',
    categoryLabel: 'Başlangıç',
    title: 'Günlük koç rutini (özet)',
    summary:
      'Verimli bir gün için sabah–öğlen–akşam üçlü kontrol listesi. Aşağıdaki zaman çizelgesini alışkanlık haline getirin.',
    icon: 'Target',
    accent: 'amber',
    visual: 'routine',
    visualCaption: 'Sabah panel → öğlen mesaj → akşam rapor akışı.',
    steps: [
      {
        title: 'Sabah: Panel taraması',
        where: 'Koç Paneli',
        detail: 'Riskli öğrenciler + bugünkü ders/görüşme + dünkü veri girişi eksikleri.'
      },
      {
        title: 'Öğlen: İletişim',
        where: 'WhatsApp merkezi · Soru havuzu',
        detail: 'Plan hatırlatması, veli onayı bekleyenler, açık sorular.'
      },
      {
        title: 'Akşam: Kapanış',
        where: 'Analiz · Etkinlikler',
        detail: 'Gün özetini not alın, yarını planlayın, haftalık hedefleri güncelleyin.'
      }
    ]
  }
];

export const COACH_GUIDE_FAQ: { q: string; a: string; icon?: string }[] = [
  {
    q: 'Öğrenci listem boş — neden?',
    a: 'Hesabınıza koç kaydı atanmamış olabilir veya öğrencilerin “koç” alanı sizinle eşleşmiyordur. Kurum yöneticinizden koç–öğrenci eşleşmesini isteyin; siz yalnızca size atananları görürsünüz.',
    icon: 'Users'
  },
  {
    q: 'WhatsApp mesajı gitmiyor.',
    a: 'WhatsApp merkezinde bağlantı durumunu kontrol edin. Kırmızı / bağlı değilse yönetici gateway URL ve mesaj kotasını doğrular. Veli numarasının +90 ve WhatsApp kayıtlı olduğundan emin olun.',
    icon: 'MessageCircle'
  },
  {
    q: 'Veli imza linki açılmıyor.',
    a: 'Linkin tamamını kopyalayın (kesik URL çalışmaz). Süresi dolmuş sözleşmelerde veli onayı sayfasından yeni link üretin. Veli farklı tarayıcıda denesin.',
    icon: 'FileText'
  },
  {
    q: 'AI Koç çalışmıyor.',
    a: 'Bu özellik kurum sunucusunda OPENAI_API_KEY gerektirir. Koç olarak siz anahtar tanımlayamazsınız; yöneticiye bildirin.',
    icon: 'Brain'
  },
  {
    q: 'Haftalık plan öğrencide görünmüyor.',
    a: 'Doğru öğrenciyi seçtiğinizden ve doğru hafta tarih aralığında olduğunuzdan emin olun. Öğrenci farklı kurumda veya size atanmamışsa plan yansımaz.',
    icon: 'Calendar'
  }
];
