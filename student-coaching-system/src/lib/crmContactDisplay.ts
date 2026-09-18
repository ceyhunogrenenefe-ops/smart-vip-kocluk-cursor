/** FAZ 1 — CRM’de kişi başlığı: ad → @kullanıcı → “Instagram kullanıcısı ·…1234” (teknik ID son çare) */

type ContactLike = {
  channel?: string | null;
  contact_name?: string | null;
  contact_username?: string | null;
  contact_identifier?: string | null;
  ad_source_data?: Record<string, unknown> | null;
};

export function isPlaceholderContactName(name?: string | null) {
  const s = String(name || '').trim();
  if (!s) return true;
  if (/^\d{6,}$/.test(s)) return true;
  return /^(instagram|facebook|whatsapp)\s+(lead|kullanıcısı)\b/i.test(s);
}

export function contactChannel(c: ContactLike): 'instagram' | 'facebook' | 'whatsapp' | string {
  const id = String(c.contact_identifier || '');
  if (id.startsWith('fb:') || c.ad_source_data?.source_platform === 'facebook') return 'facebook';
  return String(c.channel || '');
}

export function contactTitle(c: ContactLike): string {
  const name = String(c.contact_name || '').trim();
  if (name && !isPlaceholderContactName(name)) return name;
  const username = String(c.contact_username || '').trim().replace(/^@/, '');
  if (username) return `@${username}`;
  const ch = contactChannel(c);
  if (ch === 'whatsapp') return String(c.contact_identifier || name || 'WhatsApp');
  const tail = String(c.contact_identifier || '').replace(/\D/g, '').slice(-4);
  const label = ch === 'facebook' ? 'Facebook kullanıcısı' : 'Instagram kullanıcısı';
  return tail ? `${label} ·…${tail}` : label;
}

/** Başlığın altındaki satır: “@kullanıcı · Instagram” veya WhatsApp numarası */
export function contactSubtitle(c: ContactLike): string {
  const ch = contactChannel(c);
  const channelLabel = ch === 'instagram' ? 'Instagram' : ch === 'facebook' ? 'Facebook' : ch === 'whatsapp' ? 'WhatsApp' : ch;
  const username = String(c.contact_username || '').trim().replace(/^@/, '');
  const title = contactTitle(c);
  if (ch === 'whatsapp') {
    const phone = String(c.contact_identifier || '');
    return title === phone ? channelLabel : `${phone} · ${channelLabel}`;
  }
  if (username && title !== `@${username}`) return `@${username} · ${channelLabel}`;
  return channelLabel;
}

export function contactInitials(c: ContactLike): string {
  const t = contactTitle(c).replace(/^@/, '');
  const parts = t.split(/\s+/).filter((p) => /\p{L}/u.test(p));
  return (parts[0]?.[0] || '?').toLocaleUpperCase('tr-TR') + (parts[1]?.[0] || '').toLocaleUpperCase('tr-TR');
}
