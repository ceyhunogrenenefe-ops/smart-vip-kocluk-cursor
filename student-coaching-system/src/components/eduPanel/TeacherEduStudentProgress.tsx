import { useEffect, useMemo, useState } from 'react';
import { Loader2, Users } from 'lucide-react';
import EduBadgeChip from './EduBadgeChip';
import EduProgressRing from './EduProgressRing';
import { fetchEduRowStudentProgress } from '../../lib/eduPanel/eduPanelApi';
import type { EduRowStudentProgress } from '../../types/eduPanel.types';
import { badgeForPoints } from '../../lib/eduPanel/eduPanelProgress';

type Props = {
  lessonRowId: string;
  active: boolean;
};

export default function TeacherEduStudentProgress({ lessonRowId, active }: Props) {
  const [rows, setRows] = useState<EduRowStudentProgress[]>([]);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [classFilter, setClassFilter] = useState<string>('__all__');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!active || !lessonRowId) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    const cid = classFilter === '__all__' ? null : classFilter;
    void fetchEduRowStudentProgress(lessonRowId, cid)
      .then(({ data, classes: cls }) => {
        if (!cancelled) {
          setRows(data);
          if (cls.length) setClasses(cls);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Yüklenemedi');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, lessonRowId, classFilter]);

  const stats = useMemo(() => {
    if (!rows.length) return null;
    const completed = rows.filter((r) => r.topic_completed).length;
    const avgHw =
      rows.reduce((s, r) => s + (r.homework_percent || 0), 0) / Math.max(rows.length, 1);
    const avgPts = rows.reduce((s, r) => s + (r.points || 0), 0) / Math.max(rows.length, 1);
    return {
      total: rows.length,
      completed,
      avgHw: Math.round(avgHw),
      avgPts: Math.round(avgPts)
    };
  }, [rows]);

  if (!active) return null;

  return (
    <section className="mt-4 rounded-xl border-2 border-indigo-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100 pb-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <Users className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-indigo-900">Öğrenci ilerlemesi</h3>
            <p className="text-[11px] text-indigo-600">Sadece sizin sınıflarınız</p>
          </div>
        </div>
        {stats ? (
          <div className="flex flex-wrap gap-2 text-[10px]">
            <span className="rounded-full bg-indigo-50 px-2 py-1 text-indigo-800">
              {stats.completed}/{stats.total} tamamladı
            </span>
            <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-800">
              Ort. ödev %{stats.avgHw}
            </span>
            <span className="rounded-full bg-violet-50 px-2 py-1 text-violet-800">
              Ort. {stats.avgPts}p
            </span>
          </div>
        ) : null}
      </div>

      {classes.length > 1 ? (
        <div className="mb-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setClassFilter('__all__')}
            className={`rounded-full px-3 py-1 text-[11px] font-medium ${
              classFilter === '__all__'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Tüm sınıflarım
          </button>
          {classes.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setClassFilter(c.id)}
              className={`rounded-full px-3 py-1 text-[11px] font-medium ${
                classFilter === c.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
        </div>
      ) : error ? (
        <p className="text-xs text-red-600 py-2">{error}</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-slate-500 py-2">Bu seçimde öğrenci bulunamadı.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-xs">
            <thead>
              <tr className="text-slate-500">
                <th className="pb-2 font-semibold">Öğrenci</th>
                <th className="pb-2 font-semibold text-center">Puan</th>
                <th className="pb-2 font-semibold text-center">Animasyon</th>
                <th className="pb-2 font-semibold text-center">Ödev %</th>
                <th className="pb-2 font-semibold">Rozet</th>
                <th className="pb-2 font-semibold">Durum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const badge = badgeForPoints(r.points || 0);
                return (
                  <tr key={r.student_id || r.student_user_id} className="align-middle">
                    <td className="py-2 pr-2">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600">
                          {(r.student_name || '?').slice(0, 2).toUpperCase()}
                        </div>
                        <span className="font-medium text-slate-800">{r.student_name || 'Öğrenci'}</span>
                      </div>
                    </td>
                    <td className="py-2 text-center">
                      <EduProgressRing value={r.points || 0} size={44} stroke={4} badge={badge} />
                    </td>
                    <td className="py-2 text-center">
                      {r.animation_completed ? (
                        <span className="text-green-600 font-semibold">✓</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="py-2 text-center font-semibold text-amber-800">
                      {r.homework_percent ?? 0}%
                    </td>
                    <td className="py-2">
                      <EduBadgeChip badge={badge} compact />
                    </td>
                    <td className="py-2 text-slate-600">
                      {r.topic_completed ? (
                        <span className="text-green-700 font-medium">Tamamladı</span>
                      ) : (
                        <span className="text-slate-400">Devam ediyor</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
