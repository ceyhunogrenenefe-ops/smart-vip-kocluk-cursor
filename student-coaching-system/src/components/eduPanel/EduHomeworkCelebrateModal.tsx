import React, { useEffect } from 'react';
import { PartyPopper, Sparkles } from 'lucide-react';
import EduBadgeChip from './EduBadgeChip';
import EduProgressRing from './EduProgressRing';
import {
  celebrateCopy,
  eduLevelLabel,
  milestoneBadges,
  progressBreakdown,
  type EduCelebrateKind
} from '../../lib/eduPanel/eduPanelProgress';
import type { EduRewardDelta } from '../../types/eduPanel.types';

type Props = {
  open: boolean;
  onClose: () => void;
  kind?: EduCelebrateKind;
  topicTitle?: string;
  animationCompleted?: boolean;
  homeworkPercent?: number;
  topicCompleted?: boolean;
  hasAnimation?: boolean;
  hasHomework?: boolean;
  rewards?: EduRewardDelta | null;
};

export default function EduHomeworkCelebrateModal({
  open,
  onClose,
  kind = 'homework',
  topicTitle,
  animationCompleted = false,
  homeworkPercent = 0,
  topicCompleted = false,
  hasAnimation = true,
  hasHomework = true,
  rewards = null
}: Props) {
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => onClose(), 6200);
    return () => window.clearTimeout(t);
  }, [open, onClose]);

  if (!open) return null;

  const breakdown = progressBreakdown(animationCompleted, homeworkPercent, hasAnimation);
  const copy = celebrateCopy(kind, breakdown, rewards);
  const milestones = milestoneBadges({
    animationCompleted,
    homeworkPercent,
    topicCompleted,
    hasAnimation,
    hasHomework
  });
  const freshlyEarned = milestones.filter((m) => {
    if (!m.earned) return false;
    if (kind === 'animation') return m.id === 'animation';
    if (kind === 'homework') return m.id === 'homework';
    if (kind === 'topic') return m.id === 'topic';
    return true;
  });

  const accent =
    kind === 'animation'
      ? 'from-violet-100 via-white to-indigo-50'
      : kind === 'topic'
        ? 'from-emerald-50 via-white to-sky-50'
        : 'from-amber-50 via-white to-orange-50';

  const hasRewardDrop = Boolean(rewards && (rewards.gold > 0 || rewards.silver > 0 || rewards.levelUp));

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edu-celebrate-title"
        className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${accent}`} />
        {hasRewardDrop ? (
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <span className="absolute left-[12%] top-6 animate-bounce text-2xl">✨</span>
            <span className="absolute right-[14%] top-10 animate-pulse text-xl">🎉</span>
            <span className="absolute bottom-16 left-[18%] animate-pulse text-lg">⭐</span>
            <span className="absolute bottom-20 right-[20%] animate-bounce text-xl">🪙</span>
          </div>
        ) : null}
        <div className="relative px-5 pb-5 pt-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white text-4xl shadow-md ring-2 ring-white">
            {rewards?.levelUp ? '🚀' : kind === 'animation' ? '🎬' : kind === 'topic' ? '🏅' : '🎉'}
          </div>
          <PartyPopper className="mx-auto mt-2 h-5 w-5 text-violet-600" />
          {topicTitle ? (
            <p className="mt-2 truncate text-[11px] font-medium uppercase tracking-wide text-slate-500">
              {topicTitle}
            </p>
          ) : null}
          <h2 id="edu-celebrate-title" className="mt-1 text-lg font-bold text-slate-900">
            {copy.title}
          </h2>
          <p className="mt-1 text-sm text-slate-600">{copy.subtitle}</p>

          {hasRewardDrop ? (
            <div className="mt-4 rounded-xl bg-gradient-to-r from-amber-50 via-yellow-50 to-orange-50 p-3 ring-1 ring-amber-200">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                Ödül kazandın!
              </p>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-sm font-bold">
                {rewards!.gold > 0 ? (
                  <span className="inline-flex items-center gap-1 text-amber-700">
                    🥇 +{rewards!.gold} altın
                  </span>
                ) : null}
                {rewards!.silver > 0 ? (
                  <span className="inline-flex items-center gap-1 text-slate-600">
                    🥈 +{rewards!.silver} gümüş
                  </span>
                ) : null}
              </div>
              {rewards!.levelUp ? (
                <p className="mt-2 text-xs font-semibold text-violet-700">
                  Seviye {rewards!.newLevel} — {eduLevelLabel(rewards!.newLevel)}!
                </p>
              ) : null}
              <p className="mt-2 text-[10px] text-slate-500">
                Toplam: {rewards!.totals.gold} altın · {rewards!.totals.silver} gümüş · Seviye{' '}
                {rewards!.totals.level}
              </p>
            </div>
          ) : null}

          <div className="mt-4 flex items-center justify-center gap-4">
            <EduProgressRing
              value={breakdown.total}
              size={84}
              stroke={6}
              badge={breakdown.badge}
              label="Rozet puanı"
            />
            <div className="space-y-2 text-left">
              <EduBadgeChip badge={breakdown.badge} points={breakdown.total} />
              <p className="text-[11px] font-medium text-slate-600">{copy.highlight}</p>
              <p className="text-[10px] text-slate-500">
                {breakdown.hasAnimation
                  ? `Animasyon ${breakdown.animationPoints}p · Ödev ${breakdown.homeworkPoints}p`
                  : `Ödev ${breakdown.homeworkPoints}p (tam puan)`}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-white/80 p-3 text-left ring-1 ring-slate-100">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              Başarı rozetlerin
            </p>
            <div className="flex flex-wrap gap-1.5">
              {milestones.map((m) => (
                <span
                  key={m.id}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold ring-1 ring-inset ${m.chipClass} ${
                    freshlyEarned.some((f) => f.id === m.id) ? 'scale-105 shadow-sm' : ''
                  }`}
                  title={m.hint}
                >
                  <span aria-hidden>{m.emoji}</span>
                  {m.label}
                  {m.earned ? ' ✓' : ''}
                </span>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="mt-5 w-full rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700"
          >
            Harika!
          </button>
        </div>
      </div>
    </div>
  );
}
