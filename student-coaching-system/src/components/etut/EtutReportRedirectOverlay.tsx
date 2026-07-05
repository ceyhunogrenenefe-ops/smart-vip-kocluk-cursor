import { Loader2 } from 'lucide-react';

export function EtutReportRedirectOverlay() {
  return (
    <div className="fixed inset-0 z-[255] flex items-center justify-center bg-gradient-to-br from-emerald-600/95 via-teal-600/95 to-emerald-700/95 p-6 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-white/20 bg-white/95 px-6 py-8 text-center shadow-2xl">
        <Loader2 className="mx-auto h-10 w-10 animate-spin text-emerald-600" aria-hidden />
        <p className="mt-5 text-lg font-bold text-slate-900">Etüt rapor ekranına yönlendiriliyorsunuz</p>
        <p className="mt-2 text-sm text-slate-600">Lütfen bekleyin…</p>
      </div>
    </div>
  );
}
