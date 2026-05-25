import React from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Clapperboard,
  Eye,
  FolderOpen,
  Trash2,
  Upload
} from 'lucide-react';
import type { EduLessonRow } from '../../types/eduPanel.types';
import { formatLessonDate, STATUS_LABEL, SUBJECT_DOT } from '../../lib/eduPanel/eduPanelUi';

type Props = {
  row: EduLessonRow;
  className: string;
  expanded: boolean;
  onToggle: () => void;
  busy: boolean;
  hwTitle: string;
  onHwTitleChange: (v: string) => void;
  onUploadHtml: (file: File | null) => void;
  onPreview: (animationId: string) => void;
  onDeleteAnimation: (id: string) => void;
  onAddHomework: () => void;
  onPublish: () => void;
  onDeleteRow: () => void;
};

export default function TeacherEduTopicCard({
  row,
  className: classLabel,
  expanded,
  onToggle,
  busy,
  hwTitle,
  onHwTitleChange,
  onUploadHtml,
  onPreview,
  onDeleteAnimation,
  onAddHomework,
  onPublish,
  onDeleteRow
}: Props) {
  const animCount = row.animations?.length || 0;
  const hwCount = row.homework?.length || 0;

  return (
    <div
      className={`rounded-xl border bg-white shadow-sm overflow-hidden border-l-4 ${
        expanded ? 'border-violet-200 ring-1 ring-violet-100' : 'border-slate-200'
      }`}
    >
      <div
        className={`border-l-4 ${
          expanded ? 'border-violet-500' : 'border-slate-300'
        }`}
      >
        <button
          type="button"
          className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50/80"
          onClick={onToggle}
        >
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
            {expanded ? <FolderOpen className="h-5 w-5" /> : <FolderOpen className="h-5 w-5 opacity-70" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${SUBJECT_DOT[row.subject_color] || SUBJECT_DOT.gray}`} />
              <span className="font-semibold text-slate-800">{row.title}</span>
              <span className="text-xs rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                {row.subject_name}
              </span>
              <span
                className={`text-xs rounded-full px-2 py-0.5 ${
                  row.status === 'active'
                    ? 'bg-green-100 text-green-800'
                    : row.status === 'draft'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-slate-100 text-slate-600'
                }`}
              >
                {STATUS_LABEL[row.status]}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              {classLabel} · {formatLessonDate(row.lesson_date)}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-2 text-[11px]">
              <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-2 py-0.5 text-violet-700">
                <Clapperboard className="h-3 w-3" />
                {animCount} animasyon
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-amber-800">
                <BookOpen className="h-3 w-3" />
                {hwCount} ödev
              </span>
            </div>
            {row.notes ? (
              <p className="mt-1 text-xs text-slate-500 line-clamp-1">{row.notes}</p>
            ) : null}
          </div>
          {expanded ? (
            <ChevronDown className="h-5 w-5 shrink-0 text-slate-400" />
          ) : (
            <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
          )}
        </button>

        {expanded ? (
          <div className="border-t border-slate-100 bg-slate-50/50 px-4 pb-4 pt-3">
            <p className="mb-3 text-xs text-slate-600">
              Bu klasör yalnızca <strong className="text-slate-800">「{row.title}」</strong> konusuna aittir.
              Animasyon ve ödev burada birbirinden ayrıdır; başka konularla karışmaz.
            </p>

            <div className="grid gap-4 lg:grid-cols-2">
              {/* Animasyon bölümü */}
              <section className="rounded-xl border-2 border-violet-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2 border-b border-violet-100 pb-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 text-white">
                    <Clapperboard className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-violet-900">Konu animasyonu</h3>
                    <p className="text-[11px] text-violet-600">Tek dosya .html — sadece bu konu</p>
                  </div>
                </div>

                <div className="space-y-2 min-h-[4rem]">
                  {(row.animations || []).length === 0 ? (
                    <p className="text-xs text-slate-400 italic py-2">Henüz animasyon yok</p>
                  ) : (
                    (row.animations || []).map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center gap-2 rounded-lg border border-violet-100 bg-violet-50/50 px-3 py-2"
                      >
                        <Clapperboard className="h-4 w-4 shrink-0 text-violet-500" />
                        <span className="min-w-0 flex-1 truncate text-sm text-slate-800">
                          {a.original_name}
                        </span>
                        <button
                          type="button"
                          title="Önizle"
                          disabled={busy}
                          className="rounded-md p-1.5 text-violet-700 hover:bg-violet-100"
                          onClick={() => onPreview(a.id)}
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title="Sil"
                          disabled={busy}
                          className="rounded-md p-1.5 text-red-600 hover:bg-red-50"
                          onClick={() => onDeleteAnimation(a.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-violet-300 bg-violet-50/30 px-3 py-3 text-sm font-medium text-violet-800 hover:bg-violet-50">
                  <Upload className="h-4 w-4" />
                  Bu konuya HTML yükle
                  <input
                    key={`upload-${row.id}`}
                    type="file"
                    accept=".html,text/html"
                    className="hidden"
                    disabled={busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      e.target.value = '';
                      onUploadHtml(f);
                    }}
                  />
                </label>
              </section>

              {/* Ödev bölümü */}
              <section className="rounded-xl border-2 border-amber-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2 border-b border-amber-100 pb-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 text-white">
                    <BookOpen className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-amber-900">Konu ödevi</h3>
                    <p className="text-[11px] text-amber-700">Ödevler animasyondan ayrı — sadece bu konu</p>
                  </div>
                </div>

                <div className="space-y-2 min-h-[4rem]">
                  {(row.homework || []).length === 0 ? (
                    <p className="text-xs text-slate-400 italic py-2">Henüz ödev yok</p>
                  ) : (
                    (row.homework || []).map((h) => (
                      <div
                        key={h.id}
                        className="rounded-lg border border-amber-100 bg-amber-50/40 px-3 py-2"
                      >
                        <p className="text-sm font-medium text-slate-800">{h.title}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {h.status === 'published' ? 'Yayında' : 'Taslak'} ·{' '}
                          {h.submissions?.length || 0} teslim
                        </p>
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-3 flex gap-2">
                  <input
                    className="flex-1 rounded-lg border border-amber-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-300"
                    placeholder="Ödev başlığı (bu konu için)"
                    value={hwTitle}
                    disabled={busy}
                    onChange={(e) => onHwTitleChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onAddHomework();
                    }}
                  />
                  <button
                    type="button"
                    disabled={busy || !hwTitle.trim()}
                    onClick={onAddHomework}
                    className="shrink-0 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    Ekle
                  </button>
                </div>
              </section>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-3">
              {row.status !== 'active' ? (
                <button
                  type="button"
                  disabled={busy}
                  className="text-sm font-medium text-green-700 hover:underline"
                  onClick={onPublish}
                >
                  Konuyu öğrencilere yayınla
                </button>
              ) : (
                <span className="text-xs text-green-700">Öğrenciler bu konuyu görebilir</span>
              )}
              <button
                type="button"
                disabled={busy}
                className="text-sm text-red-600 hover:underline ml-auto"
                onClick={onDeleteRow}
              >
                Konu klasörünü sil
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
