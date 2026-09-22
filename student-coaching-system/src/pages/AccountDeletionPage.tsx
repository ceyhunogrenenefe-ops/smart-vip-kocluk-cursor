import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2, Trash2, CheckCircle2 } from 'lucide-react';
import { resolveApiUrl } from '../lib/session';

/** Herkese açık hesap silme talebi sayfası (Google Play veri güvenliği bağlantısı) */
export default function AccountDeletionPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [reason, setReason] = useState('');
  const [website, setWebsite] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      // Oturum bilgisi gönderilmez: talep formdaki bilgilerle açılır
      const res = await fetch(resolveApiUrl('/api/account-deletion'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName, email, phone, reason, website })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || 'Talep gönderilemedi. Lütfen tekrar deneyin.');
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Talep gönderilemedi.');
    } finally {
      setBusy(false);
    }
  };

  const input =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none';

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 text-slate-100">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <Link to="/marketing" className="mb-6 inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white">
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
          Ana sayfa
        </Link>
        <div className="rounded-2xl border border-white/10 bg-white p-6 text-slate-900 shadow-xl sm:p-8">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Hesap ve Veri Silme Talebi</h1>
          <p className="mt-2 text-sm text-slate-600">
            Online VIP Ders ve Koçluk uygulamasındaki hesabınızın ve ilişkili verilerinizin silinmesini buradan
            isteyebilirsiniz. Uygulamaya giriş yapabiliyorsanız aynı talebi <strong>Profilim → Hesabımı sil</strong>{' '}
            bölümünden de oluşturabilirsiniz.
          </p>

          <div className="mt-5 space-y-2 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">Neler silinir?</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Hesap bilgileriniz (ad, e-posta, telefon, şifre)</li>
              <li>Çalışma raporları, haftalık plan ve hedefler, deneme sonuçları</li>
              <li>Uygulama içi mesajlar ve yüklediğiniz dosyalar</li>
            </ul>
            <p className="pt-1">
              Talebiniz kimliğiniz doğrulandıktan sonra en geç <strong>30 gün</strong> içinde tamamlanır. Yasal
              zorunluluk nedeniyle saklanması gereken fatura / ödeme kayıtları, ilgili mevzuatta öngörülen süre boyunca
              saklanır ve ardından silinir.
            </p>
          </div>

          {done ? (
            <div className="mt-6 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
              <p>
                Talebiniz alındı. Kimlik doğrulaması için sizinle kayıtlı e-posta veya telefonunuz üzerinden iletişime
                geçeceğiz. Sorularınız için: destek@smartkocluk.com
              </p>
            </div>
          ) : (
            <form onSubmit={(e) => void submit(e)} className="mt-6 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Ad soyad *</label>
                <input value={fullName} onChange={(e) => setFullName(e.target.value)} required className={input} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">Hesaba kayıtlı e-posta</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Hesaba kayıtlı telefon</label>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="05xx xxx xx xx"
                    className={input}
                  />
                </div>
              </div>
              <p className="-mt-2 text-xs text-slate-500">E-posta veya telefondan en az birini girin.</p>
              <div>
                <label className="mb-1 block text-sm font-medium">Silme nedeni (isteğe bağlı)</label>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className={input} />
              </div>
              {/* bot tuzağı */}
              <input
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="hidden"
              />
              {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}
              <button
                type="submit"
                disabled={busy}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Hesabımın silinmesini talep et
              </button>
            </form>
          )}

          <div className="mt-8 flex flex-wrap gap-4 border-t border-slate-200 pt-6 text-sm">
            <Link to="/gizlilik" className="font-semibold text-blue-700 underline underline-offset-2">
              Gizlilik Politikası
            </Link>
            <Link to="/kullanim-kosullari" className="font-semibold text-blue-700 underline underline-offset-2">
              Kullanım Koşulları
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
