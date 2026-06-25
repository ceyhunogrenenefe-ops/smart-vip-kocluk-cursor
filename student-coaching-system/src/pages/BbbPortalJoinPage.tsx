import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { fetchBbbJoinUrl } from '../lib/bbbJoin';

type Props = {
  kind: 'class' | 'private';
};

export default function BbbPortalJoinPage({ kind }: Props) {
  const params = useParams();
  const id = String(kind === 'class' ? params.sessionId : params.lessonId || '').trim();
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
            ? await fetchBbbJoinUrl('class-live-lessons', id)
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
  }, [id, kind]);

  const backPath = kind === 'class' ? '/class-live-lessons' : '/live-lessons';

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl border border-slate-200 bg-white p-8 shadow-sm text-center">
          <p className="text-red-700 font-medium">Katılım başarısız</p>
          <p className="mt-2 text-sm text-slate-600">{error}</p>
          <p className="mt-3 text-xs text-slate-500">
            Panele giriş yaptığınızdan emin olun. Ham BBB sunucu linki yerine bu panel bağlantısını kullanın.
          </p>
          <Link to={backPath} className="mt-6 inline-block text-sm font-medium text-indigo-600 hover:underline">
            Ders listesine dön
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-2xl border border-slate-200 bg-white p-8 shadow-sm text-center">
        <Loader2 className="mx-auto h-10 w-10 animate-spin text-indigo-600" aria-hidden />
        <p className="mt-4 text-slate-800 font-medium">BBB odası hazırlanıyor…</p>
        <p className="mt-2 text-sm text-slate-500">Hazır olunca otomatik olarak derse yönlendirileceksiniz.</p>
      </div>
    </div>
  );
}
