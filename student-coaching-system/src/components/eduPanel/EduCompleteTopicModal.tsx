import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clapperboard, BookOpen, Sparkles, X } from 'lucide-react';
import EduBadgeChip from './EduBadgeChip';
import EduProgressRing from './EduProgressRing';
import {
  homeworkPercentFromSubmissions,
  progressBreakdown,
  clampPercent
} from '../../lib/eduPanel/eduPanelProgress';

type Props = {
  open: boolean;
  title: string;
  hasAnimation: boolean;
  publishedHwCount: number;
  submittedHwCount: number;
  initialAnimationDone: boolean;
  initialHomeworkPercent: number;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (payload: {
    animation_completed: boolean;
    homework_percent: number;
    topic_completed: boolean;
  }) => void;
};

export default function EduCompleteTopicModal({
  open,
  title,
  hasAnimation,
  publishedHwCount,
  submittedHwCount,
  initialAnimationDone,
  initialHomeworkPercent,
  busy,
  onClose,
  onConfirm
}: Props) {
  const suggestedHw = homeworkPercentFromSubmissions(publishedHwCount, submittedHwCount);
  const [animationDone, setAnimationDone] = useState(initialAnimationDone);
  const [hwPercent, setHwPercent] = useState(
    initialHomeworkPercent > 0 ? initialHomeworkPercent : suggestedHw
  );
  const [showCelebration, setShowCelebration] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAnimationDone(initialAnimationDone);
    setHwPercent(initialHomeworkPercent > 0 ? initialHomeworkPercent : suggestedHw);
    setShowCelebration(false);
  }, [open, initialAnimationDone, initialHomeworkPercent, suggestedHw]);

  const breakdown = useMemo(
    () => progressBreakdown(animationDone, hwPercent),
    [animationDone, hwPercent]
  );

  if (!open) return null;

  const handleConfirm = () => {
    setShowCelebration(true);
    onConfirm({
      animation_completed: animationDone,
      homework_percent: clampPercent(hwPercent),
      topic_completed: true
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div
        className={`w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden transition-transform duration-500 ${
          showCelebration ? 'scale-[1.02]' : ''
        }`}
        role="dialog"
        aria-labelledby="edu-complete-title"
      >
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">
              Konuyu tamamladım
            </p>
            <h2 id="edu-complete-title" className="text-lg font-bold text-slate-800">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
            aria-label="Kapat"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="flex items-center justify-center gap-6">
            <EduProgressRing
              value={breakdown.total}
              size={88}
              stroke={6}
              badge={breakdown.badge}
              label="Rozet puanı"
            />
            <div className="space-y-2 text-sm">
              <EduBadgeChip badge={breakdown.badge} points={breakdown.total} />
              <p className="text-xs text-slate-500">
                Animasyon {breakdown.animationPoints}p + Ödev {breakdown.homeworkPoints}p
              </p>
            </div>
          </div>

          {hasAnimation ? (
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-violet-100 bg-violet-50/50 p-3">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-violet-300 text-violet-600"
                checked={animationDone}
                onChange={(e) => setAnimationDone(e.target.checked)}
              />
              <Clapperboard className="h-5 w-5 text-violet-600" />
              <span className="text-sm font-medium text-slate-800">Animasyonu izledim</span>
            </label>
          ) : null}

          <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
                <BookOpen className="h-4 w-4 text-amber-600" />
                Ödev tamamlama
              </span>
              <span className="text-lg font-bold text-amber-800">{clampPercent(hwPercent)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={hwPercent}
              onChange={(e) => setHwPercent(Number(e.target.value))}
              className="w-full accent-amber-600"
            />
            <p className="text-[11px] text-slate-500">
              {publishedHwCount > 0
                ? `Teslim: ${submittedHwCount}/${publishedHwCount} ödev · kaydırıcıyı gerçek ilerlemenize göre ayarlayın`
                : 'Ödev yoksa yüzdeyi kendi çalışmanıza göre işaretleyin'}
            </p>
          </div>

          {showCelebration ? (
            <div className="flex items-center gap-2 rounded-xl bg-green-50 px-3 py-2 text-sm text-green-800 animate-pulse">
              <Sparkles className="h-4 w-4" />
              Rozetin kaydedildi — harika iş!
            </div>
          ) : null}
        </div>

        <div className="flex gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-700"
          >
            Vazgeç
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handleConfirm}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" />
            {busy ? 'Kaydediliyor…' : 'Tamamladım & rozet al'}
          </button>
        </div>
      </div>
    </div>
  );
}
