import React, { useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Clapperboard,
  Eye,
  FolderOpen,
  MessageCircle,
  Pencil,
  Trash2,
  Upload
} from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '../../context/AppContext';
import { displayInstitutionName } from '../../lib/appBrand';
import type { EduClass, EduLessonRow, LessonRowFormValues } from '../../types/eduPanel.types';
import TeacherEduStudentProgress from './TeacherEduStudentProgress';
import TeacherEduTopicEditModal from './TeacherEduTopicEditModal';
import { formatEduDateRange, formatLessonDate, STATUS_LABEL, SUBJECT_DOT } from '../../lib/eduPanel/eduPanelUi';
import {
  buildEduTopicWhatsAppShareText,
  copyEduShareText,
  whatsAppShareUrl
} from '../../lib/eduPanel/eduPanelShare';
import {
  formatEduHomeworkLabel,
  type EduHomeworkDraft
} from '../../lib/eduPanel/eduHomeworkForm';

type Props = {
  row: EduLessonRow;
  classNames: string[];
  classes: EduClass[];
  bookSuggestions?: string[];
  expanded: boolean;
  onToggle: () => void;
  busy: boolean;
  hwDraft: EduHomeworkDraft;
  onHwDraftChange: (draft: EduHomeworkDraft) => void;
  onUploadHtml: (file: File | null) => void;
  onPreview: (animationId: string) => void;
  onDeleteAnimation: (id: string) => void;
  onAddHomework: () => void;
  onPublish: () => void;
  onEdit: (patch: Partial<LessonRowFormValues>) => Promise<void>;
  onDeleteRow: () => void;
};

export default function TeacherEduTopicCard({
  row,
  classNames,
  classes,
  bookSuggestions = [],
  expanded,
  onToggle,
  busy,
  hwDraft,
  onHwDraftChange,
  onUploadHtml,
  onPreview,
  onDeleteAnimation,
  onAddHomework,
  onPublish,
  onEdit,
  onDeleteRow
}: Props) {
  const { institution } = useApp();
  const animCount = row.animations?.length || 0;
  const hwCount = row.homework?.length || 0;
  const classLabel = classNames.length ? classNames.join(', ') : 'Sınıf';
  const dateRange = formatEduDateRange(row.available_from, row.available_until, row.lesson_date);
  const [editOpen, setEditOpen] = useState(false);

  const onShareWhatsApp = async () => {
    const publishedHw = row.homework?.filter((h) => h.status === 'published') || [];
    const text = buildEduTopicWhatsAppShareText({
      title: row.title,
      subjectName: row.subject_name,
      classNames,
      homeworkDetails: publishedHw.map((h) => ({
        title: h.title,
        book_name: h.book_name,
        question_range: h.question_range
      })),
      hasAnimation: animCount > 0,
      dateRangeLabel: dateRange,
      institutionName: displayInstitutionName(institution?.name)
    });
    try {
      await copyEduShareText(text);
      window.open(whatsAppShareUrl(text), '_blank', 'noopener,noreferrer');
      toast.success('Mesaj kopyalandı — WhatsApp\'ta grubu seçip gönderin');
    } catch {
      toast.error('Paylaşım metni oluşturulamadı');
    }
  };

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
              {classLabel}
              {dateRange ? ` · ${dateRange}` : ` · ${formatLessonDate(row.lesson_date)}`}
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

            {row.status === 'draft' && animCount > 0 ? (
              <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Animasyon yüklendi ama konu <strong>taslak</strong>. Öğrenciler görmesi için alttan{' '}
                  <strong>«Konuyu öğrencilere yayınla»</strong> demelisiniz.
                </span>
              </div>
            ) : null}

            <div className="mb-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Pencil className="h-3.5 w-3.5" />
                Konuyu düzenle
              </button>
            </div>

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
                    <p className="text-[11px] text-amber-700">Kitap adı + sayfa aralığı (örn. 45-48)</p>
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
                        <p className="text-sm font-medium text-slate-800">
                          {formatEduHomeworkLabel(h)}
                        </p>
                        {h.title && (h.book_name || h.question_range) ? (
                          <p className="text-[11px] text-slate-500 mt-0.5">{h.title}</p>
                        ) : null}
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {h.status === 'published' ? 'Yayında' : 'Taslak'} ·{' '}
                          {h.submissions?.length || 0} teslim
                        </p>
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-3 space-y-2 rounded-lg border border-amber-100 bg-amber-50/20 p-3">
                  <label className="block text-sm">
                    <span className="text-xs font-medium text-amber-900">Kitap adı *</span>
                    <input
                      className="mt-1 w-full rounded-lg border border-amber-200 px-3 py-2 text-sm bg-white focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-300"
                      placeholder="Örn. Classmate 5'li Deneme"
                      list={`edu-book-suggest-${row.id}`}
                      value={hwDraft.book_name}
                      disabled={busy}
                      onChange={(e) =>
                        onHwDraftChange({ ...hwDraft, book_name: e.target.value })
                      }
                    />
                    <datalist id={`edu-book-suggest-${row.id}`}>
                      {bookSuggestions.map((name) => (
                        <option key={name} value={name} />
                      ))}
                    </datalist>
                  </label>
                  <label className="block text-sm">
                    <span className="text-xs font-medium text-amber-900">Sayfa aralığı *</span>
                    <input
                      className="mt-1 w-full rounded-lg border border-amber-200 px-3 py-2 text-sm bg-white focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-300"
                      placeholder="Örn. 45-48 veya 120-135"
                      value={hwDraft.question_range}
                      disabled={busy}
                      onChange={(e) =>
                        onHwDraftChange({ ...hwDraft, question_range: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') onAddHomework();
                      }}
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-xs font-medium text-slate-600">
                      Kısa not (isteğe bağlı)
                    </span>
                    <input
                      className="mt-1 w-full rounded-lg border border-amber-200 px-3 py-2 text-sm bg-white"
                      placeholder="Örn. çift sayfa çözümleri"
                      value={hwDraft.title}
                      disabled={busy}
                      onChange={(e) =>
                        onHwDraftChange({ ...hwDraft, title: e.target.value })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    disabled={
                      busy ||
                      (!hwDraft.book_name.trim() && !hwDraft.title.trim()) ||
                      !hwDraft.question_range.trim()
                    }
                    onClick={onAddHomework}
                    className="w-full rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    Ödevi yayınla
                  </button>
                </div>
              </section>
            </div>

            {row.status === 'active' ? (
              <TeacherEduStudentProgress lessonRowId={row.id} active={expanded} />
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-3">
              {row.status === 'active' ? (
                <button
                  type="button"
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                  onClick={() => void onShareWhatsApp()}
                >
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp grubuna paylaş
                </button>
              ) : null}
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

      <TeacherEduTopicEditModal
        open={editOpen}
        row={row}
        classes={classes}
        busy={busy}
        onClose={() => setEditOpen(false)}
        onSave={async (patch) => {
          await onEdit(patch);
          setEditOpen(false);
        }}
      />
    </div>
  );
}
