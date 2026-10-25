import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, AlertTriangle, Loader2, RefreshCw, Link2, Unlink, UserPlus, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchEdesisStudentSyncReport,
  fixEdesisStudentSync,
  linkEdesisStudent,
  type EdesisSyncItem,
  type EdesisSyncReport,
  type EdesisSyncStatus
} from '../../lib/edesis/edesisApi';

const STATUS_META: Record<EdesisSyncStatus, { label: string; hint: string; tone: string }> = {
  deleted_in_edesis: {
    label: "Edesis'te silinmiş",
    hint: "Sistemde Edesis numarası kayıtlı ama bu öğrenci Edesis'te yok. Yeniden ekleyin ya da bağlantıyı kaldırın.",
    tone: 'border-rose-200 bg-rose-50 text-rose-800'
  },
  not_linked: {
    label: "Edesis'te yok",
    hint: "Sistemde aktif ama Edesis'e bağlı değil; bu öğrenci Edesis sınavlarına giremez.",
    tone: 'border-amber-200 bg-amber-50 text-amber-900'
  },
  edesis_only: {
    label: 'Yalnız Edesis’te',
    hint: "Edesis'te var ama sistemde hiçbir öğrenciye bağlı değil. Doğru öğrenciyle bağlayın.",
    tone: 'border-sky-200 bg-sky-50 text-sky-900'
  },
  passive_in_system: {
    label: 'Sistemde pasif',
    hint: "Kaydı silinmiş / ayrılmış ama Edesis'te hâlâ duruyor. Gerekirse Edesis'te pasife alın.",
    tone: 'border-slate-200 bg-slate-50 text-slate-700'
  },
  ok: {
    label: 'Senkron',
    hint: "Sistemde ve Edesis'te aynı öğrenci, bağlı.",
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-800'
  }
};

const ORDER: EdesisSyncStatus[] = ['deleted_in_edesis', 'not_linked', 'edesis_only', 'passive_in_system', 'ok'];

function fold(s: string) {
  return String(s || '').toLocaleLowerCase('tr-TR');
}

/** Süzgeç için öğrencinin sınıfı: sistemdeki sınıf, yoksa Edesis'teki sınıf/şube */
function itemClass(i: EdesisSyncItem): string {
  const raw = String(i.classLevel || i.edesis?.gradeName || i.edesis?.className || '').trim();
  if (!raw) return 'Sınıfı yok';
  return /^\d{1,2}$/.test(raw) ? `${Number(raw)}. sınıf` : raw;
}

function classSortKey(label: string): [number, string] {
  const n = label.match(/\d+/);
  if (n) return [Number(n[0]), label];
  if (/lgs/i.test(label)) return [8.5, label];
  if (/mezun|yks|tyt|ayt/i.test(label)) return [12.5, label];
  if (/y[oö]s/i.test(label)) return [13, label];
  if (label === 'Sınıfı yok') return [999, label];
  return [100, label];
}

export default function EdesisStudentSyncPanel() {
  const [report, setReport] = useState<EdesisSyncReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<EdesisSyncStatus | 'issues'>('issues');
  const [q, setQ] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [busyKey, setBusyKey] = useState('');
  const [linkPick, setLinkPick] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setReport(await fetchEdesisStudentSyncReport());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Senkron raporu alınamadı');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const issueCount = report
    ? report.counts.deleted_in_edesis + report.counts.not_linked + report.counts.edesis_only
    : 0;

  /** Bağlanabilecek öğrenciler: sistemde aktif ve Edesis numarası olmayanlar */
  const linkable = useMemo(
    () =>
      (report?.items || [])
        .filter((i) => i.status === 'not_linked' && i.platformStudentId)
        .sort((a, b) => a.platformName.localeCompare(b.platformName, 'tr')),
    [report]
  );

  /** Sınıf seçenekleri: o sınıfta kaç öğrenci ve kaçında düzeltme gerektiği */
  const classOptions = useMemo(() => {
    const map = new Map<string, { total: number; issues: number }>();
    for (const i of report?.items || []) {
      const c = itemClass(i);
      const cur = map.get(c) || { total: 0, issues: 0 };
      cur.total += 1;
      if (['deleted_in_edesis', 'not_linked', 'edesis_only'].includes(i.status)) cur.issues += 1;
      map.set(c, cur);
    }
    return [...map.entries()]
      .map(([label, v]) => ({ label, ...v }))
      .sort((a, b) => {
        const [na, la] = classSortKey(a.label);
        const [nb, lb] = classSortKey(b.label);
        return na - nb || la.localeCompare(lb, 'tr');
      });
  }, [report]);

  /** Durum sayıları seçili sınıfa göre */
  const classCounts = useMemo(() => {
    const c: Record<EdesisSyncStatus, number> = {
      ok: 0,
      deleted_in_edesis: 0,
      not_linked: 0,
      edesis_only: 0,
      passive_in_system: 0
    };
    for (const i of report?.items || []) {
      if (classFilter && itemClass(i) !== classFilter) continue;
      c[i.status] += 1;
    }
    return c;
  }, [report, classFilter]);
  const classIssueCount = classCounts.deleted_in_edesis + classCounts.not_linked + classCounts.edesis_only;

  const shown = useMemo(() => {
    const items = (report?.items || []).filter((i) => !classFilter || itemClass(i) === classFilter);
    const byStatus =
      filter === 'issues'
        ? items.filter((i) => ['deleted_in_edesis', 'not_linked', 'edesis_only'].includes(i.status))
        : items.filter((i) => i.status === filter);
    const needle = fold(q.trim());
    const searched = needle
      ? byStatus.filter(
          (i) =>
            fold(i.platformName).includes(needle) ||
            fold(i.edesis?.name || '').includes(needle) ||
            String(i.edesisId || '').includes(needle) ||
            fold(i.classLevel || '').includes(needle)
        )
      : byStatus;
    return [...searched].sort(
      (a, b) =>
        ORDER.indexOf(a.status) - ORDER.indexOf(b.status) ||
        (a.platformName || a.edesis?.name || '').localeCompare(b.platformName || b.edesis?.name || '', 'tr')
    );
  }, [report, filter, q, classFilter]);

  const run = async (key: string, fn: () => Promise<string>) => {
    setBusyKey(key);
    try {
      toast.success(await fn());
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız', { duration: 10000 });
    } finally {
      setBusyKey('');
    }
  };

  const addToEdesis = (item: EdesisSyncItem, replaceStale = false) =>
    run(`add-${item.platformStudentId}`, async () => {
      const r = await fixEdesisStudentSync({
        action: 'add',
        platformStudentId: item.platformStudentId!,
        replaceStale
      });
      return r.created
        ? `${item.platformName} Edesis'e eklendi (no ${r.edesisStudentId}).`
        : `${item.platformName} Edesis'teki kaydıyla bağlandı (no ${r.edesisStudentId}).`;
    });

  const unlink = (item: EdesisSyncItem) => {
    if (!window.confirm(`${item.platformName} için Edesis bağlantısı (no ${item.edesisId}) kaldırılsın mı?`)) return;
    void run(`unlink-${item.platformStudentId}`, async () => {
      await fixEdesisStudentSync({ action: 'unlink', platformStudentId: item.platformStudentId! });
      return `${item.platformName} için Edesis bağlantısı kaldırıldı.`;
    });
  };

  const link = (item: EdesisSyncItem, platformStudentId: string) => {
    const target = linkable.find((l) => l.platformStudentId === platformStudentId);
    void run(`link-${item.edesisId}`, async () => {
      await linkEdesisStudent({ platformStudentId, edesisStudentId: item.edesisId! });
      return `${item.edesis?.name || item.edesisId} → ${target?.platformName || 'öğrenci'} bağlandı.`;
    });
  };

  return (
    <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Edesis ↔ sistem öğrenci senkronu</h2>
          {report ? (
            report.inSync ? (
              <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                <CheckCircle2 className="h-4 w-4" /> Senkron: sistemdeki aktif öğrencilerin hepsi Edesis&apos;te ve bağlı
              </p>
            ) : (
              <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-rose-700">
                <AlertTriangle className="h-4 w-4" /> Senkron değil: {issueCount} öğrencide düzeltme gerekiyor
              </p>
            )
          ) : null}
          {report ? (
            <p className="mt-0.5 text-xs text-slate-500">
              Sistemde {report.platformCount} öğrenci · Edesis&apos;te {report.edesisCount} öğrenci · kontrol{' '}
              {new Date(report.generatedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Yeniden kontrol et
        </button>
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>
      ) : null}

      {report ? (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setFilter('issues')}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                filter === 'issues' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              Düzeltilecekler ({classIssueCount})
            </button>
            {ORDER.map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setFilter(st)}
                title={STATUS_META[st].hint}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  filter === st ? 'border-slate-900 bg-slate-900 text-white' : STATUS_META[st].tone
                }`}
              >
                {STATUS_META[st].label} ({classCounts[st] || 0})
              </button>
            ))}
          </div>

          {filter !== 'issues' ? <p className="text-xs text-slate-500">{STATUS_META[filter].hint}</p> : null}

          <div className="flex flex-wrap gap-2">
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              aria-label="Sınıf süzgeci"
              className={`rounded-xl border px-3 py-2 text-sm ${
                classFilter ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              <option value="">Tüm sınıflar ({report.items.length})</option>
              {classOptions.map((o) => (
                <option key={o.label} value={o.label}>
                  {o.label} ({o.total}{o.issues ? ` · ${o.issues} düzeltilecek` : ''})
                </option>
              ))}
            </select>
            <label className="flex min-w-[14rem] flex-1 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Öğrenci adı, sınıf veya Edesis no"
                className="w-full bg-transparent text-sm outline-none"
              />
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="py-2 pr-3 font-semibold">Durum</th>
                  <th className="py-2 pr-3 font-semibold">Sistemde</th>
                  <th className="py-2 pr-3 font-semibold">Edesis&apos;te</th>
                  <th className="py-2 font-semibold">Düzenle</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((item) => {
                  const key = `${item.status}-${item.platformStudentId || ''}-${item.edesisId || ''}`;
                  const busy = Boolean(busyKey) && busyKey.endsWith(item.platformStudentId || item.edesisId || '#');
                  return (
                    <tr key={key} className="border-b border-slate-100 align-top">
                      <td className="py-2 pr-3">
                        <span
                          className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_META[item.status].tone}`}
                        >
                          {STATUS_META[item.status].label}
                        </span>
                        {item.status === 'deleted_in_edesis' && item.verified === false ? (
                          <div className="mt-1 text-[11px] text-slate-500">Tek tek doğrulanamadı</div>
                        ) : null}
                      </td>
                      <td className="py-2 pr-3">
                        {item.platformName ? (
                          <>
                            <div className="font-medium text-slate-900">{item.platformName}</div>
                            <div className="text-xs text-slate-500">{item.classLevel || 'sınıf yok'}</div>
                          </>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        {item.edesis ? (
                          <>
                            <div className="text-slate-800">{item.edesis.name || `No ${item.edesis.edesisId}`}</div>
                            <div className="text-xs text-slate-500">
                              No {item.edesis.edesisId}
                              {item.edesis.className ? ` · ${item.edesis.className}` : ''}
                              {item.edesis.otherTerm ? ' · başka dönemde' : ''}
                            </div>
                          </>
                        ) : item.edesisId ? (
                          <div className="text-xs text-rose-700">No {item.edesisId} bulunamadı</div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {item.status === 'not_linked' ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void addToEdesis(item)}
                              className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                            >
                              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                              Edesis&apos;e ekle
                            </button>
                          ) : null}
                          {item.status === 'deleted_in_edesis' ? (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void addToEdesis(item, true)}
                                className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                              >
                                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                                Yeniden ekle
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => unlink(item)}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
                              >
                                <Unlink className="h-3.5 w-3.5" /> Bağlantıyı kaldır
                              </button>
                            </>
                          ) : null}
                          {item.status === 'passive_in_system' && item.platformStudentId ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => unlink(item)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
                            >
                              <Unlink className="h-3.5 w-3.5" /> Bağlantıyı kaldır
                            </button>
                          ) : null}
                          {item.status === 'edesis_only' ? (
                            <>
                              <select
                                value={linkPick[item.edesisId!] ?? item.suggestion?.platformStudentId ?? ''}
                                onChange={(e) => setLinkPick((p) => ({ ...p, [item.edesisId!]: e.target.value }))}
                                className="max-w-[14rem] rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                              >
                                <option value="">Sistemdeki öğrenciyi seç…</option>
                                {linkable.map((l) => (
                                  <option key={l.platformStudentId!} value={l.platformStudentId!}>
                                    {l.platformName}
                                    {l.classLevel ? ` (${l.classLevel})` : ''}
                                    {item.suggestion?.platformStudentId === l.platformStudentId ? ' — öneri' : ''}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                disabled={
                                  Boolean(busyKey) ||
                                  !(linkPick[item.edesisId!] ?? item.suggestion?.platformStudentId)
                                }
                                onClick={() =>
                                  link(item, (linkPick[item.edesisId!] ?? item.suggestion?.platformStudentId)!)
                                }
                                className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                              >
                                <Link2 className="h-3.5 w-3.5" /> Bağla
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!shown.length ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-sm text-slate-500">
                      {filter === 'issues' ? 'Düzeltilecek öğrenci yok — sistem Edesis ile senkron.' : 'Bu grupta öğrenci yok.'}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Edesis ile karşılaştırılıyor…
        </div>
      ) : null}
    </section>
  );
}
