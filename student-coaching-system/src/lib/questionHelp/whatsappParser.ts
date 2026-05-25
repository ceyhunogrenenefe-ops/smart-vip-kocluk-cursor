import { QUESTION_GRADE_OPTIONS } from './subjects';

export interface ParsedWhatsAppQuestion {
  subject: string | null;
  grade: string | null;
  examGroup: 'LGS' | 'TYT' | 'AYT' | null;
  raw: string;
}

const SUBJECT_ALIASES: Record<string, string> = {
  mat: 'Matematik',
  matematik: 'Matematik',
  turkce: 'Türkçe',
  türkçe: 'Türkçe',
  fen: 'Fen Bilimleri',
  fizik: 'Fizik',
  kimya: 'Kimya',
  biyoloji: 'Biyoloji',
  geometri: 'Geometri',
  tarih: 'Tarih',
  cografya: 'Coğrafya',
  coğrafya: 'Coğrafya',
  edebiyat: 'Edebiyat',
  felsefe: 'Felsefe',
  ingilizce: 'İngilizce',
  inkilap: 'İnkılap Tarihi',
  din: 'Din Kültürü'
};

/** Örnek: "Matematik 12", "Fen 7", "LGS Matematik", "TYT Fizik" */
export function parseWhatsAppQuestionCaption(text: string): ParsedWhatsAppQuestion {
  const raw = String(text || '').trim();
  const lower = raw.toLocaleLowerCase('tr-TR');
  let examGroup: ParsedWhatsAppQuestion['examGroup'] = null;
  if (/\blgs\b/i.test(raw)) examGroup = 'LGS';
  if (/\btyt\b/i.test(raw)) examGroup = 'TYT';
  if (/\bayt\b/i.test(raw)) examGroup = 'AYT';

  let grade: string | null = examGroup;
  if (!grade) {
    const m = raw.match(/\b(3|4|5|6|7|8|9|10|11|12)\b/);
    if (m) grade = m[1]!;
    else {
      const opt = QUESTION_GRADE_OPTIONS.find((o) => lower.includes(o.label.toLocaleLowerCase('tr-TR')));
      if (opt) grade = opt.value;
    }
  }

  let subject: string | null = null;
  for (const [key, label] of Object.entries(SUBJECT_ALIASES)) {
    if (lower.includes(key)) {
      subject = label;
      break;
    }
  }

  return { subject, grade, examGroup, raw };
}
