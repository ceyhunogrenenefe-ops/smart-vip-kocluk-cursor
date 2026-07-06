import type { EduAnimationPoolItem } from '../../types/eduPanel.types';
import {
  classCardForPoolItem,
  type AnimationPoolProgram
} from './eduAnimationPoolCatalog';

type TopicsByClass = {
  regular: Record<string, string[]>;
  tytSubjects: Record<string, string[]>;
  aytSubjects: Record<string, string[]>;
  isYKS: boolean;
};

export type PoolTopicOption = {
  topic: string;
  subjectKey: string;
};

export type PoolFilterContext = {
  program?: string;
  classLevel?: string;
};

function normalizeSubjectName(value: string): string {
  return value.trim().toLocaleLowerCase('tr').replace(/\s+/g, ' ');
}

export function poolSubjectMatches(poolSubject: string, topicPoolSubject: string): boolean {
  const pool = normalizeSubjectName(poolSubject);
  const key = normalizeSubjectName(topicPoolSubject);
  if (!pool || !key) return false;
  if (pool === key) return true;
  if (key.endsWith(pool) || key.includes(pool)) return true;
  if (pool.includes('fen') && key.includes('fen')) return true;
  if (pool.includes('türk') && key.includes('türk')) return true;
  if (pool.includes('inkılap') && (key.includes('inkılap') || key.includes('inkilap'))) return true;
  if (pool.includes('din') && key.includes('din')) return true;
  if (pool === 'edebiyat' && key.includes('edebiyat')) return true;
  return false;
}

function yksTrackForProgram(program: AnimationPoolProgram): string {
  return program === 'ayt' ? 'YKS-Sayısal' : 'YKS-Sayısal';
}

function collectFromMap(
  map: Record<string, string[]>,
  poolSubject: string,
  out: PoolTopicOption[]
) {
  for (const [subjectKey, topics] of Object.entries(map)) {
    if (!poolSubjectMatches(poolSubject, subjectKey)) continue;
    for (const topic of topics) {
      const trimmed = String(topic || '').trim();
      if (!trimmed) continue;
      out.push({ topic: trimmed, subjectKey });
    }
  }
}

function dedupeTopics(options: PoolTopicOption[]): PoolTopicOption[] {
  const seen = new Set<string>();
  const result: PoolTopicOption[] = [];
  for (const opt of options) {
    const key = `${opt.subjectKey}::${opt.topic}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(opt);
  }
  return result.sort((a, b) => a.topic.localeCompare(b.topic, 'tr'));
}

export function topicPoolClassKeyForPoolItem(
  item: EduAnimationPoolItem,
  prefer?: PoolFilterContext
): string | number {
  const card = classCardForPoolItem(item, prefer);
  return card?.topicPoolClassKey ?? item.class_level;
}

export function listTopicsForPoolAnimation(
  item: EduAnimationPoolItem,
  getTopics: (subject: string, classLevel: number | string | undefined | null) => string[],
  getTopicsByClass: (classLevel: number | string | undefined | null) => TopicsByClass,
  prefer?: PoolFilterContext
): PoolTopicOption[] {
  const topicClass = topicPoolClassKeyForPoolItem(item, prefer);
  const poolSubject = item.subject_name.trim();
  const primary = getTopics(poolSubject, topicClass);
  const options: PoolTopicOption[] = [];

  if (primary.length) {
    for (const topic of primary) {
      const trimmed = String(topic || '').trim();
      if (trimmed) options.push({ topic: trimmed, subjectKey: poolSubject });
    }
    return dedupeTopics(options);
  }

  const byClass = getTopicsByClass(topicClass);
  collectFromMap(byClass.regular, poolSubject, options);
  if (options.length) return dedupeTopics(options);

  const card = classCardForPoolItem(item, prefer);
  const program = (prefer?.program || card?.program || item.program) as AnimationPoolProgram;
  if (program === 'tyt' || program === 'ayt') {
    const yks = getTopicsByClass(yksTrackForProgram(program));
    if (program === 'tyt') {
      collectFromMap(yks.tytSubjects, poolSubject, options);
    } else {
      collectFromMap(yks.aytSubjects, poolSubject, options);
    }
  }

  return dedupeTopics(options);
}

export function classLevelMatchesPool(
  classLevel: string | number | null | undefined,
  topicPoolClassKey: string | number
): boolean {
  const left = String(classLevel ?? '').trim();
  const right = String(topicPoolClassKey).trim();
  if (!left || !right) return false;
  if (left === right) return true;
  if ((left === '8' || left === 'LGS') && (right === '8' || right === 'LGS')) return true;
  return false;
}
