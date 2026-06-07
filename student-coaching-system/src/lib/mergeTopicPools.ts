import { TopicPool } from '../types';

export function mergeTopicPools(base: TopicPool, overrides: TopicPool): TopicPool {
  const merged: TopicPool = { ...base };
  Object.entries(overrides).forEach(([subject, levels]) => {
    const baseLevels = (base[subject] || {}) as Record<string, string[]>;
    const nextLevels = { ...baseLevels };
    Object.entries(levels || {}).forEach(([levelKey, incoming]) => {
      const current = nextLevels[levelKey] || [];
      nextLevels[levelKey] = Array.from(
        new Set([...(current || []), ...((incoming as string[]) || [])])
      );
    });
    merged[subject] = nextLevels;
  });
  return merged;
}
