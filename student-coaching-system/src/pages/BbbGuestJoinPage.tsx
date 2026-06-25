import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Loader2, Video } from 'lucide-react';
import { parseGuestJoinToken, guestJoinRedirectUrl, resolveGuestJoinShortCode } from '../lib/bbbGuestJoin';

export default function BbbGuestJoinPage() {
  const { slug, code } = useParams();
  const [searchParams] = useSearchParams();
  const shortCode = String(code || '').trim().toLowerCase();
  const [resolvedToken, setResolvedToken] = useState('');
  const [resolving, setResolving] = useState(Boolean(shortCode));
  const directToken = parseGuestJoinToken(String(slug || ''), searchParams.toString());
  const token = resolvedToken || directToken;
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!shortCode) {
      setResolving(false);
      return;
    }
    let cancel = false;
    setResolving(true);
    setError('');
    void resolveGuestJoinShortCode(shortCode)
      .then((t) => {
        if (!cancel) setResolvedToken(t);
      })
      .catch((err) => {
        if (!cancel) setError(err instanceof Error ? err.message : 'Davet bağlantısı geçersiz.');
      })
      .finally(() => {
        if (!cancel) setResolving(false);
      });
    return () => {
      cancel = true;
    };
  }, [shortCode]);

  useEffect(() => {
    if (!shortCode && !directToken) setError('Davet bağlantısı geçersiz veya eksik.');
  }, [shortCode, directToken]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setError('');
    try {
      window.location.assign(guestJoinRedirectUrl(token, name));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Katılım başarısız');
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-slate-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
            <Video className="h-6 w-6" aria-hidden />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Canlı derse katıl</h1>
            <p className="text-sm text-slate-500">Panele giriş yapmanız gerekmez.</p>
          </div>
        </div>

        {resolving ? (
          <div className="flex items-center justify-center gap-2 py-8 text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            <span className="text-sm">Davet bağlantısı doğrulanıyor…</span>
          </div>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="space-y-4">
            <label className="block text-sm">
              <span className="text-slate-600">Adınız soyadınız</span>
              <input
                type="text"
                required
                minLength={2}
                maxLength={64}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Örn. Ayşe Yılmaz"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                autoFocus
                disabled={!token}
              />
            </label>
            {error ? (
              <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
            ) : null}
            <button
              type="submit"
              disabled={busy || !token}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Derse katıl
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-xs text-slate-400">
          <Link to="/login" className="text-indigo-600 hover:underline">
            Panele giriş
          </Link>
        </p>
      </div>
    </div>
  );
}
