import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Loader2, Star } from 'lucide-react';
import { resolveApiUrl } from '../../lib/session';

type SurveyInfo = {
  institution: { name: string; logo: string | null };
  event: { title: string; date: string; time: string };
  name: string;
  answered: boolean;
  previous: {
    rating: number;
    expectation: 'evet' | 'kismen' | 'hayir' | null;
    want_info: boolean | null;
    topics: string | null;
    comment: string | null;
  } | null;
};

const RATING_LABEL = ['', 'Hiç beğenmedim', 'Beğenmedim', 'Fena değil', 'Beğendim', 'Çok beğendim'];
const EXPECTATIONS: { id: 'evet' | 'kismen' | 'hayir'; label: string }[] = [
  { id: 'evet', label: 'Evet' },
  { id: 'kismen', label: 'Kısmen' },
  { id: 'hayir', label: 'Hayır' }
];

const inputCls =
  'mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-base text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20';

function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
        active ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-emerald-400'
      }`}
    >
      {children}
    </button>
  );
}

export default function EventSurveyPublicPage() {
  const { token = '' } = useParams();
  const [info, setInfo] = useState<SurveyInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [expectation, setExpectation] = useState<'evet' | 'kismen' | 'hayir' | null>(null);
  const [wantInfo, setWantInfo] = useState<boolean | null>(null);
  const [topics, setTopics] = useState('');
  const [comment, setComment] = useState('');
  const [website, setWebsite] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancel = false;
    fetch(resolveApiUrl(`/api/event-survey?token=${encodeURIComponent(token)}`))
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(r.status === 404 ? 'Bu anket bağlantısı geçersiz.' : 'Anket yüklenemedi.');
        return j as SurveyInfo;
      })
      .then((j) => {
        if (cancel) return;
        setInfo(j);
        document.title = `${j.event.title} — Anket`;
        if (j.previous) {
          setRating(j.previous.rating);
          setExpectation(j.previous.expectation);
          setWantInfo(j.previous.want_info);
          setTopics(j.previous.topics || '');
          setComment(j.previous.comment || '');
        }
      })
      .catch((e) => !cancel && setLoadError(e instanceof Error ? e.message : 'Anket yüklenemedi.'))
      .finally(() => !cancel && setLoading(false));
    return () => {
      cancel = true;
    };
  }, [token]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!rating) {
      setError('Lütfen seminere 1–5 arası puan verin.');
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch(resolveApiUrl(`/api/event-survey?token=${encodeURIComponent(token)}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, expectation, want_info: wantInfo, topics, comment, website })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(j?.message || 'Yanıtınız gönderilemedi. Tekrar deneyin.');
        return;
      }
      setDone(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setError('Bağlantı hatası. İnternetinizi kontrol edip tekrar deneyin.');
    } finally {
      setSubmitting(false);
    }
  };

  const shown = hover || rating;

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-sky-50 px-4 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-lg">
        {loading ? (
          <div className="flex justify-center py-24 text-slate-400">
            <Loader2 className="h-8 w-8 animate-spin" aria-label="Yükleniyor" />
          </div>
        ) : loadError || !info ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-sm text-amber-900">
            {loadError || 'Anket bulunamadı.'}
          </div>
        ) : (
          <>
            <header className="mb-5 text-center">
              {info.institution.logo ? (
                <img src={info.institution.logo} alt={info.institution.name} className="mx-auto mb-3 h-14 w-auto object-contain" />
              ) : info.institution.name ? (
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">{info.institution.name}</p>
              ) : null}
              <p className="text-sm font-medium text-emerald-700">Seminer değerlendirme anketi</p>
              <h1 className="mt-1 text-2xl font-bold leading-tight text-slate-900">{info.event.title}</h1>
              {info.event.date && (
                <p className="mt-1 text-sm text-slate-500">
                  {info.event.date} {info.event.time}
                </p>
              )}
            </header>

            <main className="rounded-2xl bg-white p-5 shadow-lg shadow-emerald-900/5 ring-1 ring-slate-200 sm:p-6">
              {done ? (
                <div className="py-6 text-center" role="status">
                  <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" aria-hidden />
                  <h2 className="mt-3 text-xl font-semibold text-slate-900">Teşekkür ederiz!</h2>
                  <p className="mt-2 text-[15px] text-slate-600">
                    Görüşleriniz bize ulaştı.
                    {wantInfo ? ' Ekibimiz en kısa sürede sizinle iletişime geçecek.' : ''}
                  </p>
                </div>
              ) : (
                <form onSubmit={submit} className="space-y-6">
                  <p className="text-[15px] text-slate-700">
                    {info.name ? `Merhaba ${info.name}, ` : ''}seminerimiz hakkındaki görüşleriniz bizim için çok değerli. Anket
                    1 dakika sürer.
                    {info.answered && (
                      <span className="mt-1 block text-sm text-emerald-700">
                        Bu anketi daha önce doldurdunuz. Dilerseniz yanıtlarınızı güncelleyebilirsiniz.
                      </span>
                    )}
                  </p>

                  <fieldset>
                    <legend className="text-sm font-semibold text-slate-800">
                      1. Semineri genel olarak nasıl buldunuz? <span className="text-rose-500">*</span>
                    </legend>
                    <div className="mt-3 flex items-center justify-center gap-1.5" onMouseLeave={() => setHover(0)}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setRating(n)}
                          onMouseEnter={() => setHover(n)}
                          aria-label={`${n} puan — ${RATING_LABEL[n]}`}
                          aria-pressed={rating === n}
                          className="rounded-lg p-1 transition hover:scale-110"
                        >
                          <Star className={`h-10 w-10 ${n <= shown ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
                        </button>
                      ))}
                    </div>
                    <p className="mt-1 h-5 text-center text-sm font-medium text-slate-600">{shown ? RATING_LABEL[shown] : ''}</p>
                  </fieldset>

                  <fieldset>
                    <legend className="text-sm font-semibold text-slate-800">2. Seminer beklentinizi karşıladı mı?</legend>
                    <div className="mt-2 flex gap-2">
                      {EXPECTATIONS.map((o) => (
                        <Choice key={o.id} active={expectation === o.id} onClick={() => setExpectation(o.id)}>
                          {o.label}
                        </Choice>
                      ))}
                    </div>
                  </fieldset>

                  <label className="block">
                    <span className="text-sm font-semibold text-slate-800">3. Hangi konularda seminer düzenlememizi istersiniz?</span>
                    <input
                      className={inputCls}
                      value={topics}
                      onChange={(e) => setTopics(e.target.value)}
                      placeholder="Örn. sınav kaygısı, verimli ders çalışma…"
                      maxLength={500}
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-semibold text-slate-800">4. Görüş ve önerileriniz</span>
                    <textarea
                      className={inputCls}
                      rows={4}
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Beğendiğiniz ya da geliştirmemizi istediğiniz noktalar…"
                      maxLength={2000}
                    />
                  </label>

                  <fieldset>
                    <legend className="text-sm font-semibold text-slate-800">
                      5. Eğitim programlarımız hakkında bilgi almak ister misiniz?
                    </legend>
                    <div className="mt-2 flex gap-2">
                      <Choice active={wantInfo === true} onClick={() => setWantInfo(true)}>
                        Evet, aransın
                      </Choice>
                      <Choice active={wantInfo === false} onClick={() => setWantInfo(false)}>
                        Şimdilik hayır
                      </Choice>
                    </div>
                  </fieldset>

                  <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                    <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
                  </div>

                  {error && (
                    <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3.5 text-base font-semibold text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {submitting && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
                    {info.answered ? 'Yanıtımı güncelle' : 'Gönder'}
                  </button>
                </form>
              )}
            </main>
          </>
        )}
      </div>
    </div>
  );
}
