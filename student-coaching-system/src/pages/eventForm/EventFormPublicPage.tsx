import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { CalendarDays, CheckCircle2, Clock, Loader2, MapPin, ShieldCheck, X } from 'lucide-react';
import { resolveApiUrl } from '../../lib/session';

type FieldCfg = { enabled: boolean; required: boolean };

type PublicForm = {
  institution: { name: string; logo: string | null };
  event: { title: string; description: string; date: string; time: string; location: string };
  form: {
    heading: string;
    intro: string;
    button_label: string;
    success_message: string;
    fields: { parent_name: FieldCfg; student_name: FieldCfg; phone: FieldCfg; grade: FieldCfg };
    grade_options: string[];
    kvkk_text: string;
    kvkk_url: string;
    contact_consent: boolean;
    closed: boolean;
    closed_message: string;
  };
};

type Errors = Partial<Record<'parent_name' | 'student_name' | 'phone' | 'grade' | 'kvkk', string>>;

function formatPhoneInput(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 11);
  if (!d) return '';
  const p = d.startsWith('0') ? d : d.startsWith('5') ? `0${d}`.slice(0, 11) : d;
  const parts = [p.slice(0, 4), p.slice(4, 7), p.slice(7, 9), p.slice(9, 11)].filter(Boolean);
  return parts.join(' ');
}

function readUtm(): Record<string, string> | undefined {
  try {
    const sp = new URLSearchParams(window.location.search);
    const out: Record<string, string> = {};
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
      const v = sp.get(k);
      if (v) out[k] = v.slice(0, 120);
    }
    return Object.keys(out).length ? out : undefined;
  } catch {
    return undefined;
  }
}

const inputCls =
  'mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-base text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20';

export default function EventFormPublicPage() {
  const { slug = '' } = useParams();
  const [data, setData] = useState<PublicForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [parentName, setParentName] = useState('');
  const [studentName, setStudentName] = useState('');
  const [phone, setPhone] = useState('');
  const [grade, setGrade] = useState('');
  const [kvkk, setKvkk] = useState(false);
  const [contactConsent, setContactConsent] = useState(false);
  const [website, setWebsite] = useState(''); // bot tuzağı
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [kvkkOpen, setKvkkOpen] = useState(false);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    fetch(resolveApiUrl(`/api/event-form?slug=${encodeURIComponent(slug.toLowerCase())}`))
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(r.status === 404 ? 'Bu form bulunamadı veya yayından kaldırıldı.' : 'Form yüklenemedi.');
        return j as PublicForm;
      })
      .then((j) => {
        if (cancel) return;
        setData(j);
        document.title = `${j.form.heading || j.event.title} — Kayıt`;
      })
      .catch((e) => !cancel && setLoadError(e instanceof Error ? e.message : 'Form yüklenemedi.'))
      .finally(() => !cancel && setLoading(false));
    return () => {
      cancel = true;
    };
  }, [slug]);

  const f = data?.form;
  const hasKvkkText = Boolean(f?.kvkk_text?.trim());

  const validate = (): Errors => {
    const e: Errors = {};
    if (parentName.trim().length < 3) e.parent_name = 'Ad soyad girin.';
    if (f?.fields.student_name.enabled && f.fields.student_name.required && studentName.trim().length < 2) {
      e.student_name = 'Öğrencinin adını girin.';
    }
    const digits = phone.replace(/\D/g, '');
    if (!/^0?5\d{9}$/.test(digits) && !(phone.trim().startsWith('+') && digits.length >= 10)) {
      e.phone = 'Geçerli bir cep telefonu girin (05xx xxx xx xx).';
    }
    if (f?.fields.grade.enabled && f.fields.grade.required && !grade) e.grade = 'Sınıf seçin.';
    if (!kvkk) e.kvkk = 'Devam etmek için KVKK metnini onaylayın.';
    return e;
  };

  const onSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    setSubmitError(null);
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setSubmitting(true);
    try {
      const r = await fetch(resolveApiUrl(`/api/event-form?slug=${encodeURIComponent(slug.toLowerCase())}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parent_name: parentName,
          student_name: studentName,
          phone,
          grade,
          kvkk: true,
          contact_consent: contactConsent,
          website,
          utm: readUtm(),
          referrer: document.referrer || undefined
        })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (j?.errors) setErrors(j.errors);
        setSubmitError(j?.message || (j?.errors ? 'Lütfen işaretli alanları kontrol edin.' : 'Kayıt gönderilemedi. Tekrar deneyin.'));
        return;
      }
      setDone(j?.message || f?.success_message || 'Kaydınız alındı.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setSubmitError('Bağlantı hatası. İnternetinizi kontrol edip tekrar deneyin.');
    } finally {
      setSubmitting(false);
    }
  };

  const eventMeta = useMemo(() => {
    if (!data) return [];
    const out: { icon: typeof CalendarDays; text: string }[] = [];
    if (data.event.date) out.push({ icon: CalendarDays, text: data.event.date });
    if (data.event.time) out.push({ icon: Clock, text: data.event.time });
    if (data.event.location) out.push({ icon: MapPin, text: data.event.location });
    return out;
  }, [data]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-sky-50 px-4 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-lg">
        {loading ? (
          <div className="flex justify-center py-24 text-slate-400">
            <Loader2 className="h-8 w-8 animate-spin" aria-label="Yükleniyor" />
          </div>
        ) : loadError || !data || !f ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-sm text-amber-900">
            {loadError || 'Form bulunamadı.'}
          </div>
        ) : (
          <>
            <header className="mb-5 text-center">
              {data.institution.logo ? (
                <img src={data.institution.logo} alt={data.institution.name} className="mx-auto mb-3 h-14 w-auto object-contain" />
              ) : data.institution.name ? (
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">{data.institution.name}</p>
              ) : null}
              <h1 className="text-2xl font-bold leading-tight text-slate-900 sm:text-3xl">{f.heading || data.event.title}</h1>
              {eventMeta.length > 0 && (
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  {eventMeta.map(({ icon: Icon, text }) => (
                    <span
                      key={text}
                      className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-200"
                    >
                      <Icon className="h-4 w-4 text-emerald-600" aria-hidden />
                      {text}
                    </span>
                  ))}
                </div>
              )}
              {(f.intro || data.event.description) && (
                <p className="mt-4 whitespace-pre-line text-[15px] leading-relaxed text-slate-600">{f.intro || data.event.description}</p>
              )}
            </header>

            <main className="rounded-2xl bg-white p-5 shadow-lg shadow-emerald-900/5 ring-1 ring-slate-200 sm:p-6">
              {done ? (
                <div className="py-6 text-center" role="status">
                  <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" aria-hidden />
                  <h2 className="mt-3 text-xl font-semibold text-slate-900">Kaydınız alındı</h2>
                  <p className="mt-2 whitespace-pre-line text-[15px] text-slate-600">{done}</p>
                </div>
              ) : f.closed ? (
                <p className="py-6 text-center text-[15px] text-slate-600">{f.closed_message}</p>
              ) : (
                <form onSubmit={onSubmit} noValidate className="space-y-4">
                  <div>
                    <label htmlFor="ef-parent" className="text-sm font-medium text-slate-800">
                      Veli adı soyadı <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id="ef-parent"
                      className={inputCls}
                      value={parentName}
                      onChange={(e) => setParentName(e.target.value)}
                      autoComplete="name"
                      placeholder="Örn. Ayşe Yılmaz"
                      aria-invalid={Boolean(errors.parent_name)}
                    />
                    {errors.parent_name && <p className="mt-1 text-sm text-rose-600">{errors.parent_name}</p>}
                  </div>

                  {f.fields.student_name.enabled && (
                    <div>
                      <label htmlFor="ef-student" className="text-sm font-medium text-slate-800">
                        Öğrencinin adı soyadı {f.fields.student_name.required && <span className="text-rose-500">*</span>}
                      </label>
                      <input
                        id="ef-student"
                        className={inputCls}
                        value={studentName}
                        onChange={(e) => setStudentName(e.target.value)}
                        autoComplete="off"
                        placeholder="Örn. Ali Yılmaz"
                        aria-invalid={Boolean(errors.student_name)}
                      />
                      {errors.student_name && <p className="mt-1 text-sm text-rose-600">{errors.student_name}</p>}
                    </div>
                  )}

                  <div>
                    <label htmlFor="ef-phone" className="text-sm font-medium text-slate-800">
                      Telefon (WhatsApp) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id="ef-phone"
                      className={inputCls}
                      value={phone}
                      onChange={(e) =>
                        setPhone(e.target.value.trim().startsWith('+') ? e.target.value : formatPhoneInput(e.target.value))
                      }
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="05xx xxx xx xx"
                      aria-invalid={Boolean(errors.phone)}
                    />
                    {errors.phone ? (
                      <p className="mt-1 text-sm text-rose-600">{errors.phone}</p>
                    ) : (
                      <p className="mt-1 text-xs text-slate-500">Etkinlik linki ve hatırlatmalar bu numaraya WhatsApp ile gelir.</p>
                    )}
                  </div>

                  {f.fields.grade.enabled && (
                    <div>
                      <label htmlFor="ef-grade" className="text-sm font-medium text-slate-800">
                        Sınıf {f.fields.grade.required && <span className="text-rose-500">*</span>}
                      </label>
                      <select
                        id="ef-grade"
                        className={inputCls}
                        value={grade}
                        onChange={(e) => setGrade(e.target.value)}
                        aria-invalid={Boolean(errors.grade)}
                      >
                        <option value="">Seçin</option>
                        {f.grade_options.map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                      {errors.grade && <p className="mt-1 text-sm text-rose-600">{errors.grade}</p>}
                    </div>
                  )}

                  {/* Bot tuzağı — gerçek kullanıcı görmez */}
                  <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                    <label>
                      Web sitesi
                      <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
                    </label>
                  </div>

                  <div className="space-y-3 rounded-xl bg-slate-50 p-3.5 ring-1 ring-slate-200">
                    <label className="flex cursor-pointer items-start gap-3 text-sm leading-snug text-slate-700">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        checked={kvkk}
                        onChange={(e) => setKvkk(e.target.checked)}
                        aria-invalid={Boolean(errors.kvkk)}
                      />
                      <span>
                        {hasKvkkText ? (
                          <button
                            type="button"
                            onClick={() => setKvkkOpen(true)}
                            className="font-semibold text-emerald-700 underline underline-offset-2"
                          >
                            KVKK Aydınlatma Metni
                          </button>
                        ) : f.kvkk_url ? (
                          <a
                            href={f.kvkk_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold text-emerald-700 underline underline-offset-2"
                          >
                            KVKK Aydınlatma Metni
                          </a>
                        ) : (
                          <span className="font-semibold">KVKK Aydınlatma Metni</span>
                        )}
                        'ni okudum; kişisel verilerimin etkinlik kaydı ve bilgilendirme amacıyla işlenmesini kabul ediyorum.{' '}
                        <span className="text-rose-500">*</span>
                      </span>
                    </label>
                    {errors.kvkk && <p className="text-sm text-rose-600">{errors.kvkk}</p>}
                    {f.contact_consent && (
                      <label className="flex cursor-pointer items-start gap-3 text-sm leading-snug text-slate-700">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          checked={contactConsent}
                          onChange={(e) => setContactConsent(e.target.checked)}
                        />
                        <span>
                          {data.institution.name || 'Kurum'} tarafından eğitim programları ve kampanyalar hakkında
                          WhatsApp, SMS ve arama yoluyla bilgilendirilmek istiyorum. (İsteğe bağlı)
                        </span>
                      </label>
                    )}
                  </div>

                  {submitError && (
                    <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
                      {submitError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3.5 text-base font-semibold text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {submitting && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
                    {f.button_label}
                  </button>
                  <p className="flex items-center justify-center gap-1.5 text-xs text-slate-400">
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                    Bilgileriniz yalnızca bu etkinlik için kullanılır.
                  </p>
                </form>
              )}
            </main>
          </>
        )}
      </div>

      {kvkkOpen && f && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="kvkk-title"
          onClick={() => setKvkkOpen(false)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <h2 id="kvkk-title" className="text-base font-semibold text-slate-900">
                KVKK Aydınlatma Metni
              </h2>
              <button type="button" onClick={() => setKvkkOpen(false)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Kapat">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto whitespace-pre-line px-5 py-4 text-sm leading-relaxed text-slate-700">{f.kvkk_text}</div>
            <div className="border-t border-slate-200 p-4">
              <button
                type="button"
                onClick={() => {
                  setKvkk(true);
                  setKvkkOpen(false);
                }}
                className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Okudum, onaylıyorum
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
