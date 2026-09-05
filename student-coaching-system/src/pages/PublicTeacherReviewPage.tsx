import { FormEvent, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Star } from 'lucide-react';
import { toast } from 'sonner';
import { resolveApiUrl } from '../lib/session';

type InviteInfo = {
  token: string;
  teacher_id: string;
  teacher_name: string;
  teacher_photo_url?: string | null;
  parent_name?: string | null;
  expires_at: string;
};

/** Şifresiz veli değerlendirme — /review/public?token=... */
export default function PublicTeacherReviewPage() {
  const [params] = useSearchParams();
  const token = String(params.get('token') || '').trim();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [rating, setRating] = useState(5);
  const [hover, setHover] = useState(0);
  const [name, setName] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError('Geçersiz veya eksik bağlantı.');
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(resolveApiUrl(`/api/reviews/parent?token=${encodeURIComponent(token)}`));
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          const map: Record<string, string> = {
            invalid_token: 'Bağlantı geçersiz.',
            token_used: 'Bu değerlendirme bağlantısı daha önce kullanılmış.',
            token_expired: 'Bağlantının süresi dolmuş.',
            table_missing: 'Sistem henüz hazır değil. Lütfen daha sonra tekrar deneyin.'
          };
          throw new Error(map[j.error] || j.hint || j.message || 'Yüklenemedi');
        }
        if (cancelled) return;
        setInfo(j.data);
        setName(String(j.data?.parent_name || '').trim());
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Yüklenemedi');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !info) return;
    if (!name.trim()) {
      toast.error('Lütfen adınızı yazın');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(resolveApiUrl('/api/reviews/parent'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          rating,
          comment: comment.trim() || null,
          reviewer_name: name.trim()
        })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.hint || j.message || j.error || 'Gönderilemedi');
      setDone(true);
      toast.success('Teşekkürler! Değerlendirmeniz alındı.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gönderilemedi');
    } finally {
      setSaving(false);
    }
  };

  const photo = info?.teacher_photo_url || null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-indigo-50 px-4 py-8">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Online VIP Dershane</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Öğretmen Değerlendirme</h1>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-lg">
          {loading && (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
          )}

          {!loading && error && <p className="text-center text-sm text-red-600">{error}</p>}

          {!loading && !error && done && (
            <div className="py-8 text-center">
              <p className="text-lg font-semibold text-emerald-700">Değerlendirmeniz kaydedildi</p>
              <p className="mt-2 text-sm text-slate-600">Katkınız için teşekkür ederiz.</p>
            </div>
          )}

          {!loading && !error && info && !done && (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                {photo ? (
                  <img src={photo} alt="" className="h-14 w-14 rounded-full object-cover" />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100 text-lg font-bold text-indigo-700">
                    {(info.teacher_name || 'Ö').slice(0, 1)}
                  </div>
                )}
                <div>
                  <p className="font-semibold text-slate-900">{info.teacher_name}</p>
                  <p className="text-xs text-slate-500">Öğretmen değerlendirmesi</p>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Adınız Soyadınız</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
                  placeholder="Veli adı"
                />
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">Puan</p>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => {
                    const active = n <= (hover || rating);
                    return (
                      <button
                        key={n}
                        type="button"
                        onMouseEnter={() => setHover(n)}
                        onMouseLeave={() => setHover(0)}
                        onClick={() => setRating(n)}
                        className="rounded-lg p-1"
                        aria-label={`${n} yıldız`}
                      >
                        <Star className={`h-9 w-9 ${active ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Yorum (isteğe bağlı)</label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={4}
                  maxLength={2000}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
                  placeholder="Deneyiminizi kısaca yazabilirsiniz…"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Değerlendirmeyi Gönder
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
