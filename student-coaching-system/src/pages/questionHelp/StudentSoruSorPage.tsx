import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Camera, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { subjectsForGrade, QUESTION_GRADE_OPTIONS, gradeGroupLabel } from '../../lib/questionHelp/subjects';
import { compressQuestionImage, fileToBase64 } from '../../lib/questionHelp/compressImage';
import {
  cancelQuestion,
  createQuestion,
  fetchMyQuestions,
  rateQuestion
} from '../../lib/questionHelp/questionHelpApi';
import { useAuth } from '../../context/AuthContext';
import type { QuestionRow } from '../../lib/questionHelp/types';
import { useQuestionRealtime } from '../../lib/questionHelp/useQuestionRealtime';

const STATUS_LABEL: Record<string, string> = {
  waiting: 'Bekliyor',
  claimed: 'Öğretmen aldı',
  solving: 'Çözülüyor',
  solved: 'Çözüldü',
  cancelled: 'İptal'
};

export default function StudentSoruSorPage() {
  const { linkedStudent, linkedStudentLoading, linkedStudentError } = useAuth();
  const [grade, setGrade] = useState('9');
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<QuestionRow[]>([]);

  const subjects = useMemo(() => subjectsForGrade(grade), [grade]);

  const reload = useCallback(async () => {
    try {
      const rows = await fetchMyQuestions();
      setList(rows);
    } catch (e) {
      console.warn(e);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useQuestionRealtime(
    () => {
      void reload();
    },
    true,
    { studentId: linkedStudent?.id ?? null }
  );

  useEffect(() => {
    if (!subjects.includes(subject)) setSubject(subjects[0] || '');
  }, [subjects, subject]);

  const onFile = (f: File | null) => {
    setFile(f);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(f ? URL.createObjectURL(f) : null);
  };

  const submit = async () => {
    if (!file || !subject || !grade) {
      toast.error('Fotoğraf, sınıf ve ders zorunludur.');
      return;
    }
    setBusy(true);
    try {
      const compressed = await compressQuestionImage(file);
      const base64 = await fileToBase64(compressed);
      await createQuestion({
        subject,
        grade,
        topic: topic.trim() || undefined,
        description: description.trim() || undefined,
        image_base64: base64,
        image_mime: 'image/jpeg'
      });
      toast.success('Sorunuz öğretmen havuzuna gönderildi.');
      setDescription('');
      setTopic('');
      onFile(null);
      void reload();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Gönderilemedi';
      if (msg.includes('student_profile_missing')) {
        toast.error(
          'Öğrenci profiliniz bağlı değil. Çıkış yapıp tekrar giriş yapın veya koçunuzla iletişime geçin.'
        );
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Soru Sor</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Çözemediğiniz sorunun fotoğrafını yükleyin; branş öğretmeni havuzdan alıp çözecek.
        </p>
        {linkedStudentError ? (
          <p className="mt-2 text-sm text-amber-800 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-200">
            {linkedStudentError} Çıkış yapıp tekrar giriş yapmayı deneyin.
          </p>
        ) : null}
        {linkedStudentLoading ? (
          <p className="mt-1 text-xs text-slate-500">Profil kontrol ediliyor…</p>
        ) : null}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Sınıf / Grup</span>
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
            >
              {QUESTION_GRADE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Ders</span>
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            >
              {subjects.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-sm">
          <span className="font-medium">Konu (isteğe bağlı)</span>
          <input
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Örn. Üslü sayılar"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Açıklama</span>
          <textarea
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <div>
          <span className="text-sm font-medium">Soru fotoğrafı</span>
          <label className="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 p-6 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800">
            <Camera className="h-8 w-8 text-slate-400" />
            <span className="mt-2 text-sm text-slate-500">Galeri veya kamera</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0] || null)}
            />
          </label>
          {preview ? (
            <img src={preview} alt="Önizleme" className="mt-3 max-h-64 rounded-lg border object-contain" />
          ) : null}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Soruyu gönder
        </button>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Sorularım</h2>
        {list.length === 0 ? (
          <p className="text-sm text-slate-500">Henüz soru yok.</p>
        ) : (
          list.map((q) => (
            <div
              key={q.id}
              className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-800 dark:text-slate-100">
                    {q.subject} · {gradeGroupLabel(q.grade)}
                  </p>
                  <p className="text-xs text-slate-500">{STATUS_LABEL[q.status] || q.status}</p>
                </div>
                {q.status === 'waiting' ? (
                  <button
                    type="button"
                    className="text-xs text-red-600 hover:underline"
                    onClick={() =>
                      void cancelQuestion(q.id)
                        .then(reload)
                        .catch((e) => toast.error(String(e)))
                    }
                  >
                    İptal
                  </button>
                ) : null}
              </div>
              {q.image_url ? (
                <img src={q.image_url} alt="" className="mt-3 max-h-40 rounded-lg object-contain" />
              ) : null}
              {q.status === 'solved' && (
                <div className="mt-3 space-y-2 border-t pt-3 text-sm">
                  {q.solved_text ? <p>{q.solved_text}</p> : null}
                  {q.solved_image_url ? (
                    <img src={q.solved_image_url} alt="Çözüm" className="max-h-48 rounded-lg" />
                  ) : null}
                  {q.solved_video_url ? (
                    <a href={q.solved_video_url} className="text-blue-600 underline" target="_blank" rel="noreferrer">
                      Video çözüm
                    </a>
                  ) : null}
                  {!q.satisfaction_rating ? (
                    <div className="flex gap-2 pt-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          className="rounded border px-2 py-0.5 text-xs hover:bg-amber-50"
                          onClick={() =>
                            void rateQuestion(q.id, n)
                              .then(reload)
                              .catch((e) => toast.error(String(e)))
                          }
                        >
                          {n}★
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">Puanınız: {q.satisfaction_rating}/5</p>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
