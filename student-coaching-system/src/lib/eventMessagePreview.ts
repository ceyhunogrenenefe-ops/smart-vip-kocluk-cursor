export type EventPreviewInput = {
  title: string;
  event_date?: string | null;
  event_time?: string | null;
  meeting_link?: string | null;
  location?: string | null;
  description?: string | null;
  template_vars?: Record<string, string> | null;
};

function formatTrDate(isoDate?: string | null): string {
  if (!isoDate) return 'Belirtilmedi';
  const s = String(isoDate).slice(0, 10);
  const [y, m, d] = s.split('-');
  if (!y || !m || !d) return s;
  return `${d}.${m}.${y}`;
}

function formatTimeHm(t?: string | null): string {
  if (!t) return 'Belirtilmedi';
  return String(t).slice(0, 5);
}

export function buildEventPreviewVars(
  event: EventPreviewInput,
  displayName: string
): Record<string, string> {
  const ad = String(displayName || 'Katılımcı').trim();
  const etkinlik = String(event.title || '').trim() || 'Etkinlik';
  const tarih = formatTrDate(event.event_date);
  const saat = formatTimeHm(event.event_time);
  const link = String(event.meeting_link || '').trim() || 'https://…';
  const konum = String(event.location || '').trim() || 'Belirtilmedi';
  const aciklama = String(event.description || '').trim();

  const base: Record<string, string> = {
    ad,
    isim: ad,
    name: ad,
    ogrenci: ad,
    ogrenci_adi: ad,
    veli: ad,
    student_name: ad,
    etkinlik,
    etkinlik_adi: etkinlik,
    baslik: etkinlik,
    title: etkinlik,
    tarih,
    date: tarih,
    lesson_date: tarih,
    saat,
    time: saat,
    lesson_time: saat,
    link,
    baglanti: link,
    meeting_link: link,
    konum,
    location: konum,
    aciklama,
    description: aciklama
  };

  const extras = event.template_vars || {};
  for (const [key, raw] of Object.entries(extras)) {
    const v = String(raw ?? '').trim();
    if (v) base[key] = v;
  }

  return base;
}

export function renderTemplatePreview(content: string, vars: Record<string, string>): string {
  let out = String(content || '');
  for (const [key, value] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi'), value);
  }
  return out;
}
