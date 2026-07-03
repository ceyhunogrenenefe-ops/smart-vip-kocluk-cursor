import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { fetchBbbJoinUrl } from '../lib/bbbJoin';

type Props = {
  kind: 'class' | 'private';
};

export default function BbbPortalJoinPage({ kind }: Props) {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const id = String(kind === 'class' ? params.sessionId : params.lessonId || '').trim();
  const slotKind = searchParams.get('kind') === 'slot' ? 'slot' : 'session';
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) {
      setError('Geçersiz ders bağlantısı.');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const url =
          kind === 'class'
            ? await fetchBbbJoinUrl('class-live-lessons', id, { kind: slotKind })
            : await fetchBbbJoinUrl('teacher-lessons', id);
        if (cancelled) return;
        window.location.replace(url);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Derse katılım başarısız.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, kind, slotKind]);

  const backPath = kind === 'class' ? '/class-live-lessons' : '/live-lessons';

  if (error) {
    return (
      <div className="flex min-h-[100dvh] min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 via-slate-50 to-indigo-50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-lg sm:p-8">
          <p className="font-semibold text-red-700">Bağlantı kurulamadı</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{error}</p>
          <p className="mt-3 text-xs text-slate-500">
            Panele giriş yaptığınızdan emin olun. Ham BBB sunucu linki yerine bu panel bağlantısını kullanın.
          </p>
          <Link
            to={backPath}
            className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white"
          >
            Ders listesine dön
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 via-slate-50 to-indigo-50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-lg sm:p-8">
        <Loader2 className="mx-auto h-11 w-11 animate-spin text-indigo-600" aria-hidden />
        <h1 className="mt-5 text-base font-bold leading-snug text-slate-900 sm:text-lg">
          Derse yönlendiriliyorsunuz
        </h1>
      </div>
    </div>
  );
}
