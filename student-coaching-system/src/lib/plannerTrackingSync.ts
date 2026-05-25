import { isStudyTrackSubject } from './studyTrackSubjects';

/** Haftalık plan bloğundan kitap takibi için kullanılacak başlık */
export function bookTitleFromPlannerBlock(
  subject: string,
  blockTitle: string,
  explicitBookTitle?: string | null
): string {
  const explicit = String(explicitBookTitle || '').trim();
  if (explicit) return explicit;
  const title = String(blockTitle || '').trim();
  const sub = String(subject || '').trim();
  if (/kitap|okuma/i.test(sub) || isStudyTrackSubject(sub)) {
    if (sub === 'Kitap Okuma' && title && !/sayfa|hedef|günlük|okuma/i.test(title.toLowerCase())) {
      return title;
    }
    if (title && title !== sub) return title;
  }
  return '';
}

export function topicLabelsFromPlannerBlock(
  subject: string,
  blockTitle: string,
  resolveTopic: (rawTitle: string) => string
): { subject: string; topic: string } {
  const sub = String(subject || '').trim() || 'Genel';
  const raw = String(blockTitle || '').trim() || sub;
  const topic = resolveTopic(raw);
  return { subject: sub, topic };
}
