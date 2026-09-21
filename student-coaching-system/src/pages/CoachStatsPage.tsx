import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  Camera,
  CalendarRange,
  ChevronRight,
  ClipboardList,
  Loader2,
  RefreshCw,
  Users,
  Target,
  Video
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { userRoleTags } from '../config/rolePermissions';
import {
  fetchCoachStats,
  fetchCoachStatsClassOptions,
  type CoachStatsClassOption,
  type CoachStatsResponse
} from '../lib/coachStatsApi';
import CoachWeeklyComparison from '../components/coachStats/CoachWeeklyComparison';
import CoachStudentBreakdown from '../components/coachStats/CoachStudentBreakdown';
import TrialLessonFunnel from '../components/coachStats/TrialLessonFunnel';

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
  icon,
  title
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
  title?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" title={title}>
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

/** Tablo hücresi: büyük yüzde, altında "kaç öğrenci / kaç kayıt" */
function PctCell({
  rate,
  sub,
  title,
  danger = false
}: {
  rate: number | null | undefined;
  sub: string;
  title?: string;
  danger?: boolean;
}) {
  return (
    <td className="px-3 py-2.5" title={title}>
      <span className={danger && rate ? 'font-semibold text-rose-700' : 'font-semibold text-slate-900'}>
        {fmtPct(rate)}
      </span>
      <span className="mt-0.5 block text-[11px] text-slate-500">{sub}</span>
    </td>
  );
}

export default function CoachStatsPage() {
  const { institutions, activeInstitutionId } = useApp();
  const { effectiveUser } = useAuth();
  const tags = userRoleTags(effectiveUser);
  const isSuper = tags.includes('super_admin');
  const isCoachOnly =
    tags.includes('coach') && !tags.includes('admin') && !tags.includes('super_admin');
  const ownCoachId = String(effectiveUser?.coachId || '').trim();

  const [preset, setPreset] = useState<RangePreset>('this_week');
  const initial = rangeForPreset('this_week');
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [institutionId, setInstitutionId] = useState(
    () => activeInstitutionId || effectiveUser?.institutionId || ''
  );
  const [coachId, setCoachId] = useState(() => (isCoachOnly && ownCoachId ? ownCoachId : ''));
  const [classId, setClassId] = useState('');
  const [classOptions, setClassOptions] = useState<CoachStatsClassOption[]>([]);
  const [coachOptions, setCoachOptions] = useState<{ id: string; name: string }[]>([]);
  const [data, setData] = useState<CoachStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Admin: tabloda tıklanan koçun öğrenci kırılımı */
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const detailRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (selected) detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selected]);

  useEffect(() => {
    if (isCoachOnly && ownCoachId && coachId !== ownCoachId) setCoachId(ownCoachId);
  }, [isCoachOnly, ownCoachId, coachId]);

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
        institutionId: institutionId || null,
        coachId: coachId || null,
        classId: classId || null
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on filters
  }, [from, to, institutionId, coachId, classId]);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      const opts = await fetchCoachStatsClassOptions(institutionId || null);
      if (!cancel) setClassOptions(opts);
      try {
        const r = rangeForPreset('this_week');
        const stats = await fetchCoachStats({
          from: r.from,
          to: r.to,
          institutionId: institutionId || null
        });
        if (cancel) return;
        setCoachOptions(
          (stats.coaches || [])
            .map((c) => ({ id: c.coach_id, name: c.coach_name }))
            .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
        );
      } catch {
        /* dropdown boş kalabilir */
      }
    })();
    return () => {
      cancel = true;
    };
  }, [institutionId]);

  const totals = useMemo(() => {
    const rows = data?.coaches || [];
    const sum = (f: (c: (typeof rows)[number]) => number) => rows.reduce((a, c) => a + (f(c) || 0), 0);
    return {
      students: data?.summary.student_count ?? 0,
      active: data?.summary.active_student_count ?? data?.summary.student_count ?? 0,
      reportStudents: sum((c) => c.report_students_filled),
      absentStudents: sum((c) => c.absent_students ?? 0),
      cameraOn: sum((c) => c.camera_on ?? 0),
      cameraTotal: sum((c) => c.camera_total ?? 0),
      goalAssigned: sum((c) => c.goal_assigned_students ?? 0)
    };
  }, [data]);

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
          yoklama: c.absence_rate ?? 0,
          deneme: c.deneme_entry_rate ?? 0,
          plan: c.planner_goal_rate ?? 0,
          kamera: c.camera_rate ?? 0,
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
            {isCoachOnly
              ? 'Öğrencilerinizin rapor doldurma, ders devamı, kamera, hedef ve deneme durumunu öğrenci öğrenci görün.'
              : 'Koçları karşılaştırın; bir koça tıklayınca öğrencilerinin tek tek durumu açılır.'}{' '}
            Pasif öğrenciler hesaplamaya dahil edilmez.
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
        {!isCoachOnly ? (
          <label className="text-sm text-slate-600">
            Koç
            <select
              value={coachId}
              onChange={(e) => setCoachId(e.target.value)}
              className="mt-1 block min-w-[160px] rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">Tüm koçlar</option>
              {coachOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="text-sm text-slate-600">
          Sınıf
          <select
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className="mt-1 block min-w-[160px] rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">Tüm sınıflar</option>
            {classOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
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

      <CoachWeeklyComparison
        institutionId={institutionId}
        coachId={coachId}
        classId={classId}
        anchorTo={to}
      />

      {data ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <KpiCard
              label="Öğrenci"
              value={`${totals.active} aktif`}
              hint={`${totals.students} toplam · ${data.summary.coach_count} koç`}
              icon={<Users className="h-5 w-5" />}
            />
            <KpiCard
              label="Rapor doldurma"
              value={fmtPct(data.summary.avg_report_fill_rate)}
              hint={`${totals.reportStudents}/${totals.active} öğrenci en az 1 gün doldurdu`}
              title="Doldurulan öğrenci×gün / aktif öğrenci×gün"
              icon={<ClipboardList className="h-5 w-5" />}
            />
            <KpiCard
              label="Ders devamı"
              value={fmtPct(data.summary.avg_attendance_rate)}
              hint={`Devamsızlık ${fmtPct(data.summary.avg_absence_rate)} · ${totals.absentStudents} öğrenci devamsız`}
              title="Grup canlı ders yoklaması: katıldı (geç dahil) / işaretlenen"
              icon={<Users className="h-5 w-5" />}
            />
            <KpiCard
              label="Kamera açık"
              value={fmtPct(data.summary.avg_camera_rate)}
              hint={
                totals.cameraTotal
                  ? `${totals.cameraOn}/${totals.cameraTotal} katılımda kamera açık`
                  : 'Henüz kamera işaretlenmedi'
              }
              title="Derse katılan ve kamerası işaretlenen yoklamalarda kamera açık oranı"
              icon={<Camera className="h-5 w-5" />}
            />
            <KpiCard
              label="Plan / hedef girilen"
              value={fmtPct(data.summary.avg_goal_assigned_rate)}
              hint={`${totals.goalAssigned}/${totals.active} öğrenciye hedef girildi`}
              title="Koçun bu dönemde en az 1 haftalık hedef girdiği aktif öğrenci oranı"
              icon={<Target className="h-5 w-5" />}
            />
            <KpiCard
              label="Hedef gerçekleşme"
              value={fmtPct(data.summary.avg_planner_goal_rate)}
              hint="Girilen soru hedefinde çözülen"
              icon={<Target className="h-5 w-5" />}
            />
            <KpiCard
              label="Deneme katılımı"
              value={fmtPct(
                data.summary.deneme_participation_rate ?? data.summary.avg_deneme_entry_rate
              )}
              hint={`E-Desis · ${data.summary.deneme_participants ?? 0}/${totals.active} öğrenci katıldı`}
              icon={<BarChart3 className="h-5 w-5" />}
            />
            <KpiCard
              label="Görüşme"
              value={fmtPct(data.summary.avg_meeting_completion_rate)}
              hint={`Ortalama skor ${fmtPct(data.summary.avg_composite_score)}`}
              icon={<Video className="h-5 w-5" />}
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
                    <XAxis
                      dataKey="name"
                      angle={-25}
                      textAnchor="end"
                      interval={0}
                      height={60}
                      tick={{ fontSize: 11 }}
                    />
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
                    <Bar dataKey="yoklama" name="Devamsızlık" fill="#e11d48" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="deneme" name="Deneme" fill="#d97706" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="plan" name="Plan hedef" fill="#059669" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="kamera" name="Kamera" fill="#0891b2" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="gorusme" name="Görüşme" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {!isCoachOnly ? (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-4 py-3">
                <h2 className="text-lg font-bold text-slate-900">Koç detay tablosu</h2>
                <p className="text-xs text-slate-500">
                  Her yüzdenin altında kaç öğrenciden hesaplandığı yazar. Öğrencilerin tek tek durumunu
                  görmek için koça tıklayın.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2.5">#</th>
                      <th className="px-3 py-2.5">Koç</th>
                      <th className="px-3 py-2.5">Öğrenci</th>
                      <th className="px-3 py-2.5" title="Doldurulan öğrenci×gün / aktif öğrenci×gün">Rapor</th>
                      <th className="px-3 py-2.5" title="Grup canlı ders: katıldı / işaretlenen">Ders devamı</th>
                      <th className="px-3 py-2.5" title="Devamsız yoklama / işaretlenen">Devamsızlık</th>
                      <th className="px-3 py-2.5" title="Derse katılanlarda kamera açık oranı">Kamera</th>
                      <th className="px-3 py-2.5" title="En az 1 hedef girilen aktif öğrenci">Plan / hedef</th>
                      <th className="px-3 py-2.5" title="Soru hedefinde gerçekleşen">Hedef gerçekleşme</th>
                      <th className="px-3 py-2.5" title="E-Desis deneme sonucu olan aktif öğrenci">Deneme</th>
                      <th className="px-3 py-2.5">Görüşme</th>
                      <th className="px-3 py-2.5">Skor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.coaches.map((c, i) => {
                      const active = c.active_student_count ?? c.student_count;
                      const isSel = selected?.id === c.coach_id;
                      return (
                        <tr
                          key={c.coach_id}
                          onClick={() =>
                            setSelected(isSel ? null : { id: c.coach_id, name: c.coach_name })
                          }
                          className={`cursor-pointer border-t border-slate-100 ${
                            isSel ? 'bg-teal-50' : 'hover:bg-slate-50/80'
                          }`}
                        >
                          <td className="px-3 py-2.5 text-slate-400">{i + 1}</td>
                          <td className="px-3 py-2.5 font-medium text-slate-900">
                            <span className="inline-flex items-center gap-1 text-teal-800 underline-offset-2 hover:underline">
                              {c.coach_name}
                              <ChevronRight className={`h-4 w-4 transition ${isSel ? 'rotate-90' : ''}`} />
                            </span>
                            {c.coach_email ? (
                              <span className="mt-0.5 block text-xs font-normal text-slate-500">
                                {c.coach_email}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="font-semibold text-slate-900">{active} aktif</span>
                            <span className="mt-0.5 block text-[11px] text-slate-500">
                              {c.student_count} toplam
                            </span>
                          </td>
                          <PctCell
                            rate={c.report_fill_rate}
                            sub={`${c.report_students_filled}/${active} öğrenci doldurdu`}
                            title={`${c.report_filled_slots}/${c.report_expected_slots} öğrenci×gün`}
                          />
                          <PctCell
                            rate={c.attendance_rate}
                            sub={`${c.attendance_present}/${c.attendance_total} yoklama`}
                          />
                          <PctCell
                            rate={c.absence_rate}
                            danger
                            sub={`${c.absent_students ?? 0} öğrenci · ${c.attendance_absent ?? 0} ders`}
                          />
                          <PctCell
                            rate={c.camera_rate}
                            sub={c.camera_total ? `${c.camera_on}/${c.camera_total} açık` : 'işaretlenmedi'}
                          />
                          <PctCell
                            rate={c.goal_assigned_rate}
                            sub={`${c.goal_assigned_students ?? 0}/${active} öğrenci`}
                          />
                          <PctCell
                            rate={c.planner_goal_rate}
                            sub={`${c.planner_goal_completed}/${c.planner_goal_target} soru`}
                          />
                          <PctCell
                            rate={c.deneme_entry_rate}
                            sub={`${c.deneme_students}/${active} öğrenci`}
                          />
                          <PctCell
                            rate={c.meeting_completion_rate}
                            sub={`${c.meetings_completed}/${c.meetings_total}`}
                          />
                          <td className="px-3 py-2.5 font-semibold text-teal-800">
                            {fmtPct(c.composite_score)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div ref={detailRef}>
            {isCoachOnly && ownCoachId ? (
              <CoachStudentBreakdown
                coachId={ownCoachId}
                coachName={data.coaches[0]?.coach_name || 'Öğrencilerim'}
                from={from}
                to={to}
                institutionId={institutionId || null}
                classId={classId || null}
              />
            ) : selected ? (
              <CoachStudentBreakdown
                coachId={selected.id}
                coachName={selected.name}
                from={from}
                to={to}
                institutionId={institutionId || null}
                classId={classId || null}
                onClose={() => setSelected(null)}
              />
            ) : null}
          </div>

          {data.trial_lessons ? (
            <TrialLessonFunnel data={data.trial_lessons} from={data.from} to={data.to} />
          ) : null}

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">Notlar</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              <li>
                <strong>Deneme katılım:</strong> E-Desis’ten senkronlanan sonuçlar tercih edilir; aktif
                öğrenci paydasına göre oranlanır.
              </li>
              <li>
                <strong>Haftalık karşılaştırma:</strong> Geçen hafta ile bu haftayı aynı filtrelerle
                (koç, sınıf) yan yana gösterir; ortak deneme günleri haftanın gününe göre hizalanır.
              </li>
              <li>
                <strong>Kamera:</strong> Öğretmenin yoklamada işaretlediği kamera durumundan hesaplanır; yalnız
                derse katılan öğrenciler sayılır. 21 Eylül 2026 öncesinde kamera bilgisi kaydedilmediği için o
                tarihlerde "işaretlenmedi" görünür.
              </li>
              <li>
                <strong>Plan / hedef:</strong> Koçun seçili dönemde en az bir haftalık hedef girdiği öğrenci
                oranı; "hedef gerçekleşme" girilen soru hedefinin ne kadarının çözüldüğüdür.
              </li>
              <li>
                <strong>Pasif öğrenciler:</strong> Aktivite dönemleri dışında kalan günler tüm
                oranlardan çıkarılır.
              </li>
            </ul>
          </div>
        </>
      ) : null}
    </div>
  );
}
