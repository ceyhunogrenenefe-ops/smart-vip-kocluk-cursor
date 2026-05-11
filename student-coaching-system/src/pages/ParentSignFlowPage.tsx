import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { createParentSignContract, listParentSignContracts, type ParentSignContractRow } from '../lib/parentSignApi';
import { Copy, Loader2, Link2, CheckCircle2, Clock, FileSignature } from 'lucide-react';

function todayPlus(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function ParentSignFlowPage() {
  const { effectiveUser } = useAuth();
  const isSuper = effectiveUser?.role === 'super_admin';
  const [rows, setRows] = useState<ParentSignContractRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [institutionId, setInstitutionId] = useState('');
  const [ogrenciAd, setOgrenciAd] = useState('');
  const [ogrenciSoyad, setOgrenciSoyad] = useState('');
  const [veliAd, setVeliAd] = useState('');
  const [veliSoyad, setVeliSoyad] = useState('');
  const [telefon, setTelefon] = useState('');
  const [adres, setAdres] = useState('');
  const [sinif, setSinif] = useState('');
  const [programAdi, setProgramAdi] = useState('');
  const [baslangic, setBaslangic] = useState(todayPlus(0));
  const [bitis, setBitis] = useState(todayPlus(365));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listParentSignContracts());
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Liste yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    setMsg(null);
    try {
      const body = {
        ogrenci_ad: ogrenciAd.trim(),
        ogrenci_soyad: ogrenciSoyad.trim(),
        veli_ad: veliAd.trim(),
        veli_soyad: veliSoyad.trim(),
        telefon: telefon.trim(),
        adres: adres.trim(),
        sinif: sinif.trim(),
        program_adi: programAdi.trim(),
        baslangic_tarihi: baslangic,
        bitis_tarihi: bitis,
        ...(isSuper && institutionId.trim() ? { institution_id: institutionId.trim() } : {})
      };
      const created = await createParentSignContract(body);
      const url = created.sign_url || '';
      setMsg(`Oluşturuldu. Veli linki kopyalanabilir (aşağıda da listelenir).`);
      if (url && navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
      void load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Kayıt oluşturulamadı');
    }
  };

  const fullLink = (r: ParentSignContractRow) => {
    const path = `/veli-imza/${encodeURIComponent(r.signing_token)}`;
    if (typeof window !== 'undefined' && window.location?.origin) return `${window.location.origin}${path}`;
    return path;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/50 dark:from-slate-950 dark:via-slate-900 pb-16">
      <div className="border-b border-slate-200 bg-white/90 dark:bg-slate-900/90 backdrop-blur">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <p className="text-xs font-bold uppercase tracking-widest text-red-600">Smart Koçluk</p>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2 mt-1">
            <FileSignature className="w-8 h-8 text-blue-700" />
            Veli onayı & e-imza
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 max-w-2xl">
            Bilgileri girin; sınıfa göre haftalık saat ve ücret önerisi ile kurum kodu otomatik eklenir. Kaydedince veli
            linkini kopyalayıp gönderin. Veli onayladığında kayıt burada <strong>İmzalı</strong> olarak görünür.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 mt-8 space-y-8">
        {msg ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            {msg}
          </div>
        ) : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">Yeni kayıt</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {isSuper ? (
              <div className="sm:col-span-2">
                <label className="text-xs text-slate-500">Kurum ID</label>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono dark:bg-slate-950 dark:border-slate-600"
                  value={institutionId}
                  onChange={(e) => setInstitutionId(e.target.value)}
                  placeholder="institutions.id"
                />
              </div>
            ) : null}
            <div>
              <label className="text-xs text-slate-500">Öğrenci adı</label>
              <input className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600" value={ogrenciAd} onChange={(e) => setOgrenciAd(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-slate-500">Öğrenci soyadı</label>
              <input className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600" value={ogrenciSoyad} onChange={(e) => setOgrenciSoyad(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-slate-500">Veli adı</label>
              <input className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600" value={veliAd} onChange={(e) => setVeliAd(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-slate-500">Veli soyadı</label>
              <input className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600" value={veliSoyad} onChange={(e) => setVeliSoyad(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-slate-500">Telefon</label>
              <input className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600" value={telefon} onChange={(e) => setTelefon(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-slate-500">Adres</label>
              <input className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600" value={adres} onChange={(e) => setAdres(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-slate-500">Sınıf (ör. 9 veya LGS)</label>
              <input className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600" value={sinif} onChange={(e) => setSinif(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-slate-500">Program adı</label>
              <input className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600" value={programAdi} onChange={(e) => setProgramAdi(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-slate-500">Başlangıç</label>
              <input type="date" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600" value={baslangic} onChange={(e) => setBaslangic(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-slate-500">Bitiş</label>
              <input type="date" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600" value={bitis} onChange={(e) => setBitis(e.target.value)} />
            </div>
          </div>
          <button
            type="button"
            onClick={() => void submit()}
            className="mt-5 w-full sm:w-auto rounded-xl bg-gradient-to-r from-blue-700 to-red-600 px-6 py-3 text-sm font-bold text-white shadow-md hover:opacity-95"
          >
            Oluştur ve veli linkini kopyala
          </button>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Kayıtlar</h2>
            <button type="button" onClick={() => void load()} className="text-xs text-blue-700 font-semibold hover:underline">
              Yenile
            </button>
          </div>
          {loading ? <Loader2 className="w-6 h-6 animate-spin text-blue-600" /> : null}
          <ul className="space-y-3">
            {rows.map((r) => (
              <li
                key={r.id}
                className="rounded-xl border border-slate-100 bg-slate-50/80 p-4 text-sm dark:border-slate-700 dark:bg-slate-800/50"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      {r.ogrenci_ad} {r.ogrenci_soyad}
                    </p>
                    <p className="text-xs text-slate-500">
                      Veli: {r.veli_ad} {r.veli_soyad} · {r.telefon}
                    </p>
                    <p className="text-xs font-mono text-slate-600 mt-1">{r.contract_number}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Sınıf: {r.sinif} · {r.haftalik_ders_saati} sa/hafta · {r.ucret} TL · Kod: {r.kurum_kodu}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {r.status === 'signed' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-xs font-semibold dark:bg-emerald-900/40 dark:text-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5" /> İmzalı
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-900 px-2 py-0.5 text-xs font-semibold dark:bg-amber-900/30 dark:text-amber-100">
                        <Clock className="w-3.5 h-3.5" /> Bekliyor
                      </span>
                    )}
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline"
                      onClick={() => void navigator.clipboard.writeText(fullLink(r))}
                    >
                      <Copy className="w-3.5 h-3.5" /> Linki kopyala
                    </button>
                    <a
                      href={fullLink(r)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900"
                    >
                      <Link2 className="w-3.5 h-3.5" /> Önizle
                    </a>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
