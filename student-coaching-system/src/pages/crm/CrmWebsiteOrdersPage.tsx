import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Loader2, RefreshCw, Search, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import {
  crmWebsiteOrdersBackfill,
  crmWebsiteOrdersExport,
  crmWebsiteOrdersList,
  type CrmWebsiteOrderRow,
} from '../../lib/crmWebsiteOrdersApi';
import { exportCrmWebsiteOrdersToExcel } from '../../lib/crmWebsiteOrdersExport';
import { useAuth } from '../../context/AuthContext';
import { userRoleTags } from '../../config/rolePermissions';

const CATEGORY_OPTIONS = [
  { value: '', label: 'Tüm kategoriler' },
  { value: 'deneme', label: 'Deneme / Kulüp' },
  { value: 'kitap', label: 'Kitap' },
  { value: 'egitim', label: 'Eğitim' },
  { value: 'kocluk', label: 'Koçluk' },
  { value: 'ozel_ders', label: 'Özel ders' },
  { value: 'diger', label: 'Diğer' },
];

const PAYMENT_OPTIONS = [
  { value: '', label: 'Tüm ödemeler' },
  { value: 'paid', label: 'Ödendi' },
  { value: 'pending', label: 'Bekliyor' },
  { value: 'processing', label: 'İşlemde' },
  { value: 'failed', label: 'Başarısız' },
];

const ADDRESS_OPTIONS = [
  { value: '', label: 'Tüm adresler' },
  { value: 'complete', label: 'Adres tam' },
  { value: 'missing', label: 'Adres Eksik' },
  { value: 'not_required', label: 'Adres gerekmez' },
];

function fmtTry(kurus: number | null) {
  if (kurus == null) return '—';
  return `${(kurus / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺`;
}

function fmtWhen(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
}

function paymentBadge(status: string) {
  const s = status.toLowerCase();
  if (s === 'paid') return 'bg-emerald-100 text-emerald-900';
  if (s === 'failed') return 'bg-red-100 text-red-900';
  if (s === 'processing') return 'bg-sky-100 text-sky-900';
  return 'bg-amber-100 text-amber-900';
}

export default function CrmWebsiteOrdersPage() {
  const { effectiveUser } = useAuth();
  const tags = userRoleTags(effectiveUser);
  const isAdmin = tags.includes('super_admin') || tags.includes('admin');

  const [rows, setRows] = useState<CrmWebsiteOrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [productCategory, setProductCategory] = useState('');
  const [addressStatus, setAddressStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(search.trim()), 350);
    return () => window.clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await crmWebsiteOrdersList({
        q: debouncedQ || undefined,
        payment_status: paymentStatus || undefined,
        product_category: productCategory || undefined,
        address_status: addressStatus || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        limit: 200,
        offset: 0,
      });
      setRows(data.rows);
      setTotal(data.total);
    } catch (e) {
      toast.error((e as Error).message || 'Siparişler yüklenemedi');
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, paymentStatus, productCategory, addressStatus, dateFrom, dateTo]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    const missing = rows.filter((r) => r.address_status === 'missing').length;
    const paid = rows.filter((r) => r.payment_status === 'paid').length;
    return { missing, paid };
  }, [rows]);

  const handleBackfill = async () => {
    setBackfilling(true);
    try {
      let cursor: string | null = null;
      let rounds = 0;
      let synced = 0;
      while (rounds < 80) {
        rounds += 1;
        const r = await crmWebsiteOrdersBackfill({ cursor });
        synced += Number(r.synced || 0);
        if (r.done) break;
        cursor = r.next_cursor || null;
        if (!cursor) break;
      }
      toast.success(`Geçmiş aktarım tamamlandı (${synced} kayıt işlendi)`);
      await load();
    } catch (e) {
      toast.error((e as Error).message || 'Geçmiş aktarım başarısız');
    } finally {
      setBackfilling(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const all = await crmWebsiteOrdersExport({
        q: debouncedQ || undefined,
        payment_status: paymentStatus || undefined,
        product_category: productCategory || undefined,
        address_status: addressStatus || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });
      exportCrmWebsiteOrdersToExcel(all);
      toast.success(`${all.length} sipariş Excel'e aktarıldı`);
    } catch (e) {
      toast.error((e as Error).message || 'Excel aktarımı başarısız');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-700">CRM</p>
          <h2 className="flex items-center gap-2 font-serif text-2xl font-semibold text-slate-900">
            <ShoppingBag className="h-7 w-7 text-emerald-600" />
            Web Sitesinden Gelen Siparişler
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Kitap mağazası, deneme kulübü, eğitim paketleri ve site ödemeleri tek listede. Geçmiş kayıtlarda
            adres yoksa <strong className="font-medium">Adres Eksik</strong> görünür; bilgi uydurulmaz.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </button>
          {isAdmin && (
            <button
              type="button"
              disabled={backfilling}
              onClick={() => void handleBackfill()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-60"
            >
              {backfilling ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Geçmişi aktar
            </button>
          )}
          <button
            type="button"
            disabled={exporting}
            onClick={() => void handleExport()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Excel
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Toplam (filtre)</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{total}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Ödenen (sayfa)</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-700">{summary.paid}</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-800">Adres Eksik (sayfa)</p>
          <p className="mt-1 text-2xl font-semibold text-amber-900">{summary.missing}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Müşteri, telefon, sipariş no, ürün ara…"
            className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
          />
        </div>
        <select
          value={productCategory}
          onChange={(e) => setProductCategory(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          {CATEGORY_OPTIONS.map((o) => (
            <option key={o.value || 'all'} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={paymentStatus}
          onChange={(e) => setPaymentStatus(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          {PAYMENT_OPTIONS.map((o) => (
            <option key={o.value || 'all'} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={addressStatus}
          onChange={(e) => setAddressStatus(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          {ADDRESS_OPTIONS.map((o) => (
            <option key={o.value || 'all'} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          title="Başlangıç tarihi"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          title="Bitiş tarihi"
        />
      </div>


      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Yükleniyor…
          </div>
        ) : rows.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-500">Kayıt bulunamadı.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Tarih</th>
                  <th className="px-3 py-2.5 font-semibold">Müşteri</th>
                  <th className="px-3 py-2.5 font-semibold">Telefon</th>
                  <th className="px-3 py-2.5 font-semibold">Adres</th>
                  <th className="px-3 py-2.5 font-semibold">Ürün / Hizmet</th>
                  <th className="px-3 py-2.5 font-semibold">Tutar</th>
                  <th className="px-3 py-2.5 font-semibold">Ödeme</th>
                  <th className="px-3 py-2.5 font-semibold">Sipariş</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/80">
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{fmtWhen(r.order_placed_at)}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-slate-900">{r.customer_name || '—'}</div>
                      {r.order_number ? (
                        <div className="text-xs text-slate-500">{r.order_number}</div>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">{r.customer_phone || '—'}</td>
                    <td className="max-w-[200px] px-3 py-2.5 text-slate-700">
                      {r.address_status === 'missing' ? (
                        <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                          Adres Eksik
                        </span>
                      ) : r.address_status === 'not_required' ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        <span className="line-clamp-2 text-xs">{r.address_display || '—'}</span>
                      )}
                    </td>
                    <td className="max-w-[240px] px-3 py-2.5">
                      <div className="line-clamp-2 text-slate-800">{r.product_summary}</div>
                      <div className="text-xs capitalize text-slate-500">{r.product_category}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-900">{fmtTry(r.amount_kurus)}</td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${paymentBadge(r.payment_status)}`}>
                        {r.payment_status}
                      </span>
                      {r.payment_provider ? (
                        <div className="mt-0.5 text-xs text-slate-500">{r.payment_provider}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">{r.order_status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
