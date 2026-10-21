import React, { useEffect, useMemo, useState } from 'react';
import { Download, FileText, Loader2, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/session';

type Sinif = { id: string; name: string };
type Dosya = {
  id: string;
  class_id: string;
  class_name: string;
  teacher_user_id: string;
  teacher_name: string;
  subject: string;
  donem: number;
  yazili: number;
  calisma: number;
  file_name: string;
  updated_at: string;
  mine?: boolean;
};

const DONEMLER = [
  { n: 1, ad: '1. Dönem' },
  { n: 2, ad: '2. Dönem' }
];
const YAZILILAR = [1, 2];
const CALISMALAR = [1, 2, 3];
const MAX_MB = 100;
const MAX_BAYT = MAX_MB * 1024 * 1024;

export default function YaziliHazirlikPage() {
  const [yukleniyor, setYukleniyor] = useState(true);
  const [canUpload, setCanUpload] = useState(false);
  const [siniflar, setSiniflar] = useState<Sinif[]>([]);
  const [dersler, setDersler] = useState<Record<string, string[]>>({});
  const [dosyalar, setDosyalar] = useState<Dosya[]>([]);
  const [sinifId, setSinifId] = useState('');
  const [konu, setKonu] = useState('');
  const [donem, setDonem] = useState(1);
  const [mesgul, setMesgul] = useState<string | null>(null);
  const [uyari, setUyari] = useState<string | null>(null);

  const yukleListe = async () => {
    const res = await apiFetch('/api/yazili-hazirlik');
    const j = (await res.json().catch(() => ({}))) as {
      canUpload?: boolean;
      classes?: Sinif[];
      subjectsByClass?: Record<string, string[]>;
      files?: Dosya[];
      hint?: string;
      error?: string;
    };
    if (!res.ok) {
      setUyari(j.hint || 'Yazılıya hazırlık listesi açılamadı.');
      return;
    }
    setUyari(null);
    setCanUpload(Boolean(j.canUpload));
    const liste = Array.isArray(j.classes) ? j.classes : [];
    setSiniflar(liste);
    setDersler(j.subjectsByClass || {});
    setDosyalar(Array.isArray(j.files) ? j.files : []);
    setSinifId((onceki) => onceki || liste[0]?.id || '');
  };

  useEffect(() => {
    let iptal = false;
    void (async () => {
      setYukleniyor(true);
      try {
        if (!iptal) await yukleListe();
      } catch (e) {
        if (!iptal) setUyari(e instanceof Error ? e.message : 'Liste alınamadı');
      } finally {
        if (!iptal) setYukleniyor(false);
      }
    })();
    return () => {
      iptal = true;
    };
  }, []);

  const onerilenDersler = dersler[sinifId] || [];
  useEffect(() => {
    if (!canUpload || konu) return;
    const ilk = dersler[sinifId]?.[0];
    if (ilk) setKonu(ilk);
  }, [canUpload, konu, sinifId, dersler]);

  const gorunen = useMemo(() => {
    return dosyalar.filter((d) => {
      if (sinifId && d.class_id !== sinifId) return false;
      if (canUpload && konu && d.subject.toLocaleLowerCase('tr') !== konu.toLocaleLowerCase('tr')) return false;
      return d.donem === donem;
    });
  }, [dosyalar, sinifId, canUpload, konu, donem]);

  const rafta = (yazili: number, calisma: number) =>
    gorunen.filter((d) => d.yazili === yazili && d.calisma === calisma);

  const pdfYukle = async (yazili: number, calisma: number, file: File | null) => {
    if (!file) return;
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
      toast.error('Yalnızca PDF yükleyin.');
      return;
    }
    if (file.size > MAX_BAYT) {
      toast.error(`PDF en fazla ${MAX_MB} MB olabilir.`);
      return;
    }
    if (!sinifId || !konu.trim()) {
      toast.error('Önce sınıf ve ders seçin.');
      return;
    }
    const anahtar = `${yazili}-${calisma}`;
    setMesgul(anahtar);
    try {
      const hazir = await apiFetch('/api/yazili-hazirlik?op=upload-url', {
        method: 'POST',
        body: JSON.stringify({
          class_id: sinifId,
          subject: konu.trim(),
          donem,
          yazili,
          calisma,
          file_name: file.name,
          file_size: file.size
        })
      });
      const hazirJson = (await hazir.json().catch(() => ({}))) as {
        data?: { path?: string; signedUrl?: string; file_name?: string };
        hint?: string;
        error?: string;
      };
      if (!hazir.ok || !hazirJson.data?.path || !hazirJson.data.signedUrl) {
        throw new Error(hazirJson.hint || 'PDF yükleme hazırlığı başarısız');
      }
      const put = await fetch(hazirJson.data.signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/pdf', 'x-upsert': 'true' },
        body: file
      });
      if (!put.ok) {
        const detay = await put.text().catch(() => '');
        if (/maximum|exceed|entity too large|payload/i.test(detay)) {
          throw new Error('Depo bu boyutu kabul etmedi. Supabase Storage ayarında global dosya sınırını 100 MB yapın.');
        }
        throw new Error('PDF depoya yazılamadı');
      }
      const kayit = await apiFetch('/api/yazili-hazirlik?op=commit', {
        method: 'POST',
        body: JSON.stringify({
          class_id: sinifId,
          subject: konu.trim(),
          donem,
          yazili,
          calisma,
          path: hazirJson.data.path,
          file_name: hazirJson.data.file_name || file.name
        })
      });
      const kayitJson = (await kayit.json().catch(() => ({}))) as { hint?: string; error?: string };
      if (!kayit.ok) throw new Error(kayitJson.hint || kayitJson.error || 'Kayıt yazılamadı');
      toast.success(`${yazili}. yazılı ${calisma}. çalışma yüklendi`);
      await yukleListe();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Yüklenemedi');
    } finally {
      setMesgul(null);
    }
  };

  const indir = async (dosya: Dosya) => {
    setMesgul(dosya.id);
    try {
      const res = await apiFetch(`/api/yazili-hazirlik?op=download&id=${encodeURIComponent(dosya.id)}`);
      const j = (await res.json().catch(() => ({}))) as { url?: string; hint?: string };
      if (!res.ok || !j.url) throw new Error(j.hint || 'İndirme bağlantısı alınamadı');
      window.open(j.url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İndirilemedi');
    } finally {
      setMesgul(null);
    }
  };

  const sil = async (dosya: Dosya) => {
    setMesgul(dosya.id);
    try {
      const res = await apiFetch(`/api/yazili-hazirlik?id=${encodeURIComponent(dosya.id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Dosya kaldırılamadı');
      toast.success('Çalışma kaldırıldı');
      await yukleListe();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaldırılamadı');
    } finally {
      setMesgul(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-gradient-to-r from-[#173b70] to-indigo-700 p-6 text-white">
        <h1 className="text-2xl font-bold">Yazılıya Hazırlık</h1>
        <p className="mt-1 max-w-2xl text-sm text-indigo-100">
          1. ve 2. dönem, her dönemde 1. ve 2. yazılı. Her yazılıda üç çalışma var.
          {canUpload
            ? ' Sınıfınızı ve dersinizi seçip PDF yükleyin; öğrenciler aynı raftan indirir.'
            : ' Öğretmeninizin yüklediği çalışmaları buradan indirin.'}
        </p>
      </div>

      {uyari ? <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950">{uyari}</p> : null}

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <label className="text-sm text-slate-700">
          Sınıf
          <select
            value={sinifId}
            onChange={(e) => setSinifId(e.target.value)}
            className="mt-1 block min-w-48 rounded-lg border border-slate-300 px-3 py-2"
          >
            {siniflar.length === 0 ? <option value="">Sınıf yok</option> : null}
            {siniflar.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        {canUpload ? (
          <label className="text-sm text-slate-700">
            Ders
            <input
              list="yazili-hazirlik-dersler"
              value={konu}
              onChange={(e) => setKonu(e.target.value)}
              placeholder="Örn. Matematik"
              className="mt-1 block min-w-48 rounded-lg border border-slate-300 px-3 py-2"
            />
            <datalist id="yazili-hazirlik-dersler">
              {onerilenDersler.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </label>
        ) : null}
        <div className="flex gap-2">
          {DONEMLER.map((d) => (
            <button
              key={d.n}
              type="button"
              onClick={() => setDonem(d.n)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                donem === d.n ? 'bg-[#173b70] text-white' : 'border border-slate-300 text-slate-700'
              }`}
            >
              {d.ad}
            </button>
          ))}
        </div>
      </div>

      {yukleniyor ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Çalışmalar hazırlanıyor
        </p>
      ) : siniflar.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">
          {canUpload
            ? 'Size atanmış bir grup sınıfı yok. Yönetici sizi sınıfa öğretmen olarak eklediğinde buraya PDF yükleyebilirsiniz.'
            : 'Kayıtlı sınıfınız görünmüyor. Sınıfınız bağlandığında öğretmeninizin yüklediği çalışmalar burada durur.'}
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {YAZILILAR.map((yazili) => (
            <section key={yazili} className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="mb-3 text-lg font-bold text-[#173b70]">
                {donem}. dönem {yazili}. yazılı
              </h2>
              <div className="space-y-3">
                {CALISMALAR.map((calisma) => {
                  const liste = rafta(yazili, calisma);
                  const anahtar = `${yazili}-${calisma}`;
                  return (
                    <div key={calisma} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="font-semibold text-slate-800">{calisma}. çalışma</p>
                        {canUpload ? (
                          <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-[#173b70] px-3 py-1.5 text-xs font-semibold text-white">
                            {mesgul === anahtar ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                            PDF yükle
                            <input
                              type="file"
                              accept="application/pdf,.pdf"
                              className="hidden"
                              disabled={mesgul === anahtar}
                              onChange={(e) => {
                                const f = e.target.files?.[0] || null;
                                e.target.value = '';
                                void pdfYukle(yazili, calisma, f);
                              }}
                            />
                          </label>
                        ) : null}
                      </div>
                      {liste.length === 0 ? (
                        <p className="text-xs text-slate-500">Henüz PDF yok.</p>
                      ) : (
                        <ul className="space-y-2">
                          {liste.map((d) => (
                            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white px-2 py-2 text-sm">
                              <span className="flex min-w-0 items-center gap-2">
                                <FileText className="h-4 w-4 shrink-0 text-indigo-700" />
                                <span className="truncate">
                                  <span className="font-medium">{d.subject}</span>
                                  <span className="text-slate-500"> · {d.file_name}</span>
                                  {d.teacher_name ? <span className="text-slate-500"> · {d.teacher_name}</span> : null}
                                </span>
                              </span>
                              <span className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={() => void indir(d)}
                                  className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-semibold"
                                >
                                  <Download className="h-3.5 w-3.5" /> İndir
                                </button>
                                {canUpload && d.mine !== false ? (
                                  <button
                                    type="button"
                                    onClick={() => void sil(d)}
                                    className="inline-flex items-center gap-1 rounded border border-red-200 px-2 py-1 text-xs font-semibold text-red-700"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" /> Kaldır
                                  </button>
                                ) : null}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
