import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Copy,
  ExternalLink,
  Loader2,
  Plus,
  QrCode,
  Save,
  Trash2,
  Upload
} from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../../lib/session';

type SetRow = {
  id: string;
  slug: string;
  school_year: string;
  grade_level: number;
  subject: string;
  term: number | null;
  exam_number: number | null;
  work_type: string;
  title: string;
  description: string | null;
  status: 'draft' | 'published' | 'archived';
  question_count?: number;
  public_url: string;
};

type QuestionRow = {
  id: string;
  question_number: number;
  title: string | null;
  topic: string | null;
  youtube_video_id: string;
  youtube_url: string | null;
  public_url: string | null;
  embed_url: string;
};

const WORK_TYPES: { id: string; label: string }[] = [
  { id: 'yazili', label: 'Yazılı' },
  { id: 'deneme', label: 'Deneme' },
  { id: 'konu_tarama', label: 'Konu tarama' },
  { id: 'foy', label: 'Föy' },
  { id: 'odev', label: 'Ödev' },
  { id: 'genel', label: 'Genel' }
];

const STATUS_LABEL: Record<string, string> = {
  draft: 'Taslak',
  published: 'Yayında',
  archived: 'Arşiv'
};

function durumRenk(status: string) {
  if (status === 'published') return 'bg-emerald-100 text-emerald-800';
  if (status === 'archived') return 'bg-slate-200 text-slate-700';
  return 'bg-amber-100 text-amber-900';
}

export default function VideoSolutionCenterPage() {
  const [yukleniyor, setYukleniyor] = useState(true);
  const [sets, setSets] = useState<SetRow[]>([]);
  const [publicBase, setPublicBase] = useState('');
  const [seciliId, setSeciliId] = useState<string | null>(null);
  const [detay, setDetay] = useState<SetRow | null>(null);
  const [sorular, setSorular] = useState<QuestionRow[]>([]);
  const [mesgul, setMesgul] = useState<string | null>(null);
  const [qrSet, setQrSet] = useState<string | null>(null);
  const [qrSoru, setQrSoru] = useState<{ n: number; url: string } | null>(null);

  const [yeni, setYeni] = useState(false);
  const [form, setForm] = useState({
    school_year: '2025-2026',
    grade_level: 8,
    subject: '',
    work_type: 'yazili',
    term: 1,
    exam_number: 1,
    title: '',
    description: ''
  });

  const [soruForm, setSoruForm] = useState({
    question_number: 1,
    title: '',
    topic: '',
    youtube_url: ''
  });

  const listeYukle = useCallback(async () => {
    const res = await apiFetch('/api/video-solution');
    const j = (await res.json().catch(() => ({}))) as {
      sets?: SetRow[];
      public_base_url?: string;
      hint?: string;
      error?: string;
    };
    if (!res.ok) throw new Error(j.hint || j.error || 'Liste alınamadı');
    setSets(Array.isArray(j.sets) ? j.sets : []);
    if (j.public_base_url) setPublicBase(j.public_base_url);
  }, []);

  const detayYukle = useCallback(async (setId: string) => {
    const res = await apiFetch(`/api/video-solution?setId=${encodeURIComponent(setId)}`);
    const j = (await res.json().catch(() => ({}))) as {
      set?: SetRow;
      questions?: QuestionRow[];
      hint?: string;
      error?: string;
    };
    if (!res.ok) throw new Error(j.hint || j.error || 'Detay alınamadı');
    setDetay(j.set || null);
    setSorular(Array.isArray(j.questions) ? j.questions : []);
    if (j.set) {
      const maxN = Math.max(0, ...(j.questions || []).map((q) => q.question_number));
      setSoruForm((f) => ({ ...f, question_number: maxN + 1 }));
    }
  }, []);

  useEffect(() => {
    void (async () => {
      setYukleniyor(true);
      try {
        await listeYukle();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Yüklenemedi');
      } finally {
        setYukleniyor(false);
      }
    })();
  }, [listeYukle]);

  useEffect(() => {
    if (!seciliId) {
      setDetay(null);
      setSorular([]);
      return;
    }
    void detayYukle(seciliId).catch((e) => toast.error(e instanceof Error ? e.message : 'Detay hatası'));
  }, [seciliId, detayYukle]);

  const seciliListe = useMemo(
    () => (seciliId ? sets.find((s) => s.id === seciliId) : null),
    [seciliId, sets]
  );

  const kopyala = async (metin: string) => {
    try {
      await navigator.clipboard.writeText(metin);
      toast.success('Bağlantı kopyalandı');
    } catch {
      toast.error('Kopyalanamadı');
    }
  };

  const qrAl = async (slug: string, n?: number) => {
    const qs = new URLSearchParams({ op: 'qr', slug });
    if (n != null) qs.set('n', String(n));
    const res = await apiFetch(`/api/video-solution?${qs.toString()}`);
    const j = (await res.json().catch(() => ({}))) as { qr_data_url?: string; url?: string; hint?: string };
    if (!res.ok) throw new Error(j.hint || 'Karekod üretilemedi');
    return j;
  };

  const calismaOlustur = async (e: React.FormEvent) => {
    e.preventDefault();
    setMesgul('create');
    try {
      const res = await apiFetch('/api/video-solution?op=create-set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const j = (await res.json().catch(() => ({}))) as { set?: SetRow; hint?: string; error?: string };
      if (!res.ok) throw new Error(j.hint || j.error || 'Oluşturulamadı');
      toast.success('Çalışma oluşturuldu');
      setYeni(false);
      await listeYukle();
      if (j.set?.id) setSeciliId(j.set.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Hata');
    } finally {
      setMesgul(null);
    }
  };

  const soruKaydet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!seciliId) return;
    setMesgul('question');
    try {
      const res = await apiFetch('/api/video-solution?op=upsert-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ set_id: seciliId, ...soruForm })
      });
      const j = (await res.json().catch(() => ({}))) as { hint?: string; error?: string };
      if (!res.ok) throw new Error(j.hint || j.error || 'Kaydedilemedi');
      toast.success('Soru kaydedildi');
      setSoruForm((f) => ({
        ...f,
        youtube_url: '',
        title: '',
        topic: '',
        question_number: f.question_number + 1
      }));
      await detayYukle(seciliId);
      await listeYukle();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Hata');
    } finally {
      setMesgul(null);
    }
  };

  const yayinla = async () => {
    if (!seciliId) return;
    setMesgul('publish');
    try {
      const res = await apiFetch('/api/video-solution?op=publish-set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ set_id: seciliId })
      });
      const j = (await res.json().catch(() => ({}))) as { hint?: string; error?: string };
      if (!res.ok) throw new Error(j.hint || j.error || 'Yayınlanamadı');
      toast.success('Yayında — slug artık değiştirilmemeli');
      await detayYukle(seciliId);
      await listeYukle();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Hata');
    } finally {
      setMesgul(null);
    }
  };

  const arsivle = async () => {
    if (!seciliId) return;
    setMesgul('archive');
    try {
      const res = await apiFetch('/api/video-solution?op=archive-set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ set_id: seciliId })
      });
      const j = (await res.json().catch(() => ({}))) as { hint?: string; error?: string };
      if (!res.ok) throw new Error(j.hint || j.error || 'Arşivlenemedi');
      toast.success('Arşivlendi');
      await detayYukle(seciliId);
      await listeYukle();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Hata');
    } finally {
      setMesgul(null);
    }
  };

  const silTaslak = async () => {
    if (!seciliId || detay?.status !== 'draft') return;
    if (!window.confirm('Taslak çalışma ve tüm soruları silinsin mi?')) return;
    setMesgul('delete');
    try {
      const res = await apiFetch(`/api/video-solution?setId=${encodeURIComponent(seciliId)}`, {
        method: 'DELETE'
      });
      const j = (await res.json().catch(() => ({}))) as { hint?: string; error?: string };
      if (!res.ok) throw new Error(j.hint || j.error || 'Silinemedi');
      toast.success('Silindi');
      setSeciliId(null);
      await listeYukle();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Hata');
    } finally {
      setMesgul(null);
    }
  };

  const soruSil = async (id: string) => {
    if (!window.confirm('Bu soru silinsin mi?')) return;
    setMesgul(`del-${id}`);
    try {
      const res = await apiFetch(`/api/video-solution?questionId=${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      const j = (await res.json().catch(() => ({}))) as { hint?: string; error?: string };
      if (!res.ok) throw new Error(j.hint || j.error || 'Silinemedi');
      toast.success('Soru silindi');
      if (seciliId) await detayYukle(seciliId);
      await listeYukle();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Hata');
    } finally {
      setMesgul(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 pb-16">
      <header className="rounded-xl border border-[#173b70]/15 bg-gradient-to-r from-[#173b70]/5 to-[#d72d42]/5 p-5">
        <h1 className="text-xl font-bold text-[#173b70]">Video Çözüm Merkezi</h1>
        <p className="mt-1 text-sm text-slate-600">
          YouTube çözüm videolarını çalışma paketlerine bağlayın. Öğrenci adresi:{' '}
          <span className="font-mono text-xs">{publicBase || 'cozum.onlinevipdershane.com'}</span>
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-800">Çalışmalar</h2>
            <button
              type="button"
              onClick={() => setYeni((v) => !v)}
              className="inline-flex items-center gap-1 rounded-lg bg-[#173b70] px-3 py-1.5 text-sm text-white hover:bg-[#122d56]"
            >
              <Plus className="h-4 w-4" /> Yeni
            </button>
          </div>

          {yeni && (
            <form onSubmit={calismaOlustur} className="mb-4 space-y-2 rounded-lg border border-dashed p-3 text-sm">
              <input
                className="w-full rounded border px-2 py-1.5"
                placeholder="Başlık *"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  className="rounded border px-2 py-1.5"
                  placeholder="Eğitim yılı"
                  value={form.school_year}
                  onChange={(e) => setForm({ ...form, school_year: e.target.value })}
                />
                <input
                  type="number"
                  min={3}
                  max={12}
                  className="rounded border px-2 py-1.5"
                  value={form.grade_level}
                  onChange={(e) => setForm({ ...form, grade_level: Number(e.target.value) })}
                />
              </div>
              <input
                className="w-full rounded border px-2 py-1.5"
                placeholder="Ders *"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                required
              />
              <select
                className="w-full rounded border px-2 py-1.5"
                value={form.work_type}
                onChange={(e) => setForm({ ...form, work_type: e.target.value })}
              >
                {WORK_TYPES.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={mesgul === 'create'}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#d72d42] py-2 text-white disabled:opacity-60"
              >
                {mesgul === 'create' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Taslak oluştur
              </button>
            </form>
          )}

          {yukleniyor ? (
            <div className="flex justify-center py-8 text-slate-500">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : sets.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Henüz çalışma yok.</p>
          ) : (
            <ul className="max-h-[520px] space-y-1 overflow-y-auto">
              {sets.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setSeciliId(s.id)}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                      seciliId === s.id ? 'border-[#173b70] bg-[#173b70]/5' : 'border-transparent hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-slate-800">{s.title}</span>
                      <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${durumRenk(s.status)}`}>
                        {STATUS_LABEL[s.status] || s.status}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {s.grade_level}. sınıf · {s.subject} · {s.question_count ?? 0} soru
                    </div>
                    <div className="mt-0.5 truncate font-mono text-[10px] text-slate-400">{s.slug}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border bg-white p-4 shadow-sm">
          {!seciliId || !detay ? (
            <p className="py-12 text-center text-sm text-slate-500">Düzenlemek için soldan bir çalışma seçin.</p>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[#173b70]">{detay.title}</h2>
                  <p className="text-xs text-slate-500">
                    {detay.school_year} · {detay.grade_level}. sınıf · {detay.subject}
                  </p>
                  <p className="mt-1 font-mono text-xs text-slate-600">{detay.slug}</p>
                  {detay.status === 'published' && (
                    <p className="mt-1 text-xs text-amber-800">Yayında: slug değiştirilmez.</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {detay.status === 'draft' && (
                    <button
                      type="button"
                      onClick={() => void yayinla()}
                      disabled={!!mesgul}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white"
                    >
                      <Upload className="h-4 w-4" /> Yayınla
                    </button>
                  )}
                  {detay.status === 'published' && (
                    <button
                      type="button"
                      onClick={() => void arsivle()}
                      disabled={!!mesgul}
                      className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm"
                    >
                      <Archive className="h-4 w-4" /> Arşivle
                    </button>
                  )}
                  {detay.status === 'draft' && (
                    <button
                      type="button"
                      onClick={() => void silTaslak()}
                      disabled={!!mesgul}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-700"
                    >
                      <Trash2 className="h-4 w-4" /> Sil
                    </button>
                  )}
                </div>
              </div>

              <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm">
                <span className="truncate font-mono text-xs">{detay.public_url}</span>
                <button
                  type="button"
                  className="rounded border bg-white p-1.5"
                  onClick={() => void kopyala(detay.public_url)}
                  title="Kopyala"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <a
                  href={detay.public_url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded border bg-white p-1.5"
                  title="Aç"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded border bg-white px-2 py-1 text-xs"
                  onClick={() =>
                    void qrAl(detay.slug).then((j) => {
                      setQrSet(j.qr_data_url || null);
                      setQrSoru(null);
                    }).catch((e) => toast.error(e instanceof Error ? e.message : 'QR hatası'))
                  }
                >
                  <QrCode className="h-4 w-4" /> Set QR
                </button>
              </div>
              {qrSet && (
                <div className="mb-4 flex justify-center">
                  <img src={qrSet} alt="Set karekodu" className="h-40 w-40 rounded border" />
                </div>
              )}

              <form onSubmit={soruKaydet} className="mb-4 space-y-2 rounded-lg border p-3">
                <h3 className="text-sm font-semibold">Soru ekle / güncelle</h3>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="number"
                    min={1}
                    className="rounded border px-2 py-1.5 text-sm"
                    value={soruForm.question_number}
                    onChange={(e) => setSoruForm({ ...soruForm, question_number: Number(e.target.value) })}
                  />
                  <input
                    className="col-span-2 rounded border px-2 py-1.5 text-sm"
                    placeholder="YouTube linki *"
                    value={soruForm.youtube_url}
                    onChange={(e) => setSoruForm({ ...soruForm, youtube_url: e.target.value })}
                    required
                  />
                </div>
                <input
                  className="w-full rounded border px-2 py-1.5 text-sm"
                  placeholder="Başlık (isteğe bağlı)"
                  value={soruForm.title}
                  onChange={(e) => setSoruForm({ ...soruForm, title: e.target.value })}
                />
                <input
                  className="w-full rounded border px-2 py-1.5 text-sm"
                  placeholder="Konu (isteğe bağlı)"
                  value={soruForm.topic}
                  onChange={(e) => setSoruForm({ ...soruForm, topic: e.target.value })}
                />
                <button
                  type="submit"
                  disabled={mesgul === 'question'}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#173b70] py-2 text-sm text-white disabled:opacity-60"
                >
                  {mesgul === 'question' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Soruyu kaydet
                </button>
              </form>

              <h3 className="mb-2 text-sm font-semibold">Sorular ({sorular.length})</h3>
              {sorular.length === 0 ? (
                <p className="text-sm text-slate-500">Henüz soru yok.</p>
              ) : (
                <ul className="space-y-2">
                  {sorular.map((q) => (
                    <li key={q.id} className="rounded-lg border p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-[#173b70]">Soru {q.question_number}</span>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            className="rounded border p-1"
                            onClick={() =>
                              setSoruForm({
                                question_number: q.question_number,
                                title: q.title || '',
                                topic: q.topic || '',
                                youtube_url: q.youtube_url || q.youtube_video_id
                              })
                            }
                            title="Forma al"
                          >
                            <Save className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            className="rounded border p-1 text-red-600"
                            onClick={() => void soruSil(q.id)}
                            disabled={mesgul === `del-${q.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      {q.title && <p className="text-slate-700">{q.title}</p>}
                      {q.topic && <p className="text-xs text-slate-500">{q.topic}</p>}
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        {q.public_url && (
                          <>
                            <button
                              type="button"
                              className="text-[#173b70] underline"
                              onClick={() => void kopyala(q.public_url!)}
                            >
                              Soru linki
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5"
                              onClick={() =>
                                void qrAl(detay.slug, q.question_number).then((j) => {
                                  setQrSoru({ n: q.question_number, url: j.url || '' });
                                  setQrSet(j.qr_data_url || null);
                                }).catch((e) => toast.error(e instanceof Error ? e.message : 'QR'))
                              }
                            >
                              <QrCode className="h-3 w-3" /> QR
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {qrSoru && qrSet && (
                <p className="mt-3 text-center text-xs text-slate-500">
                  Soru {qrSoru.n} karekodu — {qrSoru.url}
                </p>
              )}
            </>
          )}
        </section>
      </div>

      {seciliListe && !detay && (
        <p className="text-center text-sm text-slate-400">Detay yükleniyor…</p>
      )}
    </div>
  );
}
