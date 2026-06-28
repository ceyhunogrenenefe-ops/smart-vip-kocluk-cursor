import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { fetchAcademicCenterBbbJoinUrl, type ExamEntryKey } from '../lib/academicCenterLinks';

const VALID_ROOMS = new Set(['lise', 'yos', 'class34', 'class56', 'class78']);

export default function AcademicCenterBbbJoinPage() {
  const [searchParams] = useSearchParams();
  const room = String(searchParams.get('room') || '').trim() as ExamEntryKey;
  const institutionId = String(searchParams.get('institution_id') || '').trim() || null;
  const [error, setError] = useState('');

  useEffect(() => {
    if (!VALID_ROOMS.has(room)) {
      setError('Geçersiz deneme sınıfı.');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const url = await fetchAcademicCenterBbbJoinUrl(room, institutionId);
        if (cancelled) return;
        window.location.replace(url);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Deneme sınıfına katılım başarısız.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [room, institutionId]);

  if (error) {
    return (
      <div className="flex min-h-[100dvh] min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 via-slate-50 to-indigo-50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-lg sm:p-8">
          <p className="font-semibold text-red-700">Bağlantı kurulamadı</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{error}</p>
          <Link
            to="/academic-center?tab=exam"
            className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white"
          >
            Akademik Merkez&apos;e dön
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 via-slate-50 to-indigo-50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-lg sm:p-8">
        <Loader2 className="mx-auto h-11 w-11 animate-spin text-emerald-600" aria-hidden />
        <h1 className="mt-5 text-base font-bold leading-snug text-slate-900 sm:text-lg">
          Deneme sınavı sınıfına yönlendiriliyorsunuz
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600 sm:text-base">Lütfen bekleyiniz…</p>
        <p className="mt-4 text-xs text-slate-500">Oda hazır olunca otomatik olarak sınıfa aktarılacaksınız.</p>
      </div>
    </div>
  );
}
