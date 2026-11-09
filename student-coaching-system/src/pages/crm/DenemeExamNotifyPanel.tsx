import { useCallback, useEffect, useMemo, useState } from 'react';
import { BellRing, Loader2, Save, Search, Send } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../../lib/session';

function crmInstitutionScope(): string | null {
  return null;
}

type Settings = {
  enabled: boolean;
  day_before_enabled: boolean;
  soon_enabled: boolean;
  karne_enabled: boolean;
  day_before_time: string;
  default_exam_time: string;
  tpl_day_before: string;
  tpl_soon: string;
  tpl_karne: string;
  test_phone: string;
};

type Target = {
  id?: string;
  kind: 'student' | 'class' | 'grade';
  student_id?: string | null;
  class_id?: string | null;
  grade_level?: string | null;
  label?: string;
};

type ExamOpt = { id: string; title: string; exam_date: string; exam_time: string | null; status: string | null };
type SendRow = {
  id: string;
  student_name: string;
  step: string;
  status: string;
  scheduled_for: string | null;
  error: string | null;
  sent_at: string | null;
};

const STEP_LABEL: Record<string, string> = {
  day_before: '1 gün önce',
  soon: '30 dk önce',
  karne: 'Karne'
};
const STATUS_LABEL: Record<string, string> = {
  pending: 'Bekliyor',
  sending: 'Gönderiliyor',
  sent: 'Gönderildi',
  failed: 'Başarısız',
  skipped: 'Katılmadı',
  cancelled: 'Durduruldu'
};

function scopedUrl(path: string): string {
  const scope = crmInstitutionScope();
  if (!scope) return path;
  return `${path}${path.includes('?') ? '&' : '?'}institution_id=${encodeURIComponent(scope)}`;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(scopedUrl(path), init);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.hint || j?.message || j?.error || 'İstek başarısız');
  return j as T;
}

function fmt(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Istanbul'
  });
}

export default function DenemeExamNotifyPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [targets, setTargets] = useState<Target[]>([]);
  const [exams, setExams] = useState<ExamOpt[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [gaps, setGaps] = useState<string[]>([]);
  const [hint, setHint] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [examId, setExamId] = useState('');
  const [sends, setSends] = useState<SendRow[]>([]);
  const [q, setQ] = useState('');
  const [students, setStudents] = useState<{ id: string; name: string; class_level: string | null }[]>([]);
  const [classes, setClasses] = useState<{ id: string; name: string; class_level: string | null }[]>([]);
  const [grades, setGrades] = useState<{ id: string; label: string }[]>([]);
  const [testStep, setTestStep] = useState('day_before');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await api<{
        schema_missing?: boolean;
        hint?: string;
        settings: Settings;
        targets: Target[];
        exams: ExamOpt[];
        counts: Record<string, number>;
        gaps: string[];
      }>('/api/deneme-exam-notify');
      setSettings(j.settings);
      setTargets(j.targets || []);
      setExams(j.exams || []);
      setCounts(j.counts || {});
      setGaps(j.gaps || []);
      setHint(j.schema_missing ? j.hint || '' : '');
      setExamId((cur) => cur || j.exams?.[0]?.id || '');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Deneme bildirimi yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!examId) return;
    void api<{ data: SendRow[] }>(`/api/deneme-exam-notify?op=sends&exam_id=${encodeURIComponent(examId)}`)
      .then((j) => setSends(j.data || []))
      .catch(() => setSends([]));
  }, [examId, counts]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const query = q.trim();
      void api<{ students: typeof students; classes: typeof classes; grades: typeof grades }>(
        `/api/deneme-exam-notify?op=directory&q=${encodeURIComponent(query)}`
      )
        .then((j) => {
          setStudents(j.students || []);
          setClasses(j.classes || []);
          setGrades(j.grades || []);
        })
        .catch(() => {});
    }, 250);
    return () => window.clearTimeout(t);
  }, [q]);

  const className = useMemo(() => new Map(classes.map((c) => [c.id, c.name])), [classes]);
  const gradeName = useMemo(() => new Map(grades.map((g) => [g.id, g.label])), [grades]);

  function patch<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((s) => (s ? { ...s, [key]: value } : s));
  }

  function addTarget(next: Target) {
    setTargets((list) => {
      const key = `${next.kind}:${next.student_id || next.class_id || next.grade_level}`;
      if (list.some((t) => `${t.kind}:${t.student_id || t.class_id || t.grade_level}` === key)) return list;
      return [...list, next];
    });
  }

  async function saveAll() {
    if (!settings) return;
    setSaving(true);
    try {
      await api('/api/deneme-exam-notify?op=save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings })
      });
      await api('/api/deneme-exam-notify?op=targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targets: targets.map((t) => ({
            kind: t.kind,
            student_id: t.student_id,
            class_id: t.class_id,
            grade_level: t.grade_level
          }))
        })
      });
      await api('/api/deneme-exam-notify?op=sync', { method: 'POST' });
      toast.success(settings.enabled ? 'Otomasyon açık. Zamanı gelen mesajlar gönderilmeye başlar.' : 'Ayarlar kaydedildi. Gerçek gönderim kapalı.');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    if (!settings?.test_phone) {
      toast.error('Önce test telefonunu yazıp kaydedin.');
      return;
    }
    setSaving(true);
    try {
      await api('/api/deneme-exam-notify?op=save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings })
      });
      const j = await api<{ ok: boolean; error?: string }>('/api/deneme-exam-notify?op=test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: testStep, phone: settings.test_phone })
      });
      if (!j.ok) toast.error(j.error || 'Test mesajı gitmedi');
      else toast.success('Test mesajı gönderildi. Öğrenci kuyruğuna yazılmadı.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Test gönderilemedi');
    } finally {
      setSaving(false);
    }
  }

  async function retry(id: string) {
    try {
      await api('/api/deneme-exam-notify?op=retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      toast.success('Başarısız satır yeniden beklemeye alındı.');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Yeniden deneme kaydedilemedi');
    }
  }

  if (loading && !settings) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Deneme bildirimi yükleniyor
        </p>
      </section>
    );
  }
  if (!settings) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <BellRing className="h-5 w-5 text-emerald-600" />
            Deneme Kulübü sınav bildirimleri
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Seçili öğrencilere sınavdan bir gün önce ve 30 dakika önce mesaj gider. Sonuç karnesi yalnız o sınava katılan öğrenciye gider.
            Gerçek gönderimler anahtar açılınca başlar. Saatler Türkiye saatidir.
          </p>
        </div>
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800">
          <input type="checkbox" checked={settings.enabled} onChange={(e) => patch('enabled', e.target.checked)} />
          Otomasyon açık
        </label>
      </div>

      {hint && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">{hint}</p>}

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={settings.day_before_enabled} onChange={(e) => patch('day_before_enabled', e.target.checked)} />
          1 gün önce
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={settings.soon_enabled} onChange={(e) => patch('soon_enabled', e.target.checked)} />
          30 dakika önce
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={settings.karne_enabled} onChange={(e) => patch('karne_enabled', e.target.checked)} />
          Sonuç karnesi
        </label>
        <label className="text-sm text-slate-700">
          Bir gün önceki saat
          <input
            type="time"
            value={settings.day_before_time}
            onChange={(e) => patch('day_before_time', e.target.value)}
            className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="text-sm text-slate-700">
          Varsayılan sınav saati
          <input
            type="time"
            value={settings.default_exam_time}
            onChange={(e) => patch('default_exam_time', e.target.value)}
            className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="text-sm text-slate-700">
          Test telefonu
          <input
            value={settings.test_phone}
            onChange={(e) => patch('test_phone', e.target.value)}
            placeholder="05xx"
            className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2"
          />
        </label>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <textarea value={settings.tpl_day_before} onChange={(e) => patch('tpl_day_before', e.target.value)} rows={5} className="rounded-xl border border-slate-300 p-3 text-sm" />
        <textarea value={settings.tpl_soon} onChange={(e) => patch('tpl_soon', e.target.value)} rows={5} className="rounded-xl border border-slate-300 p-3 text-sm" />
        <textarea value={settings.tpl_karne} onChange={(e) => patch('tpl_karne', e.target.value)} rows={5} className="rounded-xl border border-slate-300 p-3 text-sm" />
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Değişkenler: {'{{ogrenci}} {{sinav_adi}} {{tarih}} {{saat}} {{bolum}} {{link}} {{karne_link}}'}
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Öğrenci ara (en az 2 harf)"
              className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-3 text-sm"
            />
          </div>
          <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
            {students.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => addTarget({ kind: 'student', student_id: s.id, label: s.name })}
                className="block w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50"
              >
                {s.name}
                <span className="ml-2 text-xs text-slate-400">{s.class_level || ''}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {classes.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => addTarget({ kind: 'class', class_id: c.id, label: c.name })}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:border-emerald-400"
              >
                Sınıf: {c.name}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {grades.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => addTarget({ kind: 'grade', grade_level: g.id, label: g.label })}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:border-emerald-400"
              >
                Kademe: {g.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-sm font-medium text-slate-800">Seçilenler</p>
          <ul className="mt-2 space-y-1">
            {targets.length === 0 && <li className="text-sm text-slate-500">Henüz öğrenci, sınıf veya kademe seçilmedi.</li>}
            {targets.map((t, i) => {
              const label =
                t.label ||
                (t.kind === 'class' ? className.get(String(t.class_id)) : t.kind === 'grade' ? gradeName.get(String(t.grade_level)) : t.student_id) ||
                'Seçim';
              return (
                <li key={`${t.kind}-${i}`} className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1.5 text-sm">
                  <span>
                    {t.kind === 'student' ? 'Öğrenci' : t.kind === 'class' ? 'Sınıf' : 'Kademe'}: {label}
                  </span>
                  <button type="button" className="text-xs text-rose-600" onClick={() => setTargets((list) => list.filter((_, idx) => idx !== i))}>
                    Çıkar
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-slate-500">Aynı öğrenci birden fazla seçimde olsa da bir kez mesaj alır.</p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => void saveAll()}
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Kaydet
        </button>
        <select value={testStep} onChange={(e) => setTestStep(e.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
          <option value="day_before">Test: 1 gün önce</option>
          <option value="soon">Test: 30 dk önce</option>
          <option value="karne">Test: karne</option>
        </select>
        <button
          type="button"
          onClick={() => void sendTest()}
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          <Send className="h-4 w-4" />
          Test gönder
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        {Object.entries(STATUS_LABEL).map(([key, label]) => (
          <span key={key} className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
            {label}: {counts[key] || 0}
          </span>
        ))}
      </div>

      <div className="mt-3">
        <select value={examId} onChange={(e) => setExamId(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm sm:max-w-md">
          {exams.length === 0 && <option value="">Bu aralıkta deneme yok</option>}
          {exams.map((exam) => (
            <option key={exam.id} value={exam.id}>
              {exam.exam_date?.slice(0, 10)} · {exam.title}
              {exam.status === 'yapilmadi' ? ' · iptal' : ''}
            </option>
          ))}
        </select>
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="px-2 py-2">Öğrenci</th>
                <th className="px-2 py-2">Adım</th>
                <th className="px-2 py-2">Durum</th>
                <th className="px-2 py-2">Plan</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {sends.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-2 py-3 text-slate-500">
                    Bu sınav için kayıt yok. Kaydet, kuyruğu günceller.
                  </td>
                </tr>
              )}
              {sends.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-2 py-2">{row.student_name}</td>
                  <td className="px-2 py-2">{STEP_LABEL[row.step] || row.step}</td>
                  <td className="px-2 py-2" title={row.error || ''}>
                    {STATUS_LABEL[row.status] || row.status}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-slate-500">{fmt(row.scheduled_for)}</td>
                  <td className="px-2 py-2 text-right">
                    {row.status === 'failed' && (
                      <button type="button" className="text-xs font-semibold text-emerald-700" onClick={() => void retry(row.id)}>
                        Yeniden dene
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {gaps.length > 0 && (
        <ul className="mt-4 space-y-1 rounded-xl bg-amber-50 p-3 text-xs text-amber-950">
          {gaps.map((gap) => (
            <li key={gap}>{gap}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
