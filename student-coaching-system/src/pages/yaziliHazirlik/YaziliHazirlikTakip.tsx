import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, RefreshCw, Search, X } from 'lucide-react';
import { apiFetch } from '../../lib/session';
import YaziliHatirlatmaPaneli from './YaziliHatirlatmaPaneli';

type SlotKey = '1-1' | '1-2' | '2-1' | '2-2';
type TakipSatir = {
  key: string;
  institution_id: string;
  institution_name: string;
  class_id: string;
  class_name: string;
  teacher_id: string;
  teacher_name: string;
  subject: string;
  total: number;
  by_slot: Record<SlotKey, number>;
  last_upload: string | null;
};
type TakipDosya = {
  id: string;
  row_key: string;
  class_name: string;
  subject: string;
  donem: number;
  yazili: number;
  calisma: number;
  file_name: string;
  updated_at: string | null;
};
type Rapor = {
  institutions: { id: string; name: string }[];
  rows: TakipSatir[];
  files: TakipDosya[];
};

const SLOTLAR: { key: SlotKey; kisa: string; ad: string }[] = [
  { key: '1-1', kisa: '1.D 1.Y', ad: '1. Dönem 1. Yazılı' },
  { key: '1-2', kisa: '1.D 2.Y', ad: '1. Dönem 2. Yazılı' },
  { key: '2-1', kisa: '2.D 1.Y', ad: '2. Dönem 1. Yazılı' },
  { key: '2-2', kisa: '2.D 2.Y', ad: '2. Dönem 2. Yazılı' }
];
const DERS_YOK = '__ders_yok__';

function tarih(t: string | null) {
  if (!t) return '—';
  try {
    return new Date(t).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

const trSirala = (a: string, b: string) => a.localeCompare(b, 'tr', { numeric: true });
const tekil = <T,>(list: T[], key: (x: T) => string) => {
  const m = new Map<string, T>();
  for (const x of list) if (!m.has(key(x))) m.set(key(x), x);
  return [...m.values()];
};

/** Yönetici / süper admin: sınıf + ders + öğretmen bazında yüklenen çalışmalar. */
export default function YaziliHazirlikTakip({ superAdmin }: { superAdmin: boolean }) {
  const [rapor, setRapor] = useState<Rapor | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const [kurum, setKurum] = useState('all');
  const [sinif, setSinif] = useState('all');
  const [ogretmen, setOgretmen] = useState('all');
  const [ders, setDers] = useState('all');
  const [arama, setArama] = useState('');
  const [sadeceYuklemeyen, setSadeceYuklemeyen] = useState(false);
  const [acik, setAcik] = useState<string | null>(null);

  const getir = async () => {
    setYukleniyor(true);
    setHata(null);
    try {
      const res = await apiFetch('/api/yazili-hazirlik?op=report');
      const j = (await res.json().catch(() => ({}))) as Partial<Rapor> & { hint?: string; error?: string };
      if (!res.ok) throw new Error(j.hint || j.error || 'Takip raporu alınamadı');
      setRapor({ institutions: j.institutions || [], rows: j.rows || [], files: j.files || [] });
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Takip raporu alınamadı');
    } finally {
      setYukleniyor(false);
    }
  };

  useEffect(() => {
    void getir();
  }, []);

  const tumSatirlar = rapor?.rows || [];
  const kurumda = useMemo(
    () => tumSatirlar.filter((r) => kurum === 'all' || r.institution_id === kurum),
    [tumSatirlar, kurum]
  );

  // Süzgeç seçenekleri birbirine göre daralır (ör. sınıf seçilince yalnız o sınıfın öğretmenleri)
  const sinifSecenek = useMemo(
    () =>
      tekil(
        kurumda.filter((r) => (ogretmen === 'all' || r.teacher_id === ogretmen) && (ders === 'all' || (r.subject || DERS_YOK) === ders)),
        (r) => r.class_id
      ).sort((a, b) => trSirala(a.class_name, b.class_name)),
    [kurumda, ogretmen, ders]
  );
  const ogretmenSecenek = useMemo(
    () =>
      tekil(
        kurumda.filter((r) => (sinif === 'all' || r.class_id === sinif) && (ders === 'all' || (r.subject || DERS_YOK) === ders)),
        (r) => r.teacher_id
      ).sort((a, b) => trSirala(a.teacher_name, b.teacher_name)),
    [kurumda, sinif, ders]
  );
  const dersSecenek = useMemo(() => {
    const set = new Set(
      kurumda
        .filter((r) => (sinif === 'all' || r.class_id === sinif) && (ogretmen === 'all' || r.teacher_id === ogretmen))
        .map((r) => r.subject || DERS_YOK)
    );
    return [...set].sort((a, b) => (a === DERS_YOK ? 1 : b === DERS_YOK ? -1 : trSirala(a, b)));
  }, [kurumda, sinif, ogretmen]);

  // Seçim artık seçenekler arasında değilse sıfırla
  useEffect(() => {
    if (sinif !== 'all' && !sinifSecenek.some((s) => s.class_id === sinif)) setSinif('all');
  }, [sinif, sinifSecenek]);
  useEffect(() => {
    if (ogretmen !== 'all' && !ogretmenSecenek.some((s) => s.teacher_id === ogretmen)) setOgretmen('all');
  }, [ogretmen, ogretmenSecenek]);
  useEffect(() => {
    if (ders !== 'all' && !dersSecenek.includes(ders)) setDers('all');
  }, [ders, dersSecenek]);

  const satirlar = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase('tr');
    return kurumda.filter((r) => {
      if (sinif !== 'all' && r.class_id !== sinif) return false;
      if (ogretmen !== 'all' && r.teacher_id !== ogretmen) return false;
      if (ders !== 'all' && (r.subject || DERS_YOK) !== ders) return false;
      if (sadeceYuklemeyen && r.total > 0) return false;
      if (!q) return true;
      return [r.teacher_name, r.class_name, r.subject].some((x) => x.toLocaleLowerCase('tr').includes(q));
    });
  }, [kurumda, sinif, ogretmen, ders, arama, sadeceYuklemeyen]);

  const ozet = useMemo(() => {
    const ogretmenler = new Set(satirlar.map((r) => r.teacher_id));
    const yukleyen = new Set(satirlar.filter((r) => r.total > 0).map((r) => r.teacher_id));
    return {
      ogretmen: ogretmenler.size,
      yukleyen: yukleyen.size,
      calisma: satirlar.reduce((n, r) => n + r.total, 0)
    };
  }, [satirlar]);

  const suzgecVar = sinif !== 'all' || ogretmen !== 'all' || ders !== 'all' || arama.trim() || sadeceYuklemeyen;
  const temizle = () => {
    setSinif('all');
    setOgretmen('all');
    setDers('all');
    setArama('');
    setSadeceYuklemeyen(false);
  };

  const kurumlarGoster = superAdmin && (rapor?.institutions.length || 0) > 1;
  const secimKutusu = 'mt-1 block w-full min-w-40 rounded-lg border border-slate-300 bg-white px-3 py-2';

  if (yukleniyor) {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Takip raporu hazırlanıyor
      </p>
    );
  }
  if (hata) {
    return <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950">{hata}</p>;
  }

  return (
    <div className="space-y-4">
      <YaziliHatirlatmaPaneli />
      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        {kurumlarGoster ? (
          <label className="text-sm text-slate-700">
            Kurum
            <select value={kurum} onChange={(e) => setKurum(e.target.value)} className={secimKutusu}>
              <option value="all">Tüm kurumlar</option>
              {rapor?.institutions.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="text-sm text-slate-700">
          Sınıf
          <select value={sinif} onChange={(e) => setSinif(e.target.value)} className={secimKutusu}>
            <option value="all">Tüm sınıflar</option>
            {sinifSecenek.map((s) => (
              <option key={s.class_id} value={s.class_id}>
                {kurumlarGoster && kurum === 'all' ? `${s.class_name} (${s.institution_name})` : s.class_name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-700">
          Öğretmen
          <select value={ogretmen} onChange={(e) => setOgretmen(e.target.value)} className={secimKutusu}>
            <option value="all">Tüm öğretmenler</option>
            {ogretmenSecenek.map((s) => (
              <option key={s.teacher_id} value={s.teacher_id}>
                {s.teacher_name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-700">
          Ders
          <select value={ders} onChange={(e) => setDers(e.target.value)} className={secimKutusu}>
            <option value="all">Tüm dersler</option>
            {dersSecenek.map((d) => (
              <option key={d} value={d}>
                {d === DERS_YOK ? 'Ders belirtilmemiş' : d}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-700">
          Ara
          <span className="mt-1 flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              value={arama}
              onChange={(e) => setArama(e.target.value)}
              placeholder="Öğretmen, sınıf veya ders"
              className="w-full min-w-0 outline-none"
            />
          </span>
        </label>
        <div className="flex flex-wrap items-end gap-3 sm:col-span-2 lg:col-span-3">
          <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
            <input type="checkbox" checked={sadeceYuklemeyen} onChange={(e) => setSadeceYuklemeyen(e.target.checked)} />
            Yalnız hiç yüklemeyenler
          </label>
          {suzgecVar ? (
            <button
              type="button"
              onClick={temizle}
              className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
            >
              <X className="h-4 w-4" /> Süzgeçleri temizle
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void getir()}
            className="ml-auto inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
          >
            <RefreshCw className="h-4 w-4" /> Yenile
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Öğretmen</p>
          <p className="mt-1 text-2xl font-bold text-[#173b70]">{ozet.ogretmen}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">En az bir çalışma yükleyen</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">
            {ozet.yukleyen}
            <span className="ml-1 text-sm font-medium text-slate-500">/ {ozet.ogretmen}</span>
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Yüklenen çalışma</p>
          <p className="mt-1 text-2xl font-bold text-[#173b70]">{ozet.calisma}</p>
        </div>
      </div>

      {satirlar.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">
          {sadeceYuklemeyen ? 'Bu seçimde hiç yüklemeyen öğretmen yok.' : 'Bu seçime uyan kayıt yok.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-3 py-2">Sınıf</th>
                <th className="px-3 py-2">Ders</th>
                <th className="px-3 py-2">Öğretmen</th>
                {SLOTLAR.map((s) => (
                  <th key={s.key} className="px-2 py-2 text-center" title={s.ad}>
                    {s.kisa}
                  </th>
                ))}
                <th className="px-3 py-2 text-center">Toplam</th>
                <th className="px-3 py-2">Son yükleme</th>
              </tr>
            </thead>
            <tbody>
              {satirlar.map((r) => {
                const ac = acik === r.key;
                const detay = ac ? (rapor?.files || []).filter((f) => f.row_key === r.key) : [];
                return (
                  <React.Fragment key={r.key}>
                    <tr
                      className={`border-t border-slate-100 ${r.total > 0 ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                      onClick={() => r.total > 0 && setAcik(ac ? null : r.key)}
                    >
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-1 font-medium text-slate-800">
                          {r.total > 0 ? (
                            ac ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />
                          ) : (
                            <span className="inline-block w-4" />
                          )}
                          {r.class_name}
                        </span>
                        {kurumlarGoster && kurum === 'all' ? (
                          <span className="ml-5 block text-xs text-slate-500">{r.institution_name}</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {r.subject || <span className="text-xs text-slate-400">Ders belirtilmemiş</span>}
                      </td>
                      <td className="px-3 py-2 text-slate-700">{r.teacher_name}</td>
                      {SLOTLAR.map((s) => (
                        <td key={s.key} className="px-2 py-2 text-center tabular-nums text-slate-700">
                          {r.by_slot[s.key] || <span className="text-slate-300">0</span>}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-center">
                        <span
                          className={`inline-block min-w-8 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${
                            r.total > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                          }`}
                        >
                          {r.total}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500">{tarih(r.last_upload)}</td>
                    </tr>
                    {ac ? (
                      <tr className="bg-slate-50">
                        <td colSpan={10} className="px-8 py-2">
                          <ul className="space-y-1 text-xs text-slate-700">
                            {detay.map((f) => (
                              <li key={f.id}>
                                {f.donem}. dönem {f.yazili}. yazılı {f.calisma}. çalışma
                                <span className="text-slate-500"> · {f.file_name} · {tarih(f.updated_at)}</span>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-500">
        Her satır bir sınıf, ders ve öğretmendir. Ders bilgisi yüklenen dosyadan, yoksa haftalık ders programından gelir.
        Bir ders için her dönemde 2 yazılı × 3 çalışma = 6 PDF beklenir.
      </p>
    </div>
  );
}
