import React, { useMemo, useState } from 'react';
import { Link2, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../../lib/session';
import type { Durum } from './YaziliProgramPage';
import { oturumIptal } from './oturumIslem';
import { atlananYaz, haftalikOlustur, type Atlanan } from './tekrar';

import { birlestirmePlani, bugunIst, dersAnahtari, dk, kisa, seviye, type Oturum } from './birlestirme';

export default function SinifBirlestir({
  durum,
  sinifId,
  sinifAd,
  ogretmenAd,
  kurumQs,
  kapat,
  bitti
}: {
  durum: Durum;
  sinifId: string;
  sinifAd: Map<string, string>;
  ogretmenAd: Map<string, string>;
  kurumQs: string;
  kapat: () => void;
  bitti: () => Promise<void>;
}) {
  const aAd = sinifAd.get(sinifId) || 'Sınıf';
  const adaylar = useMemo(() => {
    const sv = seviye(aAd);
    return durum.classes
      .filter((c) => c.id !== sinifId)
      .sort((x, y) => Number(seviye(y.name) === sv) - Number(seviye(x.name) === sv) || x.name.localeCompare(y.name, 'tr'));
  }, [durum.classes, sinifId, aAd]);
  const [bId, setBId] = useState(() => {
    const sv = seviye(aAd);
    return adaylar.find((c) => sv != null && seviye(c.name) === sv)?.id || '';
  });
  const [tamamen, setTamamen] = useState(true);
  const [bagla, setBagla] = useState(true);
  const [calisiyor, setCalisiyor] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  const bugun = bugunIst();
  const bas = durum.ayar.baslangic > bugun ? durum.ayar.baslangic : bugun;
  const bit = durum.ayar.bitis;
  const bAd = sinifAd.get(bId) || 'diğer sınıf';
  const plan = useMemo(
    () => (bId && bas <= bit ? birlestirmePlani(durum, sinifId, bId, bas, bit, tamamen) : null),
    [durum, sinifId, bId, bas, bit, tamamen]
  );
  const yap = async () => {
    if (!plan || !bId) return;
    const mesaj =
      `${bAd} sınıfının ${kisa(bas)} – ${kisa(bit)} programı ${aAd} ile birleştirilecek:\n\n` +
      `• ${plan.eklenecek.length} ders ${bAd} sınıfına ortak ders olarak eklenecek\n` +
      `• ${plan.iptal.length} ders ${bAd} sınıfından iptal edilecek\n\n` +
      'Öğrenciler değişikliği hemen görür. Devam edilsin mi?';
    if (!window.confirm(mesaj)) return;
    setHata(null);
    const atlanan: Atlanan[] = [];
    let iptalEdilen = 0;
    let eklenen = 0;
    try {
      // 1) B'nin farklı derslerini iptal et (sınıf çakışması kalmasın)
      for (let i = 0; i < plan.iptal.length; i += 1) {
        const s = plan.iptal[i];
        setCalisiyor(`İptal ${i + 1}/${plan.iptal.length}`);
        try {
          await oturumIptal(s.id);
          iptalEdilen += 1;
        } catch (e) {
          atlanan.push({ tarih: s.lesson_date, sebep: `${s.subject} iptal edilemedi: ${e instanceof Error ? e.message : 'hata'}` });
        }
      }
      // 2) A'nın derslerini B'ye ekle — aynı gün/saat/ders/öğretmen serileri tek istekte
      const gruplar = new Map<string, { o: Oturum; tarihler: string[] }>();
      for (const s of plan.eklenecek) {
        const gun = new Date(`${s.lesson_date}T00:00:00Z`).getUTCDay();
        const k = [gun, s.start_time, s.end_time, dersAnahtari(s.subject), s.teacher_id || ''].join('|');
        const g = gruplar.get(k) || { o: s, tarihler: [] };
        g.tarihler.push(s.lesson_date);
        gruplar.set(k, g);
      }
      let gi = 0;
      for (const { o, tarihler } of gruplar.values()) {
        gi += 1;
        setCalisiyor(`Ekleniyor ${gi}/${gruplar.size}`);
        try {
          const r = await haftalikOlustur(
            { class_id: bId, teacher_id: o.teacher_id, subject: o.subject, start_time: o.start_time, end_time: o.end_time },
            tarihler
          );
          eklenen += r.eklenen;
          atlanan.push(...r.atlanan.map((a) => ({ ...a, sebep: `${o.subject}: ${a.sebep}` })));
        } catch (e) {
          for (const t of tarihler) atlanan.push({ tarih: t, sebep: `${o.subject}: ${e instanceof Error ? e.message : 'eklenemedi'}` });
        }
      }
      // 3) Bağla: bundan sonra bir sınıfta yapılan değişiklik diğerine de uygulanır
      if (bagla) {
        setCalisiyor('Bağlanıyor');
        const baglar = (durum.ayar.baglar || []).filter(
          (b) => !(b.siniflar.includes(sinifId) && b.siniflar.includes(bId) && b.baslangic === bas && b.bitis === bit)
        );
        baglar.push({ siniflar: [sinifId, bId], baslangic: bas, bitis: bit });
        const res = await apiFetch(`/api/yazili-program?op=save-settings${kurumQs}`, {
          method: 'POST',
          body: JSON.stringify({ ayar: { ...durum.ayar, baglar } })
        });
        if (!res.ok) atlanan.push({ tarih: bas, sebep: 'Sınıflar bağlanamadı; Tarih ve saatler → Ortak program bölümünden bağlayın.' });
      }
      const ozet = `${aAd} + ${bAd} birleştirildi: ${eklenen} ders eklendi, ${iptalEdilen} ders iptal edildi.`;
      if (atlanan.length) {
        toast.warning(`${ozet} ${atlanan.length} işlem yapılamadı.`, {
          description: atlanan.sort((x, y) => x.tarih.localeCompare(y.tarih)).map(atlananYaz).join('\n'),
          duration: 30000
        });
      } else {
        toast.success(ozet);
      }
      await bitti();
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Birleştirilemedi');
    } finally {
      setCalisiyor(null);
    }
  };

  const ogretmen = (id: string | null) => (id ? ogretmenAd.get(id) || 'Öğretmen' : 'Öğretmensiz');
  const liste = (xs: Oturum[]) =>
    xs
      .slice()
      .sort((x, y) => x.lesson_date.localeCompare(y.lesson_date) || dk(x.start_time) - dk(y.start_time))
      .slice(0, 40)
      .map((s) => (
        <li key={s.id}>
          {kisa(s.lesson_date)} {s.start_time}–{s.end_time} · {s.subject} · {ogretmen(s.teacher_id)}
        </li>
      ));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-1 text-lg font-bold text-[#173b70]">
              <Link2 className="h-5 w-5" /> Sınıfları birleştir
            </h3>
            <p className="text-sm text-slate-600">
              {aAd} programı esas alınır · {kisa(bas)} – {kisa(bit)}
            </p>
          </div>
          <button type="button" onClick={kapat} aria-label="Kapat" className="rounded p-1 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="block text-sm text-slate-700">
          Birleştirilecek sınıf
          <select value={bId} onChange={(e) => setBId(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">Sınıf seçin</option>
            {adaylar.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <p className="mt-3 rounded-lg bg-indigo-50 p-2 text-xs text-indigo-950">
          {aAd} sınıfının dersleri, aynı öğretmen ve saatle {bAd} sınıfına da konur. Aynı gün, saat, ders ve öğretmendeki dersler
          tek canlı derste (aynı odada) birleşir. Geçmiş günlere dokunulmaz.
        </p>

        <label className="mt-3 flex items-start gap-2 text-sm text-slate-800">
          <input type="checkbox" checked={tamamen} onChange={(e) => setTamamen(e.target.checked)} className="mt-1" />
          <span>
            İki sınıfın programı tamamen aynı olsun
            <span className="block text-xs text-slate-500">
              İşaretli değilse {bAd} sınıfının yalnız {aAd} dersleriyle aynı saate düşen dersleri iptal edilir; diğer dersleri kalır.
            </span>
          </span>
        </label>
        <label className="mt-2 flex items-start gap-2 text-sm text-slate-800">
          <input type="checkbox" checked={bagla} onChange={(e) => setBagla(e.target.checked)} className="mt-1" />
          <span>
            Sınıfları bağla
            <span className="block text-xs text-slate-500">
              Bundan sonra birinde taşıdığınız, eklediğiniz ya da iptal ettiğiniz ders diğerine de uygulanır.
            </span>
          </span>
        </label>

        {plan ? (
          <div className="mt-3 space-y-2 text-sm">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-emerald-50 p-2">
                <p className="text-xl font-bold text-emerald-700">{plan.eklenecek.length}</p>
                <p className="text-xs text-emerald-900">{bAd} sınıfına eklenecek</p>
              </div>
              <div className="rounded-lg bg-red-50 p-2">
                <p className="text-xl font-bold text-red-700">{plan.iptal.length}</p>
                <p className="text-xs text-red-900">{bAd} sınıfından iptal</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2">
                <p className="text-xl font-bold text-slate-700">{plan.ayni}</p>
                <p className="text-xs text-slate-600">zaten aynı</p>
              </div>
            </div>
            {plan.iptal.length ? (
              <details className="rounded-lg border border-red-100 px-2 py-1">
                <summary className="cursor-pointer text-xs font-semibold text-red-800">İptal edilecek dersler</summary>
                <ul className="mt-1 space-y-0.5 text-xs text-slate-700">{liste(plan.iptal)}</ul>
                {plan.iptal.length > 40 ? <p className="text-xs text-slate-500">… ve {plan.iptal.length - 40} ders daha</p> : null}
              </details>
            ) : null}
            {plan.eklenecek.length ? (
              <details className="rounded-lg border border-emerald-100 px-2 py-1">
                <summary className="cursor-pointer text-xs font-semibold text-emerald-800">Eklenecek dersler</summary>
                <ul className="mt-1 space-y-0.5 text-xs text-slate-700">{liste(plan.eklenecek)}</ul>
                {plan.eklenecek.length > 40 ? <p className="text-xs text-slate-500">… ve {plan.eklenecek.length - 40} ders daha</p> : null}
              </details>
            ) : null}
          </div>
        ) : null}

        {hata ? <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-800">{hata}</p> : null}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={kapat} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
            Vazgeç
          </button>
          <button
            type="button"
            disabled={!plan || calisiyor !== null || (!plan.eklenecek.length && !plan.iptal.length && !bagla)}
            onClick={() => void yap()}
            className="inline-flex items-center gap-1 rounded-lg bg-[#173b70] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {calisiyor ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            {calisiyor || 'Birleştir'}
          </button>
        </div>
      </div>
    </div>
  );
}
