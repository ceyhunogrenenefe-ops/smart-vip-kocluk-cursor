import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LayoutDashboard, Users, Wallet } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { listParentSignContracts } from '../lib/parentSignApi';
import { flattenTaksitRows, formatMultiCurrencySums, sumTaksitByCurrency } from '../lib/taksitMuhasebe';
import { formatTryAmount } from '../lib/groupLessonPaymentUnits';
import { apiFetch } from '../lib/session';
import TahsilatTaksitPanel, { type TahsilatStats } from '../components/muhasebe/TahsilatTaksitPanel';
import TeacherPaymentsPanel from '../components/muhasebe/TeacherPaymentsPanel';

type MuhasebeTab = 'ozet' | 'tahsilat' | 'ogretmen';

const TAB_ITEMS: { id: MuhasebeTab; label: string; icon: typeof Wallet }[] = [
  { id: 'ozet', label: 'Genel bakış', icon: LayoutDashboard },
  { id: 'tahsilat', label: 'Tahsilat & taksit', icon: Wallet },
  { id: 'ogretmen', label: 'Öğretmen ödemeleri', icon: Users }
];

function parseTab(raw: string | null): MuhasebeTab {
  if (raw === 'tahsilat' || raw === 'ogretmen' || raw === 'ozet') return raw;
  return 'ozet';
}

export default function MuhasebePage() {
  const { effectiveUser } = useAuth();
  const { activeInstitutionId } = useApp();
  const isSuper = effectiveUser?.role === 'super_admin';
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get('tab'));
  const [tahsilatStats, setTahsilatStats] = useState<TahsilatStats | null>(null);
  const [teacherPayableTry, setTeacherPayableTry] = useState(0);

  const institutionId = String(
    isSuper ? activeInstitutionId || effectiveUser?.institution_id || '' : effectiveUser?.institution_id || activeInstitutionId || ''
  ).trim();

  const loadOverviewStats = useCallback(async () => {
    try {
      const monthStart = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
      const today = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;

      if (institutionId) {
        const all = await listParentSignContracts();
        const rows = all.filter((r) => String(r.institution_id || '') === institutionId);
        const flat = flattenTaksitRows(rows);
        const unpaid = flat.filter((x) => !x.odendi);
        const overdue = unpaid.filter((x) => x.durum === 'overdue');
        const dueWeek = unpaid.filter((x) => x.durum === 'overdue' || x.durum === 'due_week');
        const thisMonthUnpaid = unpaid.filter((x) => {
          const p = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
          return x.vadeYmd.startsWith(p);
        });
        setTahsilatStats({
          overdueCount: overdue.length,
          overdueSums: sumTaksitByCurrency(flat, (x) => !x.odendi && x.durum === 'overdue'),
          dueWeekCount: dueWeek.length,
          dueWeekSums: sumTaksitByCurrency(flat, (x) => !x.odendi && (x.durum === 'overdue' || x.durum === 'due_week')),
          thisMonthCount: thisMonthUnpaid.length,
          thisMonthSums: sumTaksitByCurrency(thisMonthUnpaid),
          totalOpenSums: sumTaksitByCurrency(unpaid),
          openRowCount: unpaid.length
        });
      }

      const qs = new URLSearchParams({ scope: 'summary', include_sessions: '0', from: monthStart, to: today });
      const res = await apiFetch(`/api/class-live-lessons?${qs.toString()}`);
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        const totals = Array.isArray(j.teacher_totals) ? j.teacher_totals : [];
        const sum = totals.reduce((acc: number, row: { total_amount_tl?: number }) => acc + Number(row.total_amount_tl || 0), 0);
        setTeacherPayableTry(Math.round(sum * 100) / 100);
      }
    } catch {
      /* overview istatistikleri opsiyonel */
    }
  }, [institutionId]);

  useEffect(() => {
    if (tab === 'ozet') void loadOverviewStats();
  }, [tab, loadOverviewStats]);

  const setTab = useCallback(
    (next: MuhasebeTab) => {
      setSearchParams(next === 'ozet' ? {} : { tab: next }, { replace: true });
    },
    [setSearchParams]
  );

  const overviewCards = useMemo(
    () => [
      {
        title: 'Açık taksit borcu',
        value: tahsilatStats ? `${tahsilatStats.openRowCount} satır` : '—',
        sub: tahsilatStats ? formatMultiCurrencySums(tahsilatStats.totalOpenSums) : '',
        tone: 'slate'
      },
      {
        title: 'Vadesi geçen taksit',
        value: tahsilatStats ? String(tahsilatStats.overdueCount) : '—',
        sub: tahsilatStats ? formatMultiCurrencySums(tahsilatStats.overdueSums) : '',
        tone: 'red'
      },
      {
        title: 'Öğretmen ödemeleri (seçili dönem)',
        value: `${formatTryAmount(teacherPayableTry)} ₺`,
        sub: 'Grup dersi tamamlanan oturumlar × birim ücret',
        tone: 'indigo'
      }
    ],
    [tahsilatStats, teacherPayableTry]
  );

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Wallet className="w-8 h-8 text-emerald-600" />
            Muhasebe
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">
            Kurum gelirleri (tahsilat & taksit) ile giderler (grup dersi öğretmen ödemeleri) tek panelde. Oturum
            detaylarını buradan düzenleyebilirsiniz.
          </p>
        </div>
        <Link
          to="/veli-onay"
          className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        >
          Veli sözleşmeleri
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200/80 dark:border-slate-700">
        {TAB_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
              tab === id
                ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'ozet' ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            {overviewCards.map((c) => (
              <div
                key={c.title}
                className="rounded-2xl border border-slate-200 bg-white p-4 dark:bg-slate-900 dark:border-slate-700"
              >
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{c.title}</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{c.value}</p>
                {c.sub ? <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">{c.sub}</p> : null}
              </div>
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <button
              type="button"
              onClick={() => setTab('tahsilat')}
              className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 text-left hover:bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/20"
            >
              <p className="font-bold text-emerald-900 dark:text-emerald-100">Tahsilat & taksit</p>
              <p className="text-sm text-emerald-800/80 dark:text-emerald-200/80 mt-1">
                Veli taksitlerini işaretleyin, vadesi geçenleri takip edin.
              </p>
            </button>
            <button
              type="button"
              onClick={() => setTab('ogretmen')}
              className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-5 text-left hover:bg-indigo-50 dark:border-indigo-900/50 dark:bg-indigo-950/20"
            >
              <p className="font-bold text-indigo-900 dark:text-indigo-100">Öğretmen ödemeleri</p>
              <p className="text-sm text-indigo-800/80 dark:text-indigo-200/80 mt-1">
                Grup dersi birim hesabı, toplamlar ve oturum düzenleme.
              </p>
            </button>
          </div>
        </div>
      ) : null}

      {tab === 'tahsilat' ? <TahsilatTaksitPanel onStatsChange={setTahsilatStats} /> : null}

      {tab === 'ogretmen' ? <TeacherPaymentsPanel onTeacherTotalChange={setTeacherPayableTry} /> : null}
    </div>
  );
}
