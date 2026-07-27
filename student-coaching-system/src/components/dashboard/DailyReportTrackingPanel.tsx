import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, ChevronLeft, ChevronRight, ClipboardList, Search, XCircle } from 'lucide-react';
import type { Student, WeeklyEntry } from '../../types';
import { formatClassLevelLabel } from '../../types';
import {
  buildDailyReportStatuses,
  buildLastNDaySummaries,
  formatDayLabelTr,
  getIstanbulDateString,
  addDaysToYmd
} from '../../lib/dailyReportTracking';
import {
  isActiveFromPeriods,
  type StudentActivityPeriod
} from '../../lib/studentActivityApi';

type Props = {
  students: Student[];
  weeklyEntries: WeeklyEntry[];
  title?: string;
  subtitle?: string;
  /** student_id → dönemler; yoksa tümü aktif sayılır */
  periodsByStudent?: Record<string, StudentActivityPeriod[]>;
  coachId?: string;
  /** Yönetici: aktiflik filtresi UI */
  showActivityScopeFilter?: boolean;
};

type FilterMode = 'all' | 'filled' | 'missing';
type ActivityScope = 'active_on_date' | 'passive_on_date' | 'all_students';

export function DailyReportTrackingPanel({
  students,
  weeklyEntries,
  title = 'Günlük rapor takibi',
  subtitle = 'Hangi öğrenciler seçili günde rapor doldurdu?',
  periodsByStudent,
  coachId,
  showActivityScopeFilter = false
}: Props) {
  const navigate = useNavigate();
  const todayYmd = getIstanbulDateString();
  const [selectedDate, setSelectedDate] = useState(todayYmd);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [activityScope, setActivityScope] = useState<ActivityScope>('active_on_date');
  const [search, setSearch] = useState('');

  const scopedStudents = useMemo(() => {
    if (!periodsByStudent) return students;
    return students.filter((s) => {
      const periods = periodsByStudent[s.id] || [];
      const active = isActiveFromPeriods(periods, selectedDate, coachId);
      if (activityScope === 'active_on_date') return active;
      if (activityScope === 'passive_on_date') return !active;
      return true;
    });
  }, [students, periodsByStudent, selectedDate, coachId, activityScope]);

  const weekSummaries = useMemo(() => {
    // Haftalık özet kartları: her gün için o gün aktif olanlar
    if (!periodsByStudent) {
      return buildLastNDaySummaries(students, weeklyEntries, selectedDate, 7);
    }
    const out = [];
    for (let i = 6; i >= 0; i -= 1) {
      const date = addDaysToYmd(selectedDate, -i);
      const dayStudents = students.filter((s) =>
        isActiveFromPeriods(periodsByStudent[s.id] || [], date, coachId)
      );
      const statuses = buildDailyReportStatuses(dayStudents, weeklyEntries, date);
      const filledCount = statuses.filter((x) => x.filled).length;
      const totalStudents = dayStudents.length;
      out.push({
        date,
        filledCount,
        totalStudents,
        rate: totalStudents > 0 ? Math.round((filledCount / totalStudents) * 100) : 0
      });
    }
    return out;
  }, [students, weeklyEntries, selectedDate, periodsByStudent, coachId]);

  const statuses = useMemo(
    () => buildDailyReportStatuses(scopedStudents, weeklyEntries, selectedDate),
    [scopedStudents, weeklyEntries, selectedDate]
  );

  const statusByStudentId = useMemo(
    () => new Map(statuses.map((s) => [s.studentId, s])),
    [statuses]
  );

  const filledCount = statuses.filter((s) => s.filled).length;
  const missingCount = scopedStudents.length - filledCount;
  const fillRate =
    scopedStudents.length > 0 ? Math.round((filledCount / scopedStudents.length) * 1000) / 10 : 0;

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scopedStudents
      .map((student) => ({
        student,
        status: statusByStudentId.get(student.id) ?? {
          studentId: student.id,
          filled: false,
          entryCount: 0,
          breakdownTotal: 0,
          solvedTotal: 0
        }
      }))
      .filter(({ student, status }) => {
        if (filter === 'filled' && !status.filled) return false;
        if (filter === 'missing' && status.filled) return false;
        if (!q) return true;
        return (
          student.name.toLowerCase().includes(q) ||
          String(student.email || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (a.status.filled !== b.status.filled) return a.status.filled ? 1 : -1;
        return a.student.name.localeCompare(b.student.name, 'tr');
      });
  }, [scopedStudents, statusByStudentId, filter, search]);

  const shiftDate = (delta: number) => {
    setSelectedDate((d) => addDaysToYmd(d, delta));
  };

  const isToday = selectedDate === todayYmd;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="border-b border-gray-100 px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-indigo-600" />
              <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
            </div>
            <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
            {periodsByStudent ? (
              <p className="mt-1 text-xs text-slate-500">
                Oran, seçili günde <strong>aktif</strong> öğrenciler üzerinden hesaplanır (pasifler dahil
                edilmez).
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => shiftDate(-1)}
              className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50"
              aria-label="Önceki gün"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <input
              type="date"
              value={selectedDate}
              max={todayYmd}
              onChange={(e) => setSelectedDate(e.target.value || todayYmd)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => shiftDate(1)}
              disabled={isToday}
              className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50 disabled:opacity-40"
              aria-label="Sonraki gün"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            {!isToday && (
              <button
                type="button"
                onClick={() => setSelectedDate(todayYmd)}
                className="rounded-lg bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
              >
                Bugün
              </button>
            )}
          </div>
        </div>

        {(showActivityScopeFilter || periodsByStudent) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {(
              [
                ['active_on_date', 'Rapor tarihinde aktif'],
                ['passive_on_date', 'Yalnızca pasifler'],
                ['all_students', 'Tüm öğrenciler']
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActivityScope(key)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  activityScope === key
                    ? 'bg-slate-800 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {weekSummaries.map((day) => {
            const active = day.date === selectedDate;
            return (
              <button
                key={day.date}
                type="button"
                onClick={() => setSelectedDate(day.date)}
                className={`min-w-[5.5rem] shrink-0 rounded-xl border px-3 py-2 text-left transition-colors ${
                  active
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-200 hover:border-indigo-200 hover:bg-gray-50'
                }`}
              >
                <p className="text-xs text-gray-500">{formatDayLabelTr(day.date)}</p>
                <p className="text-sm font-semibold text-slate-800">
                  {day.filledCount}/{day.totalStudents}
                </p>
                <p className="text-[11px] text-gray-500">%{day.rate}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 border-b border-gray-100 px-4 py-4 sm:grid-cols-4 sm:px-6">
        <div className="rounded-xl bg-slate-50 px-4 py-3">
          <p className="text-sm text-slate-600">Aktif öğrenci</p>
          <p className="text-2xl font-bold text-slate-800">{scopedStudents.length}</p>
        </div>
        <div className="rounded-xl bg-green-50 px-4 py-3">
          <p className="text-sm text-green-700">Dolduran</p>
          <p className="text-2xl font-bold text-green-800">{filledCount}</p>
        </div>
        <div className="rounded-xl bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">Doldurmayan</p>
          <p className="text-2xl font-bold text-red-800">{missingCount}</p>
        </div>
        <div className="rounded-xl bg-indigo-50 px-4 py-3">
          <p className="text-sm text-indigo-700">Doldurma oranı</p>
          <p className="text-2xl font-bold text-indigo-800">%{fillRate}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-b border-gray-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['all', 'Tümü'],
              ['filled', 'Doldurdu'],
              ['missing', 'Doldurmadı']
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                filter === key
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative max-w-xs w-full">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Öğrenci ara…"
            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm"
          />
        </div>
      </div>

      {scopedStudents.length === 0 ? (
        <p className="px-6 py-8 text-center text-sm text-gray-500">
          Seçili günde bu filtreye uygun öğrenci yok.
        </p>
      ) : rows.length === 0 ? (
        <p className="px-6 py-8 text-center text-sm text-gray-500">Arama veya filtreye uygun öğrenci yok.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 sm:px-6">Öğrenci</th>
                <th className="px-4 py-3">Sınıf</th>
                <th className="px-4 py-3">Durum</th>
                <th className="px-4 py-3">Kayıt</th>
                <th className="px-4 py-3 sm:px-6">Detay</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(({ student, status }) => (
                <tr key={student.id} className="hover:bg-gray-50/80">
                  <td className="px-4 py-3 font-medium text-slate-800 sm:px-6">{student.name}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {formatClassLevelLabel(student.classLevel)}
                  </td>
                  <td className="px-4 py-3">
                    {status.filled ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800">
                        <CheckCircle className="h-3.5 w-3.5" />
                        Doldurdu
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-800">
                        <XCircle className="h-3.5 w-3.5" />
                        Doldurmadı
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {status.entryCount > 0 ? (
                      <>
                        {status.entryCount} kayıt
                        {status.breakdownTotal > 0 && (
                          <span className="block text-xs text-gray-400">
                            D/Y/B: {status.breakdownTotal}
                          </span>
                        )}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 sm:px-6">
                    <button
                      type="button"
                      onClick={() => navigate(`/tracking?student=${encodeURIComponent(student.id)}`)}
                      className="text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                      Takip
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
