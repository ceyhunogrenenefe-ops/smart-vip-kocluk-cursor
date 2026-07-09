import React, { useCallback, useEffect, useState } from 'react';
import { Check, ImageIcon, Loader2, Pencil, Trash2, Video, X } from 'lucide-react';
import { toast } from 'sonner';
import type { EduHomework, EduHomeworkSubmission } from '../../types/eduPanel.types';
import { formatEduHomeworkLabel } from '../../lib/eduPanel/eduHomeworkForm';
import {
  fetchEduHomeworkStats,
  fetchEduHomeworkSubmissions,
  patchEduHomeworkSubmission,
  type EduHomeworkStatsPayload
} from '../../lib/eduPanel/eduPanelApi';
import { statusTone } from '../../lib/eduPanel/eduHomeworkStats';

type Props = {
  open: boolean;
  homework: EduHomework | null;
  onClose: () => void;
  onUpdated?: () => void;
};

export default function EduHomeworkSubmissionsModal({
  open,
  homework,
  onClose,
  onUpdated
}: Props) {
  const [loading, setLoading] = useState(false);
  const [subs, setSubs] = useState<EduHomeworkSubmission[]>([]);
  const [stats, setStats] = useState<EduHomeworkStatsPayload | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [noteMode, setNoteMode] = useState(false);

  const load = useCallback(async () => {
    if (!homework?.id) return;
    setLoading(true);
    try {
      const [data, st] = await Promise.all([
        fetchEduHomeworkSubmissions(homework.id),
        fetchEduHomeworkStats(homework.id).catch(() => null)
      ]);
      setSubs(data);
      setStats(st);
      setSelectedId((prev) => {
        if (prev && data.some((s) => s.id === prev)) return prev;
        return data[0]?.id || null;
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Teslimler yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [homework?.id]);

  useEffect(() => {
    if (open && homework) {
      setSubs([]);
      setStats(null);
      setSelectedId(null);
      setNoteMode(false);
      void load();
    }
  }, [open, homework, load]);

  const selected = subs.find((s) => s.id === selectedId) || subs[0] || null;

  const onApprove = async (sub: EduHomeworkSubmission) => {
    setBusyId(sub.id);
    try {
      const updated = await patchEduHomeworkSubmission(sub.id, { status: 'reviewed' });
      setSubs((prev) => prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)));
      toast.success('Ödev onaylandı');
      onUpdated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Onaylanamadı');
    } finally {
      setBusyId(null);
    }
  };

  const onDeleteMedia = async (sub: EduHomeworkSubmission) => {
    if (!sub.has_media && !(sub.photo_urls?.length || sub.video_url)) {
      toast.message('Bu teslimde medya dosyası yok.');
      return;
    }
    if (!window.confirm('Yüklenen fotoğraf ve video silinsin mi? Teslim kaydı, tarih ve notlar korunur.')) {
      return;
    }
    setBusyId(sub.id);
    try {
      const updated = await patchEduHomeworkSubmission(sub.id, { delete_media: true });
      setSubs((prev) =>
        prev.map((s) =>
          s.id === updated.id
            ? { ...updated, student_name: s.student_name, photo_urls: [], video_url: null, has_media: false }
            : s
        )
      );
      toast.success('Medya dosyaları silindi');
      onUpdated?.();
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Silinemedi');
    } finally {
      setBusyId(null);
    }
  };

  const onSaveNote = async (sub: EduHomeworkSubmission, teacher_note: string, grade: string) => {
    setBusyId(sub.id);
    try {
      const updated = await patchEduHomeworkSubmission(sub.id, {
        teacher_note: teacher_note.trim() || null,
        grade: grade.trim() || null,
        status: 'reviewed'
      });
      setSubs((prev) => prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)));
      toast.success('Geri bildirim kaydedildi');
      setNoteMode(false);
      onUpdated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setBusyId(null);
    }
  };

  if (!open || !homework) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-2 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
      >
        <div className="flex items-start justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Ödev Teslimleri</h3>
            <p className="mt-0.5 text-xs text-slate-500">{formatEduHomeworkLabel(homework)}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {stats ? (
          <div className="grid grid-cols-2 gap-2 border-b border-slate-100 bg-slate-50/80 px-4 py-3 text-[11px] sm:grid-cols-4">
            <div>
              <p className="text-slate-500">Teslim oranı</p>
              <p className="font-bold text-slate-800">%{stats.rate}</p>
            </div>
            <div>
              <p className="text-slate-500">Fotoğraf / Video</p>
              <p className="font-bold text-slate-800">
                {stats.photoCount} / {stats.videoCount}
              </p>
            </div>
            <div>
              <p className="text-slate-500">En erken</p>
              <p className="truncate font-bold text-slate-800">{stats.earliest?.name || '—'}</p>
            </div>
            <div>
              <p className="text-slate-500">Teslim etmeyen</p>
              <p className="font-bold text-slate-800">{stats.missingNames.length}</p>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 gap-0 md:grid-cols-[220px_1fr]">
            <div className="max-h-48 overflow-y-auto border-b border-slate-100 md:max-h-none md:border-b-0 md:border-r">
              {(stats?.roster?.length ? stats.roster : null)?.map((r) => {
                const sub = subs.find(
                  (s) => s.student_id === r.id || s.student_user_id === r.user_id
                );
                const tone = statusTone(r.status);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      if (sub) setSelectedId(sub.id);
                    }}
                    className={`flex w-full flex-col items-start px-3 py-2.5 text-left text-sm ${tone.bg} ${
                      selected?.id === sub?.id ? 'ring-1 ring-inset ring-amber-300' : ''
                    }`}
                  >
                    <span className={`font-medium ${tone.text}`}>{r.name}</span>
                    <span className={`text-[10px] ${tone.text}`}>{tone.label}</span>
                  </button>
                );
              }) ||
                subs.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    className={`flex w-full flex-col items-start px-3 py-2.5 text-left text-sm ${
                      selected?.id === s.id ? 'bg-amber-50 text-amber-900' : 'hover:bg-slate-50'
                    }`}
                  >
                    <span className="font-medium">{s.student_name || 'Öğrenci'}</span>
                    <span className="text-[10px] text-slate-500">
                      {new Date(s.submitted_at).toLocaleString('tr-TR')}
                    </span>
                  </button>
                ))}
              {!stats?.roster?.length && subs.length === 0 ? (
                <p className="px-3 py-8 text-center text-xs text-slate-500">Henüz teslim yok.</p>
              ) : null}
            </div>

            {selected ? (
              <SubmissionDetail
                key={selected.id}
                sub={selected}
                busy={busyId === selected.id}
                noteMode={noteMode}
                onToggleNote={() => setNoteMode((v) => !v)}
                onApprove={() => void onApprove(selected)}
                onDeleteMedia={() => void onDeleteMedia(selected)}
                onSaveNote={(note, grade) => void onSaveNote(selected, note, grade)}
              />
            ) : (
              <p className="p-6 text-sm text-slate-500">Öğrenci seçin veya teslim bekleyin.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SubmissionDetail({
  sub,
  busy,
  noteMode,
  onToggleNote,
  onApprove,
  onDeleteMedia,
  onSaveNote
}: {
  sub: EduHomeworkSubmission;
  busy: boolean;
  noteMode: boolean;
  onToggleNote: () => void;
  onApprove: () => void;
  onDeleteMedia: () => void;
  onSaveNote: (note: string, grade: string) => void;
}) {
  const [note, setNote] = useState(sub.teacher_note || '');
  const [grade, setGrade] = useState(sub.grade || '');
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => {
    setNote(sub.teacher_note || '');
    setGrade(sub.grade || '');
  }, [sub.id, sub.teacher_note, sub.grade]);

  const hasMedia = Boolean(sub.has_media || sub.photo_urls?.length || sub.video_url);

  return (
    <div className="min-h-0 overflow-y-auto p-4 space-y-4">
      {lightboxUrl ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-label="Fotoğraf önizleme"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            onClick={() => setLightboxUrl(null)}
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={lightboxUrl}
            alt=""
            loading="lazy"
            className="max-h-[90vh] max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}

      <div className="rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2 text-xs text-slate-600">
        <p>
          Teslim: <strong>{new Date(sub.submitted_at).toLocaleString('tr-TR')}</strong>
        </p>
        <p className="mt-0.5">
          Durum: <strong>{sub.status === 'reviewed' ? 'Onaylandı' : 'Teslim edildi'}</strong>
        </p>
      </div>

      {hasMedia ? (
        <section className="space-y-3">
          <p className="text-xs font-semibold text-slate-700">Çözüm medyası</p>
          {sub.photo_urls && sub.photo_urls.length > 0 ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {sub.photo_urls.map((url) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => setLightboxUrl(url)}
                  className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
                >
                  <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
                  <span className="absolute bottom-1 right-1 rounded bg-black/50 p-1 text-white opacity-0 group-hover:opacity-100">
                    <ImageIcon className="h-3 w-3" />
                  </span>
                </button>
              ))}
            </div>
          ) : null}
          {sub.video_url ? (
            <video
              src={sub.video_url}
              controls
              playsInline
              preload="metadata"
              className="max-h-64 w-full rounded-lg border border-slate-200 bg-black"
            />
          ) : null}
        </section>
      ) : (
        <p className="text-xs italic text-slate-500">Bu teslimde medya dosyası yok.</p>
      )}

      <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
        <button
          type="button"
          disabled={busy || sub.status === 'reviewed'}
          onClick={onApprove}
          className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" />
          Onayla
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onToggleNote}
          className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-800 hover:bg-violet-100 disabled:opacity-50"
        >
          <Pencil className="h-3.5 w-3.5" />
          Not Yaz
        </button>
        <button
          type="button"
          disabled={busy || !hasMedia}
          onClick={onDeleteMedia}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          Sil
        </button>
      </div>

      {noteMode ? (
        <section className="space-y-2 rounded-xl border border-violet-100 bg-violet-50/40 p-3">
          <input
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            placeholder="Not / puan (isteğe bağlı)"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
          />
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Öğrenciye not"
            rows={3}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => onSaveNote(note, grade)}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {busy ? 'Kaydediliyor…' : 'Notu kaydet'}
          </button>
        </section>
      ) : null}
    </div>
  );
}
