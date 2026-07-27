import React, { useEffect, useMemo, useState } from 'react';
import { BookMarked, History, Loader2, MapPin, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  AppModal,
  AppModalBody,
  AppModalFooter,
  AppModalHeader
} from '../ui/AppModal';
import {
  ClassLessonTopicCheckpoint,
  fetchTopicCheckpointHistory,
  formatCheckpointSummary,
  trendLabel,
  upsertTopicCheckpoint
} from '../../lib/classLessonTopicCheckpointApi';
import { toast } from 'sonner';

export type TopicCheckpointSessionContext = {
  id: string;
  class_id: string;
  subject: string;
  lesson_date: string;
  teacher_id: string;
  class_level?: string | null;
  class_name?: string | null;
};

function buildClassSubjectTitle(ctx: TopicCheckpointSessionContext): string {
  const level = String(ctx.class_level || '').trim();
  const sub = String(ctx.subject || '').trim();
  if (level && sub) return `${level}. Sınıf ${sub}`;
  if (level) return `${level}. Sınıf`;
  return sub || 'Grup dersi';
}

type Props = {
  open: boolean;
  onClose: () => void;
  session: TopicCheckpointSessionContext | null;
  initialCheckpoint?: ClassLessonTopicCheckpoint | null;
  onSaved?: (row: ClassLessonTopicCheckpoint) => void;
};

export default function ClassLessonTopicCheckpointModal({
  open,
  onClose,
  session,
  initialCheckpoint,
  onSaved
}: Props) {
  const { getTopicsByClass } = useApp();
  const [topic, setTopic] = useState('');
  const [subTopic, setSubTopic] = useState('');
  const [bookName, setBookName] = useState('');
  const [pageNumber, setPageNumber] = useState('');
  const [note, setNote] = useState('');
  const [editId, setEditId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<ClassLessonTopicCheckpoint[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const classLevelKey = useMemo(() => {
    const raw = String(session?.class_level || '').trim();
    if (!raw) return session?.class_name || '';
    return raw;
  }, [session]);

  const topicPool = useMemo(() => {
    const subject = String(session?.subject || '').trim();
    const byClass = getTopicsByClass(classLevelKey);
    const list = byClass?.[subject] || byClass?.regular || [];
    return Array.isArray(list) ? list : [];
  }, [getTopicsByClass, classLevelKey, session?.subject]);

  useEffect(() => {
    if (!open || !session) return;
    const cp = initialCheckpoint;
    setTopic(cp?.topic || '');
    setSubTopic(cp?.sub_topic || '');
    setBookName(cp?.book_name || '');
    setPageNumber(cp?.page_number || '');
    setNote(cp?.note || '');
    setEditId(cp?.id);
    setHistoryOpen(false);
  }, [open, session, initialCheckpoint]);

  const loadHistory = async () => {
    if (!session) return;
    setHistoryLoading(true);
    try {
      const rows = await fetchTopicCheckpointHistory(session.class_id, session.subject, 30);
      setHistory(rows);
      setHistoryOpen(true);
    } finally {
      setHistoryLoading(false);
    }
  };

  const applyHistoryRow = (row: ClassLessonTopicCheckpoint) => {
    setEditId(row.id);
    setTopic(row.topic || '');
    setSubTopic(row.sub_topic || '');
    setBookName(row.book_name || '');
    setPageNumber(row.page_number || '');
    setNote(row.note || '');
    setHistoryOpen(false);
  };

  const save = async () => {
    if (!session) return;
    const trimmedTopic = topic.trim();
    if (!trimmedTopic) {
      toast.error('Konu alanı zorunludur');
      return;
    }
    setBusy(true);
    try {
      const classLabel = buildClassSubjectTitle(session);
      const result = await upsertTopicCheckpoint({
        id: editId,
        class_session_id: session.id,
        class_id: session.class_id,
        teacher_id: session.teacher_id,
        subject: session.subject,
        lesson_date: session.lesson_date,
        class_label: classLabel,
        topic: trimmedTopic,
        sub_topic: subTopic.trim() || undefined,
        book_name: bookName.trim() || undefined,
        page_number: pageNumber.trim() || undefined,
        note: note.trim() || undefined
      });
      if (!result.ok || !result.data) {
        toast.error(result.error || 'Kayıt yapılamadı');
        return;
      }
      toast.success('Nerede kaldığınız kaydedildi');
      onSaved?.(result.data);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  if (!open || !session) return null;

  const title = buildClassSubjectTitle(session);

  return (
    <AppModal open onClose={busy ? () => undefined : onClose} panelClassName="max-w-lg">
      <AppModalHeader>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
            <MapPin className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-slate-900">Nerede Kaldım?</h3>
            <p className="text-sm text-slate-600">{title}</p>
            <p className="text-xs text-slate-500">
              {session.lesson_date} · Ders sonu kaydı
            </p>
          </div>
        </div>
        <button
          type="button"
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
          onClick={onClose}
          disabled={busy}
        >
          <X className="h-5 w-5" />
        </button>
      </AppModalHeader>
      <AppModalBody className="space-y-3">
        {historyOpen ? (
          <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800">Geçmiş kayıtlar</p>
              <button
                type="button"
                className="text-xs font-medium text-indigo-600"
                onClick={() => setHistoryOpen(false)}
              >
                Kapat
              </button>
            </div>
            {history.length === 0 ? (
              <p className="text-sm text-slate-500">Henüz kayıt yok.</p>
            ) : (
              history.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => applyHistoryRow(row)}
                  className="w-full rounded-lg border border-white bg-white px-3 py-2 text-left text-sm shadow-sm hover:border-indigo-200"
                >
                  <p className="font-medium text-slate-800">{formatCheckpointSummary(row)}</p>
                  <p className="text-xs text-slate-500">
                    {row.lesson_date} · {trendLabel(row.progress_trend)}
                  </p>
                </button>
              ))
            )}
          </div>
        ) : (
          <>
            <label className="block text-sm font-medium text-slate-700">
              Konu <span className="text-red-500">*</span>
              <input
                list="cltc-topic-pool"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                placeholder="Örn. Üslü sayılar"
              />
              <datalist id="cltc-topic-pool">
                {topicPool.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Alt konu
              <input
                value={subTopic}
                onChange={(e) => setSubTopic(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                placeholder="İsteğe bağlı"
              />
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                <span className="inline-flex items-center gap-1">
                  <BookMarked className="h-3.5 w-3.5" />
                  Kitap
                </span>
                <input
                  value={bookName}
                  onChange={(e) => setBookName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  placeholder="Kaynak adı"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Sayfa
                <input
                  value={pageNumber}
                  onChange={(e) => setPageNumber(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  placeholder="Örn. 42 veya 40-45"
                  inputMode="numeric"
                />
              </label>
            </div>
            <label className="block text-sm font-medium text-slate-700">
              Not
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                placeholder="Kısa açıklama (isteğe bağlı)"
              />
            </label>
          </>
        )}
      </AppModalBody>
      <AppModalFooter className="flex flex-col gap-2 sm:flex-row sm:justify-between">
        <button
          type="button"
          disabled={historyLoading || busy}
          onClick={() => void loadHistory()}
          className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          {historyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <History className="h-4 w-4" />}
          Geçmiş / düzenle
        </button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="min-h-[44px] rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Daha sonra
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy}
            className="min-h-[44px] rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      </AppModalFooter>
    </AppModal>
  );
}

export { buildClassSubjectTitle };
