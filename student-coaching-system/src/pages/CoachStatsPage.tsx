import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import {
  BarChart3,
  CalendarRange,
  ClipboardList,
  Loader2,
  RefreshCw,
  Trophy,
  Users,
  Target,
  Video
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { userRoleTags } from '../config/rolePermissions';
import { fetchCoachStats, type CoachStatsResponse } from '../lib/coachStatsApi';

const TZ = 'Europe/Istanbul';

function istanbulToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function addDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

function mondayOf(ymd: string): string {
  const noon = new Date(`${ymd}T12:00:00+03:00`);
  const short = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(noon);
  const map: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  return addDaysYmd(ymd, -(map[short] ?? 0));
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return '—';
  return `%${v.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`;
}

type RangePreset = 'this_week' | 'last_week' | 'last_30';

function rangeForPreset(preset: RangePreset): { from: string; to: string } {
  const today = istanbulToday();
  if (preset === 'last_30') return { from: addDaysYmd(today, -29), to: today };
  const mon = mondayOf(today);
  if (preset === 'this_week') return { from: mon, to: today };
  const lastMon = addDaysYmd(mon, -7);
  return { from: lastMon, to: addDaysYmd(lastMon, 6) };
}

function KpiCard({
  label,
  value,
  hint,
  icon
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
          {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
          {icon}
        </div>
      </div>
    </div>
  );
}

export default function CoachStatsPage() {
  const { institutions, activeInstitutionId } = useApp();
  const { effectiveUser } = useAuth();
  const tags = userRoleTags(effectiveUser);
  const isSuper = tags.includes('super_admin');

  const [preset, setPreset] = useState<RangePreset>('this_week');
  const initial = rangeForPreset('this_week');
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [institutionId, setInstitutionId] = useState(
    () => activeInstitutionId || effectiveUser?.institutionId || ''
  );
  const [data, setData] = useState<CoachStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const applyPreset = (p: RangePreset) => {
    setPreset(p);
    const r = rangeForPreset(p);
    setFrom(r.from);
    setTo(r.to);
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchCoachStats({
        from,
        to,
        institutionId: institutionId || null
      });
      setData(res);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : 'Yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on range/institution
  }, [from, to, institutionId]);

  const chartData = useMemo(
    () =>
      (data?.coaches || [])
        .filter((c) => c.student_count > 0)
        .slice(0, 20)
        .map((c) => ({
          name: c.coach_name.length > 14 ? `${c.coach_name.slice(0, 12)}…` : c.coach_name,
          fullName: c.coach_name,
          rapor: c.report_fill_rate ?? 0,
          devam: c.attendance_rate ?? 0,
          denemeOda: c.deneme_join_rate ?? 0,
          plan: c.planner_goal_rate ?? 0,
          gorusme: c.meeting_completion_rate ?? 0
        })),
    [data]
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <BarChart3 className="h-7 w-7 text-teal-600" />
            Koç İstatistikleri
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Haftalık rapor doldurma, canlı ders devamı, deneme girişi ve koç görüşmelerini
            koç bazında karşılaştırın.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Yenile
        </button>
      </header>

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['this_week', 'Bu hafta'],
              ['last_week', 'Geçen hafta'],
              ['last_30', 'Son 30 gün']
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => applyPreset(key)}
              className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                preset === key
                  ? 'bg-teal-600 text-white'
                  : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="text-sm text-slate-600">
          Başlangıç
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setPreset('this_week');
              setFrom(e.target.value);
            }}
            className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm text-slate-600">
          Bitiş
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setPreset('this_week');
              setTo(e.target.value);
            }}
            className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        {isSuper && institutions?.length ? (
          <label className="text-sm text-slate-600">
            Kurum
            <select
              value={institutionId}
              onChange={(e) => setInstitutionId(e.target.value)}
              className="mt-1 block min-w-[200px] rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">Tüm kurumlar</option>
              {institutions.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
          <CalendarRange className="h-4 w-4" />
          {data ? `${data.from} → ${data.to} · ${data.day_count} gün` : '—'}
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      ) : null}

      {loading && !data ? (
        <div className="flex items-center justify-center gap-2 py-20 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          İstatistikler hesaplanıyor…
        </div>
      ) : null}

      {data ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
            <KpiCard
              label="Ort. rapor doluluk"
              value={fmtPct(data.summary.avg_report_fill_rate)}
              hint="Öğrenci×gün"
              icon={<ClipboardList className="h-5 w-5" />}
            />
            <KpiCard
              label="Ort. ders devamı"
              value={fmtPct(data.summary.avg_attendance_rate)}
              hint="Grup canlı ders"
              icon={<Users className="h-5 w-5" />}
            />
            <KpiCard
              label="Ort. deneme oda"
              value={fmtPct(data.summary.avg_deneme_join_rate)}
              hint="BBB giriş logu"
              icon={<BarChart3 className="h-5 w-5" />}
            />
            <KpiCard
              label="Ort. plan hedef"
              value={fmtPct(data.summary.avg_planner_goal_rate)}
              hint="Koç soru kotası"
              icon={<Target className="h-5 w-5" />}
            />
            <KpiCard
              label="Ort. deneme sonuç"
              value={fmtPct(data.summary.avg_deneme_entry_rate)}
              hint="≥1 sonuç kaydı"
              icon={<BarChart3 className="h-5 w-5" />}
            />
            <KpiCard
              label="Ort. görüşme"
              value={fmtPct(data.summary.avg_meeting_completion_rate)}
              hint="Koç görüşmeleri"
              icon={<Video className="h-5 w-5" />}
            />
            <KpiCard
              label="Ortalama skor"
              value={fmtPct(data.summary.avg_composite_score)}
              hint={`${data.summary.coach_count} koç · ${data.summary.student_count} öğrenci`}
              icon={<Trophy className="h-5 w-5" />}
            />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <h2 className="mb-4 text-lg font-bold text-slate-900">Koç karşılaştırması (%)</h2>
            {chartData.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500">
                Bu aralıkta öğrencisi olan koç bulunamadı.
              </p>
            ) : (
              <div className="h-[360px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 48 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" angle={-25} textAnchor="end" interval={0} height={60} tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(v: number) => `%${v}`}
                      labelFormatter={(_, payload) =>
                        (payload?.[0]?.payload as { fullName?: string })?.fullName || ''
                      }
                    />
                    <Legend />
                    <Bar dataKey="rapor" name="Rapor" fill="#0d9488" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="devam" name="Devam" fill="#2563eb" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="denemeOda" name="Deneme oda" fill="#d97706" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="plan" name="Plan hedef" fill="#059669" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="gorusme" name="Görüşme" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="text-lg font-bold text-slate-900">Koç detay tablosu</h2>
              <p className="text-xs text-slate-500">
                Skor = rapor, devam, deneme oda (yoksa sonuç) ve plan hedef ortalaması
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2.5">#</th>
                    <th className="px-3 py-2.5">Koç</th>
                    <th className="px-3 py-2.5">Öğrenci</th>
                    <th className="px-3 py-2.5">Rapor %</th>
                    <th className="px-3 py-2.5">Devam %</th>
                    <th className="px-3 py-2.5">Deneme oda %</th>
                    <th className="px-3 py-2.5">Plan hedef %</th>
                    <th className="px-3 py-2.5">Sonuç %</th>
                    <th className="px-3 py-2.5">Görüşme %</th>
                    <th className="px-3 py-2.5">Skor</th>
                  </tr>
                </thead>
                <tbody>
                  {data.coaches.map((c, i) => (
                    <tr key={c.coach_id} className="border-t border-slate-100 hover:bg-slate-50/80">
                      <td className="px-3 py-2.5 text-slate-400">{i + 1}</td>
                      <td className="px-3 py-2.5 font-medium text-slate-900">
                        {c.coach_name}
                        {c.coach_email ? (
                          <span className="mt-0.5 block text-xs font-normal text-slate-500">
                            {c.coach_email}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5">{c.student_count}</td>
                      <td className="px-3 py-2.5">
                        {fmtPct(c.report_fill_rate)}
                        <span className="mt-0.5 block text-[11px] text-slate-400">
                          {c.report_filled_slots}/{c.report_expected_slots}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {fmtPct(c.attendance_rate)}
                        <span className="mt-0.5 block text-[11px] text-slate-400">
                          {c.attendance_present}/{c.attendance_total}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {fmtPct(c.deneme_join_rate)}
                        <span className="mt-0.5 block text-[11px] text-slate-400">
                          {c.deneme_join_students}/{c.student_count}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {fmtPct(c.planner_goal_rate)}
                        <span className="mt-0.5 block text-[11px] text-slate-400">
                          {c.planner_goal_completed}/{c.planner_goal_target}
                          {c.planner_students_with_goals > 0
                            ? ` · ${c.planner_students_met}/${c.planner_students_with_goals} öğr.`
                            : ''}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {fmtPct(c.deneme_entry_rate)}
                        <span className="mt-0.5 block text-[11px] text-slate-400">
                          {c.deneme_students}/{c.student_count}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {fmtPct(c.meeting_completion_rate)}
                        <span className="mt-0.5 block text-[11px] text-slate-400">
                          {c.meetings_completed}/{c.meetings_total}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-teal-800">
                        {fmtPct(c.composite_score)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">Notlar</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              <li>
                <strong>Deneme oda:</strong> Akademik Merkez BBB deneme sınıfına giriş logu (SQL tablosu
                gerekir). Tablo yoksa oran boş kalır; deploy sonrası SQL’i çalıştırın.
              </li>
              <li>
                <strong>Plan hedef:</strong> Koçun verdiği soru hedeflerine göre gerçekleşme (günlük rapor
                kayıtları).
              </li>
              <li>
                Sonraki: konu takip, özel canlı ders yoklama, Soru Sor çözüm oranı.
              </li>
            </ul>
          </div>
        </>
      ) : null}
    </div>
  );
}
