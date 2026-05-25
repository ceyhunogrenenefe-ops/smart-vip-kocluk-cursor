import React, { useState } from 'react';
import { BookOpen, Clapperboard, FolderOpen, Play, Upload } from 'lucide-react';
import type { EduHomework, EduLessonRow } from '../../types/eduPanel.types';
import type { EduHomeworkSubmission } from '../../types/eduPanel.types';
import { formatLessonDate, SUBJECT_BORDER } from '../../lib/eduPanel/eduPanelUi';

type Props = {
  row: EduLessonRow;
  expanded: boolean;
  onToggle: () => void;
  submissions: Record<string, EduHomeworkSubmission | null>;
  animLoading: boolean;
  busyHw: string | null;
  onOpenAnimation: (id: string) => void;
  onSubmitHomework: (hw: EduHomework, file: File | null) => void;
};

export default function StudentEduTopicCard({
  row,
  expanded,
  onToggle,
  submissions,
  animLoading,
  busyHw,
  onOpenAnimation,
  onSubmitHomework
}: Props) {
  const publishedHw = (row.homework || []).filter((h) => h.status === 'published');
  const hasAnim = (row.animations || []).length > 0;
  const hasHw = publishedHw.length > 0;
  const [tab, setTab] = useState<'animation' | 'homework'>(hasAnim ? 'animation' : 'homework');

  return (
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
          <p className="text-xs text-slate-500">{formatLessonDate(row.lesson_date)}</p>
          <h2 className="text-lg font-semibold text-slate-800">{row.title}</h2>
          <p className="text-sm text-slate-600">{row.subject_name}</p>
          {row.notes ? <p className="mt-1 text-xs text-slate-500">{row.notes}</p> : null}
          <div className="mt-2 flex gap-2 text-[11px]">
            {hasAnim ? (
              <span className="rounded-md bg-violet-50 px-2 py-0.5 text-violet-700">Animasyon</span>
            ) : null}
            {hasHw ? (
              <span className="rounded-md bg-amber-50 px-2 py-0.5 text-amber-800">
                {publishedHw.length} ödev
              </span>
            ) : null}
          </div>
        </div>
      </button>

      {expanded ? (
        <div className="border-t border-slate-100 bg-slate-50/40 px-4 pb-4">
          <p className="py-2 text-xs text-slate-600">
            <strong>{row.title}</strong> konusunun içeriği — animasyon ve ödev ayrı sekmelerde.
          </p>

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
                    <span className="truncate">{a.original_name}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {hasHw && (!hasAnim || tab === 'homework') ? (
            <section className="rounded-xl border-2 border-amber-200 bg-white p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-amber-900">
                <BookOpen className="h-4 w-4" />
                Bu konunun ödevi
              </h3>
              <div className="space-y-3">
                {publishedHw.map((hw) => {
                  const sub = submissions[hw.id];
                  return (
                    <div
                      key={hw.id}
                      className="rounded-lg border border-amber-100 bg-amber-50/30 p-3"
                    >
                      <p className="font-medium text-slate-800">{hw.title}</p>
                      {hw.book_name || hw.question_range ? (
                        <p className="text-xs text-slate-500 mt-0.5">
                          {[hw.book_name, hw.question_range].filter(Boolean).join(' · ')}
                        </p>
                      ) : null}
                      {hw.due_date ? (
                        <p className="text-xs text-amber-700 mt-1">Son tarih: {hw.due_date}</p>
                      ) : null}
                      {sub ? (
                        <p className="text-xs text-green-700 mt-2">
                          Teslim edildi ({new Date(sub.submitted_at).toLocaleString('tr-TR')})
                          {sub.grade ? ` · Not: ${sub.grade}` : ''}
                        </p>
                      ) : (
                        <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-indigo-700">
                          <Upload className="h-4 w-4" />
                          {busyHw === hw.id ? 'Yükleniyor…' : 'Fotoğraf ile teslim et'}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={busyHw === hw.id}
                            onChange={(e) => onSubmitHomework(hw, e.target.files?.[0] || null)}
                          />
                        </label>
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
  );
}
