import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Loader2, MessageCircle, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { listInstitutionsForPicker, type InstitutionPickRow } from '../lib/parentSignApi';
import {
  approveBookOrder,
  cancelBookOrder,
  createBookseller,
  deleteBookseller,
  ensureBooksellerPortalToken,
  listBookOrders,
  listBooksellers,
  patchBookseller,
  processPendingBookOrders,
  resendBookOrderWhatsApp,
  type BookOrderRow,
  type BooksellerRow
} from '../lib/bookOrdersApi';
import { kitapciPortalUrl } from '../lib/kitapciPortalApi';

function statusLabel(status: string) {
  switch (status) {
    case 'pending':
      return 'Onay bekliyor';
    case 'approved':
      return 'Onaylandı';
    case 'notified':
      return 'Kitapçıya iletildi';
    case 'confirmed':
      return 'Kitapçı onayladı';
    case 'shipped':
      return 'Kargoda';
    case 'cancelled':
      return 'İptal';
    default:
      return status;
  }
}

function statusBadge(status: string) {
  switch (status) {
    case 'notified':
      return 'bg-emerald-100 text-emerald-900';
    case 'approved':
      return 'bg-sky-100 text-sky-900';
    case 'confirmed':
      return 'bg-indigo-100 text-indigo-900';
    case 'shipped':
      return 'bg-violet-100 text-violet-900';
    case 'cancelled':
      return 'bg-slate-200 text-slate-700';
    default:
      return 'bg-amber-100 text-amber-900';
  }
}

function waLabel(status: string) {
  switch (status) {
    case 'awaiting_approval':
      return 'Onay bekliyor';
    case 'pending':
      return 'Gönderim bekliyor';
    case 'sent':
      return 'Gönderildi';
    case 'failed':
      return 'Hata';
    case 'skipped':
      return 'Atlandı';
    default:
      return status;
  }
}

function waErrorText(error: string) {
  const e = String(error || '').trim();
  if (!e) return '';
  if (e === 'bookseller_not_found') return 'Kitapçı bulunamadı — listeden seçip tekrar deneyin';
  if (e === 'bookseller_selection_required') return 'Kitapçı seçin';
  if (e === 'no_active_bookseller') return 'Aktif kitapçı yok';
  return e;
}

function waBadge(status: string) {
  switch (status) {
    case 'sent':
      return 'text-emerald-700';
    case 'failed':
      return 'text-red-700';
    case 'awaiting_approval':
      return 'text-amber-700';
    case 'skipped':
      return 'text-slate-500';
    default:
      return 'text-slate-500';
  }
}

function formatTrDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function BookOrdersPage() {
  const { effectiveUser } = useAuth();
  const { activeInstitutionId } = useApp();
  const isSuper = effectiveUser?.role === 'super_admin';

  const [institutionId, setInstitutionId] = useState('');
  const [institutionOptions, setInstitutionOptions] = useState<InstitutionPickRow[]>([]);
  const [orders, setOrders] = useState<BookOrderRow[]>([]);
  const [booksellers, setBooksellers] = useState<BooksellerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showBooksellerForm, setShowBooksellerForm] = useState(false);
  const [bsName, setBsName] = useState('');
  const [bsPhone, setBsPhone] = useState('');
  const [bsCity, setBsCity] = useState('');
  const [bsBolge, setBsBolge] = useState('');
  const [selectedBookseller, setSelectedBookseller] = useState<Record<string, string>>({});

  const activeBooksellers = useMemo(
    () => booksellers.filter((b) => b.is_active !== false),
    [booksellers]
  );

  const effectiveInstitutionId = useMemo(() => {
    if (isSuper) return institutionId.trim() || String(activeInstitutionId || '').trim();
    return String(activeInstitutionId || effectiveUser?.institution_id || '').trim();
  }, [isSuper, institutionId, activeInstitutionId, effectiveUser?.institution_id]);

  useEffect(() => {
    if (!isSuper) return;
    void listInstitutionsForPicker()
      .then(setInstitutionOptions)
      .catch(() => setInstitutionOptions([]));
  }, [isSuper]);

  const load = useCallback(async () => {
    if (!effectiveInstitutionId) {
      setOrders([]);
      setBooksellers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [o, b] = await Promise.all([
        listBookOrders(effectiveInstitutionId),
        listBooksellers(effectiveInstitutionId)
      ]);
      setOrders(o);
      setBooksellers(b);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Veriler yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [effectiveInstitutionId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!activeBooksellers.length) return;
    setSelectedBookseller((prev) => {
      const next = { ...prev };
      for (const o of orders) {
        if (next[o.id] && activeBooksellers.some((b) => b.id === next[o.id])) continue;
        const savedId = o.kitapci_id && activeBooksellers.some((b) => b.id === o.kitapci_id) ? o.kitapci_id : null;
        if (savedId) {
          next[o.id] = savedId;
          continue;
        }
        const ad = String(o.kitapci_adi || '').trim();
        if (ad) {
          const byName = activeBooksellers.find(
            (b) => b.name.trim().toLocaleLowerCase('tr') === ad.toLocaleLowerCase('tr')
          );
          if (byName) {
            next[o.id] = byName.id;
            continue;
          }
        }
        if (activeBooksellers.length === 1) {
          next[o.id] = activeBooksellers[0].id;
        }
      }
      return next;
    });
  }, [orders, activeBooksellers]);

  const booksellerNameForOrder = useCallback(
    (o: BookOrderRow) => {
      const selId = selectedBookseller[o.id];
      const fromSel = selId ? activeBooksellers.find((b) => b.id === selId) : null;
      if (fromSel) return fromSel.name;
      return o.kitapci_adi || '—';
    },
    [selectedBookseller, activeBooksellers]
  );

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr');
    if (!q) return orders;
    return orders.filter((o) => {
      const ogrenci = o.ogrenci_ad_soyad || o.ogrenci_adi || '';
      const veli = o.veli_ad_soyad || o.veli_adi || '';
      return (
        ogrenci.toLocaleLowerCase('tr').includes(q) ||
        veli.toLocaleLowerCase('tr').includes(q) ||
        String(o.telefon || '').includes(q) ||
        String(o.il || '').toLocaleLowerCase('tr').includes(q) ||
        String(o.ilce || '').toLocaleLowerCase('tr').includes(q)
      );
    });
  }, [orders, search]);

  const addBookseller = async () => {
    if (!effectiveInstitutionId) {
      toast.error('Kurum seçin');
      return;
    }
    if (!bsName.trim() || !bsPhone.trim()) {
      toast.error('Kitapçı adı ve telefon gerekli');
      return;
    }
    setBusy('add-bs');
    try {
      await createBookseller({
        institution_id: effectiveInstitutionId,
        name: bsName.trim(),
        phone: bsPhone.trim(),
        city: bsCity.trim() || undefined,
        bolge: bsBolge.trim() || undefined
      });
      toast.success('Kitapçı eklendi');
      setBsName('');
      setBsPhone('');
      setBsCity('');
      setBsBolge('');
      setShowBooksellerForm(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Eklenemedi');
    } finally {
      setBusy(null);
    }
  };

  const toggleBookseller = async (row: BooksellerRow) => {
    setBusy(`bs-${row.id}`);
    try {
      await patchBookseller(row.id, { is_active: !row.is_active });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Güncellenemedi');
    } finally {
      setBusy(null);
    }
  };

  const copyPortalLink = async (b: BooksellerRow) => {
    setBusy(`pl-${b.id}`);
    try {
      let token = String(b.portal_token || '').trim();
      if (!token) {
        const fresh = await ensureBooksellerPortalToken(b.id);
        token = String(fresh.portal_token || '').trim();
        await load();
      }
      if (!token) {
        toast.error('Panel linki oluşturulamadı — Supabase SQL çalıştırıldı mı?');
        return;
      }
      const url = kitapciPortalUrl(token);
      await navigator.clipboard.writeText(url);
      toast.success('Kitapçı panel linki kopyalandı');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Link kopyalanamadı');
    } finally {
      setBusy(null);
    }
  };

  const removeBookseller = async (id: string) => {
    if (!window.confirm('Kitapçı silinsin mi?')) return;
    setBusy(`del-${id}`);
    try {
      await deleteBookseller(id);
      toast.success('Silindi');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Silinemedi');
    } finally {
      setBusy(null);
    }
  };

  const pickBooksellerId = (orderId: string) => {
    const id = selectedBookseller[orderId]?.trim();
    if (id) return id;
    if (activeBooksellers.length === 1) return activeBooksellers[0].id;
    return null;
  };

  const resendWa = async (id: string) => {
    const kitapciId = pickBooksellerId(id);
    if (!kitapciId && activeBooksellers.length > 1) {
      toast.error('Önce kitapçı seçin');
      return;
    }
    setBusy(`wa-${id}`);
    try {
      await resendBookOrderWhatsApp(id, kitapciId || undefined);
      toast.success('WhatsApp gönderildi');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gönderilemedi');
    } finally {
      setBusy(null);
    }
  };

  const approveOrder = async (id: string) => {
    const kitapciId = pickBooksellerId(id);
    if (!kitapciId && activeBooksellers.length > 1) {
      toast.error('Onaylamadan önce kitapçı seçin');
      return;
    }
    if (!activeBooksellers.length) {
      toast.error('Aktif kitapçı yok — önce kitapçı ekleyin');
      return;
    }
    setBusy(`ap-${id}`);
    try {
      await approveBookOrder(id, kitapciId || undefined);
      toast.success('Onaylandı — kitapçıya WhatsApp gönderildi');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Onaylanamadı');
    } finally {
      setBusy(null);
    }
  };

  const cancelOrder = async (id: string) => {
    if (!window.confirm('Sipariş iptal edilsin mi? Kitapçıya mesaj gitmez.')) return;
    setBusy(`ca-${id}`);
    try {
      await cancelBookOrder(id);
      toast.success('Sipariş iptal edildi');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İptal edilemedi');
    } finally {
      setBusy(null);
    }
  };

  const runPending = async () => {
    setBusy('pending');
    try {
      const out = await processPendingBookOrders();
      toast.success(`${out.processed} bekleyen sipariş işlendi`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlenemedi');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <BookOpen className="h-6 w-6 text-indigo-600" />
            Kitap siparişleri
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Veli formu doldurur → sipariş tabloya düşer → siz onaylarsınız → kitapçıya WhatsApp gider.
            Meta şablon: <span className="font-mono text-xs">kitap_siparisi</span>
            <span className="text-slate-500"> · Kitapçı paneli: onay + kargo takibi</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Yenile
          </button>
          {isSuper ? (
            <button
              type="button"
              onClick={() => void runPending()}
              disabled={busy === 'pending'}
              className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm text-violet-900 hover:bg-violet-100"
            >
              {busy === 'pending' ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
              Bekleyen WhatsApp
            </button>
          ) : null}
        </div>
      </div>

      {isSuper ? (
        <label className="block max-w-md text-sm">
          <span className="text-slate-600">Kurum</span>
          <select
            value={institutionId || effectiveInstitutionId}
            onChange={(e) => setInstitutionId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
          >
            <option value="">— Kurum seçin —</option>
            {institutionOptions.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-800">Kitapçılar</h2>
          <button
            type="button"
            onClick={() => setShowBooksellerForm((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 hover:underline"
          >
            <Plus className="h-3.5 w-3.5" />
            Kitapçı ekle
          </button>
        </div>
        {showBooksellerForm ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <input value={bsName} onChange={(e) => setBsName(e.target.value)} placeholder="Kitapçı adı" className="rounded border px-2 py-1.5 text-sm" />
            <input value={bsPhone} onChange={(e) => setBsPhone(e.target.value)} placeholder="05xx…" className="rounded border px-2 py-1.5 text-sm font-mono" />
            <input value={bsCity} onChange={(e) => setBsCity(e.target.value)} placeholder="Şehir (opsiyonel)" className="rounded border px-2 py-1.5 text-sm" />
            <input value={bsBolge} onChange={(e) => setBsBolge(e.target.value)} placeholder="Bölge (opsiyonel)" className="rounded border px-2 py-1.5 text-sm" />
            <button
              type="button"
              disabled={busy === 'add-bs'}
              onClick={() => void addBookseller()}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 sm:col-span-2 lg:col-span-1"
            >
              Kaydet
            </button>
          </div>
        ) : null}
        {booksellers.length ? (
          <ul className="mt-3 space-y-2">
            {booksellers.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm">
                <span>
                  <span className="font-medium">{b.name}</span>
                  <span className="ml-2 font-mono text-xs text-slate-500">{b.phone}</span>
                  {b.city ? <span className="ml-2 text-xs text-slate-400">{b.city}</span> : null}
                  {b.is_active === false ? <span className="ml-2 text-xs text-amber-700">(pasif)</span> : null}
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={busy === `pl-${b.id}`}
                    onClick={() => void copyPortalLink(b)}
                    className="text-xs font-medium text-violet-700 hover:underline"
                  >
                    {busy === `pl-${b.id}` ? '…' : 'Panel linki'}
                  </button>
                  <button type="button" onClick={() => void toggleBookseller(b)} className="text-xs text-indigo-700 hover:underline">
                    {b.is_active === false ? 'Aktifleştir' : 'Pasifleştir'}
                  </button>
                  <button type="button" onClick={() => void removeBookseller(b.id)} className="text-red-600 hover:text-red-800">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-amber-700">Henüz kitapçı yok — sipariş gelince WhatsApp gitmez. En az bir aktif kitapçı ekleyin.</p>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-800">Siparişler</h2>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ara: öğrenci, veli, il…"
            className="ml-auto max-w-xs flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
          />
        </div>
        {loading ? (
          <p className="text-sm text-slate-500">Yükleniyor…</p>
        ) : !effectiveInstitutionId ? (
          <p className="text-sm text-amber-700">Liste için kurum seçin.</p>
        ) : filteredOrders.length === 0 ? (
          <p className="text-sm text-slate-500">Henüz sipariş yok.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b text-xs text-slate-500">
                  <th className="py-2 pr-2">Tarih</th>
                  <th className="py-2 pr-2">Öğrenci / Veli</th>
                  <th className="py-2 pr-2">Adres / Ücret</th>
                  <th className="py-2 pr-2">Kitapçı</th>
                  <th className="py-2 pr-2">Kargo</th>
                  <th className="py-2 pr-2">WA</th>
                  <th className="py-2">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((o) => (
                  <tr key={o.id} className="border-b border-slate-50 align-top">
                    <td className="py-2 pr-2 text-xs text-slate-500 whitespace-nowrap">{formatTrDate(o.created_at)}</td>
                    <td className="py-2 pr-2">
                      <div className="font-medium">{o.ogrenci_ad_soyad || o.ogrenci_adi}</div>
                      <div className="text-xs text-slate-500">{o.veli_ad_soyad || o.veli_adi}</div>
                      <div className="font-mono text-[11px] text-slate-400">{o.telefon}</div>
                      {o.sinif ? <div className="text-xs">{o.sinif}</div> : null}
                    </td>
                    <td className="py-2 pr-2 max-w-[200px] text-xs">
                      {o.adres ? <div className="whitespace-pre-wrap">{o.adres}</div> : null}
                      {o.ilce || o.il ? (
                        <div className="text-slate-500">
                          {[o.ilce, o.il].filter(Boolean).join(' / ')}
                        </div>
                      ) : null}
                      {o.ucret_durumu ? (
                        <div className="mt-0.5 font-medium text-indigo-800">{o.ucret_durumu}</div>
                      ) : null}
                      {o.siparis_notu || o.notlar ? (
                        <div className="mt-0.5 text-slate-500">{o.siparis_notu || o.notlar}</div>
                      ) : null}
                    </td>
                    <td className="py-2 pr-2 text-xs">{booksellerNameForOrder(o)}</td>
                    <td className="py-2 pr-2 text-xs font-mono">
                      {o.kargo_takip_no || '—'}
                      {o.kitapci_notu ? <div className="font-sans text-[10px] text-slate-500">{o.kitapci_notu}</div> : null}
                    </td>
                    <td className="py-2 pr-2">
                      <span className={`text-xs font-medium ${waBadge(o.whatsapp_status)}`}>{waLabel(o.whatsapp_status)}</span>
                      {o.whatsapp_error ? (
                        <div className="text-[10px] text-red-600">{waErrorText(o.whatsapp_error)}</div>
                      ) : null}
                    </td>
                    <td className="py-2">
                      <div className="flex flex-col gap-1">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${statusBadge(o.status)}`}>
                          {statusLabel(o.status)}
                        </span>
                        {activeBooksellers.length > 0 ? (
                          <label className="text-[10px] text-slate-500">
                            Kitapçı
                            <select
                              value={selectedBookseller[o.id] || ''}
                              onChange={(e) =>
                                setSelectedBookseller((prev) => ({ ...prev, [o.id]: e.target.value }))
                              }
                              className="mt-0.5 block w-full max-w-[180px] rounded border border-slate-200 bg-white px-1.5 py-1 text-[11px] text-slate-800"
                            >
                              {activeBooksellers.length > 1 ? (
                                <option value="">— Seçin —</option>
                              ) : null}
                              {activeBooksellers.map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.name}
                                  {b.city ? ` (${b.city})` : ''}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                        {o.status === 'pending' ? (
                          <>
                            <button
                              type="button"
                              disabled={busy === `ap-${o.id}` || !activeBooksellers.length}
                              onClick={() => void approveOrder(o.id)}
                              className="text-left text-[11px] font-semibold text-emerald-700 hover:underline disabled:text-slate-400"
                            >
                              {busy === `ap-${o.id}` ? 'Gönderiliyor…' : 'Onayla ve kitapçıya gönder'}
                            </button>
                            <button
                              type="button"
                              disabled={busy === `ca-${o.id}`}
                              onClick={() => void cancelOrder(o.id)}
                              className="text-left text-[11px] text-red-700 hover:underline"
                            >
                              İptal
                            </button>
                          </>
                        ) : null}
                        {o.status !== 'pending' && o.whatsapp_status !== 'awaiting_approval' ? (
                          <button
                            type="button"
                            disabled={busy === `wa-${o.id}` || !activeBooksellers.length}
                            onClick={() => void resendWa(o.id)}
                            className="text-left text-[11px] text-indigo-700 hover:underline disabled:text-slate-400"
                          >
                            WhatsApp tekrar
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 space-y-2">
        <p className="font-semibold text-slate-800">Form bağlantısı</p>
        <p>
          Mevcut formunuz kayıtları <span className="font-mono">kitap_siparisleri</span> tablosuna yazabilir veya API ile gönderebilir:
        </p>
        <pre className="overflow-x-auto rounded bg-white p-2 font-mono text-[10px]">{`POST /api/book-orders?op=public-submit
Header: X-Book-Order-Key: <BOOK_ORDER_FORM_SECRET>
Body: {
  "institution_id": "<kurum-id>",
  "veli_ad_soyad": "...",
  "ogrenci_ad_soyad": "...",
  "sinif": "12",
  "ucret_durumu": "Ödendi",
  "telefon": "05xx...",
  "adres": "...",
  "ilce": "...",
  "il": "...",
  "siparis_notu": "..."
}`}</pre>
        <p>
          Supabase formu doğrudan tabloya yazıyorsa: <span className="font-mono">status=pending</span>,{' '}
          <span className="font-mono">whatsapp_status=awaiting_approval</span>. Onay sonrası mesaj gider.
        </p>
      </section>
    </div>
  );
}
