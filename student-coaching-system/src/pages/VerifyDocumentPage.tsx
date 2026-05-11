import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { verifyDocumentPublic } from '../lib/contractSystemApi';
import { ShieldCheck, ShieldAlert, Loader2 } from 'lucide-react';

export default function VerifyDocumentPage() {
  const [params] = useSearchParams();
  const t = params.get('t') || '';
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<Awaited<ReturnType<typeof verifyDocumentPublic>> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!t) {
        setResult({ ok: false, error: 'missing_token' });
        setLoading(false);
        return;
      }
      const r = await verifyDocumentPublic(t);
      if (!cancelled) {
        setResult(r);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-950 flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full rounded-2xl border border-white/10 bg-white/95 shadow-2xl p-8 text-slate-900">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="w-8 h-8 text-blue-700" />
          <h1 className="text-lg font-bold">Belge doğrulama</h1>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-slate-600">
            <Loader2 className="w-5 h-5 animate-spin" /> Sorgulanıyor…
          </div>
        ) : result?.ok ? (
          <div className="space-y-3 text-sm">
            <p className="text-emerald-700 font-semibold flex items-center gap-2">
              <ShieldCheck className="w-5 h-5" />
              Bu belge Smart Koçluk kayıtlarında bulundu.
            </p>
            <p>
              <span className="text-slate-500">Sözleşme no:</span>{' '}
              <span className="font-mono font-bold">{result.contract_number}</span>
            </p>
            <p>
              <span className="text-slate-500">Durum:</span> {result.status}
            </p>
            {result.institution_name ? (
              <p>
                <span className="text-slate-500">Kurum:</span> {result.institution_name}
              </p>
            ) : null}
            {result.signed_at ? (
              <p>
                <span className="text-slate-500">İmza tarihi:</span> {new Date(result.signed_at).toLocaleString('tr-TR')}
              </p>
            ) : (
              <p className="text-amber-700">Henüz dijital imza tamamlanmamış olabilir.</p>
            )}
          </div>
        ) : (
          <div className="text-red-700 flex items-start gap-2 text-sm">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <span>Kayıt bulunamadı veya bağlantı geçersiz.</span>
          </div>
        )}
      </div>
    </div>
  );
}
