import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Copy, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/session';

type Totals = { group: number; private: number; guidance: number };
type CompareRow = {
  kind: string;
  label: string;
  unit: string;
  declared: number;
  system: number;
  diff: number;
  comparable: boolean;
  state: 'match' | 'mismatch' | 'info';
};
type Row = {
  id: string;
  teacher_id: string;
  teacher_name: string;
  status: string;
  submitted_at: string | null;
  edit_allowed: boolean;
  message_count: number;
  last_message_at: string | null;
  declared: Record<string, number>;
  system: Totals;
  unassigned: { count: number; units: number };
  comparison: { rows: CompareRow[]; declared_total: number; system_total: number; mismatch_count: number; state: string };
};

const STATUS: Record<string, { label: string; dot: string; cls: string }> = {
  pending: { label: 'Form Bekleniyor', dot: '⚪', cls: 'bg-slate-100 text-slate-600' },
  opened: { label: 'Form Açıldı', dot: '🟡', cls: 'bg-amber-100 text-amber-900' },
  submitted: { label: 'Form Geldi', dot: '🟢', cls: 'bg-emerald-100 text-emerald-900' },
  reopened: { label: 'Düzeltmeye Açıldı', dot: '🟠', cls: 'bg-orange-100 text-orange-900' }
};

function donemSecenekleri() {
  const out: Array<{ id: string; label: string }> = [];
  const aylar = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const now = new Date();
  for (let i = 1; i <= 14; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      id: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`,
      label: `${aylar[d.getMonth()]} ${d.getFullYear()}`
    });
  }
  return out;
}

/** Öğretmen aylık beyanları ve sistem kayıtlarıyla karşılaştırma. */
export default function TeacherDeclarationsPage() {
  const donemler = useMemo(donemSecenekleri, []);
  const [period, setPeriod] = useState(donemler[0]?.id || '');
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [periodLabel, setPeriodLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    if (!period) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/teacher-declarations?period=${encodeURIComponent(period)}`);
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Liste alınamadı');
      setRows(j.rows || []);
      setSummary(j.summary || {});
      setPeriodLabel(j.period_label || '');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Liste alınamadı');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('tr');
    return rows.filter((r) => {
      if (fStatus && r.status !== fStatus) return false;
      if (fStatus === 'mismatch' && r.comparison.state !== 'mismatch') return false;
      if (!needle) return true;
      return r.teacher_name.toLocaleLowerCase('tr').includes(needle);
    });
  }, [rows, q, fStatus]);

  const ac = async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await apiFetch(`/api/teacher-declarations?op=detail&id=${encodeURIComponent(id)}`);
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Detay alınamadı');
      setDetail(j);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Detay alınamadı');
    } finally {
      setDetailLoading(false);
    }
  };

  const linkKopyala = async (id: string) => {
    const res = await apiFetch(`/api/teacher-declarations?op=link&id=${encodeURIComponent(id)}`);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(j.error || 'Bağlantı alınamadı');
      return;
    }
    try {
      await navigator.clipboard.writeText(j.url);
      toast.success('Form bağlantısı kopyalandı');
    } catch {
      toast.message(j.url);
    }
  };

  const duzeltmeyeAc = async (id: string) => {
    const res = await apiFetch('/api/teacher-declarations?op=allow-edit', {
      method: 'POST',
      body: JSON.stringify({ id })
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(j.error || 'İşlem başarısız');
      return;
    }
    toast.success(j.message || 'Açıldı');
    setDetail(null);
    await load();
  };

  const cards: Array<[string, number]> = [
    ['Toplam Öğretmen', summary.total || 0],
    ['Form Gönderen', summary.submitted || 0],
    ['Form Göndermeyen', summary.pending || 0],
    ['Formu Açan', summary.opened || 0],
    ['Uyumlu', summary.match || 0],
    ['Uyuşmazlık', summary.mismatch || 0]
  ];

  const dRows = (detail?.details as CompareRow[] | undefined) || [];
  const dCmp = detail?.comparison as Row['comparison'] | undefined;
  const dDecl = detail?.declaration as Record<string, string> | undefined;
  const dUnassigned = detail?.unassigned as { count: number; units: number } | undefined;

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 p-4 sm:p-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Öğretmen</p>
        <h1 className="mt-1 font-serif text-2xl font-semibold text-slate-900">Aylık Çalışma Beyanları</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Öğretmenlerin bildirdiği çalışma ile sistemdeki ders kayıtları yan yana gösterilir. Beyan sistem
          kaydını değiştirmez; farkı gördükten sonra kararı siz verirsiniz.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <label className="text-xs text-slate-600">
          Dönem
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="mt-1 block w-44 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          >
            {donemler.map((d) => (
              <option key={d.id} value={d.id}>{d.label}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-600">
          Öğretmen ara
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="mt-1 block w-48 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs text-slate-600">
          Form durumu
          <select
            value={fStatus}
            onChange={(e) => setFStatus(e.target.value)}
            className="mt-1 block w-44 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          >
            <option value="">Tümü</option>
            {Object.entries(STATUS).map(([id, s]) => (
              <option key={id} value={id}>{s.dot} {s.label}</option>
            ))}
          </select>
        </label>
        <span className="ml-auto text-xs text-slate-500">{filtered.length} kayıt · {periodLabel}</span>
      </div>

      <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
            <p className="text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
            <p className="mt-0.5 text-[11px] font-medium text-slate-600">{label}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Öğretmen</th>
                <th className="px-3 py-2 font-medium">Grup</th>
                <th className="px-3 py-2 font-medium">Özel</th>
                <th className="px-3 py-2 font-medium">Rehberlik</th>
                <th className="px-3 py-2 font-medium">Beyan / Sistem</th>
                <th className="px-3 py-2 font-medium">Durum</th>
                <th className="px-3 py-2 font-medium">Mesaj</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const st = STATUS[r.status] || STATUS.pending;
                const uyusmazlik = r.comparison.state === 'mismatch' && r.status !== 'pending';
                const hucre = (d: number, s: number, karsilastirilabilir = true) => (
                  <span className={karsilastirilabilir && d !== s ? 'font-semibold text-rose-700' : 'text-slate-700'}>
                    {d} <span className="text-slate-400">/ {s}</span>
                  </span>
                );
                return (
                  <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => void ac(r.id)}
                        className="font-medium text-slate-900 hover:text-emerald-700 hover:underline"
                      >
                        {r.teacher_name}
                      </button>
                      {r.unassigned?.count ? (
                        <span className="mt-0.5 flex items-center gap-1 text-[10px] text-amber-700">
                          <AlertTriangle className="h-3 w-3" />
                          {r.unassigned.count} ders öğretmensiz
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">{hucre(r.declared?.group || 0, r.system?.group || 0)}</td>
                    <td className="px-3 py-2">{hucre(r.declared?.private || 0, r.system?.private || 0)}</td>
                    <td className="px-3 py-2">{hucre(r.declared?.guidance || 0, r.system?.guidance || 0, false)}</td>
                    <td className="px-3 py-2 tabular-nums text-slate-600">
                      {r.comparison.declared_total} / {r.comparison.system_total}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}>
                        {st.label}
                      </span>
                      {r.status !== 'pending' ? (
                        <span
                          className={`ml-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            uyusmazlik ? 'bg-rose-100 text-rose-900' : 'bg-emerald-100 text-emerald-900'
                          }`}
                        >
                          {uyusmazlik ? `🔴 ${r.comparison.mismatch_count} fark` : '🟢 Uyumlu'}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">
                      {r.message_count ? `${r.message_count} kez` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => void linkKopyala(r.id)}
                        title="Form bağlantısını kopyala"
                        className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!filtered.length ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-sm text-slate-500">
                    Bu dönemde kayıt yok.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      {detail || detailLoading ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex shrink-0 items-start justify-between gap-2 border-b border-slate-200 px-4 py-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  {dDecl?.teacher_name} — {dDecl?.period_label}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {dDecl?.submitted_at
                    ? `Gönderim: ${new Date(dDecl.submitted_at).toLocaleString('tr-TR')}`
                    : 'Form henüz gönderilmedi'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-slate-50 p-4">
              {detailLoading ? (
                <div className="flex justify-center py-10 text-slate-400">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : (
                <>
                  <section className="rounded-xl border border-slate-200 bg-white p-3">
                    <h4 className="text-xs font-semibold text-slate-700">Toplam karşılaştırma</h4>
                    <table className="mt-2 w-full text-left text-sm">
                      <thead className="text-[11px] uppercase text-slate-400">
                        <tr>
                          <th className="py-1 font-medium">Çalışma</th>
                          <th className="py-1 font-medium">Beyan</th>
                          <th className="py-1 font-medium">Sistem</th>
                          <th className="py-1 font-medium">Fark</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(dCmp?.rows || []).map((r) => (
                          <tr key={r.kind} className="border-t border-slate-100">
                            <td className="py-1.5 text-slate-700">{r.label}</td>
                            <td className="py-1.5 tabular-nums">{r.declared}</td>
                            <td className="py-1.5 tabular-nums text-slate-500">{r.system}</td>
                            <td className="py-1.5">
                              {r.state === 'match' ? (
                                <span className="inline-flex items-center gap-1 text-emerald-700">
                                  <Check className="h-3.5 w-3.5" /> Uyumlu
                                </span>
                              ) : r.state === 'mismatch' ? (
                                <span className="font-semibold text-rose-700">
                                  {r.diff > 0 ? '+' : ''}{r.diff}
                                </span>
                              ) : (
                                <span className="text-slate-400">bilgi</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {dUnassigned?.count ? (
                      <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        Bu dönemde öğretmeni atanmamış {dUnassigned.count} tamamlanmış ders var
                        ({dUnassigned.units} ders birimi). Bunlar hiçbir öğretmenin sistem toplamına
                        girmiyor; fark buradan kaynaklanıyor olabilir.
                      </p>
                    ) : null}
                  </section>

                  <section className="rounded-xl border border-slate-200 bg-white p-3">
                    <h4 className="text-xs font-semibold text-slate-700">Satır bazlı karşılaştırma</h4>
                    <table className="mt-2 w-full text-left text-sm">
                      <thead className="text-[11px] uppercase text-slate-400">
                        <tr>
                          <th className="py-1 font-medium">Sınıf / Öğrenci</th>
                          <th className="py-1 font-medium">Tür</th>
                          <th className="py-1 font-medium">Beyan</th>
                          <th className="py-1 font-medium">Sistem</th>
                          <th className="py-1 font-medium">Durum</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dRows.map((r, i) => (
                          <tr key={i} className="border-t border-slate-100">
                            <td className="py-1.5 text-slate-700">{r.label || '—'}</td>
                            <td className="py-1.5 text-xs text-slate-500">{r.kind}</td>
                            <td className="py-1.5 tabular-nums">{r.declared}</td>
                            <td className="py-1.5 tabular-nums text-slate-500">{r.system}</td>
                            <td className="py-1.5">
                              {r.state === 'match' ? (
                                <span className="text-emerald-700">✓ Uyumlu</span>
                              ) : r.state === 'mismatch' ? (
                                <span className="font-semibold text-rose-700">
                                  ⚠ {Math.abs(r.diff)} fark
                                </span>
                              ) : (
                                <span className="text-slate-400">bilgi</span>
                              )}
                            </td>
                          </tr>
                        ))}
                        {!dRows.length ? (
                          <tr>
                            <td colSpan={5} className="py-6 text-center text-xs text-slate-500">
                              Karşılaştırılacak kayıt yok.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </section>

                  {dDecl?.note ? (
                    <p className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
                      <span className="text-xs font-semibold text-slate-500">Öğretmen notu:</span> {dDecl.note}
                    </p>
                  ) : null}
                </>
              )}
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-4 py-3">
              {dDecl?.status === 'submitted' ? (
                <button
                  type="button"
                  onClick={() => void duzeltmeyeAc(String(dDecl.id))}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Öğretmene düzeltme izni ver
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
