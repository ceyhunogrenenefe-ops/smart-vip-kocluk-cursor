import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Filter, Loader2, MapPin, Minus } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/session';
import {
  ClassLessonTopicCheckpoint,
  fetchAdminTopicProgress,
  formatCheckpointSummary,
  trendLabel
} from '../lib/classLessonTopicCheckpointApi';

type ClassOption = { id: string; name: string; class_level?: string | null };
type TeacherOption = { id: string; name: string };

function TrendBadge({ trend }: { trend?: string }) {
  if (trend === 'forward') {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
        <ArrowUpRight className="h-3 w-3" />
        {trendLabel('forward')}
      </span>
    );
  }
  if (trend === 'backward') {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-800">
        <ArrowDownRight className="h-3 w-3" />
        {trendLabel('backward')}
      </span>
    );
  }
  if (trend === 'same') {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
        <Minus className="h-3 w-3" />
        {trendLabel('same')}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
      {trendLabel(trend as 'unknown')}
    </span>
  );
}

export default function ClassLessonTopicProgressPage() {
  const { users } = useApp();
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [rows, setRows] = useState<ClassLessonTopicCheckpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [teacherId, setTeacherId] = useState('');
  const [classId, setClassId] = useState('');
  const [subject, setSubject] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const teachers = useMemo<TeacherOption[]>(() => {
    return (users || [])
      .filter((u) => {
        const r = String(u.role || '').toLowerCase();
        return r === 'teacher' || (Array.isArray(u.roles) && u.roles.includes('teacher'));
      })
      .map((u) => ({ id: u.id, name: u.name || u.email || u.id }));
  }, [users]);

  useEffect(() => {
    void (async () => {
      const res = await apiFetch('/api/class-live-lessons?scope=classes');
      const j = await res.json().catch(() => ({}));
      setClasses(Array.isArray(j.data) ? j.data : []);
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdminTopicProgress({
        teacher_id: teacherId || undefined,
        class_id: classId || undefined,
        subject: subject.trim() || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        limit: 250
      });
      setRows(data);
    } finally {
      setLoading(false);
    }
  }, [teacherId, classId, subject, dateFrom, dateTo]);

  useEffect(() => {
    void load();
  }, [load]);

  const subjectsForClass = useMemo(() => {
    if (!classId) return [];
    const set = new Set<string>();
    for (const r of rows) {
      if (r.class_id === classId && r.subject) set.add(r.subject);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'tr'));
  }, [classId, rows]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <MapPin className="h-7 w-7 text-emerald-600" />
            Grup Dersi Konu İlerlemesi
          </h1>
          <p className="text-sm text-slate-600">
            Öğretmen, sınıf ve derse göre «Nerede Kaldım?» kayıtları; ilerleme ve geçmiş.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Filter className="h-4 w-4" />}
          Yenile
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-xs font-medium text-slate-600">
          Öğretmen
          <select
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
          >
            <option value="">Tümü</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">
          Sınıf
          <select
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
          >
            <option value="">Tümü</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.class_level ? `${c.class_level}. ` : ''}
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">
          Ders
          <input
            list="cltp-subjects"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
            placeholder="Matematik…"
          />
          <datalist id="cltp-subjects">
            {subjectsForClass.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
        <label className="text-xs font-medium text-slate-600">
          Başlangıç
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
          />
        </label>
        <label className="text-xs font-medium text-slate-600">
          Bitiş
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
          />
        </label>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-3">Tarih</th>
              <th className="px-3 py-3">Öğretmen</th>
              <th className="px-3 py-3">Sınıf / ders</th>
              <th className="px-3 py-3">Konu</th>
              <th className="px-3 py-3">Kitap / sayfa</th>
              <th className="px-3 py-3">Trend</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                  Kayıt bulunamadı. Öğretmenler ders sonunda «Nerede Kaldım?» formunu doldurdukça burada görünür.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/80">
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-700">{row.lesson_date}</td>
                  <td className="px-3 py-2.5 text-slate-800">{row.teacher_name || row.teacher_id}</td>
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-slate-800">{row.class_display || row.class_label}</p>
                    <p className="text-xs text-slate-500">{row.subject}</p>
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-slate-800">{row.topic}</p>
                    {row.sub_topic ? <p className="text-xs text-slate-500">{row.sub_topic}</p> : null}
                  </td>
                  <td className="px-3 py-2.5 text-slate-700">
                    {row.book_name || '—'}
                    {row.page_number ? ` · s. ${row.page_number}` : ''}
                  </td>
                  <td className="px-3 py-2.5">
                    <TrendBadge trend={row.progress_trend} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
