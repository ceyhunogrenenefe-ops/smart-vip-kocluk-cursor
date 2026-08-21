/**
 * Kitap Mağazası Ödeme — /kitap-odeme
 * Sepet her zaman panelde gösterilir (onlinevipdershane odeme.html yamasına bağımlı değil).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, CreditCard, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import BrandLogo from '../../components/brand/BrandLogo';
import { apiFetch, resolveApiUrl } from '../../lib/session';
import { formatCommerceTry } from '../../types/commerce.types';
import type { CheckoutHandoffPayload } from '../../lib/commerceStoreApi';

async function fetchHandoff(token: string): Promise<CheckoutHandoffPayload> {
  const res = await fetch(resolveApiUrl(`/api/commerce-checkout-handoff?token=${encodeURIComponent(token)}`));
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(String(data.error || 'Ödeme oturumu yüklenemedi.'));
  }
  return data.checkout as CheckoutHandoffPayload;
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

async function startCheckout(body: Record<string, unknown>) {
  const res = await apiFetch('/api/commerce-checkout-start', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    const hint = data.hint ? ` ${data.hint}` : '';
    throw new Error(String(data.error || 'Ödeme başlatılamadı.') + hint);
  }
  return data as {
    ok: true;
    method: 'paytr' | 'garanti_form' | 'garanti_link';
    redirect_url?: string;
    token?: string;
    pay_url?: string;
    gateway_url?: string;
    fields?: Record<string, string>;
  };
}

export default function KitapOdemePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';

  const [checkout, setCheckout] = useState<CheckoutHandoffPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');

  const [parentName, setParentName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
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
      const data = await fetchHandoff(token);
      setCheckout(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ödeme oturumu yüklenemedi.');
      setCheckout(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = checkout?.items || [];
  const total = checkout?.total_kurus ?? 0;
  const shipping = checkout?.shipping_kurus ?? 0;
  const discount = checkout?.discount_kurus ?? 0;
  const subtotal = checkout?.subtotal_kurus ?? total;

  const itemLines = useMemo(
    () =>
      items.map((it, idx) => ({
        key: `${it.title}-${idx}`,
        title: it.title || 'Kitap',
        qty: it.qty || 1,
        line: (it.unit_kurus || 0) * (it.qty || 1),
      })),
    [items]
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !checkout) return;
    setPaying(true);
    setError('');
    try {
      const result = await startCheckout({
        handoff_token: token,
        parentName: parentName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        studentInfo: studentInfo.trim(),
      });

      if (result.method === 'paytr' && result.redirect_url) {
        window.location.assign(result.redirect_url);
        return;
      }
      if (result.method === 'garanti_link' && result.pay_url) {
        window.location.assign(result.pay_url);
        return;
      }
      if (result.method === 'garanti_form' && result.gateway_url && result.fields) {
        postGarantiForm(result.gateway_url, result.fields);
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
        <p className="mt-1 text-sm text-gray-500">Sepetiniz yüklendi. Veli bilgilerinizi girip güvenli ödemeye geçin.</p>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          </div>
        ) : error && !checkout ? (
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
        ) : checkout ? (
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
            <form onSubmit={(e) => void onSubmit(e)} className="lg:col-span-3 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="font-semibold text-gray-800">Veli Bilgileri</h2>
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
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">Öğrenci Bilgisi (isteğe bağlı)</span>
                  <textarea
                    rows={2}
                    value={studentInfo}
                    onChange={(e) => setStudentInfo(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    placeholder="Öğrenci adı, sınıf seviyesi vb."
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
                Kart bilgileriniz PayTR veya Garanti BBVA güvenli ödeme sayfasında alınır.
              </p>
            </form>

            <aside className="lg:col-span-2 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="font-semibold text-gray-800">Sipariş Özeti</h2>
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
                ) : null}
                {discount > 0 ? (
                  <div className="flex justify-between text-green-600">
                    <span>İndirim</span>
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
