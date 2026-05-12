import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch, getAuthToken } from '../../lib/session';
import { useAuth } from '../../context/AuthContext';
import { userHasAnyRole } from '../../config/rolePermissions';
import { isUuid } from '../../utils/uuid';
import {
  ClipboardList,
  Loader2,
  RefreshCw,
  Send,
  Download,
  Calendar,
  Filter,
  BarChart3,
  MessageCircle,
  ToggleLeft,
  ToggleRight
} from 'lucide-react';

export type AttendanceHubRow = {
  lesson_type: string;
  session_id: string;
  lesson_date: string;
  start_time: string;
  subject: string;
  class_id: string;
  class_name: string;
  teacher_id: string;
  teacher_name: string;
  student_id: string;
  student_name: string;
  student_phone: string | null;
  parent_phone: string | null;
  status: 'present' | 'absent' | 'late';
  marked_at: string | null;
  marked_by: string | null;
};

type StatsPayload = {
  daily_absent_by_date: Record<string, number>;
  top_absent_students: { student_id: string; student_name: string; absent_count: number }[];
  class_participation: {
    class_id: string;
    class_name: string;
    present: number;
    absent: number;
    late: number;
    participation_pct: number;
  }[];
  teacher_yoklama: {
    teacher_id: string;
    teacher_name: string;
    marked: number;
    present: number;
    absent: number;
    late: number;
  }[];
};

type InstitutionLite = { id: string; name: string };

type Props = {
  institutions: InstitutionLite[];
  activeInstitutionId: string | null;
};

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function AttendanceReportHub({ institutions, activeInstitutionId }: Props) {
  const { user, effectiveUser } = useAuth();
  const isSuper = user?.role === 'super_admin';
  const isAdmin = user?.role === 'admin';
  const canEditPrefs = isSuper || isAdmin;
  const tags = userHasAnyRole(effectiveUser, ['super_admin', 'admin', 'coach', 'teacher']);

  const [instFilter, setInstFilter] = useState(() =>
    isSuper ? '' : activeInstitutionId || institutions[0]?.id || ''
  );
  const [from, setFrom] = useState(() => daysAgo(30));
  const [to, setTo] = useState(isoToday);
  const [classId, setClassId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [status, setStatus] = useState<'all' | 'absent' | 'present' | 'late'>('all');
  const [lessonType, setLessonType] = useState<'all' | 'group' | 'private'>('group');
  const [absentToday, setAbsentToday] = useState(false);
  const [includeStats, setIncludeStats] = useState(true);

  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<AttendanceHubRow[]>([]);
  const [summary, setSummary] = useState({ present: 0, absent: 0, late: 0, records: 0, session_count: 0 });
  const [stats, setStats] = useState<StatsPayload | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preset, setPreset] = useState<'absent_standard' | 'next_time' | 'missing_record'>('absent_standard');
  const [channels, setChannels] = useState<'parent' | 'student' | 'both'>('parent');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);

  const [autoWa, setAutoWa] = useState(true);
  const [prefsLoading, setPrefsLoading] = useState(false);

  const loadMeta = useCallback(async () => {
    if (!getAuthToken() || !tags) return;
    try {
      const res = await apiFetch('/api/class-live-lessons?scope=classes');
      const j = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(j.data)) {
        setClasses(j.data.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name || c.id })));
      }
    } catch {
      setClasses([]);
    }
  }, [tags]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  /** Eski localStorage `inst-...` / geçersiz seçim: API UUID bekliyor */
  useEffect(() => {
    const v = instFilter.trim();
    if (!v) return;
    if (!isUuid(v)) {
      setInstFilter(isSuper ? '' : institutions.find((x) => isUuid(x.id))?.id || '');
      return;
    }
    if (institutions.length > 0) {
      const known = new Set(institutions.map((x) => String(x.id)));
      if (!known.has(v)) {
        setInstFilter(isSuper ? '' : institutions.find((x) => isUuid(x.id))?.id || '');
      }
    }
  }, [institutions, instFilter, isSuper]);

  const loadPrefs = useCallback(async () => {
    if (!canEditPrefs || !getAuthToken()) return;
    setPrefsLoading(true);
    try {
      const q = new URLSearchParams({ scope: 'attendance-prefs' });
      if (isSuper && instFilter && isUuid(instFilter.trim())) q.set('institution_id', instFilter.trim());
      const res = await apiFetch(`/api/class-live-lessons?${q}`);
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.data) setAutoWa(j.data.auto_whatsapp_absent !== false);
    } catch {
      /* ignore */
    } finally {
      setPrefsLoading(false);
    }
  }, [canEditPrefs, isSuper, instFilter]);

  useEffect(() => {
    void loadPrefs();
  }, [loadPrefs]);

  const savePrefs = async (next: boolean) => {
    if (!canEditPrefs) return;
    setPrefsLoading(true);
    try {
      const body: Record<string, unknown> = { auto_whatsapp_absent: next };
      if (isSuper && instFilter && isUuid(instFilter.trim())) body.institution_id = instFilter.trim();
      const res = await apiFetch('/api/class-live-lessons?op=set-attendance-prefs', {
        method: 'POST',
        body: JSON.stringify(body)
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(j.error || res.status));
      setAutoWa(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ayar kaydedilemedi');
    } finally {
      setPrefsLoading(false);
    }
  };

  const loadReport = useCallback(async () => {
    if (!getAuthToken()) return;
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({
        scope: 'attendance-report',
        from: absentToday ? isoToday() : from.trim(),
        to: absentToday ? isoToday() : to.trim(),
        stats: includeStats ? '1' : '0'
      });
      if (classId.trim()) q.set('class_id', classId.trim());
      if (studentId.trim()) q.set('student_id', studentId.trim());
      if (sessionId.trim()) q.set('session_id', sessionId.trim());
      if (teacherId.trim()) q.set('teacher_id', teacherId.trim());
      if (status !== 'all') q.set('status', status);
      q.set('lesson_type', lessonType);
      if (absentToday) q.set('absent_today', '1');
      if (isSuper && instFilter.trim() && isUuid(instFilter.trim())) q.set('institution_id', instFilter.trim());

      const res = await apiFetch(`/api/class-live-lessons?${q}`);
      const j = (await res.json().catch(() => ({}))) as {
        data?: {
          rows: AttendanceHubRow[];
          summary: typeof summary;
          stats?: StatsPayload;
        };
        error?: string;
      };
      if (!res.ok) {
        setError(String(j.error || `HTTP ${res.status}`));
        setRows([]);
        return;
      }
      setRows(j.data?.rows || []);
      setSummary(
        j.data?.summary || {
          present: 0,
          absent: 0,
          late: 0,
          records: 0,
          session_count: 0
        }
      );
      setStats(j.data?.stats || null);
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hata');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [
    from,
    to,
    classId,
    studentId,
    sessionId,
    teacherId,
    status,
    lessonType,
    absentToday,
    includeStats,
    isSuper,
    instFilter
  ]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const absentRows = useMemo(() => rows.filter((r) => r.status === 'absent'), [rows]);

  const toggleSel = (key: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  };

  const selectAllAbsent = () => {
    setSelected(new Set(absentRows.map((r) => `${r.session_id}|${r.student_id}`)));
  };

  const clearSel = () => setSelected(new Set());

  const sessionContextFromRow = (r: AttendanceHubRow) => ({
    subject: r.subject,
    lesson_time: String(r.start_time).slice(0, 5),
    teacher_name: r.teacher_name,
    lesson_date: r.lesson_date,
    class_name: r.class_name,
    student_name: r.student_name
  });

  const bulkSend = async () => {
    if (!selected.size) {
      setBulkMsg('Önce satır seçin.');
      return;
    }
    setBulkBusy(true);
    setBulkMsg(null);
    try {
      const targets: { student_id: string; channels: string }[] = [];
      const ctxMap = new Map<string, AttendanceHubRow>();
      for (const key of selected) {
        const [sid, stu] = key.split('|');
        const row = rows.find((r) => r.session_id === sid && r.student_id === stu);
        if (row) {
          targets.push({ student_id: row.student_id, channels });
          ctxMap.set(row.student_id, row);
        }
      }
      const first = targets.length ? ctxMap.get(targets[0].student_id) : null;
      const res = await apiFetch('/api/class-live-lessons?op=bulk-attendance-notify', {
        method: 'POST',
        body: JSON.stringify({
          targets,
          message_preset: preset,
          session_context: first ? sessionContextFromRow(first) : {}
        })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(j.error || res.status));
      const okN = (j.results || []).filter((x: { ok?: boolean }) => x.ok).length;
      setBulkMsg(`Gönderim tamamlandı (${okN}/${targets.length} başarılı). Meta oturum penceresi yoksa mesaj düşmeyebilir.`);
    } catch (e) {
      setBulkMsg(e instanceof Error ? e.message : 'Gönderim hatası');
    } finally {
      setBulkBusy(false);
    }
  };

  const exportCsv = () => {
    if (!rows.length) return;
    const h = [
      'Tarih',
      'Saat',
      'Tür',
      'Sınıf',
      'Ders',
      'Öğretmen',
      'Öğrenci',
      'Durum',
      'Yoklama saati'
    ];
    const lines = rows.map((r) =>
      [
        r.lesson_date,
        String(r.start_time).slice(0, 5),
        r.lesson_type,
        r.class_name,
        r.subject,
        r.teacher_name,
        r.student_name,
        r.status === 'present' ? 'katıldı' : r.status === 'late' ? 'geç katıldı' : 'katılmadı',
        r.marked_at ? new Date(r.marked_at).toLocaleString('tr-TR') : ''
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(',')
    );
    const blob = new Blob([[h.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `yoklama-raporu-${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const statusStyle = (s: string) => {
    if (s === 'present') return 'bg-emerald-100 text-emerald-800';
    if (s === 'late') return 'bg-amber-100 text-amber-900';
    return 'bg-rose-100 text-rose-800';
  };

  if (!tags) return null;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-indigo-50/40 p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-indigo-600" />
            <h3 className="text-lg font-semibold text-slate-900">Yoklama raporu</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadReport()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Yenile
            </button>
            <button
              type="button"
              onClick={exportCsv}
              disabled={!rows.length}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
            >
              <Download className="h-4 w-4" />
              CSV
            </button>
          </div>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          Grup canlı ders yoklaması; filtreleyin, devamsızlık analizini görün, seçili öğrencilere WhatsApp gönderin.
        </p>
      </div>

      {canEditPrefs ? (
        <div className="flex flex-col gap-3 rounded-xl border border-violet-100 bg-violet-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <MessageCircle className="mt-0.5 h-5 w-5 text-violet-600" />
            <div>
              <p className="font-medium text-violet-900">Otomatik devamsızlık WhatsApp (veli şablonu)</p>
              <p className="text-xs text-violet-800">
                Yoklama kaydında &quot;katılmadı&quot; işaretlenince mevcut veli bildirimi akışı çalışsın mı?
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={prefsLoading}
            onClick={() => void savePrefs(!autoWa)}
            className="inline-flex items-center gap-2 self-start rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm font-medium text-violet-900 hover:bg-violet-50 disabled:opacity-50"
          >
            {autoWa ? <ToggleRight className="h-5 w-5 text-emerald-600" /> : <ToggleLeft className="h-5 w-5 text-slate-400" />}
            {autoWa ? 'Açık' : 'Kapalı'}
          </button>
        </div>
      ) : null}

      {isSuper ? (
        <label className="block max-w-md text-sm">
          <span className="text-xs font-medium text-slate-500">Kurum (süper admin)</span>
          <select
            value={instFilter}
            onChange={(e) => setInstFilter(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">Tüm kurumlar</option>
            {institutions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 lg:grid-cols-12">
        <div className="flex flex-wrap items-end gap-3 lg:col-span-12">
          <label className="text-xs">
            <span className="font-medium text-slate-500">Başlangıç</span>
            <input
              type="date"
              disabled={absentToday}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 block rounded-lg border border-slate-200 px-2 py-1.5 text-sm disabled:opacity-50"
            />
          </label>
          <label className="text-xs">
            <span className="font-medium text-slate-500">Bitiş</span>
            <input
              type="date"
              disabled={absentToday}
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 block rounded-lg border border-slate-200 px-2 py-1.5 text-sm disabled:opacity-50"
            />
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={absentToday} onChange={(e) => setAbsentToday(e.target.checked)} />
            <Calendar className="h-4 w-4 text-amber-600" />
            Bugün derse katılmayanlar
          </label>
          <label className="text-xs">
            <span className="font-medium text-slate-500">Durum</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
              className="mt-1 block rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            >
              <option value="all">Tümü</option>
              <option value="absent">Katılmadı</option>
              <option value="present">Katıldı</option>
              <option value="late">Geç katıldı</option>
            </select>
          </label>
          <label className="text-xs">
            <span className="font-medium text-slate-500">Ders türü</span>
            <select
              value={lessonType}
              onChange={(e) => setLessonType(e.target.value as typeof lessonType)}
              className="mt-1 block rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            >
              <option value="group">Grup dersi</option>
              <option value="private">Özel ders (veri yok)</option>
              <option value="all">Tümü</option>
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-end gap-3 lg:col-span-12">
          <label className="min-w-[140px] text-xs">
            <span className="font-medium text-slate-500">Sınıf</span>
            <select
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            >
              <option value="">Tümü</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-[200px] text-xs">
            <span className="font-medium text-slate-500">Öğretmen (kullanıcı id)</span>
            <input
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
              placeholder="İsteğe bağlı"
              className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-xs"
            />
          </label>
          <label className="min-w-[160px] text-xs">
            <span className="font-medium text-slate-500">Öğrenci ID</span>
            <input
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              placeholder="İsteğe bağlı"
              className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="min-w-[200px] text-xs">
            <span className="font-medium text-slate-500">Oturum ID</span>
            <input
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              placeholder="UUID"
              className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-xs"
            />
          </label>
          <label className="inline-flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={includeStats} onChange={(e) => setIncludeStats(e.target.checked)} />
            İstatistikleri yükle
          </label>
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
          <p className="text-xs text-emerald-800">Katıldı</p>
          <p className="text-xl font-bold text-emerald-900">{summary.present}</p>
        </div>
        <div className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2">
          <p className="text-xs text-rose-800">Katılmadı</p>
          <p className="text-xl font-bold text-rose-900">{summary.absent}</p>
        </div>
        <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
          <p className="text-xs text-amber-900">Geç katıldı</p>
          <p className="text-xl font-bold text-amber-950">{summary.late}</p>
        </div>
        <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
          <p className="text-xs text-slate-600">Kayıt</p>
          <p className="text-xl font-bold text-slate-900">{summary.records}</p>
        </div>
        <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2">
          <p className="text-xs text-indigo-800">Oturum (aralık)</p>
          <p className="text-xl font-bold text-indigo-900">{summary.session_count}</p>
        </div>
      </div>

      {stats ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-2 flex items-center gap-2 text-slate-800">
              <BarChart3 className="h-4 w-4" />
              <span className="font-semibold">Sınıf katılım oranı</span>
            </div>
            <div className="max-h-56 space-y-2 overflow-y-auto text-sm">
              {stats.class_participation.length === 0 ? (
                <p className="text-slate-500">Veri yok</p>
              ) : (
                stats.class_participation.map((c) => (
                  <div key={c.class_id} className="flex justify-between gap-2 border-b border-slate-100 py-1">
                    <span className="truncate font-medium">{c.class_name}</span>
                    <span className="shrink-0 text-emerald-700">%{c.participation_pct}</span>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-2 flex items-center gap-2 text-slate-800">
              <Filter className="h-4 w-4" />
              <span className="font-semibold">En çok devamsızlık</span>
            </div>
            <ol className="max-h-56 list-decimal space-y-1 overflow-y-auto pl-5 text-sm">
              {stats.top_absent_students.map((s) => (
                <li key={s.student_id}>
                  {s.student_name}{' '}
                  <span className="text-rose-600">({s.absent_count})</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2">
            <p className="mb-2 font-semibold text-slate-800">Öğretmen bazlı yoklama</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-2 py-2">Öğretmen</th>
                    <th className="px-2 py-2">Kayıt</th>
                    <th className="px-2 py-2 text-emerald-700">Katıldı</th>
                    <th className="px-2 py-2 text-amber-700">Geç</th>
                    <th className="px-2 py-2 text-rose-700">Katılmadı</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.teacher_yoklama.map((t) => (
                    <tr key={t.teacher_id} className="border-b border-slate-100">
                      <td className="px-2 py-2 font-medium">{t.teacher_name}</td>
                      <td className="px-2 py-2">{t.marked}</td>
                      <td className="px-2 py-2 text-emerald-700">{t.present}</td>
                      <td className="px-2 py-2 text-amber-700">{t.late}</td>
                      <td className="px-2 py-2 text-rose-700">{t.absent}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap gap-3">
          <label className="text-xs">
            <span className="font-medium text-slate-500">Şablon</span>
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value as typeof preset)}
              className="mt-1 block rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            >
              <option value="absent_standard">Katılım sağlamamıştır</option>
              <option value="next_time">Sonraki derse zamanında katılım</option>
              <option value="missing_record">Eksik ders kaydı</option>
            </select>
          </label>
          <label className="text-xs">
            <span className="font-medium text-slate-500">Kanal</span>
            <select
              value={channels}
              onChange={(e) => setChannels(e.target.value as typeof channels)}
              className="mt-1 block rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            >
              <option value="parent">Veli</option>
              <option value="student">Öğrenci</option>
              <option value="both">Öğrenci + veli</option>
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={selectAllAbsent}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Katılmayanların tümünü seç
          </button>
          <button type="button" onClick={clearSel} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
            Seçimi temizle
          </button>
          <button
            type="button"
            disabled={bulkBusy || !selected.size}
            onClick={() => void bulkSend()}
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-40"
          >
            {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Toplu WhatsApp
          </button>
        </div>
      </div>
      {bulkMsg ? <p className="text-sm text-slate-700">{bulkMsg}</p> : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th className="w-10 px-2 py-2"> </th>
              <th className="px-2 py-2">Tarih</th>
              <th className="px-2 py-2">Saat</th>
              <th className="px-2 py-2">Sınıf</th>
              <th className="px-2 py-2">Ders</th>
              <th className="px-2 py-2">Öğretmen</th>
              <th className="px-2 py-2">Öğrenci</th>
              <th className="px-2 py-2">Durum</th>
              <th className="px-2 py-2">Yoklama saati</th>
            </tr>
          </thead>
          <tbody>
            {loading && !rows.length ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                  <Loader2 className="mr-2 inline h-5 w-5 animate-spin" />
                  Yükleniyor…
                </td>
              </tr>
            ) : !rows.length ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                  Kayıt yok veya filtrelere uyan sonuç yok.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const key = `${r.session_id}|${r.student_id}`;
                const canSelect = r.status === 'absent';
                return (
                  <tr key={key} className="border-b border-slate-100 hover:bg-slate-50/80">
                    <td className="px-2 py-2">
                      <input
                        type="checkbox"
                        disabled={!canSelect}
                        checked={selected.has(key)}
                        onChange={() => toggleSel(key)}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">{r.lesson_date}</td>
                    <td className="whitespace-nowrap px-2 py-2">{String(r.start_time).slice(0, 5)}</td>
                    <td className="max-w-[140px] truncate px-2 py-2">{r.class_name}</td>
                    <td className="max-w-[120px] truncate px-2 py-2">{r.subject}</td>
                    <td className="max-w-[120px] truncate px-2 py-2">{r.teacher_name}</td>
                    <td className="font-medium text-slate-900">{r.student_name}</td>
                    <td className="px-2 py-2">
                      <span className={`inline-flex rounded px-2 py-0.5 text-xs font-semibold ${statusStyle(r.status)}`}>
                        {r.status === 'present' ? 'Katıldı' : r.status === 'late' ? 'Geç katıldı' : 'Katılmadı'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-xs text-slate-500">
                      {r.marked_at ? new Date(r.marked_at).toLocaleString('tr-TR') : '—'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
