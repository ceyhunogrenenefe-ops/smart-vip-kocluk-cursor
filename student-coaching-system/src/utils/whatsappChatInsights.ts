// Türkçe: WhatsApp sohbet metninden yerel (anahtar kelime) analizi — tam otomasyon için WhatsApp Business API gerekir

export type ChatInsightResult = {
  homeworkLines: string[];
  meetingLines: string[];
  taskSuggestions: string[];
  summaryBullets: string[];
};

const HOMEWORK_RE =
  /ödev|ödevler|yapılacak|yapılması|teslim|bitir|çöz|sayfa|konu|test|soru|kitap|okuma|proje|sunum|rapor/i;
const MEETING_RE =
  /görüşme|görüş|toplantı|arayacağım|ararım|saat|yarın|bugün|ders|online|zoom|meet|veli|koçluk/i;

export function analyzeWhatsAppPaste(text: string, studentName?: string): ChatInsightResult {
  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  const homeworkLines: string[] = [];
  const meetingLines: string[] = [];

  for (const line of lines) {
    if (HOMEWORK_RE.test(line)) homeworkLines.push(line);
    else if (MEETING_RE.test(line)) meetingLines.push(line);
  }

  const taskSuggestions: string[] = [];
  if (homeworkLines.length) {
    taskSuggestions.push('Ödev teslim tarihlerini öğrenci takvimine işleyin.');
    taskSuggestions.push('Tamamlanmamış maddeler için haftalık takipte hedef soru/konu ekleyin.');
  }
  if (meetingLines.length) {
    taskSuggestions.push('Görüşme saatlerini veli ile teyit edip not düşün.');
  }

  const summaryBullets: string[] = [];
  const name = studentName?.trim();
  if (name) summaryBullets.push(`Konuşma bağlamı: ${name} ile ilgili sohbet özeti.`);
  summaryBullets.push(`Tespit edilen ödev / görev satırları: ${homeworkLines.length}`);
  summaryBullets.push(`Görüşme / planlama satırları: ${meetingLines.length}`);
  if (!homeworkLines.length && !meetingLines.length) {
    summaryBullets.push(
      'Anahtar kelime eşleşmesi bulunamadı; metni kısaltıp tekrar deneyebilir veya manuel not ekleyebilirsiniz.'
    );
  }

  return { homeworkLines, meetingLines, taskSuggestions, summaryBullets };
}

export function fillTemplate(
  template: string,
  vars: { ad?: string; sinif?: string; gorev?: string; tarih?: string; kurum?: string }
): string {
  let out = template;
  const map: Record<string, string> = {
    ad: vars.ad ?? '',
    sinif: vars.sinif ?? '',
    gorev: vars.gorev ?? '',
    tarih: vars.tarih ?? new Date().toLocaleDateString('tr-TR'),
    kurum: vars.kurum ?? ''
  };
  Object.entries(map).forEach(([k, v]) => {
    out = out.replace(new RegExp(`\\{${k}\\}`, 'gi'), v);
  });
  return out;
}
