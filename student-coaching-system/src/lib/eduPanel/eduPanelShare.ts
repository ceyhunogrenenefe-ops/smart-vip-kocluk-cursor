import { formatEduHomeworkLabel } from './eduHomeworkForm';
import { displayInstitutionName } from '../appBrand';

/** Veli / öğrenci WhatsApp grubuna yapıştırılacak haftalık konu + ödev + animasyon mesajı */
export function buildEduTopicWhatsAppShareText(opts: {  title: string;
  subjectName: string;
  classNames: string[];
  homeworkTitles?: string[];
  /** Kitap + sayfa detaylı ödev satırları */
  homeworkDetails?: { book_name?: string | null; question_range?: string | null; title?: string }[];
  hasAnimation: boolean;
  dateRangeLabel?: string;
  panelUrl?: string;
  institutionName?: string;
}): string {
  const {
    title,
    subjectName,
    classNames,
    homeworkTitles = [],
    homeworkDetails = [],
    hasAnimation,
    dateRangeLabel,
    panelUrl,
    institutionName,
  } = opts;
  const url =
    panelUrl?.trim() ||
    (typeof window !== 'undefined'
      ? `${window.location.origin}/edu-derslerim`
      : '/edu-derslerim');
  const classes = classNames.filter(Boolean).join(', ');
  const hwLines =
    homeworkDetails.length > 0
      ? homeworkDetails.slice(0, 4).map((h) => `  · ${formatEduHomeworkLabel(h)}`)
      : homeworkTitles.slice(0, 3).map((t) => `  · ${t}`);
  const hwLine =
    hwLines.length > 0
      ? `📝 Ödev:\n${hwLines.join('\n')}`
      : '📝 Ödev panelde yayınlandığında buradan görünecek.';
  const animLine = hasAnimation
    ? '🎬 Bu haftanın konu animasyonu panelde hazır.'
    : '🎬 Animasyon yakında panelde olacak.';
  const dateLine = dateRangeLabel ? `📅 Bitiş tarihine kadar: ${dateRangeLabel}` : '';

  return (
    `Merhaba,\n\n` +
    `Bu haftanın konusu: *${title}* (${subjectName})` +
    (classes ? `\nSınıf: ${classes}` : '') +
    (dateLine ? `\n${dateLine}` : '') +
    `\n\n${animLine}\n${hwLine}\n\n` +
    `Panelden animasyon ve ödevinize ulaşın:\n${url}\n\n` +
    displayInstitutionName(institutionName)
  );
}export function whatsAppShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export async function copyEduShareText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}
