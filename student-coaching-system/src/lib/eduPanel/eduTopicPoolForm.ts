import { sortSubjectsWithStudyTracks } from '../studyTrackSubjects';

export type TopicsByClassBundle = {
  regular: Record<string, string[]>;
  tytSubjects: Record<string, string[]>;
  aytSubjects: Record<string, string[]>;
  isYKS: boolean;
};

/** Konu havuzu ders listesi (sınıf kademesine göre). */
export function listTopicPoolSubjects(tb: TopicsByClassBundle): string[] {
  const keys = tb.isYKS
    ? [...Object.keys(tb.tytSubjects), ...Object.keys(tb.aytSubjects), ...Object.keys(tb.regular)]
    : Object.keys(tb.regular);
  return sortSubjectsWithStudyTracks([...new Set(keys.filter(Boolean))]);
}

/** Seçili dersin konu havuzundaki başlıkları. */
export function listTopicPoolTopics(tb: TopicsByClassBundle, subjectName: string): string[] {
  const key = String(subjectName || '').trim();
  if (!key) return [];
  const list = tb.regular[key] || tb.tytSubjects[key] || tb.aytSubjects[key] || [];
  return [...new Set(list.map((t) => String(t || '').trim()).filter(Boolean))];
}

/** Önek + havuz değeri (ör. "Tekrar" + "Kuvvet" → "Tekrar Kuvvet"). */
export function joinEduPoolPrefix(prefix: string, poolValue: string): string {
  const p = String(prefix || '').trim();
  const v = String(poolValue || '').trim();
  if (!p) return v;
  if (!v) return p;
  if (v.toLocaleLowerCase('tr').startsWith(p.toLocaleLowerCase('tr'))) return v;
  return `${p} ${v}`.replace(/\s+/g, ' ').trim();
}

export function resolveEduTopicPoolClassKey(
  selectedClasses: { class_level?: string | number | null }[],
  activeLevelKey?: string | null
): string | null {
  const level = String(activeLevelKey || '').trim();
  if (level && level !== '__all__' && level !== '__none__') return level;
  for (const c of selectedClasses || []) {
    const k = String(c.class_level ?? '').trim();
    if (k) return k;
  }
  return null;
}
