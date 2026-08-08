import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, CreditCard, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import BrandLogo from '../components/brand/BrandLogo';
import {
  fetchGarantiPublicOrder,
  postToGarantiGateway,
  startGarantiPayment,
  type GarantiPaymentOrder
} from '../lib/garantiPosApi';

function formatTry(n: number) {
  return `${Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;
}

function PaymentShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,#1e3a5f_0%,#0b1220_55%,#070b14_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col px-4 py-8 sm:py-12">
        <header className="mb-8 flex items-center justify-center">
          <BrandLogo className="h-10 w-auto" />
        </header>
        <main className="flex-1">{children}</main>
        <footer className="mt-10 text-center text-xs text-slate-400">
          Online VIP Dershane · Güvenli ödeme (Garanti BBVA 3D Secure)
        </footer>
      </div>
    </div>
  );
}

export function GarantiOdemeSonucPage() {
  const [params] = useSearchParams();
  const status = params.get('status') || '';
  const order = params.get('order') || '';
  const reason = params.get('reason') || '';
  const ok = status === 'ok';

  return (
    <PaymentShell>
      <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur">
        {ok ? (
          <CheckCircle2 className="mx-auto mb-4 h-14 w-14 text-emerald-400" aria-hidden />
        ) : (
          <XCircle className="mx-auto mb-4 h-14 w-14 text-rose-400" aria-hidden />
        )}
        <h1 className="text-2xl font-semibold tracking-tight">
          {ok ? 'Ödeme alındı' : 'Ödeme tamamlanamadı'}
        </h1>
        <p className="mt-3 text-sm text-slate-300">
          {ok
            ? 'Teşekkürler. Tahsilat kaydınız güncellendi. Bu pencereyi kapatabilirsiniz.'
            : reason
              ? `Banka mesajı: ${reason}`
              : 'Kartınızdan çekim yapılmadı veya işlem iptal edildi. Tekrar deneyebilirsiniz.'}
        </p>
        {order ? <p className="mt-4 font-mono text-xs text-slate-500">Sipariş: {order}</p> : null}
        <Link
          to="/"
          className="mt-8 inline-flex rounded-xl bg-sky-500 px-5 py-2.5 text-sm font-medium text-slate-950 hover:bg-sky-400"
        >
          Ana sayfa
        </Link>
      </div>
    </PaymentShell>
  );
}

export default function GarantiOdemePage() {
  const { token } = useParams();
  const [order, setOrder] = useState<GarantiPaymentOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [paying, setPaying] = useState(false);
  const [installment, setInstallment] = useState(0);

  const load = useCallback(async () => {
    if (!token) {
      setError('Geçersiz bağlantı');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await fetchGarantiPublicOrder(token);
      setOrder(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'not_found');
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const installmentOptions = useMemo(() => {
    const max = Number(order?.installment_max) || 0;
    if (max < 2) return [];
    const opts = [{ value: 0, label: 'Tek çekim' }];
    for (let i = 2; i <= max; i++) opts.push({ value: i, label: `${i} taksit` });
    return opts;
  }, [order?.installment_max]);

  async function onPay() {
    if (!token || !order) return;
    setPaying(true);
    setError('');
    try {
      const started = await startGarantiPayment(token, installment);
      postToGarantiGateway(started.gateway_url, started.fields);
    } catch (e) {
      setPaying(false);
      const msg = e instanceof Error ? e.message : 'start_failed';
      const map: Record<string, string> = {
        already_paid: 'Bu ödeme zaten alınmış.',
        cancelled: 'Bu ödeme iptal edilmiş.',
        garanti_not_configured: 'Ödeme sistemi henüz yapılandırılmamış.',
        installment_not_allowed: 'Seçilen taksit bu ödemede geçerli değil.'
      };
      setError(map[msg] || msg);
    }
  }

  if (loading) {
    return (
      <PaymentShell>
        <div className="flex justify-center py-20 text-slate-300">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </PaymentShell>
    );
  }

  if (error && !order) {
    return (
      <PaymentShell>
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-8 text-center">
          <p className="text-sm">Ödeme linki bulunamadı veya geçersiz.</p>
        </div>
      </PaymentShell>
    );
  }

  if (!order) return null;

  const paid = order.status === 'paid';
  const amount = order.amount_try ?? order.amount_kurus / 100;

  return (
    <PaymentShell>
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] shadow-2xl shadow-black/40 backdrop-blur">
        <div className="border-b border-white/10 bg-gradient-to-r from-sky-600/30 to-transparent px-6 py-5">
          <p className="text-xs uppercase tracking-[0.2em] text-sky-200/80">Online VIP Dershane</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{order.title}</h1>
        </div>
        <div className="space-y-6 px-6 py-6">
          <div>
            <p className="text-sm text-slate-400">Ödenecek tutar</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-white">{formatTry(amount)}</p>
            {order.customer_name ? (
              <p className="mt-2 text-sm text-slate-300">{order.customer_name}</p>
            ) : null}
          </div>

          {paid ? (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-500/15 px-4 py-3 text-sm text-emerald-200">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              Bu ödeme daha önce başarıyla alındı.
            </div>
          ) : (
            <>
              {installmentOptions.length > 0 ? (
                <label className="block text-sm">
                  <span className="text-slate-400">Taksit</span>
                  <select
                    className="mt-1 w-full rounded-xl border border-white/15 bg-slate-950/60 px-3 py-2.5 text-slate-100"
                    value={installment}
                    onChange={(e) => setInstallment(Number(e.target.value))}
                  >
                    {installmentOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {error ? <p className="text-sm text-rose-300">{error}</p> : null}

              <button
                type="button"
                disabled={paying || order.gateway_ready === false}
                onClick={() => void onPay()}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-3.5 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {paying ? <Loader2 className="h-5 w-5 animate-spin" /> : <CreditCard className="h-5 w-5" />}
                {paying ? 'Garanti’ye yönlendiriliyor…' : 'Güvenli ödemeye geç'}
              </button>

              <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-400">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
                Kart bilgileriniz Garanti BBVA güvenli ödeme sayfasında alınır. 3D Secure doğrulaması
                zorunludur.
              </p>
            </>
          )}
        </div>
      </div>
    </PaymentShell>
  );
}
