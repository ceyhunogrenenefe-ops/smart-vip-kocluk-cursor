import React, { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ClipboardList, LayoutDashboard, School, Users, Wallet } from 'lucide-react';
import TahsilatTaksitPanel from '../components/muhasebe/TahsilatTaksitPanel';
import TeacherPaymentsPanel from '../components/muhasebe/TeacherPaymentsPanel';
import StudentPaymentTrackerPanel from '../components/muhasebe/StudentPaymentTrackerPanel';
import MuhasebeOverviewPanel from '../components/muhasebe/MuhasebeOverviewPanel';
import MuhasebeClassReportPanel from '../components/muhasebe/MuhasebeClassReportPanel';

type MuhasebeTab = 'ozet' | 'tahsilat' | 'ogrenci-odeme' | 'ogretmen' | 'sinif-rapor';

const TAB_ITEMS: { id: MuhasebeTab; label: string; icon: typeof Wallet }[] = [
  { id: 'ozet', label: 'Genel bakış', icon: LayoutDashboard },
  { id: 'sinif-rapor', label: 'Sınıf raporu', icon: School },
  { id: 'tahsilat', label: 'Tahsilat & taksit', icon: Wallet },
  { id: 'ogrenci-odeme', label: 'Öğrenci ödemeleri', icon: ClipboardList },
  { id: 'ogretmen', label: 'Öğretmen ödemeleri', icon: Users }
];

function parseTab(raw: string | null): MuhasebeTab {
  if (
    raw === 'tahsilat' ||
    raw === 'ogretmen' ||
    raw === 'ozet' ||
    raw === 'ogrenci-odeme' ||
    raw === 'sinif-rapor'
  ) {
    return raw;
  }
  return 'ozet';
}

export default function MuhasebePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get('tab'));
  const [, setTeacherPayableTry] = useState(0);

  const setTab = useCallback(
    (next: MuhasebeTab) => {
      setSearchParams(next === 'ozet' ? {} : { tab: next }, { replace: true });
    },
    [setSearchParams]
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
            Aylık gelir–gider–kâr, ekstra giderler, sınıf bazlı öğrenci ödemeleri ve öğretmen giderleri.
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
        <MuhasebeOverviewPanel
          onGoTab={(t) => setTab(t)}
        />
      ) : null}

      {tab === 'sinif-rapor' ? <MuhasebeClassReportPanel /> : null}

      {tab === 'tahsilat' ? <TahsilatTaksitPanel /> : null}

      {tab === 'ogrenci-odeme' ? <StudentPaymentTrackerPanel /> : null}

      {tab === 'ogretmen' ? <TeacherPaymentsPanel onTeacherTotalChange={setTeacherPayableTry} /> : null}
    </div>
  );
}
