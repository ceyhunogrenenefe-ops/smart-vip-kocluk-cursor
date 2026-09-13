/** Kommo Ayarlar → Widgetler’deki resmi mesajlaşma / lead / Google / telefon seti. */
export type CrmWidgetCategory = 'messaging' | 'lead' | 'google' | 'phone';
export type CrmWidgetAction =
  | 'whatsapp_cloud'
  | 'whatsapp_gateway'
  | 'facebook_login'
  | 'facebook_lead_ads'
  | 'google_calendar'
  | 'crm_pipeline'
  | 'meetings'
  | 'webhooks'
  | 'soon';

export type CrmWidgetDef = {
  id: string;
  name: string;
  blurb: string;
  category: CrmWidgetCategory;
  action: CrmWidgetAction;
  accent: string;
  mark: string;
};

export const CRM_WIDGET_CATEGORIES: { id: 'all' | 'installed' | CrmWidgetCategory; label: string }[] = [
  { id: 'all', label: 'Tümü' },
  { id: 'installed', label: 'Kurulu' },
  { id: 'messaging', label: 'Mesajlaşma' },
  { id: 'lead', label: 'Lead yakalama' },
  { id: 'google', label: 'Google' },
  { id: 'phone', label: 'Telefon & video' }
];

export const CRM_WIDGET_CATALOG: CrmWidgetDef[] = [
  {
    id: 'whatsapp_business',
    name: 'WhatsApp Business',
    blurb: 'Cloud API · 0850 303 40 14 · gelen DM inbox',
    category: 'messaging',
    action: 'whatsapp_cloud',
    accent: 'bg-emerald-600',
    mark: 'WA'
  },
  {
    id: 'whatsapp_lite',
    name: 'WhatsApp Lite',
    blurb: 'Telefon QR / gateway (Baileys) — Kommo WhatsApp Lite karşılığı',
    category: 'messaging',
    action: 'whatsapp_gateway',
    accent: 'bg-lime-600',
    mark: 'QR'
  },
  {
    id: 'instagram',
    name: 'Instagram',
    blurb: 'Direkt mesaj, yorum ve lead — Login for Business',
    category: 'messaging',
    action: 'facebook_login',
    accent: 'bg-gradient-to-br from-purple-500 to-pink-500',
    mark: 'IG'
  },
  {
    id: 'facebook',
    name: 'Facebook Messenger',
    blurb: 'Sayfa mesajları — Instagram ile aynı bağlama',
    category: 'messaging',
    action: 'facebook_login',
    accent: 'bg-blue-600',
    mark: 'FB'
  },
  {
    id: 'telegram',
    name: 'Telegram',
    blurb: 'Telegram bot ile lead ve sohbet',
    category: 'messaging',
    action: 'soon',
    accent: 'bg-sky-500',
    mark: 'TG'
  },
  {
    id: 'online_chat',
    name: 'Online sohbet',
    blurb: 'Site chat butonu — Kommo Website chat',
    category: 'messaging',
    action: 'soon',
    accent: 'bg-indigo-600',
    mark: 'CH'
  },
  {
    id: 'email',
    name: 'E-posta',
    blurb: 'Gelen kutusuna e-posta yazışması',
    category: 'messaging',
    action: 'soon',
    accent: 'bg-slate-700',
    mark: '@'
  },
  {
    id: 'gmail',
    name: 'Gmail',
    blurb: 'Gmail hesabını CRM yazışmasına bağla',
    category: 'google',
    action: 'soon',
    accent: 'bg-red-500',
    mark: 'Gm'
  },
  {
    id: 'sms',
    name: 'SMS (Twilio)',
    blurb: 'SMS lead ve bildirim',
    category: 'messaging',
    action: 'webhooks',
    accent: 'bg-rose-600',
    mark: 'SMS'
  },
  {
    id: 'viber',
    name: 'Viber',
    blurb: 'Viber mesajlaşma',
    category: 'messaging',
    action: 'soon',
    accent: 'bg-purple-700',
    mark: 'VB'
  },
  {
    id: 'wechat',
    name: 'WeChat',
    blurb: 'WeChat müşteri sohbeti',
    category: 'messaging',
    action: 'soon',
    accent: 'bg-green-600',
    mark: 'WC'
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    blurb: 'TikTok mesaj ve içerik etkileşimi',
    category: 'messaging',
    action: 'soon',
    accent: 'bg-zinc-900',
    mark: 'TT'
  },
  {
    id: 'facebook_lead_ads',
    name: 'Facebook Lead Ads',
    blurb: 'Reklam formu lead’leri inbox / pipeline',
    category: 'lead',
    action: 'facebook_lead_ads',
    accent: 'bg-blue-700',
    mark: 'LA'
  },
  {
    id: 'instagram_lead',
    name: 'Instagram Lead Ads',
    blurb: 'Instagram reklam formu ve DM reklamı',
    category: 'lead',
    action: 'facebook_lead_ads',
    accent: 'bg-fuchsia-600',
    mark: 'IL'
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    blurb: 'LinkedIn lead yakalama',
    category: 'lead',
    action: 'soon',
    accent: 'bg-sky-800',
    mark: 'in'
  },
  {
    id: 'website_form',
    name: 'Website formu',
    blurb: 'Kommo WEBSİTESİ FORM — siteden gelen kayıt',
    category: 'lead',
    action: 'crm_pipeline',
    accent: 'bg-emerald-800',
    mark: 'WF'
  },
  {
    id: 'typeform',
    name: 'Typeform',
    blurb: 'Typeform gönderimleri lead’e',
    category: 'lead',
    action: 'soon',
    accent: 'bg-black',
    mark: 'TF'
  },
  {
    id: 'jotform',
    name: 'Jotform',
    blurb: 'Jotform → CRM lead',
    category: 'lead',
    action: 'soon',
    accent: 'bg-orange-600',
    mark: 'JF'
  },
  {
    id: 'google_forms',
    name: 'Google Forms',
    blurb: 'Form yanıtlarını lead olarak al',
    category: 'lead',
    action: 'soon',
    accent: 'bg-violet-600',
    mark: 'GF'
  },
  {
    id: 'tiktok_ads',
    name: 'TikTok Ads',
    blurb: 'TikTok reklam lead senkronu',
    category: 'lead',
    action: 'soon',
    accent: 'bg-neutral-900',
    mark: 'TA'
  },
  {
    id: 'google_calendar',
    name: 'Google Takvim',
    blurb: 'Görüşme takvimi senkronu',
    category: 'google',
    action: 'google_calendar',
    accent: 'bg-blue-500',
    mark: 'GC'
  },
  {
    id: 'google_sheets',
    name: 'Google Sheets',
    blurb: 'Lead listesini tabloya yaz',
    category: 'google',
    action: 'soon',
    accent: 'bg-emerald-700',
    mark: 'GS'
  },
  {
    id: 'google_docs',
    name: 'Google Docs',
    blurb: 'Sözleşme / teklif şablonları',
    category: 'google',
    action: 'soon',
    accent: 'bg-blue-800',
    mark: 'GD'
  },
  {
    id: 'phone_calls',
    name: 'Telefon / Arama',
    blurb: 'Arama kaydı ve geri dönüş',
    category: 'phone',
    action: 'meetings',
    accent: 'bg-teal-700',
    mark: '☎'
  },
  {
    id: 'video_meet',
    name: 'Video görüşme',
    blurb: 'Online görüşme (Zoom / BBB)',
    category: 'phone',
    action: 'meetings',
    accent: 'bg-sky-700',
    mark: 'VD'
  },
  {
    id: 'slack',
    name: 'Slack',
    blurb: 'Ekip bildirimi',
    category: 'phone',
    action: 'soon',
    accent: 'bg-purple-600',
    mark: 'SL'
  }
];
