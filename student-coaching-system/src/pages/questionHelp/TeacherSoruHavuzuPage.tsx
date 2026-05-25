import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle, Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import TeacherQuestionProfileFields from '../../components/questionHelp/TeacherQuestionProfileFields';
import {
  claimQuestion,
  fetchTeacherPool,
  fetchTeacherQuestionProfile,
  saveTeacherQuestionProfile,
  submitSolution,
  fetchTeacherStats
} from '../../lib/questionHelp/questionHelpApi';
import { QUESTION_GRADE_OPTIONS, teacherProfileMatchesQuestionLocal } from '../../lib/questionHelp/subjects';
import type { QuestionRow } from '../../lib/questionHelp/types';
import { useQuestionRealtime } from '../../lib/questionHelp/useQuestionRealtime';
import { compressQuestionImage, fileToBase64 } from '../../lib/questionHelp/compressImage';

type Tab = 'pool' | 'mine' | 'solved';

export default function TeacherSoruHavuzuPage() {
  const [tab, setTab] = useState<Tab>('pool');
  const [filterGrade, setFilterGrade] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [rows, setRows] = useState<QuestionRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<QuestionRow | null>(null);
  const [solveText, setSolveText] = useState('');
  const [solveFile, setSolveFile] = useState<File | null>(null);
  const [profile, setProfile] = useState({ branches: [] as string[], grades: [] as string[] });
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    void fetchTeacherQuestionProfile()
      .then(setProfile)
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    try {
      const scope = tab === 'pool' ? 'pool' : tab === 'mine' ? 'mine' : 'solved';
      const data = await fetchTeacherPool({
        scope,
        grade: filterGrade || undefined,
        subject: filterSubject || undefined
      });
      const scoped =
        tab === 'pool'
          ? profile.branches.length && profile.grades.length
            ? data.filter((q) =>
                teacherProfileMatchesQuestionLocal(profile, q.subject, q.grade)
              )
            : []
          : data;
      setRows(scoped);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Liste alınamadı');
    }
  }, [tab, filterGrade, filterSubject, profile.branches, profile.grades]);

  useEffect(() => {
    void load();
  }, [load]);

  useQuestionRealtime(() => {
    void load();
  });

  useEffect(() => {
    void fetchTeacherStats().then(setStats).catch(() => {});
  }, []);

  const onClaim = async (q: QuestionRow) => {
    setBusyId(q.id);
    try {
      const row = await claimQuestion(q.id);
      toast.success('Soru size atandı.');
      setSelected(row);
      setTab('mine');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Alınamadı (başka öğretmen almış olabilir)');
    } finally {
      setBusyId(null);
    }
  };

  const onSolve = async () => {
    if (!selected) return;
    setBusyId(selected.id);
    try {
      let solved_image_base64: string | undefined;
      if (solveFile) {
        const blob = await compressQuestionImage(solveFile);
        solved_image_base64 = await fileToBase64(blob);
      }
      await submitSolution(selected.id, {
        solved_text: solveText.trim() || undefined,
        solved_image_base64,
        solved_image_mime: 'image/jpeg'
      });
      toast.success('Çözüm öğrenciye iletildi.');
      setSelected(null);
      setSolveText('');
      setSolveFile(null);
      setTab('solved');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gönderilemedi');
    } finally {
      setBusyId(null);
    }
  };

  const saveProfile = async () => {
    try {
      await saveTeacherQuestionProfile({
        branches: profile.branches,
        grades: profile.grades
      });
      const fresh = await fetchTeacherQuestionProfile();
      setProfile(fresh);
      toast.success('Branş ve sınıflar kaydedildi.');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi');
    }
  };

  const tabLabel = useMemo(
    () =>
      ({
        pool: 'Bekleyen Sorular',
        mine: 'Çözdüğüm / Üzerimde',
        solved: 'Çözülmüş'
      }) as Record<Tab, string>,
    []
  );

  const profileIncomplete = !profile.branches.length || !profile.grades.length;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Soru Havuzu</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Yalnızca tanımlı branş ve sınıf/sınav grubundaki soruları görürsünüz. Bir soruyu aldığınızda diğer
          öğretmenler göremez.
        </p>
        {stats ? (
          <p className="mt-1 text-xs text-slate-500">
            Çözülen: {String(stats.solved_count ?? 0)} · Alınan: {String(stats.claimed_count ?? 0)}
          </p>
        ) : null}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <p className="text-sm text-amber-800 dark:text-amber-200 mb-2">
          Branş ve sınıf ataması yönetici tarafından Kullanıcı Yönetimi üzerinden de yapılabilir. Aşağıdan kendi
          profilinizi güncelleyebilirsiniz.
        </p>
        <TeacherQuestionProfileFields value={profile} onChange={setProfile} />
        <button
          type="button"
          className="mt-3 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900"
          onClick={() => void saveProfile()}
        >
          Kaydet
        </button>
        {profileIncomplete ? (
          <p className="mt-2 text-xs text-amber-700">Havuz için en az bir branş ve bir sınıf seçin.</p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2 dark:border-slate-700">
        {(['pool', 'mine', 'solved'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === t
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
            }`}
          >
            {tabLabel[t]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          value={filterGrade}
          onChange={(e) => setFilterGrade(e.target.value)}
          className="rounded-lg border px-2 py-1 text-sm dark:bg-slate-900 dark:border-slate-700"
        >
          <option value="">Tüm sınıflar</option>
          {QUESTION_GRADE_OPTIONS.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </select>
        <select
          value={filterSubject}
          onChange={(e) => setFilterSubject(e.target.value)}
          className="rounded-lg border px-2 py-1 text-sm dark:bg-slate-900 dark:border-slate-700"
        >
          <option value="">Tüm branşlar</option>
          {profile.branches.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>

      {tab === 'pool' && profileIncomplete ? (
        <p className="text-sm text-amber-700 rounded-lg border border-amber-200 bg-amber-50 p-3">
          Soru havuzunu görmek için branş ve sınıf tanımlayın veya yöneticinizden atama isteyin.
        </p>
      ) : null}

      <div className="space-y-3">
        {rows.map((q) => (
          <div
            key={q.id}
            className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-slate-900 dark:text-slate-50">
                  {q.subject} · {q.grade}
                  {q.topic ? ` · ${q.topic}` : ''}
                </p>
                <p className="text-xs text-slate-500">{new Date(q.created_at).toLocaleString('tr-TR')}</p>
              </div>
              <span className="text-xs rounded-full bg-slate-100 px-2 py-0.5 dark:bg-slate-800">{q.status}</span>
            </div>
            {q.image_url ? (
              <img src={q.image_url} alt="Soru" className="mt-2 max-h-48 rounded-lg object-contain" />
            ) : null}
            {q.description ? <p className="mt-2 text-sm text-slate-600">{q.description}</p> : null}
            {tab === 'pool' && q.status === 'waiting' ? (
              <button
                type="button"
                disabled={busyId === q.id}
                onClick={() => void onClaim(q)}
                className="mt-3 inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busyId === q.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                Soruyu al
              </button>
            ) : null}
            {(tab === 'mine' && q.claimed_by) || selected?.id === q.id ? (
              <button
                type="button"
                className="mt-2 text-sm text-violet-600 underline"
                onClick={() => setSelected(q)}
              >
                Çözüm gönder
              </button>
            ) : null}
          </div>
        ))}
        {!rows.length && !profileIncomplete ? (
          <p className="text-sm text-slate-500 text-center py-8">Kayıt yok.</p>
        ) : null}
      </div>

      {selected ? (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 dark:bg-slate-900 space-y-3">
            <h3 className="font-semibold">Çözüm gönder</h3>
            <textarea
              value={solveText}
              onChange={(e) => setSolveText(e.target.value)}
              rows={4}
              className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700"
              placeholder="Açıklama (isteğe bağlı)"
            />
            <input type="file" accept="image/*" onChange={(e) => setSolveFile(e.target.files?.[0] || null)} />
            <div className="flex gap-2 justify-end">
              <button type="button" className="px-3 py-1.5 text-sm" onClick={() => setSelected(null)}>
                İptal
              </button>
              <button
                type="button"
                disabled={busyId === selected.id}
                onClick={() => void onSolve()}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white"
              >
                {busyId === selected.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4" />
                )}
                Gönder
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
