import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  ArrowDownAZ,
  ArrowUpAZ,
  BookOpen,
  CheckCircle2,
  Download,
  Loader2,
  Package,
  Search,
  Truck
} from 'lucide-react';
import { toast } from 'sonner';
import {
  confirmKitapciPortalOrder,
  fetchKitapciPortal,
  shipKitapciPortalOrder,
  type KitapciPortalOrder
} from '../lib/kitapciPortalApi';
function statusLabel(status: string) {
  switch (status) {
    case 'notified':
      return 'Yeni sipariş';
    case 'confirmed':
      return 'Onaylandı';
    case 'shipped':
      return 'Kargoya verildi';
    default:
      return status;
  }
}

function statusClass(status: string) {
  switch (status) {
    case 'shipped':
      return 'bg-emerald-100 text-emerald-900';
    case 'confirmed':
      return 'bg-sky-100 text-sky-900';
    default:
      return 'bg-amber-100 text-amber-900';
  }
}

function formatTrDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
}

function sinifSortKey(val: string) {
  const m = String(val || '').match(/^(\d+)/);
  return m ? Number(m[1]) : 999;
}

function orderSearchHaystack(o: KitapciPortalOrder) {
  return [
    o.ogrenci_ad_soyad,
    o.veli_ad_soyad,
    o.sinif,
    o.telefon,
    o.kitaplar,
    o.adres,
    o.ilce,
    o.il,
    o.siparis_notu
  ]
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('tr-TR');
}

export default function KitapciPortalPage() {
  const { token } = useParams();
  const [booksellerName, setBooksellerName] = useState('');
  const [orders, setOrders] = useState<KitapciPortalOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tracking, setTracking] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [sinifFilter, setSinifFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [nameSort, setNameSort] = useState<'asc' | 'desc'>('asc');

  const sinifOptions = useMemo(() => {
    const set = new Set<string>();
    orders.forEach((o) => {
      const s = String(o.sinif || '').trim();
      if (s) set.add(s);
    });
    return Array.from(set).sort(
      (a, b) => sinifSortKey(a) - sinifSortKey(b) || a.localeCompare(b, 'tr')
    );
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase('tr-TR');
    let list = orders;

    if (sinifFilter) {
      list = list.filter((o) => String(o.sinif || '').trim() === sinifFilter);
    }

    if (q) {
      list = list.filter((o) => orderSearchHaystack(o).includes(q));
    }

    return [...list].sort((a, b) => {
      const cmp = String(a.ogrenci_ad_soyad || '').localeCompare(
        String(b.ogrenci_ad_soyad || ''),
        'tr',
        { sensitivity: 'base' }
      );
      return nameSort === 'asc' ? cmp : -cmp;
    });
  }, [orders, sinifFilter, searchQuery, nameSort]);

  const filtersActive = Boolean(sinifFilter || searchQuery.trim());

  const panelTitle = booksellerName
    ? `${booksellerName.toLocaleUpperCase('tr-TR')} KİTAP SİPARİŞ PANELİ`
    : 'KİTAP SİPARİŞ PANELİ';

  const load = useCallback(async () => {
    const t = String(token || '').trim();
    if (!t) {
      setErr('Geçersiz bağlantı');
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const data = await fetchKitapciPortal(t);
      setBooksellerName(data.bookseller?.name || 'Kitapçı');
      setOrders(data.orders || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Panel açılamadı');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const confirm = async (orderId: string) => {
    const t = String(token || '').trim();
    if (!t) return;
    setBusy(`c-${orderId}`);
    try {
      await confirmKitapciPortalOrder(t, orderId);
      toast.success('Sipariş onaylandı');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Onaylanamadı');
    } finally {
      setBusy(null);
    }
  };

  const ship = async (orderId: string) => {
    const t = String(token || '').trim();
    const kargo = String(tracking[orderId] || '').trim();
    if (!kargo) {
      toast.error('Kargo takip numarası girin');
      return;
    }
    setBusy(`s-${orderId}`);
    try {
      await shipKitapciPortalOrder(t, orderId, {
        kargo_takip_no: kargo,
        kitapci_notu: notes[orderId]?.trim() || undefined
      });
      toast.success('Kargo bilgisi kaydedildi');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setBusy(null);
    }
  };

  const downloadExcel = async () => {
    if (!filteredOrders.length) {
      toast.error('İndirilecek sipariş yok');
      return;
    }
    try {
      const { exportKitapciOrdersToExcel } = await import('../lib/kitapciPortalExport');
      exportKitapciOrdersToExcel(filteredOrders, booksellerName);
      toast.success(`${filteredOrders.length} sipariş Excel olarak indirildi`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Excel oluşturulamadı');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (err) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md rounded-xl border border-red-200 bg-white p-6 text-center shadow-sm">
          <p className="font-semibold text-red-800">Panel açılamadı</p>
          <p className="mt-2 text-sm text-slate-600">{err}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-4 inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Tekrar dene
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-slate-50 px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-2xl space-y-5">
        <header className="rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-indigo-600 p-2.5 text-white">
                <BookOpen className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-900">{panelTitle}</h1>
                <p className="text-sm text-slate-600">Kitap sipariş paneli — onaylayın, kargo takibini girin</p>
              </div>
            </div>
            {orders.length > 0 ? (
              <button
                type="button"
                onClick={downloadExcel}
                disabled={!filteredOrders.length}
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                Excel indir ({filteredOrders.length}
                {filtersActive && filteredOrders.length !== orders.length ? ` / ${orders.length}` : ''})
              </button>
            ) : null}
          </div>
        </header>

        {orders.length > 0 ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium text-slate-600 sm:col-span-2">
                Öğrenci / veli ara
                <div className="relative mt-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Ad, veli, telefon, kitap seti…"
                    className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm"
                  />
                </div>
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Sınıf
                <select
                  value={sinifFilter}
                  onChange={(e) => setSinifFilter(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">Tüm sınıflar</option>
                  {sinifOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-col justify-end">
                <span className="text-xs font-medium text-slate-600">Öğrenci adına göre sırala</span>
                <button
                  type="button"
                  onClick={() => setNameSort((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                  className="mt-1 inline-flex items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-900 hover:bg-indigo-100"
                >
                  {nameSort === 'asc' ? <ArrowDownAZ className="h-4 w-4" /> : <ArrowUpAZ className="h-4 w-4" />}
                  {nameSort === 'asc' ? 'A → Z' : 'Z → A'}
                </button>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              {filteredOrders.length} sipariş listeleniyor
              {filtersActive && filteredOrders.length !== orders.length ? ` (toplam ${orders.length})` : ''}
            </p>
          </section>
        ) : null}

        {orders.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
            Size henüz iletilmiş sipariş görünmüyor. Kurum siparişi onaylayıp size WhatsApp gönderdiğinde öğrenci
            listesi burada çıkar.
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
            Arama veya sınıf filtresine uygun sipariş bulunamadı.
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSinifFilter('');
              }}
              className="mt-3 block w-full text-sm font-semibold text-indigo-700 hover:underline"
            >
              Filtreleri temizle
            </button>
          </div>
        ) : (
          <ul className="space-y-4">
            {filteredOrders.map((o) => (
              <li key={o.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{o.ogrenci_ad_soyad}</p>
                    <p className="text-sm text-slate-600">Veli: {o.veli_ad_soyad}</p>
                    {o.sinif ? <p className="text-xs text-slate-500">Sınıf: {o.sinif}</p> : null}
                    <p className="mt-1 text-sm font-medium text-indigo-900">
                      <span className="font-normal text-slate-500">Kitap seti:</span>{' '}
                      {o.kitaplar?.trim() || '—'}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass(o.status)}`}>
                    {statusLabel(o.status)}
                  </span>
                </div>

                <div className="mt-3 space-y-1 text-sm text-slate-700">
                  <p>
                    <span className="text-slate-500">Telefon:</span>{' '}
                    <span className="font-mono">{o.telefon}</span>
                  </p>
                  {o.adres ? (
                    <p>
                      <span className="text-slate-500">Adres:</span> {o.adres}
                      {o.ilce || o.il ? ` — ${[o.ilce, o.il].filter(Boolean).join(' / ')}` : ''}
                    </p>
                  ) : null}
                  {o.ucret_durumu ? (
                    <p>
                      <span className="text-slate-500">Ücret:</span> {o.ucret_durumu}
                    </p>
                  ) : null}
                  {o.siparis_notu ? (
                    <p className="text-slate-600">
                      <span className="text-slate-500">Not:</span> {o.siparis_notu}
                    </p>
                  ) : null}
                  <p className="text-xs text-slate-400">Sipariş: {formatTrDate(o.created_at)}</p>
                </div>

                {o.status === 'shipped' ? (
                  <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                    <div className="flex items-center gap-1.5 font-medium">
                      <Truck className="h-4 w-4" />
                      Kargo: {o.kargo_takip_no}
                    </div>
                    {o.kitapci_notu ? <p className="mt-1 text-xs">{o.kitapci_notu}</p> : null}
                    <p className="mt-1 text-xs text-emerald-700">{formatTrDate(o.shipped_at)}</p>
                  </div>
                ) : (
                  <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
                    {o.status === 'notified' ? (
                      <button
                        type="button"
                        disabled={busy === `c-${o.id}`}
                        onClick={() => void confirm(o.id)}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 sm:w-auto"
                      >
                        {busy === `c-${o.id}` ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                        Siparişi onayla
                      </button>
                    ) : (
                      <p className="flex items-center gap-1 text-xs text-sky-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Onaylandı {formatTrDate(o.kitapci_confirmed_at)}
                      </p>
                    )}

                    <label className="block text-xs text-slate-600">
                      Kargo takip no
                      <input
                        value={tracking[o.id] ?? o.kargo_takip_no ?? ''}
                        onChange={(e) => setTracking((p) => ({ ...p, [o.id]: e.target.value }))}
                        placeholder="Örn. 1234567890"
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
                      />
                    </label>
                    <label className="block text-xs text-slate-600">
                      Not (opsiyonel)
                      <input
                        value={notes[o.id] ?? ''}
                        onChange={(e) => setNotes((p) => ({ ...p, [o.id]: e.target.value }))}
                        placeholder="Kargo firması vb."
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={busy === `s-${o.id}` || o.status === 'shipped'}
                      onClick={() => void ship(o.id)}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50 sm:w-auto"
                    >
                      {busy === `s-${o.id}` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Package className="h-4 w-4" />
                      )}
                      Kargoya verildi — kaydet
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <p className="text-center text-xs text-slate-400">Online VIP Dershane · Kitap sipariş paneli</p>
      </div>
    </div>
  );
}
