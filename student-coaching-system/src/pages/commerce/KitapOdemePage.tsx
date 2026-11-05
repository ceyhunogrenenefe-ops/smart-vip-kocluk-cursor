/**
 * Kitap Mağazası Ödemesi — /kitap-odeme
 * odeme/kitap ile aynı akış: checkout token + teslimat adresi → PayTR / Garanti
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, CreditCard, Loader2, MapPin, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import BrandLogo from '../../components/brand/BrandLogo';
import { apiFetch } from '../../lib/session';
import { formatCommerceTry } from '../../types/commerce.types';

type CheckoutOrder = {
  order_number: string;
  total_kurus: number;
  subtotal_kurus: number;
  shipping_kurus: number;
  discount_kurus: number;
  coupon_code?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  items?: Array<{
    title_snapshot?: string | null;
    quantity?: number;
    unit_price_kurus?: number;
    line_total_kurus?: number;
  }>;
  shipping_address?: {
    address_line1?: string | null;
    district?: string | null;
    city?: string | null;
  } | null;
};

async function checkoutStore<T>(op: string, payload: Record<string, unknown>): Promise<T> {
  const res = await apiFetch('/api/commerce-store', {
    method: 'POST',
    body: JSON.stringify({ op, ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(String(data.error || 'İşlem başarısız'));
  }
  return data as T;
}

function postGarantiForm(gatewayUrl: string, fields: Record<string, string>) {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = gatewayUrl;
  form.acceptCharset = 'UTF-8';
  form.style.display = 'none';
  Object.keys(fields || {}).forEach((name) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = fields[name] == null ? '' : String(fields[name]);
    form.appendChild(input);
  });
  document.body.appendChild(form);
  form.submit();
}

export default function KitapOdemePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';

  const [order, setOrder] = useState<CheckoutOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');

  const [parentName, setParentName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [district, setDistrict] = useState('');
  const [city, setCity] = useState('');
  const [studentInfo, setStudentInfo] = useState('');

  const load = useCallback(async () => {
    if (!token) {
      setError('Geçersiz ödeme bağlantısı. Lütfen sepetten tekrar deneyin.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await checkoutStore<{ order: CheckoutOrder }>('checkout.resolve', { token });
      setOrder(data.order);
      if (data.order.customer_name) setParentName(data.order.customer_name);
      if (data.order.customer_email) setEmail(data.order.customer_email);
      if (data.order.customer_phone) setPhone(data.order.customer_phone);
      const addr = data.order.shipping_address;
      if (addr?.address_line1) setAddressLine1(addr.address_line1);
      if (addr?.district) setDistrict(addr.district);
      if (addr?.city) setCity(addr.city);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ödeme oturumu yüklenemedi.');
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const itemLines = useMemo(() => {
    const items = order?.items || [];
    return items.map((it, idx) => ({
      key: `${it.title_snapshot}-${idx}`,
      title: it.title_snapshot || 'Kitap',
      qty: it.quantity || 1,
      line: it.line_total_kurus ?? (it.unit_price_kurus || 0) * (it.quantity || 1),
    }));
  }, [order]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !order) return;
    if (!addressLine1.trim() || !city.trim()) {
      toast.error('Teslimat adresi ve il zorunludur');
      return;
    }
    setPaying(true);
    setError('');
    try {
      const result = await checkoutStore<{
        provider: 'paytr' | 'garanti';
        token?: string;
        action?: string;
        fields?: Record<string, string>;
      }>('checkout.pay', {
        token,
        provider: 'paytr',
        customer: {
          parentName: parentName.trim(),
          phone: phone.trim(),
          email: email.trim(),
          studentInfo: studentInfo.trim(),
        },
        address: {
          address_line1: addressLine1.trim(),
          district: district.trim() || undefined,
          city: city.trim(),
        },
      });

      if (result.provider === 'paytr' && result.token) {
        window.location.assign(`https://www.paytr.com/odeme/guvenli/${encodeURIComponent(result.token)}`);
        return;
      }
      if (result.provider === 'garanti' && result.action && result.fields) {
        postGarantiForm(result.action, result.fields);
        return;
      }
      throw new Error('Ödeme yönlendirmesi alınamadı.');
    } catch (ex) {
      const msg = ex instanceof Error ? ex.message : 'Ödeme başlatılamadı.';
      setError(msg);
      toast.error(msg);
      setPaying(false);
    }
  }

  const total = order?.total_kurus ?? 0;
  const shipping = order?.shipping_kurus ?? 0;
  const discount = order?.discount_kurus ?? 0;
  const subtotal = order?.subtotal_kurus ?? total;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-indigo-50/40">
      <header className="border-b border-gray-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <BrandLogo className="h-9 w-auto" />
          <Link to="/sepet" className="inline-flex items-center gap-1 text-sm font-medium text-indigo-700 hover:text-indigo-900">
            <ArrowLeft className="h-4 w-4" /> Sepete dön
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900">Kitap Mağazası Ödemesi</h1>
        <p className="mt-1 text-sm text-gray-500">
          Deneme Kulübü ve kitap siparişleri için veli bilgileri ile teslimat adresini girin.
        </p>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          </div>
        ) : error && !order ? (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
            {error}
            <button
              type="button"
              onClick={() => navigate('/sepet')}
              className="mt-4 block rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700"
            >
              Sepete dön
            </button>
          </div>
        ) : order ? (
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
            <form onSubmit={(e) => void onSubmit(e)} className="lg:col-span-3 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="font-semibold text-gray-800">Veli / Teslimat Bilgileri</h2>
              {error ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p> : null}
              <div className="mt-4 space-y-3">
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">Veli Adı Soyadı *</span>
                  <input
                    required
                    value={parentName}
                    onChange={(e) => setParentName(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    placeholder="Örn. Ayşe Yılmaz"
                    autoComplete="name"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">Telefon *</span>
                  <input
                    required
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    placeholder="05xx xxx xx xx"
                    autoComplete="tel"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">E-posta *</span>
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    placeholder="ornek@email.com"
                    autoComplete="email"
                  />
                </label>
                <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 space-y-3">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
                    <MapPin className="h-4 w-4" /> Teslimat adresi *
                  </div>
                  <input
                    required
                    value={addressLine1}
                    onChange={(e) => setAddressLine1(e.target.value)}
                    className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    placeholder="Mahalle, cadde, kapı no"
                    autoComplete="street-address"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      required
                      value={district}
                      onChange={(e) => setDistrict(e.target.value)}
                      className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                      placeholder="İlçe *"
                      autoComplete="address-level2"
                    />
                    <input
                      required
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                      placeholder="İl"
                      autoComplete="address-level1"
                    />
                  </div>
                </div>
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">Not (isteğe bağlı)</span>
                  <textarea
                    rows={2}
                    value={studentInfo}
                    onChange={(e) => setStudentInfo(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    placeholder="Kapı kodu, öğrenci adı vb."
                  />
                </label>
              </div>
              <button
                type="submit"
                disabled={paying}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                {paying ? 'Yönlendiriliyor…' : 'Güvenli Ödemeye Geç'}
              </button>
              <p className="mt-3 flex items-start gap-2 text-xs text-gray-500">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
                Adres sipariş detayına kaydedilir. Kart bilgileri PayTR veya Garanti sayfasında alınır.
              </p>
            </form>

            <aside className="lg:col-span-2 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="font-semibold text-gray-800">Sipariş Özeti</h2>
              {order.order_number ? (
                <p className="mt-1 text-xs text-gray-500">
                  Sipariş no: <strong>{order.order_number}</strong>
                </p>
              ) : null}
              <div className="mt-4 space-y-3">
                {itemLines.length ? (
                  itemLines.map((it) => (
                    <div key={it.key} className="flex gap-3 border-b border-gray-100 pb-3 last:border-0">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-500">
                        <BookOpen className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium leading-tight text-gray-800">{it.title}</div>
                        <div className="text-xs text-gray-400">Adet: {it.qty}</div>
                      </div>
                      <div className="text-sm font-semibold text-indigo-700">{formatCommerceTry(it.line)}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-gray-600">Kitap Mağazası Siparişi</div>
                )}
              </div>
              <div className="mt-4 space-y-2 border-t border-gray-200 pt-4 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Ara Toplam</span>
                  <span>{formatCommerceTry(subtotal)}</span>
                </div>
                {shipping > 0 ? (
                  <div className="flex justify-between text-gray-600">
                    <span>Kargo</span>
                    <span>{formatCommerceTry(shipping)}</span>
                  </div>
                ) : (
                  <div className="flex justify-between text-gray-600">
                    <span>Kargo</span>
                    <span className="text-green-600">Ücretsiz</span>
                  </div>
                )}
                {discount > 0 ? (
                  <div className="flex justify-between text-green-600">
                    <span>İndirim{order.coupon_code ? ` (${order.coupon_code})` : ''}</span>
                    <span>-{formatCommerceTry(discount)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between border-t border-gray-200 pt-2 text-base font-bold text-gray-900">
                  <span>Toplam</span>
                  <span className="text-indigo-700">{formatCommerceTry(total)}</span>
                </div>
              </div>
            </aside>
          </div>
        ) : null}
      </main>
    </div>
  );
}
