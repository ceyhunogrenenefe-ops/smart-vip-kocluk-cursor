import React, { useMemo, useState } from 'react';
import { BookOpen, CheckCircle2, Clapperboard, FolderOpen, Play, Send } from 'lucide-react';
import type { EduHomework, EduLessonRow, EduLessonRowProgress } from '../../types/eduPanel.types';
import type { EduHomeworkSubmission } from '../../types/eduPanel.types';
import EduBadgeChip from './EduBadgeChip';
import EduCompleteTopicModal from './EduCompleteTopicModal';
import EduHomeworkCelebrateModal from './EduHomeworkCelebrateModal';
import EduProgressRing from './EduProgressRing';
import EduStudentHomeworkDetailModal from './EduStudentHomeworkDetailModal';
import EduSubmitHomeworkModal from './EduSubmitHomeworkModal';
import { formatEduDateRange, formatLessonDate, SUBJECT_BORDER } from '../../lib/eduPanel/eduPanelUi';
import { formatEduHomeworkLabel } from '../../lib/eduPanel/eduHomeworkForm';
import {
  homeworkPoolAnimationIds,
  statusTone,
  submissionDeliveryStatus
} from '../../lib/eduPanel/eduHomeworkStats';
import { badgeForPoints, progressBreakdown } from '../../lib/eduPanel/eduPanelProgress';

type Props = {
  row: EduLessonRow;
  expanded: boolean;
  onToggle: () => void;
  submissions: Record<string, EduHomeworkSubmission | null>;
  progress?: EduLessonRowProgress | null;
  animLoading: boolean;
  busyHw: string | null;
  busyProgress?: boolean;
  onOpenAnimation: (id: string) => void;
  onOpenPoolAnimation?: (poolId: string) => void;
  onSubmitHomework: (
    hw: EduHomework,
    payload: { photos: File[]; video: File | null }
  ) => Promise<void>;
  onSaveProgress: (payload: {
    animation_completed: boolean;
    homework_percent: number;
    topic_completed: boolean;
  }) => Promise<void>;
};

export default function StudentEduTopicCard({
  row,
  expanded,
  onToggle,
  submissions,
  progress,
  animLoading,
  busyHw,
  busyProgress,
  onOpenAnimation,
  onOpenPoolAnimation,
  onSubmitHomework,
  onSaveProgress
}: Props) {
  const publishedHw = (row.homework || []).filter((h) => h.status === 'published');
  const hasAnim = (row.animations || []).length > 0;
  const hasHw = publishedHw.length > 0;
  const dateRange = formatEduDateRange(row.available_from, row.available_until, row.lesson_date);
  const [tab, setTab] = useState<'animation' | 'homework'>(hasAnim ? 'animation' : 'homework');
  const [completeOpen, setCompleteOpen] = useState(false);
  const [submitHw, setSubmitHw] = useState<EduHomework | null>(null);
  const [detailHw, setDetailHw] = useState<EduHomework | null>(null);
  const [celebrate, setCelebrate] = useState(false);

  const submittedCount = publishedHw.filter((h) => submissions[h.id]).length;
  const breakdown = useMemo(
    () =>
      progressBreakdown(
        Boolean(progress?.animation_completed),
        progress?.homework_percent ?? 0
      ),
    [progress]
  );

  const handleComplete = async (payload: {
    animation_completed: boolean;
    homework_percent: number;
    topic_completed: boolean;
  }) => {
    await onSaveProgress(payload);
    setCompleteOpen(false);
  };

  return (
    <>
      <article
        className={`rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden border-l-4 ${
          SUBJECT_BORDER[row.subject_color] || SUBJECT_BORDER.gray
        }`}
      >
        <button
          type="button"
          className="flex w-full items-start gap-3 p-4 text-left hover:bg-slate-50/80"
          onClick={onToggle}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <FolderOpen className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-500">
              {dateRange || formatLessonDate(row.lesson_date)}
            </p>
            <h2 className="text-lg font-semibold text-slate-800">{row.title}</h2>
            <p className="text-sm text-slate-600">{row.subject_name}</p>
            {row.notes ? <p className="mt-1 text-xs text-slate-500">{row.notes}</p> : null}
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
              {hasAnim ? (
                <span className="rounded-md bg-violet-50 px-2 py-0.5 text-violet-700">Animasyon</span>
              ) : null}
              {hasHw ? (
                <span className="rounded-md bg-amber-50 px-2 py-0.5 text-amber-800">
                  {publishedHw.length} ödev
                </span>
              ) : null}
              {progress?.topic_completed ? (
                <EduBadgeChip badge={breakdown.badge} compact />
              ) : progress && progress.points > 0 ? (
                <span className="text-slate-500">{progress.points}p</span>
              ) : null}
            </div>
          </div>
          <EduProgressRing
            value={progress?.points ?? breakdown.total}
            size={52}
            stroke={4}
            badge={badgeForPoints(progress?.points ?? breakdown.total)}
          />
        </button>

        {expanded ? (
          <div className="border-t border-slate-100 bg-slate-50/40 px-4 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-2 py-3">
              <p className="text-xs text-slate-600">
                <strong>{row.title}</strong> — animasyon ve ödev ayrı sekmelerde.
              </p>
              {progress?.topic_completed ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700">
                  <CheckCircle2 className="h-4 w-4" />
                  Konu tamamlandı
                </span>
              ) : (
                <button
                  type="button"
                  disabled={busyProgress}
                  onClick={() => setCompleteOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Konuyu tamamladım
                </button>
              )}
            </div>

            <div className="mb-3 grid grid-cols-3 gap-2 rounded-xl bg-white p-3 text-center text-[10px] shadow-sm ring-1 ring-slate-100">
              <div>
                <p className="font-bold text-violet-700">{breakdown.animationPoints}p</p>
                <p className="text-slate-500">Animasyon</p>
              </div>
              <div>
                <p className="font-bold text-amber-700">{breakdown.homeworkPercent}%</p>
                <p className="text-slate-500">Ödev</p>
              </div>
              <div>
                <p className="font-bold text-indigo-700">{breakdown.total}p</p>
                <p className="text-slate-500">Toplam</p>
              </div>
            </div>

            {(hasAnim || hasHw) && hasAnim && hasHw ? (
              <div className="mb-3 flex gap-1 rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setTab('animation')}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-xs font-semibold ${
                    tab === 'animation'
                      ? 'bg-white text-violet-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-800'
                  }`}
                >
                  <Clapperboard className="h-3.5 w-3.5" />
                  Animasyon
                </button>
                <button
                  type="button"
                  onClick={() => setTab('homework')}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-xs font-semibold ${
                    tab === 'homework'
                      ? 'bg-white text-amber-800 shadow-sm'
                      : 'text-slate-600 hover:text-slate-800'
                  }`}
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  Ödev
                </button>
              </div>
            ) : null}

            {hasAnim && (!hasHw || tab === 'animation') ? (
              <section className="rounded-xl border-2 border-violet-200 bg-white p-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-violet-900">
                  <Clapperboard className="h-4 w-4" />
                  Bu konunun animasyonu
                  {progress?.animation_completed ? (
                    <span className="ml-auto text-[10px] font-semibold text-green-600">İzlendi ✓</span>
                  ) : null}
                </h3>
                <div className="flex flex-col gap-2">
                  {(row.animations || []).map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      disabled={animLoading}
                      onClick={() => onOpenAnimation(a.id)}
                      className="flex items-center gap-2 rounded-lg bg-violet-50 px-4 py-3 text-left text-sm font-medium text-violet-800 hover:bg-violet-100 disabled:opacity-50"
                    >
                      <Play className="h-5 w-5 shrink-0" />
                      <span className="truncate">▶ İzle — {a.original_name}</span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {hasHw && (!hasAnim || tab === 'homework') ? (
              <section className="rounded-xl border-2 border-amber-200 bg-white p-4 mt-3">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-amber-900">
                  <BookOpen className="h-4 w-4" />
                  Bu konunun ödevi
                  <span className="ml-auto text-[10px] font-medium text-amber-700">
                    {submittedCount}/{publishedHw.length} teslim
                  </span>
                </h3>
                <div className="space-y-3">
                  {publishedHw.map((hw) => {
                    const sub = submissions[hw.id];
                    const tone = statusTone(submissionDeliveryStatus(hw.due_date, Boolean(sub)));
                    const poolIds = homeworkPoolAnimationIds(hw);
                    return (
                      <div
                        key={hw.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setDetailHw(hw)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setDetailHw(hw);
                          }
                        }}
                        className={`rounded-lg border border-amber-100 p-3 cursor-pointer hover:ring-1 hover:ring-amber-200 ${tone.bg}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold text-slate-800 text-base">
                            {formatEduHomeworkLabel(hw)}
                          </p>
                          <span
                            className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold ${tone.text} ${tone.bg}`}
                          >
                            {tone.emoji} {tone.label}
                          </span>
                        </div>
                        {hw.book_name ? (
                          <p className="text-xs text-amber-800 mt-1">
                            📖 {hw.book_name}
                            {hw.question_range ? ` · Sayfa ${hw.question_range}` : ''}
                          </p>
                        ) : hw.question_range ? (
                          <p className="text-xs text-amber-800 mt-1">Sayfa {hw.question_range}</p>
                        ) : null}
                        {hw.title &&
                        (hw.book_name || hw.question_range) &&
                        hw.title !== formatEduHomeworkLabel(hw) ? (
                          <p className="text-xs text-slate-500 mt-0.5">{hw.title}</p>
                        ) : null}
                        {hw.due_date ? (
                          <p className="text-xs text-amber-700 mt-1">Son tarih: {hw.due_date}</p>
                        ) : null}
                        {poolIds.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {poolIds.map((id) => (
                              <button
                                key={id}
                                type="button"
                                disabled={animLoading || !onOpenPoolAnimation}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenPoolAnimation?.(id);
                                }}
                                className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-2.5 py-1.5 text-[11px] font-semibold text-violet-800 hover:bg-violet-100 disabled:opacity-50"
                              >
                                <Play className="h-3 w-3" />
                                ▶ İzle
                              </button>
                            ))}
                          </div>
                        ) : null}
                        {sub ? (
                          <p className="text-xs text-green-700 mt-2">
                            Teslim edildi ({new Date(sub.submitted_at).toLocaleString('tr-TR')})
                            {sub.grade ? ` · Not: ${sub.grade}` : ''}
                            {sub.photo_paths?.length || sub.storage_path || sub.video_path ? (
                              <span className="text-green-600"> · Medya eklendi</span>
                            ) : null}
                          </p>
                        ) : (
                          <button
                            type="button"
                            disabled={busyHw === hw.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSubmitHw(hw);
                            }}
                            className="mt-2 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                          >
                            <Send className="h-4 w-4" />
                            {busyHw === hw.id ? 'Gönderiliyor…' : 'Ödevi Teslim Et'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {!hasAnim && !hasHw ? (
              <p className="text-sm text-slate-500 py-2">Bu konuda henüz içerik yok.</p>
            ) : null}
          </div>
        ) : null}
      </article>

      <EduStudentHomeworkDetailModal
        open={Boolean(detailHw)}
        homework={detailHw}
        row={row}
        submission={detailHw ? submissions[detailHw.id] : null}
        busy={Boolean(detailHw && busyHw === detailHw.id)}
        onClose={() => setDetailHw(null)}
        onSubmit={() => {
          if (!detailHw) return;
          setSubmitHw(detailHw);
          setDetailHw(null);
        }}
        onPreviewPoolAnimation={onOpenPoolAnimation}
        onPreviewLessonAnimation={onOpenAnimation}
      />

      <EduSubmitHomeworkModal
        open={Boolean(submitHw)}
        homework={submitHw}
        busy={Boolean(submitHw && busyHw === submitHw.id)}
        onClose={() => setSubmitHw(null)}
        onSubmit={async (payload) => {
          if (!submitHw) return;
          await onSubmitHomework(submitHw, payload);
          setSubmitHw(null);
          setCelebrate(true);
        }}
      />

      <EduHomeworkCelebrateModal open={celebrate} onClose={() => setCelebrate(false)} />

      <EduCompleteTopicModal
        open={completeOpen}
        title={row.title}
        hasAnimation={hasAnim}
        publishedHwCount={publishedHw.length}
        submittedHwCount={submittedCount}
        initialAnimationDone={Boolean(progress?.animation_completed)}
        initialHomeworkPercent={progress?.homework_percent ?? 0}
        busy={busyProgress}
        onClose={() => setCompleteOpen(false)}
        onConfirm={(p) => void handleComplete(p)}
      />
    </>
  );
}
