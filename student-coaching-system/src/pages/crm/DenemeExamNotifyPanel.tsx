import { useCallback, useEffect, useMemo, useState } from 'react';
import { BellRing, ChevronDown, Loader2, Save, Send } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../../lib/session';
import { crmInstitutionScope } from '../../lib/crmInboxApi';

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
  source_class_id?: string | null;
  enabled?: boolean;
  day_before_enabled?: boolean;
  soon_enabled?: boolean;
  karne_enabled?: boolean;
  join_link?: string | null;
  label?: string;
};

type ClassOpt = {
  id: string;
  name: string;
  class_level: string | null;
  program_id?: string | null;
  program_name?: string;
  join_link?: string;
};
type ProgramOpt = { id: string; name: string };
type StudentOpt = { id: string; name: string; class_level: string | null };

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

function classLevelKey(cls: ClassOpt): string {
  const raw = String(cls.class_level || '').trim();
  if (raw) return raw.toLocaleLowerCase('tr-TR');
  const match = String(cls.name || '').match(/(?:^|[^\d])(\d{1,2})(?:\s|[.\-/]|$)/);
  return match ? match[1] : '';
}

function reminderText(row: Target): string {
  const parts = [
    row.day_before_enabled !== false ? '1 gün önce' : '',
    row.soon_enabled !== false ? '30 dk önce' : '',
    row.karne_enabled !== false ? 'karne' : ''
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'hiçbiri';
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
  const [open, setOpen] = useState(false);
  const [programId, setProgramId] = useState('');
  const [pickClassId, setPickClassId] = useState('');
  const [levelKey, setLevelKey] = useState('');
  const [classes, setClasses] = useState<ClassOpt[]>([]);
  const [programs, setPrograms] = useState<ProgramOpt[]>([]);
  const [roster, setRoster] = useState<Record<string, StudentOpt[]>>({});
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
    const ids = [...new Set(targets.filter((t) => t.kind === 'class' && t.class_id).map((t) => String(t.class_id)))];
    for (const id of ids) {
      if (roster[id]) continue;
      void api<{ students: StudentOpt[] }>(`/api/deneme-exam-notify?op=directory&class_id=${encodeURIComponent(id)}`)
        .then((j) => setRoster((cur) => (cur[id] ? cur : { ...cur, [id]: j.students || [] })))
        .catch(() => {});
    }
  }, [targets, roster]);

  useEffect(() => {
    if (!examId) return;
    void api<{ data: SendRow[] }>(`/api/deneme-exam-notify?op=sends&exam_id=${encodeURIComponent(examId)}`)
      .then((j) => setSends(j.data || []))
      .catch(() => setSends([]));
  }, [examId, counts]);

  useEffect(() => {
    void api<{ classes: ClassOpt[]; programs: ProgramOpt[] }>('/api/deneme-exam-notify?op=directory')
      .then((j) => {
        setClasses(j.classes || []);
        setPrograms(j.programs || []);
      })
      .catch(() => {});
  }, []);

  const filteredClasses = useMemo(
    () => classes.filter((c) => !programId || String(c.program_id || '') === programId),
    [classes, programId]
  );
  const levels = useMemo(() => {
    const set = new Set(filteredClasses.map(classLevelKey).filter(Boolean));
    return [...set].sort((a, b) => a.localeCompare(b, 'tr', { numeric: true }));
  }, [filteredClasses]);
  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);

  function patch<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((s) => (s ? { ...s, [key]: value } : s));
  }

  function patchClass(classId: string, patchRow: Partial<Target>) {
    setTargets((list) => list.map((t) => (t.kind === 'class' && t.class_id === classId ? { ...t, ...patchRow } : t)));
  }

  async function addClass(classId: string) {
    const cls = classById.get(classId);
    if (!cls) return;
    let people = roster[classId];
    if (!people) {
      const j = await api<{ students: StudentOpt[] }>(
        `/api/deneme-exam-notify?op=directory&class_id=${encodeURIComponent(classId)}`
      );
      people = j.students || [];
      setRoster((cur) => ({ ...cur, [classId]: people }));
    }
    setTargets((list) => {
      if (list.some((t) => t.kind === 'class' && t.class_id === classId)) return list;
      const classRow: Target = {
        kind: 'class',
        class_id: classId,
        label: cls.name,
        enabled: true,
        day_before_enabled: true,
        soon_enabled: true,
        karne_enabled: true,
        join_link: cls.join_link || ''
      };
      const studentRows: Target[] = people.map((s) => ({
        kind: 'student',
        student_id: s.id,
        source_class_id: classId,
        label: s.name
      }));
      return [...list, classRow, ...studentRows];
    });
    setPickClassId('');
  }

  async function loadPeople(classId: string): Promise<StudentOpt[]> {
    if (roster[classId]) return roster[classId];
    const j = await api<{ students: StudentOpt[] }>(
      `/api/deneme-exam-notify?op=directory&class_id=${encodeURIComponent(classId)}`
    );
    const people = j.students || [];
    setRoster((cur) => (cur[classId] ? cur : { ...cur, [classId]: people }));
    return people;
  }

  async function applyLevel(preset: 'all' | 'karne' | 'reminders') {
    const flags =
      preset === 'karne'
        ? { enabled: true, day_before_enabled: false, soon_enabled: false, karne_enabled: true }
        : preset === 'reminders'
          ? { enabled: true, day_before_enabled: true, soon_enabled: true, karne_enabled: false }
          : { enabled: true, day_before_enabled: true, soon_enabled: true, karne_enabled: true };
    const matches = filteredClasses.filter((c) => classLevelKey(c) === levelKey);
    if (!matches.length) {
      toast.error('Bu seviyede sınıf yok.');
      return;
    }
    const peopleByClass: Record<string, StudentOpt[]> = {};
    for (const cls of matches) peopleByClass[cls.id] = await loadPeople(cls.id);
    setTargets((list) => {
      const next = [...list];
      for (const cls of matches) {
        const idx = next.findIndex((t) => t.kind === 'class' && t.class_id === cls.id);
        if (idx >= 0) next[idx] = { ...next[idx], ...flags };
        else {
          next.push({
            kind: 'class',
            class_id: cls.id,
            label: cls.name,
            join_link: cls.join_link || '',
            ...flags
          });
          for (const student of peopleByClass[cls.id] || []) {
            next.push({ kind: 'student', student_id: student.id, source_class_id: cls.id, label: student.name });
          }
        }
      }
      return next;
    });
    toast.success(`${matches.length} sınıfa hatırlatma ayarı yazıldı. Kaydetmeyi unutmayın.`);
  }

  function removeClass(classId: string) {
    setTargets((list) => list.filter((t) => t.class_id !== classId && t.source_class_id !== classId));
  }

  function toggleStudent(classId: string, student: StudentOpt) {
    setTargets((list) => {
      const has = list.some((t) => t.kind === 'student' && t.source_class_id === classId && t.student_id === student.id);
      if (has) return list.filter((t) => !(t.kind === 'student' && t.source_class_id === classId && t.student_id === student.id));
      return [...list, { kind: 'student', student_id: student.id, source_class_id: classId, label: student.name }];
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
      const saved = await api<{ hint?: string }>('/api/deneme-exam-notify?op=targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targets: targets.map((t) => ({
            kind: t.kind,
            student_id: t.student_id,
            class_id: t.class_id,
            grade_level: t.grade_level,
            source_class_id: t.source_class_id,
            enabled: t.enabled,
            day_before_enabled: t.day_before_enabled,
            soon_enabled: t.soon_enabled,
            karne_enabled: t.karne_enabled,
            join_link: t.join_link
          }))
        })
      });
      await api('/api/deneme-exam-notify?op=sync', { method: 'POST' });
      if (saved.hint) toast.error(saved.hint);
      else toast.success(settings.enabled ? 'Sınıf ayarları kaydedildi. Zamanı gelen mesajlar gönderilmeye başlar.' : 'Sınıf ayarları kaydedildi. Gerçek gönderim kapalı.');
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

  const classTargets = targets.filter((t) => t.kind === 'class');

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 text-left">
          <ChevronDown className={`h-5 w-5 text-slate-500 transition ${open ? 'rotate-180' : ''}`} />
          <BellRing className="h-5 w-5 text-emerald-600" />
          <span>
            <span className="block text-base font-semibold text-slate-900">Deneme Kulübü sınav bildirimleri</span>
            <span className="block text-xs text-slate-500">
              {classTargets.length} sınıf · {settings.enabled ? 'otomasyon açık' : 'otomasyon kapalı'} · hafta sonu sınavları 10:00
            </span>
          </span>
        </button>
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800">
          <input type="checkbox" checked={settings.enabled} onChange={(e) => patch('enabled', e.target.checked)} />
          Otomasyon açık
        </label>
      </div>

      {open && (
      <>
      <p className="mt-3 max-w-3xl text-sm text-slate-600">
        Hangi hatırlatmanın gideceğini her sınıfta ayrı seçin. Örneğin 9. sınıflara yalnız karne, 8. sınıflara üç hatırlatma gidebilir. Mesaj veliye ve öğrenciye gider.
      </p>

      {hint && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">{hint}</p>}

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="text-sm text-slate-700">
          Bir gün önceki saat
          <input
            type="time"
            value={settings.day_before_time}
            onChange={(e) => patch('day_before_time', e.target.value)}
            className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="text-sm text-slate-700 md:col-span-2">
          Hafta içi sınav saati
          <input
            type="time"
            value={settings.default_exam_time}
            onChange={(e) => patch('default_exam_time', e.target.value)}
            className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2"
          />
          <span className="mt-1 block text-xs text-slate-500">Cumartesi ve pazar sabit 10:00.</span>
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

      <div className="mt-4 space-y-3">
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <label className="text-sm text-slate-700">
            Program
            <select value={programId} onChange={(e) => { setProgramId(e.target.value); setPickClassId(''); }} className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2">
              <option value="">Tüm programlar</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-700">
            Sınıf
            <select value={pickClassId} onChange={(e) => setPickClassId(e.target.value)} className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2">
              <option value="">Sınıf seçin</option>
              {filteredClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.program_name ? `${c.program_name} · ` : ''}{c.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void addClass(pickClassId)}
            disabled={!pickClassId}
            className="self-end rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            Sınıfı ekle
          </button>
        </div>
        <div className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3 sm:flex-row sm:items-end">
          <label className="text-sm text-slate-700 sm:min-w-40">
            Seviye
            <select value={levelKey} onChange={(e) => setLevelKey(e.target.value)} className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2">
              <option value="">Seviye seçin</option>
              {levels.map((level) => (
                <option key={level} value={level}>{/^\d+$/.test(level) ? `${level}. sınıf` : level}</option>
              ))}
            </select>
          </label>
          <button type="button" disabled={!levelKey} onClick={() => void applyLevel('karne')} className="rounded-xl bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">
            Bu seviyedekilere sadece karne
          </button>
          <button type="button" disabled={!levelKey} onClick={() => void applyLevel('all')} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-40">
            Üç hatırlatma
          </button>
          <button type="button" disabled={!levelKey} onClick={() => void applyLevel('reminders')} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-40">
            Karne hariç
          </button>
        </div>

        {classTargets.length === 0 && <p className="text-sm text-slate-500">Henüz sınıf eklenmedi.</p>}
        {classTargets.map((cls) => {
          const id = String(cls.class_id);
          const info = classById.get(id);
          const people = roster[id] || [];
          const picked = new Set(targets.filter((t) => t.kind === 'student' && t.source_class_id === id).map((t) => String(t.student_id)));
          return (
            <article key={id} className="rounded-xl border border-slate-200 p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{cls.label || info?.name || 'Sınıf'}</p>
                  <p className="text-xs text-slate-500">{info?.program_name || 'Program'} · {picked.size} öğrenci</p>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={cls.enabled !== false} onChange={(e) => patchClass(id, { enabled: e.target.checked })} />
                    Bu sınıf açık
                  </label>
                  <button type="button" className="text-xs font-semibold text-rose-600" onClick={() => removeClass(id)}>Sınıfı iptal et</button>
                </div>
              </div>
              <p className="mt-2 text-sm font-medium text-emerald-800">Bu sınıfa gidecek: {reminderText(cls)}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => patchClass(id, { enabled: true, day_before_enabled: false, soon_enabled: false, karne_enabled: true })} className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">Sadece karne</button>
                <button type="button" onClick={() => patchClass(id, { enabled: true, day_before_enabled: true, soon_enabled: true, karne_enabled: true })} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">Üçü de</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-700">
                <label className="flex items-center gap-1"><input type="checkbox" checked={cls.day_before_enabled !== false} onChange={(e) => patchClass(id, { day_before_enabled: e.target.checked })} /> 1 gün önce</label>
                <label className="flex items-center gap-1"><input type="checkbox" checked={cls.soon_enabled !== false} onChange={(e) => patchClass(id, { soon_enabled: e.target.checked })} /> 30 dk önce</label>
                <label className="flex items-center gap-1"><input type="checkbox" checked={cls.karne_enabled !== false} onChange={(e) => patchClass(id, { karne_enabled: e.target.checked })} /> Karne</label>
              </div>
              <label className="mt-2 block text-sm text-slate-700">
                Bu sınıfın davet linki
                <input
                  value={cls.join_link || ''}
                  onChange={(e) => patchClass(id, { join_link: e.target.value })}
                  placeholder={info?.join_link || 'https://'}
                  className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <div className="mt-2 flex gap-2 text-xs">
                <button type="button" className="font-semibold text-emerald-700" onClick={() => setTargets((list) => {
                  const rest = list.filter((t) => !(t.kind === 'student' && t.source_class_id === id));
                  return [...rest, ...people.map((s) => ({ kind: 'student' as const, student_id: s.id, source_class_id: id, label: s.name }))];
                })}>Tümünü seç</button>
                <button type="button" className="font-semibold text-slate-500" onClick={() => setTargets((list) => list.filter((t) => !(t.kind === 'student' && t.source_class_id === id)))}>Seçimi temizle</button>
              </div>
              <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                {people.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 rounded-lg px-1 py-1 text-sm hover:bg-slate-50">
                    <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggleStudent(id, s)} />
                    {s.name}
                  </label>
                ))}
                {people.length === 0 && <p className="text-xs text-slate-500">Bu sınıfta öğrenci kaydı yok.</p>}
              </div>
            </article>
          );
        })}
        <p className="text-xs text-slate-500">Mesaj öğrencinin kendi telefonuna ve veli telefonuna gider. Aynı numara bir kez kullanılır. Aynı öğrenci bir kez yazılır.</p>
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
      </>
      )}
    </section>
  );
}
