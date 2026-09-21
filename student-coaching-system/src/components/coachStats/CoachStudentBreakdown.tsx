import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, Search, X, XCircle } from 'lucide-react';
import { fetchCoachStats, type CoachStatRow, type CoachStudentStat } from '../../lib/coachStatsApi';

type Props = {
  coachId: string;
  coachName: string;
  from: string;
  to: string;
  institutionId?: string | null;
  classId?: string | null;
  /** koç kendi sayfasında: kapatma düğmesi gösterilmez */
  onClose?: () => void;
};

function fmtPct(v: number | null | undefined): string {
  if (v == null) return '—';
  return `%${v.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`;
}

/** Oran rengi: ≥80 yeşil, ≥50 sarı, altı kırmızı; veri yoksa gri */
function tone(v: number | null | undefined, invert = false): string {
  if (v == null) return 'bg-slate-100 text-slate-500';
  const good = invert ? v <= 10 : v >= 80;
  const mid = invert ? v <= 25 : v >= 50;
  if (good) return 'bg-emerald-50 text-emerald-800';
  if (mid) return 'bg-amber-50 text-amber-800';
  return 'bg-rose-50 text-rose-800';
}

function RateCell({ rate, sub, title }: { rate: number | null; sub: string; title?: string }) {
  return (
    <td className="px-3 py-2" title={title}>
      <span className={`inline-block min-w-[3.25rem] rounded-lg px-2 py-0.5 text-center text-sm font-semibold ${tone(rate)}`}>
        {fmtPct(rate)}
      </span>
      <span className="mt-0.5 block text-[11px] text-slate-500">{sub}</span>
    </td>
  );
}

function YesNo({ ok, label }: { ok: boolean; label: string }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700">
      <CheckCircle2 className="h-4 w-4" />
      {label}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-sm font-medium text-rose-700">
      <XCircle className="h-4 w-4" />
      Yok
    </span>
  );
}

type Filter = 'all' | 'no_report' | 'absent' | 'camera_off' | 'no_goal' | 'no_deneme';

const FILTERS: { id: Filter; label: string; test: (s: CoachStudentStat) => boolean }[] = [
  { id: 'all', label: 'Tümü', test: () => true },
  { id: 'no_report', label: 'Rapor doldurmayan', test: (s) => s.report_filled_days === 0 },
  { id: 'absent', label: 'Devamsızlığı olan', test: (s) => s.attendance_absent > 0 },
  { id: 'camera_off', label: 'Kamerası kapalı', test: (s) => s.camera_total > 0 && s.camera_on < s.camera_total },
  { id: 'no_goal', label: 'Hedef girilmemiş', test: (s) => s.goals_count === 0 },
  { id: 'no_deneme', label: 'Denemeye girmeyen', test: (s) => s.deneme_count === 0 && !s.deneme_joined }
];

export default function CoachStudentBreakdown({
  coachId,
  coachName,
  from,
  to,
  institutionId,
  classId,
  onClose
}: Props) {
  const [row, setRow] = useState<CoachStatRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    setError(null);
    void fetchCoachStats({ from, to, institutionId, coachId, classId, detail: true })
      .then((res) => {
        if (!cancel) setRow(res.coaches.find((c) => c.coach_id === coachId) || null);
      })
      .catch((e) => {
        if (!cancel) setError(e instanceof Error ? e.message : 'Yüklenemedi');
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [coachId, from, to, institutionId, classId]);

  const students = useMemo(() => row?.students || [], [row]);
  const activeStudents = useMemo(() => students.filter((s) => s.active), [students]);

  const counts = useMemo(() => {
    const m = new Map<Filter, number>();
    for (const f of FILTERS) m.set(f.id, activeStudents.filter(f.test).length);
    return m;
  }, [activeStudents]);

  const visible = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter) || FILTERS[0];
    const needle = q.trim().toLocaleLowerCase('tr');
    return students.filter(
      (s) =>
        (filter === 'all' || (s.active && f.test(s))) &&
        (!needle || s.name.toLocaleLowerCase('tr').includes(needle))
    );
  }, [students, filter, q]);

  return (
    <div className="overflow-hidden rounded-2xl border border-teal-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 bg-teal-50/60 px-4 py-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{coachName} — öğrenci bazında</h2>
          <p className="text-xs text-slate-600">
            {from} → {to} · {activeStudents.length} aktif / {students.length} öğrenci · Pasif öğrenciler
            en altta soluk gösterilir ve oranlara katılmaz.
          </p>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <X className="h-4 w-4" />
            Kapat
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Öğrenciler yükleniyor…
        </div>
      ) : error ? (
        <div className="m-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 px-4 py-3">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  filter === f.id
                    ? 'bg-teal-600 text-white'
                    : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {f.label}
                {f.id !== 'all' ? <span className="ml-1 opacity-80">({counts.get(f.id) ?? 0})</span> : null}
              </button>
            ))}
            <label className="ml-auto flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1 text-sm">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Öğrenci ara"
                className="w-36 bg-transparent outline-none"
              />
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2.5">Öğrenci</th>
                  <th className="px-3 py-2.5" title="Rapor doldurduğu gün / aktif olduğu gün">Rapor</th>
                  <th className="px-3 py-2.5" title="Grup canlı ders yoklaması: katıldı / işaretlenen">Ders devamı</th>
                  <th className="px-3 py-2.5" title="Derse katıldığı yoklamalarda kamera açık / işaretlenen">Kamera</th>
                  <th className="px-3 py-2.5" title="Koçun bu dönemde girdiği haftalık hedef">Plan / hedef</th>
                  <th className="px-3 py-2.5" title="Hedeflenen soru sayısında gerçekleşen">Hedef gerçekleşme</th>
                  <th className="px-3 py-2.5" title="E-Desis deneme sonucu">Deneme</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                      Bu filtrede öğrenci yok.
                    </td>
                  </tr>
                ) : (
                  visible.map((s) => (
                    <tr
                      key={s.student_id}
                      className={`border-t border-slate-100 ${s.active ? 'hover:bg-slate-50/80' : 'opacity-50'}`}
                    >
                      <td className="px-3 py-2">
                        <span className="font-medium text-slate-900">{s.name}</span>
                        <span className="mt-0.5 block text-[11px] text-slate-500">
                          {s.class_level ? `${s.class_level}` : ''}
                          {!s.active ? ' · pasif' : ''}
                        </span>
                      </td>
                      <RateCell
                        rate={s.report_rate}
                        sub={`${s.report_filled_days}/${s.report_expected_days} gün`}
                      />
                      <RateCell
                        rate={s.attendance_rate}
                        sub={
                          s.attendance_total
                            ? `${s.attendance_present}/${s.attendance_total} ders${s.attendance_absent ? ` · ${s.attendance_absent} devamsız` : ''}`
                            : 'yoklama yok'
                        }
                      />
                      <RateCell
                        rate={s.camera_rate}
                        sub={s.camera_total ? `${s.camera_on}/${s.camera_total} açık` : 'işaretlenmedi'}
                      />
                      <td className="px-3 py-2">
                        <YesNo ok={s.goals_count > 0} label={`${s.goals_count} hedef`} />
                      </td>
                      <RateCell
                        rate={s.goal_rate}
                        sub={s.goal_target ? `${s.goal_completed}/${s.goal_target} soru` : 'soru hedefi yok'}
                      />
                      <td className="px-3 py-2">
                        <YesNo
                          ok={s.deneme_count > 0 || s.deneme_joined}
                          label={s.deneme_count > 0 ? `${s.deneme_count} deneme` : 'Odaya girdi'}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
