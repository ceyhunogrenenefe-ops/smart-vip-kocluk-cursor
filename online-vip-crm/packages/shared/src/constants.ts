/**
 * Default lead pipeline stages for Turkish education institutions.
 * Order is significant (index = display order).
 */
export const DEFAULT_PIPELINE_STAGES = [
  { key: 'new_request', name: 'Yeni Talep', color: '#1a3fad', isWon: false, isLost: false },
  { key: 'first_call', name: 'İlk Arama Yapılacak', color: '#2563eb', isWon: false, isLost: false },
  { key: 'called', name: 'Arandı', color: '#0ea5e9', isWon: false, isLost: false },
  { key: 'informed', name: 'Bilgi Verildi', color: '#06b6d4', isWon: false, isLost: false },
  { key: 'trial_planned', name: 'Deneme Dersi Planlandı', color: '#14b8a6', isWon: false, isLost: false },
  { key: 'trial_attended', name: 'Deneme Dersine Katıldı', color: '#10b981', isWon: false, isLost: false },
  { key: 'offer_sent', name: 'Teklif Gönderildi', color: '#84cc16', isWon: false, isLost: false },
  { key: 'parent_deciding', name: 'Veli Karar Aşamasında', color: '#eab308', isWon: false, isLost: false },
  { key: 'awaiting_payment', name: 'Ödeme Bekleniyor', color: '#f59e0b', isWon: false, isLost: false },
  { key: 'enrolled', name: 'Kayıt Oldu', color: '#22c55e', isWon: true, isLost: false },
  { key: 'call_later', name: 'Daha Sonra Aranacak', color: '#a855f7', isWon: false, isLost: false },
  { key: 'unreachable', name: 'Ulaşılamadı', color: '#78716c', isWon: false, isLost: true },
  { key: 'lost', name: 'Kaybedildi', color: '#e8232a', isWon: false, isLost: true },
] as const;

export type DefaultPipelineStageKey = (typeof DEFAULT_PIPELINE_STAGES)[number]['key'];

/** Brand CSS variable defaults for Online VIP Dershane. */
export const BRAND_CSS_VARIABLES = {
  '--brand-primary': '#e8232a',
  '--brand-secondary': '#1a3fad',
  '--brand-accent': '#e8232a',
  '--brand-background': '#ffffff',
  '--brand-text': '#0f172a',
} as const;

export const DEMO_PASSWORD = 'Demo123!@#';

export const DEMO_INSTITUTION_SLUG = 'online-vip-dershane';
