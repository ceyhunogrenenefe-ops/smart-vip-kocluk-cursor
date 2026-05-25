import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import {
  listInstitutionsForPicker,
  listParentSignContracts,
  patchParentSignKayitOnly,
  type InstitutionPickRow,
  type ParentSignContractRow
} from '../lib/parentSignApi';
import {
  flattenTaksitRows,
  formatTrShortDate,
  type TaksitDurum,
  type TaksitFlatRow
} from '../lib/taksitMuhasebe';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Loader2,
  RefreshCw,
  Wallet
} from 'lucide-react';

function durumEtiket(d: TaksitDurum): { text: string; cls: string } {
  switch (d) {
    case 'paid':
      return { text: 'Ödendi', cls: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200' };
    case 'overdue':
      return { text: 'Vadesi geçti', cls: 'bg-red-100 text-red-900 dark:bg-red-950/50 dark:text-red-200' };
    case 'due_week':
      return { text: '≤7 gün', cls: 'bg-amber-100 text-amber-950 dark:bg-amber-900/40 dark:text-amber-100' };
    case 'due_month':
      return { text: '≤30 gün', cls: 'bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100' };
    default:
      return { text: 'Gelecek', cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200' };
  }
}

export default function TahsilatMuhasebePage() {
  const { effectiveUser } = useAuth();
  const { activeInstitutionId, institution } = useApp();
  const isSuper = effectiveUser?.role === 'super_admin';
  const [institutionId, setInstitutionId] = useState('');
  const [institutionOptions, setInstitutionOptions] = useState<InstitutionPickRow[]>([]);
  const [loadingInstitutions, setLoadingInstitutions] = useState(false);

  const effectiveInstitutionId = useMemo(() => {
    if (isSuper) {
      const p = institutionId.trim();
      if (p) return p;
      return String(activeInstitutionId || '').trim();
    }
    return String(activeInstitutionId || effectiveUser?.institution_id || '').trim();
  }, [isSuper, institutionId, activeInstitutionId, effectiveUser?.institution_id]);

  const [rows, setRows] = useState<ParentSignContractRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [filterMonth, setFilterMonth] = useState('');
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!isSuper) return;
    let c = false;
    void (async () => {
      setLoadingInstitutions(true);
      try {
        const opts = await listInstitutionsForPicker();
        if (!c) setInstitutionOptions(opts);
      } catch {
        if (!c) setInstitutionOptions([]);
      } finally {
        if (!c) setLoadingInstitutions(false);
      }
    })();
    return () => {
      c = true;
    };
  }, [isSuper]);

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const all = await listParentSignContracts();
      const inst = effectiveInstitutionId;
      if (!inst) {
        setRows([]);
        return;
      }
      setRows(all.filter((r) => String(r.institution_id || '') === inst));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Liste yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [effectiveInstitutionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const flat = useMemo(() => flattenTaksitRows(rows), [rows]);

  const stats = useMemo(() => {
    const unpaid = flat.filter((x) => !x.odendi);
    const overdue = unpaid.filter((x) => x.durum === 'overdue');
    const dueWeek = unpaid.filter((x) => x.durum === 'overdue' || x.durum === 'due_week');
    const sum = (arr: TaksitFlatRow[]) => arr.reduce((s, x) => s + (Number.isFinite(x.tutarTl) ? x.tutarTl : 0), 0);
    const thisMonthPrefix = filterMonth.trim();
    const thisMonthUnpaid =
      thisMonthPrefix.length === 7
        ? unpaid.filter((x) => x.vadeYmd.startsWith(thisMonthPrefix))
        : unpaid.filter((x) => {
            const t = new Date();
            const p = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
            return x.vadeYmd.startsWith(p);
          });
    return {
      overdueCount: overdue.length,
      overdueTl: sum(overdue),
      dueWeekCount: dueWeek.length,
      dueWeekTl: sum(dueWeek),
      thisMonthCount: thisMonthUnpaid.length,
      thisMonthTl: sum(thisMonthUnpaid),
      totalOpenTl: sum(unpaid)
    };
  }, [flat, filterMonth]);

  const filtered = useMemo(() => {
    let f = flat;
    const q = search.trim().toLowerCase();
    if (q) {
      f = f.filter(
        (x) =>
          x.ogrenciLabel.toLowerCase().includes(q) ||
          x.contractNumber.toLowerCase().includes(q) ||
          x.programAdi.toLowerCase().includes(q)
      );
    }
    if (onlyOverdue) f = f.filter((x) => !x.odendi && x.durum === 'overdue');
    if (filterMonth.trim().length === 7) {
      const p = filterMonth.trim();
      f = f.filter((x) => x.vadeYmd.startsWith(p) || (!x.odendi && x.durum === 'overdue'));
    }
    return [...f].sort((a, b) => a.vadeYmd.localeCompare(b.vadeYmd) || a.contractNumber.localeCompare(b.contractNumber));
  }, [flat, search, onlyOverdue, filterMonth]);

  const toggle = async (contractId: string, index: number, odendi: boolean) => {
    setBusyKey(`${contractId}:${index}`);
    setMsg(null);
    try {
      await patchParentSignKayitOnly({ id: contractId, taksit_odeme_update: { index, odendi } });
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Güncellenemedi');
    } finally {
      setBusyKey(null);
    }
  };

  const headerKurum =
    isSuper && institutionId.trim()
      ? institutionOptions.find((o) => o.id === institutionId.trim())?.name
      : institution?.name;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Wallet className="w-8 h-8 text-emerald-600" />
            Tahsilat & taksit
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-xl">
            Veli sözleşmelerindeki taksitleri aylık takip edin. Vadesi geçen ve yaklaşan ödemeler üstte vurgulanır;
            ödeme alındığında satırı işaretleyin.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/veli-onay"
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          >
            Veli onayı <ChevronRight className="w-4 h-4" />
          </Link>
          <button
            type="button"
            disabled={loading}
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-900 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-100 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Yenile
          </button>
        </div>
      </div>

      {isSuper ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Kurum (süper admin)</label>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <select
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600 min-w-[200px]"
              value={institutionId}
              onChange={(e) => setInstitutionId(e.target.value)}
              disabled={loadingInstitutions}
            >
              <option value="">Aktif kurum / üst çubuk</option>
              {institutionOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            {loadingInstitutions ? <Loader2 className="w-4 h-4 animate-spin text-slate-400" /> : null}
          </div>
        </div>
      ) : null}

      {stats.overdueCount > 0 ? (
        <div
          role="alert"
          className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-950 shadow-sm dark:border-red-800 dark:bg-red-950/40 dark:text-red-100 flex flex-wrap items-center gap-3"
        >
          <AlertTriangle className="w-6 h-6 shrink-0 text-red-600 dark:text-red-400" />
          <div>
            <p className="font-bold">
              {stats.overdueCount} taksitin vadesi geçti ({stats.overdueTl.toLocaleString('tr-TR')} TL tahsil edilmedi)
            </p>
            <p className="text-xs opacity-90 mt-0.5">
              Aşağıdan ödeme alındıkça «Ödendi» kutusunu işaretleyin; böylece aylık takipte borç kalmaz.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          Şu an vadesi geçmiş ödenmemiş taksit yok. Yaklaşan vadeler için aşağıdaki özetlere bakın.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 dark:from-amber-950/30 dark:to-slate-900 dark:border-amber-900/50">
          <p className="text-xs font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-1">
            <CalendarDays className="w-4 h-4" /> Bu hafta içinde / geciken (ödenmemiş)
          </p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{stats.dueWeekCount}</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">{stats.dueWeekTl.toLocaleString('tr-TR')} TL</p>
        </div>
        <div className="rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-4 dark:from-sky-950/25 dark:to-slate-900 dark:border-sky-900/40">
          <p className="text-xs font-semibold text-sky-900 dark:text-sky-200">Seçili ay vadesi (ödenmemiş)</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{stats.thisMonthCount}</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">{stats.thisMonthTl.toLocaleString('tr-TR')} TL</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:bg-slate-900 dark:border-slate-700">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Toplam açık borç (taksit)</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
            {flat.filter((x) => !x.odendi).length} satır
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-400">{stats.totalOpenTl.toLocaleString('tr-TR')} TL</p>
        </div>
      </div>

      {headerKurum ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Kurum: <strong className="text-slate-800 dark:text-slate-200">{headerKurum}</strong>
        </p>
      ) : null}

      {msg ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {msg}
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:bg-slate-900 dark:border-slate-700">
        <div>
          <label className="text-xs text-slate-500 dark:text-slate-400">Ay filtresi</label>
          <input
            type="month"
            className="mt-1 block rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:bg-slate-950 dark:border-slate-600"
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
          />
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
          <input type="checkbox" checked={onlyOverdue} onChange={(e) => setOnlyOverdue(e.target.checked)} />
          Yalnızca vadesi geçenler
        </label>
        <div className="flex-1 min-w-[160px]">
          <label className="text-xs text-slate-500 dark:text-slate-400">Ara (öğrenci / belge / program)</label>
          <input
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:bg-slate-950 dark:border-slate-600"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ara…"
          />
        </div>
      </div>

      {loading && !rows.length ? (
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin" /> Yükleniyor…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500 dark:border-slate-600">
          <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-50" />
          Bu kurumda henüz taksit satırı yok veya filtrelere uyan kayıt yok. Taksitler veli ücreti girildikten sonra oluşur.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300">
                <th className="px-3 py-2">Vade</th>
                <th className="px-3 py-2">Öğrenci</th>
                <th className="px-3 py-2">Program</th>
                <th className="px-3 py-2 text-right">Tutar</th>
                <th className="px-3 py-2">Durum</th>
                <th className="px-3 py-2">Ödendi</th>
                <th className="px-3 py-2">Belge</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((x) => {
                const st = durumEtiket(x.durum);
                const busy = busyKey === `${x.contractId}:${x.taksitIndex}`;
                return (
                  <tr
                    key={`${x.contractId}-${x.taksitIndex}`}
                    className={
                      x.durum === 'overdue' && !x.odendi
                        ? 'bg-red-50/60 dark:bg-red-950/15'
                        : x.durum === 'due_week' && !x.odendi
                          ? 'bg-amber-50/50 dark:bg-amber-950/10'
                          : 'odd:bg-white even:bg-slate-50/50 dark:odd:bg-slate-900 dark:even:bg-slate-800/40'
                    }
                  >
                    <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{formatTrShortDate(x.vadeYmd)}</td>
                    <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">{x.ogrenciLabel}</td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400 max-w-[180px] truncate">{x.programAdi || '—'}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{x.tutarTl.toLocaleString('tr-TR')} TL</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}>{st.text}</span>
                    </td>
                    <td className="px-3 py-2">
                      <label className="inline-flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-200">
                        <input
                          type="checkbox"
                          checked={x.odendi}
                          disabled={busy}
                          onChange={(e) => void toggle(x.contractId, x.taksitIndex, e.target.checked)}
                        />
                        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                      </label>
                      {x.odendi && x.odendiTarihi ? (
                        <span className="block text-[10px] text-slate-500 mt-0.5">{formatTrShortDate(x.odendiTarihi)}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                      {x.contractNumber}
                      {!x.signed ? (
                        <span className="block text-amber-700 dark:text-amber-300">İmza bekliyor</span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
