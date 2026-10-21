import React, { useMemo, useState } from 'react';
import { AlertTriangle, Ban, Loader2, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../../lib/session';
import type { Ders, Durum, Mesgul, Satir } from './YaziliProgramPage';

const GUN_ADI = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const HAZIRLIK_EKI = ' (Yazılıya Hazırlık)';
const dk = (t: string) => {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};
const cakisir = (a: { start_time: string; end_time: string }, b: { start_time: string; end_time: string }) =>
  dk(a.start_time) < dk(b.end_time) && dk(b.start_time) < dk(a.end_time);
const tarihNesne = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const gunEtiketi = (iso: string) => {
  const t = tarihNesne(iso);
  return `${t.getUTCDate()} ${t.toLocaleDateString('tr-TR', { month: 'long', timeZone: 'UTC' })} ${GUN_ADI[t.getUTCDay()]}`;
};
const kisaTarih = (iso: string | null) =>
  iso ? tarihNesne(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '—';
const haftasonuMu = (iso: string) => [0, 6].includes(tarihNesne(iso).getUTCDay());
const hazirlikMi = (subject: string) => /yazılıya hazırlık/i.test(subject || '');

type Oturum = Mesgul & { id: string; lesson_date: string };
type OturumPencere = { tur: 'duzenle'; oturum: Oturum } | { tur: 'ekle'; tarih: string };

async function istek(url: string, init?: RequestInit) {
  const res = await apiFetch(url, init);
  const j = (await res.json().catch(() => ({}))) as { error?: string; message?: string; hint?: string };
  if (!res.ok) {
    const msg = j.message || j.hint || j.error || `İşlem başarısız (${res.status})`;
    throw new Error(/teacher_required/.test(msg) ? 'Öğretmen seçin.' : msg);
  }
  return j;
}

/**
 * Seçili sınıfın, seçili tarih aralığındaki gerçek ders programı (class_sessions) +
 * yazılıya hazırlık taslakları. Gerçek dersler burada düzenlenir / iptal edilir / eklenir.
 */
export default function SinifProgrami({
  durum,
  gunler,
  sinifId,
  setSinifId,
  sinifAd,
  ogretmenAd,
  satirMap,
  sorunlarTaslak,
  taslakDuzenle,
  taslakSil,
  mesgulIs,
  yenile
}: {
  durum: Durum;
  gunler: string[];
  sinifId: string;
  setSinifId: (id: string) => void;
  sinifAd: Map<string, string>;
  ogretmenAd: Map<string, string>;
  satirMap: Map<string, Satir>;
  sorunlarTaslak: (d: Ders) => string[];
  taslakDuzenle: (d: Ders) => void;
  taslakSil: (d: Ders) => void;
  mesgulIs: string | null;
  yenile: () => Promise<void>;
}) {
  const [pencere, setPencere] = useState<OturumPencere | null>(null);
  const [iptalEdilen, setIptalEdilen] = useState<string | null>(null);
  const tumSiniflar = sinifId === 'all';

  const oturumlar = useMemo(
    () => (durum.sessions as Oturum[]).filter((s) => s.id && s.lesson_date && (tumSiniflar ? false : s.class_id === sinifId)),
    [durum.sessions, sinifId, tumSiniflar]
  );

  /** Gerçek dersin çakışmaları: aynı gün başka oturum / hazırlık dersi (öğretmen veya sınıf) */
  const oturumSorunlari = (o: Oturum) => {
    const out: string[] = [];
    const ayniGun = (durum.sessions as Oturum[]).filter((x) => x.id !== o.id && x.lesson_date === o.lesson_date && cakisir(x, o));
    const taslak = durum.items.filter((x) => x.lesson_date === o.lesson_date && cakisir(x, o));
    const sinif = [...ayniGun, ...taslak].find((x) => x.class_id === o.class_id);
    if (sinif) out.push(`Sınıfın aynı saatte başka dersi var (${sinif.subject})`);
    if (o.teacher_id) {
      const ogr = [...ayniGun, ...taslak].find((x) => x.teacher_id === o.teacher_id);
      if (ogr) out.push(`Öğretmenin aynı saatte dersi var (${sinifAd.get(ogr.class_id) || 'başka sınıf'} · ${ogr.subject})`);
    }
    return out;
  };

  const iptalEt = async (o: Oturum) => {
    if (!window.confirm(`${gunEtiketi(o.lesson_date)} ${o.start_time} ${o.subject} dersi iptal edilsin mi?\nÖğrenciler bu dersi artık görmez.`)) return;
    setIptalEdilen(o.id);
    try {
      await istek(`/api/class-live-lessons?session_id=${encodeURIComponent(o.id)}&apply_scope=single`, { method: 'DELETE' });
      toast.success('Ders iptal edildi.');
      await yenile();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İptal edilemedi');
    } finally {
      setIptalEdilen(null);
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <h2 className="text-lg font-bold text-[#173b70]">Sınıfın ders programı</h2>
        <select
          value={sinifId}
          onChange={(e) => setSinifId(e.target.value)}
          className="ml-auto rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold"
          aria-label="Programı gösterilecek sınıf"
        >
          <option value="all">Sınıf seçin (tüm hazırlık dersleri)</option>
          {durum.classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {tumSiniflar ? (
        <p className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-950">
          Bir sınıf seçin: o sınıfın bu tarihlerdeki <b>mevcut ders programı</b> burada açılır; dersleri taşıyabilir, iptal
          edebilir, yazılıya hazırlık dersine çevirebilir veya yeni ders ekleyebilirsiniz. Şu an yalnız hazırlık dersleri
          gösteriliyor.
        </p>
      ) : (
        <div className="flex flex-wrap gap-3 text-xs text-slate-600">
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded bg-slate-200" /> Mevcut ders
          </span>
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded bg-emerald-200" /> Yazılıya hazırlık (yayında)
          </span>
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded bg-amber-200" /> Taslak (henüz görünmez)
          </span>
        </div>
      )}

      {gunler.map((gun) => {
        const taslaklar = durum.items.filter((i) => i.lesson_date === gun && (tumSiniflar || i.class_id === sinifId));
        const gercek = oturumlar.filter((o) => o.lesson_date === gun);
        type Kalem = { tur: 'oturum'; o: Oturum } | { tur: 'taslak'; d: Ders };
        const kalemler: Kalem[] = [
          ...gercek.map((o) => ({ tur: 'oturum' as const, o })),
          ...taslaklar.map((d) => ({ tur: 'taslak' as const, d }))
        ].sort((a, b) => {
          const sa = a.tur === 'oturum' ? a.o.start_time : a.d.start_time;
          const sb = b.tur === 'oturum' ? b.o.start_time : b.d.start_time;
          return sa.localeCompare(sb);
        });
        return (
          <div key={gun} className="rounded-xl border border-slate-200 bg-white">
            <div className={`flex items-center justify-between rounded-t-xl px-3 py-2 ${haftasonuMu(gun) ? 'bg-indigo-50' : 'bg-slate-50'}`}>
              <span className="font-semibold text-slate-800">{gunEtiketi(gun)}</span>
              <span className="flex items-center gap-2">
                <span className="text-xs text-slate-500">{kalemler.length ? `${kalemler.length} ders` : 'Ders yok'}</span>
                {!tumSiniflar ? (
                  <button
                    type="button"
                    onClick={() => setPencere({ tur: 'ekle', tarih: gun })}
                    className="inline-flex items-center gap-0.5 rounded-lg border border-indigo-200 bg-white px-2 py-0.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                  >
                    <Plus className="h-3.5 w-3.5" /> Ders ekle
                  </button>
                ) : null}
              </span>
            </div>
            {kalemler.length ? (
              <ul className="divide-y divide-slate-100">
                {kalemler.map((k) => {
                  if (k.tur === 'oturum') {
                    const o = k.o;
                    const s = oturumSorunlari(o);
                    const hz = hazirlikMi(o.subject);
                    return (
                      <li key={`o-${o.id}`} className={`flex flex-wrap items-start gap-2 px-3 py-2 text-sm ${hz ? 'bg-emerald-50/60' : ''}`}>
                        <span className="w-24 shrink-0 font-semibold tabular-nums text-slate-700">
                          {o.start_time}–{o.end_time}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="font-medium text-slate-800">{o.subject}</span>
                          <span className="block text-xs text-slate-500">
                            {o.teacher_id ? ogretmenAd.get(o.teacher_id) || 'Öğretmen' : 'Öğretmen yok'}
                          </span>
                          {s.map((m) => (
                            <span key={m} className="mt-0.5 flex items-center gap-1 text-xs text-red-700">
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {m}
                            </span>
                          ))}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${hz ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                          {hz ? 'Hazırlık' : 'Ders'}
                        </span>
                        <span className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => setPencere({ tur: 'duzenle', oturum: o })}
                            className="rounded border border-slate-200 p-1 text-slate-600 hover:bg-slate-50"
                            aria-label="Düzenle"
                            title="Düzenle / yazılıya hazırlığa çevir"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void iptalEt(o)}
                            disabled={iptalEdilen === o.id}
                            className="rounded border border-red-200 p-1 text-red-700 hover:bg-red-50"
                            aria-label="İptal et"
                            title="Dersi iptal et"
                          >
                            {iptalEdilen === o.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
                          </button>
                        </span>
                      </li>
                    );
                  }
                  const d = k.d;
                  const s = sorunlarTaslak(d);
                  return (
                    <li
                      key={`d-${d.id}`}
                      className={`flex flex-wrap items-start gap-2 px-3 py-2 text-sm ${d.status === 'published' ? 'bg-emerald-50/60' : 'bg-amber-50/60'}`}
                    >
                      <span className="w-24 shrink-0 font-semibold tabular-nums text-slate-700">
                        {d.start_time}–{d.end_time}
                      </span>
                      <span className="min-w-0 flex-1">
                        {tumSiniflar ? <span className="font-medium text-slate-800">{sinifAd.get(d.class_id) || 'Sınıf'} · </span> : null}
                        <span className="font-medium text-slate-800">{d.subject}</span>
                        <span className="text-slate-500"> · Yazılıya hazırlık</span>
                        <span className="block text-xs text-slate-500">
                          {d.teacher_id ? ogretmenAd.get(d.teacher_id) || 'Öğretmen' : 'Öğretmen yok'}
                        </span>
                        {s.map((m) => (
                          <span key={m} className="mt-0.5 flex items-center gap-1 text-xs text-red-700">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {m}
                          </span>
                        ))}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          d.status === 'published' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
                        }`}
                      >
                        {d.status === 'published' ? 'Yayında' : 'Taslak'}
                      </span>
                      <span className="flex gap-1">
                        {d.status === 'draft' ? (
                          <button
                            type="button"
                            onClick={() => taslakDuzenle(d)}
                            className="rounded border border-slate-200 p-1 text-slate-600 hover:bg-slate-50"
                            aria-label="Taslağı düzenle"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => taslakSil(d)}
                          disabled={mesgulIs === `sil-${d.id}`}
                          className="rounded border border-red-200 p-1 text-red-700 hover:bg-red-50"
                          aria-label="Kaldır"
                        >
                          {mesgulIs === `sil-${d.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        );
      })}

      {pencere && !tumSiniflar ? (
        <OturumPenceresi
          pencere={pencere}
          sinifId={sinifId}
          durum={durum}
          satirMap={satirMap}
          sinifAd={sinifAd}
          kapat={() => setPencere(null)}
          kaydedildi={async () => {
            setPencere(null);
            await yenile();
          }}
        />
      ) : null}
    </section>
  );
}

function OturumPenceresi({
  pencere,
  sinifId,
  durum,
  satirMap,
  sinifAd,
  kapat,
  kaydedildi
}: {
  pencere: OturumPencere;
  sinifId: string;
  durum: Durum;
  satirMap: Map<string, Satir>;
  sinifAd: Map<string, string>;
  kapat: () => void;
  kaydedildi: () => Promise<void>;
}) {
  const o = pencere.tur === 'duzenle' ? pencere.oturum : null;
  const [tarih, setTarih] = useState(o ? o.lesson_date : pencere.tur === 'ekle' ? pencere.tarih : '');
  const [bas, setBas] = useState(o?.start_time || '');
  const [bit, setBit] = useState(o?.end_time || '');
  const [ders, setDers] = useState(o?.subject || '');
  const [ogretmen, setOgretmen] = useState(o?.teacher_id || '');
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  // Yazılısı olan dersler: tek tıkla hazırlık dersine çevirme
  const yaziliDersleri = useMemo(
    () =>
      durum.rows
        .filter((r) => r.class_id === sinifId && r.exam_date)
        .sort((a, b) => String(a.exam_date).localeCompare(String(b.exam_date))),
    [durum.rows, sinifId]
  );
  const dersOnerileri = useMemo(() => {
    const set = new Set<string>();
    for (const r of durum.rows) if (r.class_id === sinifId) set.add(r.subject);
    for (const s of durum.sessions) if (s.class_id === sinifId) set.add(s.subject);
    return [...set].sort((a, b) => a.localeCompare(b, 'tr'));
  }, [durum.rows, durum.sessions, sinifId]);

  const gecerli = /^\d{4}-\d{2}-\d{2}$/.test(tarih) && dk(bit) > dk(bas) && ders.trim().length > 0;
  const hazirlikSatiri = [...satirMap.values()].find(
    (r) => r.class_id === sinifId && hazirlikMi(ders) && ders.toLocaleLowerCase('tr').startsWith(r.subject.toLocaleLowerCase('tr'))
  );
  const uyari =
    hazirlikSatiri?.exam_date && tarih && tarih >= hazirlikSatiri.exam_date
      ? `Bu dersin yazılısı ${kisaTarih(hazirlikSatiri.exam_date)}; hazırlık dersi yazılıdan sonraya düşüyor.`
      : null;

  const kaydet = async () => {
    setKaydediliyor(true);
    setHata(null);
    try {
      if (o) {
        const patch: Record<string, string> = { id: o.id, apply_scope: 'single' };
        if (tarih !== o.lesson_date) patch.lesson_date = tarih;
        if (bas !== o.start_time) patch.start_time = bas;
        if (bit !== o.end_time) patch.end_time = bit;
        if (ders.trim() !== o.subject) patch.subject = ders.trim();
        if (ogretmen && ogretmen !== (o.teacher_id || '')) patch.teacher_id = ogretmen;
        if (Object.keys(patch).length === 2) {
          kapat();
          return;
        }
        await istek('/api/class-live-lessons', { method: 'PATCH', body: JSON.stringify(patch) });
        toast.success('Ders güncellendi.');
      } else {
        await istek('/api/class-live-lessons?op=create-session', {
          method: 'POST',
          body: JSON.stringify({
            class_id: sinifId,
            teacher_id: ogretmen,
            lesson_date: tarih,
            start_time: bas,
            end_time: bit,
            duration_minutes: dk(bit) - dk(bas),
            subject: ders.trim()
          })
        });
        toast.success('Ders eklendi.');
      }
      await kaydedildi();
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setKaydediliyor(false);
    }
  };

  const alan = 'mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2';
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h3 className="text-lg font-bold text-[#173b70]">{o ? 'Dersi düzenle' : 'Ders ekle'}</h3>
            <p className="text-sm text-slate-600">{sinifAd.get(sinifId)}</p>
          </div>
          <button type="button" onClick={kapat} aria-label="Kapat" className="rounded p-1 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {yaziliDersleri.length ? (
          <div className="mb-3 rounded-xl bg-emerald-50 p-3">
            <p className="mb-2 flex items-center gap-1 text-sm font-semibold text-emerald-900">
              <Sparkles className="h-4 w-4" /> Yazılıya hazırlık dersi yap
            </p>
            <div className="flex flex-wrap gap-1.5">
              {yaziliDersleri.map((r) => (
                <button
                  key={r.subject_key}
                  type="button"
                  onClick={() => {
                    setDers(`${r.subject}${HAZIRLIK_EKI}`);
                    if (r.teacher_id) setOgretmen(r.teacher_id);
                  }}
                  className="rounded-full border border-emerald-300 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                  title={`Yazılı ${kisaTarih(r.exam_date)}`}
                >
                  {r.subject} · {kisaTarih(r.exam_date)}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <label className="block text-sm text-slate-700">
          Ders adı
          <input list="sinif-ders-onerileri" value={ders} onChange={(e) => setDers(e.target.value)} className={alan} />
          <datalist id="sinif-ders-onerileri">
            {dersOnerileri.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </label>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <label className="text-sm text-slate-700">
            Tarih
            <input type="date" value={tarih} onChange={(e) => setTarih(e.target.value)} className={alan} />
          </label>
          <label className="text-sm text-slate-700">
            Başlangıç
            <input type="time" value={bas} onChange={(e) => setBas(e.target.value)} className={alan} />
          </label>
          <label className="text-sm text-slate-700">
            Bitiş
            <input type="time" value={bit} onChange={(e) => setBit(e.target.value)} className={alan} />
          </label>
        </div>
        <label className="mt-3 block text-sm text-slate-700">
          Öğretmen
          <select value={ogretmen} onChange={(e) => setOgretmen(e.target.value)} className={alan}>
            <option value="">{o ? 'Değiştirme' : 'Öğretmen seçin'}</option>
            {durum.teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>

        {uyari ? (
          <p className="mt-3 flex items-center gap-1 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {uyari}
          </p>
        ) : null}
        {hata ? <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-800">{hata}</p> : null}
        <p className="mt-3 text-xs text-slate-500">
          Değişiklik hemen canlı ders programına yansır. Öğretmen çakışması varsa kaydedilmez ve nedeni burada yazar.
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={kapat} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
            Vazgeç
          </button>
          <button
            type="button"
            disabled={!gecerli || kaydediliyor || (!o && !ogretmen)}
            onClick={() => void kaydet()}
            className="inline-flex items-center gap-1 rounded-lg bg-[#173b70] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {kaydediliyor ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Kaydet
          </button>
        </div>
      </div>
    </div>
  );
}
