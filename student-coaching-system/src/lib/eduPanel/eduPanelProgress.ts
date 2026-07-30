/** EduPanel rozet / puan mantığı — animasyon %40 + ödev %60 (animasyon yoksa ödev %100) */

import { homeworkPoolAnimationIds } from './eduHomeworkStats';

export type EduBadgeTier = {
  id: string;
  label: string;
  emoji: string;
  ringClass: string;
  chipClass: string;
  min: number;
};

export const EDU_ANIMATION_POINTS = 40;
export const EDU_HOMEWORK_POINTS_MAX = 60;
export const EDU_HOMEWORK_ONLY_POINTS_MAX = 100;

export const EDU_BADGE_TIERS: EduBadgeTier[] = [
  {
    id: 'none',
    label: 'Başla',
    emoji: '○',
    ringClass: 'stroke-slate-300',
    chipClass: 'bg-slate-100 text-slate-600',
    min: 0
  },
  {
    id: 'starter',
    label: 'Başlangıç',
    emoji: '🌱',
    ringClass: 'stroke-emerald-400',
    chipClass: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    min: 1
  },
  {
    id: 'rising',
    label: 'Gelişiyor',
    emoji: '⚡',
    ringClass: 'stroke-sky-400',
    chipClass: 'bg-sky-50 text-sky-800 ring-sky-200',
    min: 40
  },
  {
    id: 'solid',
    label: 'İyi Gidiyor',
    emoji: '🔥',
    ringClass: 'stroke-orange-400',
    chipClass: 'bg-orange-50 text-orange-800 ring-orange-200',
    min: 60
  },
  {
    id: 'pro',
    label: 'Usta',
    emoji: '🏆',
    ringClass: 'stroke-violet-500',
    chipClass: 'bg-violet-50 text-violet-800 ring-violet-200',
    min: 80
  },
  {
    id: 'gold',
    label: 'Altın',
    emoji: '⭐',
    ringClass: 'stroke-amber-400',
    chipClass: 'bg-amber-50 text-amber-900 ring-amber-300',
    min: 95
  }
];

export type EduStudentRewards = {
  gold: number;
  silver: number;
  xp: number;
  level: number;
};

export type EduRewardDelta = {
  gold: number;
  silver: number;
  levelUp: boolean;
  previousLevel: number;
  newLevel: number;
  totals: EduStudentRewards;
};

export const EDU_LEVEL_THRESHOLDS = [0, 15, 35, 60, 90, 130, 180, 240, 310, 400];

export function clampPercent(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Konuda izlenebilir animasyon var mı? (satır animasyonu veya ödeve bağlı havuz) */
export function lessonRowHasAnimation(row: {
  animations?: unknown[] | null;
  homework?: {
    status?: string;
    pool_animation_id?: string | null;
    pool_animation_ids?: string[] | null;
  }[] | null;
}): boolean {
  if ((row.animations || []).length > 0) return true;
  const published = (row.homework || []).filter((h) => h.status === 'published');
  return published.some((h) => homeworkPoolAnimationIds(h).length > 0);
}

export function homeworkPointsMax(hasAnimation = true): number {
  return hasAnimation ? EDU_HOMEWORK_POINTS_MAX : EDU_HOMEWORK_ONLY_POINTS_MAX;
}

export function computeEduPoints(
  animationCompleted: boolean,
  homeworkPercent: number,
  hasAnimation = true
): number {
  const anim = hasAnimation && animationCompleted ? EDU_ANIMATION_POINTS : 0;
  const hwMax = homeworkPointsMax(hasAnimation);
  const hw = Math.round(clampPercent(homeworkPercent) * (hwMax / 100));
  return anim + hw;
}

export function homeworkPercentFromSubmissions(
  publishedCount: number,
  submittedCount: number
): number {
  if (publishedCount <= 0) return 0;
  return clampPercent((submittedCount / publishedCount) * 100);
}

export function badgeForPoints(points: number): EduBadgeTier {
  const p = clampPercent(points);
  let tier = EDU_BADGE_TIERS[0];
  for (const t of EDU_BADGE_TIERS) {
    if (p >= t.min) tier = t;
  }
  return tier;
}

export function progressBreakdown(
  animationCompleted: boolean,
  homeworkPercent: number,
  hasAnimation = true
) {
  const hw = clampPercent(homeworkPercent);
  const animPts = hasAnimation && animationCompleted ? EDU_ANIMATION_POINTS : 0;
  const hwMax = homeworkPointsMax(hasAnimation);
  const hwPts = Math.round(hw * (hwMax / 100));
  const total = animPts + hwPts;
  return {
    animationPoints: animPts,
    homeworkPoints: hwPts,
    homeworkPercent: hw,
    homeworkPointsMax: hwMax,
    hasAnimation,
    total,
    badge: badgeForPoints(total)
  };
}

export function eduXpFromRewards(gold: number, silver: number): number {
  return gold * 10 + silver * 5;
}

export function eduLevelFromXp(xp: number): number {
  const safe = Math.max(0, Math.floor(Number(xp) || 0));
  let level = 1;
  for (let i = 1; i < EDU_LEVEL_THRESHOLDS.length; i += 1) {
    if (safe >= EDU_LEVEL_THRESHOLDS[i]) level = i + 1;
    else break;
  }
  return level;
}

export function eduLevelLabel(level: number): string {
  const labels = [
    'Çaylak',
    'Meraklı',
    'Azimli',
    'Çalışkan',
    'Usta',
    'Şampiyon',
    'Kahraman',
    'Efsane',
    'Yıldız',
    'Altın Usta'
  ];
  const idx = Math.max(0, Math.min(labels.length - 1, Math.floor(level) - 1));
  return labels[idx];
}

/** Konu içi başarı rozetleri — animasyon / ödev / konu tamamlama */
export type EduMilestoneId = 'animation' | 'homework' | 'topic';

export type EduMilestoneBadge = {
  id: EduMilestoneId;
  label: string;
  emoji: string;
  hint: string;
  earned: boolean;
  chipClass: string;
};

export function milestoneBadges(opts: {
  animationCompleted: boolean;
  homeworkPercent: number;
  topicCompleted?: boolean;
  hasAnimation?: boolean;
  hasHomework?: boolean;
}): EduMilestoneBadge[] {
  const hwDone = clampPercent(opts.homeworkPercent) >= 100;
  const hwMax = homeworkPointsMax(opts.hasAnimation !== false);
  const list: EduMilestoneBadge[] = [];
  if (opts.hasAnimation !== false) {
    list.push({
      id: 'animation',
      label: 'Animasyon Ustası',
      emoji: '🎬',
      hint: `Animasyonu izle → +${EDU_ANIMATION_POINTS}p`,
      earned: Boolean(opts.animationCompleted),
      chipClass: opts.animationCompleted
        ? 'bg-violet-100 text-violet-900 ring-violet-300'
        : 'bg-slate-50 text-slate-400 ring-slate-200'
    });
  }
  if (opts.hasHomework !== false) {
    list.push({
      id: 'homework',
      label: 'Ödev Kahramanı',
      emoji: '📝',
      hint: `Tüm ödevleri teslim et → +${hwMax}p`,
      earned: hwDone,
      chipClass: hwDone
        ? 'bg-amber-100 text-amber-950 ring-amber-300'
        : 'bg-slate-50 text-slate-400 ring-slate-200'
    });
  }
  list.push({
    id: 'topic',
    label: 'Konu Tamam',
    emoji: '🏅',
    hint: 'Konuyu tamamladım ile kilidi aç',
    earned: Boolean(opts.topicCompleted),
    chipClass: opts.topicCompleted
      ? 'bg-emerald-100 text-emerald-900 ring-emerald-300'
      : 'bg-slate-50 text-slate-400 ring-slate-200'
  });
  return list;
}

export type EduCelebrateKind = 'animation' | 'homework' | 'topic';

export function celebrateCopy(
  kind: EduCelebrateKind,
  breakdown: ReturnType<typeof progressBreakdown>,
  rewards?: EduRewardDelta | null
): { title: string; subtitle: string; highlight: string } {
  const rewardLine = rewards
    ? [
        rewards.gold > 0 ? `+${rewards.gold} altın` : '',
        rewards.silver > 0 ? `+${rewards.silver} gümüş` : '',
        rewards.levelUp ? `Seviye ${rewards.newLevel}!` : ''
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  if (kind === 'animation') {
    return {
      title: 'Animasyon rozeti kazandın!',
      subtitle: 'Konu animasyonunu izledin — bu başarı rozetine işlendi.',
      highlight: [rewardLine, `+${breakdown.animationPoints} puan · ${breakdown.badge.emoji} ${breakdown.badge.label}`]
        .filter(Boolean)
        .join(' · ')
    };
  }
  if (kind === 'homework') {
    return {
      title: breakdown.homeworkPercent >= 100 ? 'Ödev rozeti tamam!' : 'Ödev teslim edildi!',
      subtitle:
        breakdown.homeworkPercent >= 100
          ? breakdown.hasAnimation
            ? 'Bu konunun tüm ödevlerini yükledin — Kahraman rozeti senin.'
            : 'Ödevini teslim ettin — bu konu için tam puanı aldın!'
          : 'Hocan ödevini inceleyecek. Eksik ödevleri de tamamlarsan rozeti açarsın.',
      highlight: [
        rewardLine,
        `Ödev %${breakdown.homeworkPercent} · ${breakdown.total}p · ${breakdown.badge.emoji} ${breakdown.badge.label}`
      ]
        .filter(Boolean)
        .join(' · ')
    };
  }
  return {
    title: rewards?.levelUp ? 'Seviye atladın!' : 'Konu rozetin hazır!',
    subtitle: rewards?.levelUp
      ? `${eduLevelLabel(rewards.newLevel)} seviyesine yükseldin — ödüllerin birikti!`
      : 'Animasyon + ödev ilerlemen kayda geçti.',
    highlight: [rewardLine, `${breakdown.total}p · ${breakdown.badge.emoji} ${breakdown.badge.label}`]
      .filter(Boolean)
      .join(' · ')
  };
}
