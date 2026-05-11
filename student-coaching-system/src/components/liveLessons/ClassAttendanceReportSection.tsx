import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, getAuthToken } from '../../lib/session';
import { userHasAnyRole } from '../../config/rolePermissions';
import { useAuth } from '../../context/AuthContext';
import { ClipboardList, Download, Loader2, RefreshCw, Brain } from 'lucide-react';

export type ClassAttendanceReportRow = {
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
  status: 'present' | 'absent';
  marked_at: string | null;
  marked_by: string | null;
};

type ReportPayload = {
  rows: ClassAttendanceReportRow[];
  summary: { present: number; absent: number; records: number; session_count: number };
};

function isoDateDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

type Props = {
  /** Süper admin: kurum filtresi seçenekleri */
  institutionChoices?: { id: string; name: string }[];
  className?: string;
};

export function ClassAttendanceReportSection({ institutionChoices, className = '' }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canAiCoach = userHasAnyRole(user, ['admin', 'coach']);
  const showInstitutionFilter = Boolean(institutionChoices?.length);

  const [from, setFrom] = useState(() => isoDateDaysAgo(30));
  const [to, setTo] = useState(todayIso);
  const [institutionId, setInstitutionId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ReportPayload | null>(null);

  const load = useCallback(async () => {
    if (!getAuthToken()) return;
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({
        scope: 'attendance-report',
        from: from.trim(),
        to: to.trim()
      });
      if (showInstitutionFilter && institutionId.trim()) {
        q.set('institution_id', institutionId.trim());
      }
      const res = await apiFetch(`/api/class-live-lessons?${q.toString()}`);
      const j = (await res.json().catch(() => ({}))) as {
        data?: ReportPayload;
        error?: string;
      };
      if (!res.ok) {
        setError(String(j.error || `HTTP ${res.status}`));
        setData(null);
        return;
      }
      setData(j.data || { rows: [], summary: { present: 0, absent: 0, records: 0, session_count: 0 } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yükleme hatası');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [from, to, institutionId, showInstitutionFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportCsv = () => {
    if (!data?.rows.length) return;
    const header = [
      'Tarih',
      'Saat',
      'Sınıf',
      'Ders',
      'Öğretmen',
      'Öğrenci',
      'Durum',
      'İşaret zamanı'
    ];
    const lines = data.rows.map((r) =>
      [
        r.lesson_date,
        r.start_time,
        r.class_name,
        r.subject,
        r.teacher_name,
        r.student_name,
        r.status === 'present' ? 'geldi' : 'gelmedi',
        r.marked_at ? new Date(r.marked_at).toISOString() : ''
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(',')
    );
    const blob = new Blob([[header.join(','), ...lines].join('\n')], {
      type: 'text/csv;charset=utf-8;'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `grup-ders-yoklama-${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openAiCoachForStudent = (row: ClassAttendanceReportRow) => {
    const q = new URLSearchParams({
      student: row.student_id,
      classAttendance: '1',
      from,
      to
    });
    navigate(`/ai-coach?${q.toString()}`);
  };

  const absentStudents = useMemo(() => {
    if (!data?.rows.length) return [];
    const m = new Map<string, string>();
    for (const r of data.rows) {
      if (r.status === 'absent') m.set(r.student_id, r.student_name);
    }
    return [...m.entries()].map(([id, name]) => ({ id, name }));
  }, [data]);

  return (
    <div
      className={['bg-white rounded-xl shadow-sm border border-slate-200 p-6', className].filter(Boolean).join(' ')}
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-indigo-600" />
            Grup dersi yoklama raporu
          </h3>
          <p className="text-sm text-slate-600 mt-1">
            Canlı grup derslerinde kaydedilen yoklamalar burada listelenir. Tarih aralığını değiştirip yenileyin;
            CSV olarak indirebilirsiniz.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Yenile
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!data?.rows.length}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-900 disabled:opacity-40"
          >
            <Download className="w-4 h-4" />
            CSV
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <label className="text-sm">
          <span className="block text-xs font-medium text-slate-500 mb-1">Başlangıç</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="block text-xs font-medium text-slate-500 mb-1">Bitiş</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
          />
        </label>
        {showInstitutionFilter ? (
          <label className="text-sm min-w-[200px]">
            <span className="block text-xs font-medium text-slate-500 mb-1">Kurum (isteğe bağlı)</span>
            <select
              value={institutionId}
              onChange={(e) => setInstitutionId(e.target.value)}
              className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
            >
              <option value="">Tüm kurumlar</option>
              {(institutionChoices || []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {error ? <p className="text-sm text-red-600 mb-3">{error}</p> : null}

      {data ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2">
            <p className="text-xs text-emerald-700">Geldi</p>
            <p className="text-xl font-bold text-emerald-800">{data.summary.present}</p>
          </div>
          <div className="rounded-lg bg-rose-50 border border-rose-100 px-3 py-2">
            <p className="text-xs text-rose-700">Gelmedi</p>
            <p className="text-xl font-bold text-rose-800">{data.summary.absent}</p>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
            <p className="text-xs text-slate-600">Yoklama satırı</p>
            <p className="text-xl font-bold text-slate-800">{data.summary.records}</p>
          </div>
          <div className="rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2">
            <p className="text-xs text-indigo-700">Ders oturumu (aralıkta)</p>
            <p className="text-xl font-bold text-indigo-800">{data.summary.session_count}</p>
          </div>
        </div>
      ) : null}

      {absentStudents.length > 0 ? (
        <div className="mb-4 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span className="font-medium">Devamsızlık alan öğrenciler (özet): </span>
          {absentStudents.map((s) => s.name).join(', ')}
        </div>
      ) : null}

      <div className="overflow-x-auto max-h-[420px] overflow-y-auto border border-slate-100 rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 sticky top-0 z-10">
            <tr>
              <th className="text-left px-3 py-2 font-semibold text-slate-600">Tarih</th>
              <th className="text-left px-3 py-2 font-semibold text-slate-600">Saat</th>
              <th className="text-left px-3 py-2 font-semibold text-slate-600">Sınıf</th>
              <th className="text-left px-3 py-2 font-semibold text-slate-600">Ders</th>
              <th className="text-left px-3 py-2 font-semibold text-slate-600">Öğrenci</th>
              <th className="text-center px-3 py-2 font-semibold text-slate-600">Yoklama</th>
              {canAiCoach ? (
                <th className="text-right px-3 py-2 font-semibold text-slate-600">AI Koç</th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && !data?.rows.length ? (
              <tr>
                <td colSpan={canAiCoach ? 7 : 6} className="px-3 py-8 text-center text-slate-500">
                  <Loader2 className="w-6 h-6 animate-spin inline-block mr-2 align-middle" />
                  Yükleniyor…
                </td>
              </tr>
            ) : !data?.rows.length ? (
              <tr>
                <td colSpan={canAiCoach ? 7 : 6} className="px-3 py-6 text-center text-slate-500">
                  Bu aralıkta yoklama kaydı yok veya erişiminiz kapsamında oturum bulunamadı.
                </td>
              </tr>
            ) : (
              data.rows.map((r) => (
                <tr key={`${r.session_id}-${r.student_id}`} className="hover:bg-slate-50/80">
                  <td className="px-3 py-2 whitespace-nowrap">{r.lesson_date}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{String(r.start_time).slice(0, 5)}</td>
                  <td className="px-3 py-2">{r.class_name}</td>
                  <td className="px-3 py-2">{r.subject}</td>
                  <td className="px-3 py-2 font-medium text-slate-800">{r.student_name}</td>
                  <td className="px-3 py-2 text-center">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${
                        r.status === 'present'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {r.status === 'present' ? 'Geldi' : 'Gelmedi'}
                    </span>
                  </td>
                  {canAiCoach ? (
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => openAiCoachForStudent(r)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-violet-700 hover:text-violet-900"
                      >
                        <Brain className="w-3.5 h-3.5" />
                        AI ile
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
