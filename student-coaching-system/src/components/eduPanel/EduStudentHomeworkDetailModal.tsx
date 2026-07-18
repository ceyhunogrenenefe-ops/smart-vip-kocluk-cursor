import React from 'react';
import { BookOpen, Calendar, Clapperboard, Loader2, Play, Send, X } from 'lucide-react';
import EduHomeworkPdfLink from './EduHomeworkPdfLink';
import type { EduHomework, EduHomeworkSubmission, EduLessonRow } from '../../types/eduPanel.types';
import { formatEduHomeworkLabel } from '../../lib/eduPanel/eduHomeworkForm';
import { homeworkPoolAnimationIds } from '../../lib/eduPanel/eduHomeworkStats';

type Props = {
  open: boolean;
  homework: EduHomework | null;
  row: EduLessonRow | null;
  submission?: EduHomeworkSubmission | null;
  busy?: boolean;
  onClose: () => void;
  onSubmit: () => void;
  onPreviewPoolAnimation?: (poolId: string) => void;
  onPreviewLessonAnimation?: (animationId: string) => void;
};

export default function EduStudentHomeworkDetailModal({
  open,
  homework,
  row,
  submission,
  busy,
  onClose,
  onSubmit,
  onPreviewPoolAnimation,
  onPreviewLessonAnimation
}: Props) {
  if (!open || !homework) return null;

  const poolIds = homeworkPoolAnimationIds(homework).filter((id) => {
    const attached = (row?.animations || []).some((a) => String(a.pool_id || '') === String(id));
    return !attached;
  });
  const lessonAnims = row?.animations || [];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
      >
        <div className="flex items-start justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Ödev Detayı</h3>
            <p className="mt-0.5 text-xs text-slate-500">{formatEduHomeworkLabel(homework)}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {homework.description ? (
            <section>
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <FileText className="h-3.5 w-3.5" />
                Açıklama
              </p>
              <p className="whitespace-pre-wrap text-sm text-slate-700">{homework.description}</p>
            </section>
          ) : null}

          <section className="rounded-xl border border-amber-100 bg-amber-50/40 p-3 text-sm">
            <p className="flex items-center gap-2 font-medium text-amber-950">
              <BookOpen className="h-4 w-4" />
              {formatEduHomeworkLabel(homework)}
            </p>
            {homework.due_date ? (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-800">
                <Calendar className="h-3.5 w-3.5" />
                Teslim tarihi: {homework.due_date}
              </p>
            ) : null}
          </section>

          {(homework.attachment_pdf_path || homework.attachment_pdf_name || homework.attachment_pdf_url) ? (
            <section>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                Öğretmen PDF
              </p>
              <EduHomeworkPdfLink
                homework={homework}
                fullWidth
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-50"
              />
            </section>
          ) : null}

          {(poolIds.length > 0 || lessonAnims.length > 0) && (
            <section>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-violet-800">
                <Clapperboard className="h-3.5 w-3.5" />
                Animasyonlar
              </p>
              <div className="space-y-2">
                {lessonAnims.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => onPreviewLessonAnimation?.(a.id)}
                    className="flex w-full items-center gap-2 rounded-lg border border-violet-100 bg-violet-50 px-3 py-2.5 text-left text-sm font-medium text-violet-900 hover:bg-violet-100"
                  >
                    <Play className="h-4 w-4" />
                    ▶ İzle — {a.original_name}
                  </button>
                ))}
                {poolIds.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onPreviewPoolAnimation?.(id)}
                    className="flex w-full items-center gap-2 rounded-lg border border-violet-100 bg-violet-50 px-3 py-2.5 text-left text-sm font-medium text-violet-900 hover:bg-violet-100"
                  >
                    <Play className="h-4 w-4" />
                    ▶ İzle — Animasyon
                  </button>
                ))}
              </div>
            </section>
          )}

          {submission?.teacher_note ? (
            <section className="rounded-xl border border-green-100 bg-green-50/50 p-3">
              <p className="text-xs font-semibold text-green-900">Öğretmen Notu</p>
              <p className="mt-1 text-sm text-green-900">{submission.teacher_note}</p>
              {submission.grade ? (
                <p className="mt-1 text-xs text-green-800">Not: {submission.grade}</p>
              ) : null}
            </section>
          ) : null}

          {submission ? (
            <p className="text-sm font-medium text-green-700">
              Teslim edildi ({new Date(submission.submitted_at).toLocaleString('tr-TR')})
            </p>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={onSubmit}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Teslim Et
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
