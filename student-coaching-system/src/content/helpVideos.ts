/** Panel yardım videoları — öğrenci / öğretmen-koç */

export type HelpVideo = {
  id: string;
  title: string;
  description: string;
  viewUrl: string;
  embedUrl?: string;
};

export const STUDENT_HELP_VIDEOS: HelpVideo[] = [
  {
    id: 'deneme-sinavi-giris',
    title: 'Deneme sınavına nasıl girilir?',
    description:
      'Akademik Merkez üzerinden deneme sınavı sınıfına nasıl katılacağınızı adım adım gösteren kısa video.',
    viewUrl: 'https://youtu.be/He-7YtJ5gr0',
    embedUrl: 'https://www.youtube.com/embed/He-7YtJ5gr0'
  },
  {
    id: 'haftalik-rapor',
    title: 'Haftalık rapor kısmı nasıl doldurulur?',
    description:
      'Haftalık rapor alanlarını doğru ve eksiksiz doldurmanız için adım adım anlatan kısa video.',
    viewUrl: 'https://youtu.be/YYOqCZqpH7w',
    embedUrl: 'https://www.youtube.com/embed/YYOqCZqpH7w'
  },
  {
    id: 'canli-ders-katilim',
    title: 'Canlı derslere nasıl katılabilirim?',
    description:
      'Canlı derslere panel üzerinden nasıl katılacağınızı adım adım gösteren kısa video.',
    viewUrl: 'https://youtu.be/SoOumaTj3Fo',
    embedUrl: 'https://www.youtube.com/embed/SoOumaTj3Fo'
  }
];

/** Öğretmen & koç — Ödevlerim ve Animasyonlarım */
export const TEACHER_COACH_HELP_VIDEOS: HelpVideo[] = [
  {
    id: 'odev-ve-animasyon',
    title: 'Ödev ve animasyon nasıl eklenir?',
    description:
      'Ödevlerim ve Animasyonlarım ekranında konu oluşturma, ödev verme, HTML / havuz / NotebookLM ile animasyon ekleme adımlarını gösteren kısa video.',
    viewUrl: 'https://www.youtube.com/watch?v=N-4LfPn01Kk',
    embedUrl: 'https://www.youtube.com/embed/N-4LfPn01Kk'
  }
];

/** @deprecated Prefer HelpVideo — geriye dönük alias */
export type StudentHelpVideo = HelpVideo;
