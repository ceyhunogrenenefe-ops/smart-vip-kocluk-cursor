import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarCheck,
  ChevronDown,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../../lib/session';
import PlannerSekmeleri from '../../components/schedule/PlannerSekmeleri';

/* ---------- Tipler ---------- */
type Ayar = {
  baslangic: string;
  bitis: string;
  haftasonu: string[];
  haftaici: string[];
  gunlukEnFazla: number;
  dersBasinaHazirlik: number;
  oncelik: 'haftasonu' | 'yakin';
};
type Sinif = { id: string; name: string; level: number | null; student_count: number };
type Ogretmen = { id: string; name: string };
type Satir = {
  class_id: string;
  class_name: string;
  subject: string;
  subject_key: string;
  in_program: boolean;
  teacher_id: string | null;
  exam_date: string | null;
  takvim_tarih: string | null;
  takvim_not: string | null;
  saved: boolean;
};
type Ders = {
  id: string;
  class_id: string;
  subject: string;
  subject_key: string;
  teacher_id: string | null;
  lesson_date: string;
  start_time: string;
  end_time: string;
  status: 'draft' | 'published';
  session_id: string | null;
};
type Mesgul = { class_id: string; teacher_id: string | null; lesson_date?: string; day_of_week?: number; start_time: string; end_time: string; subject: string };
type Durum = {
  institution_id: string;
  institutions: { id: string; name: string }[];
  takvim_adi: string;
  ayar: Ayar;
  classes: Sinif[];
  teachers: Ogretmen[];
  rows: Satir[];
  items: Ders[];
  slots: Mesgul[];
  sessions: Mesgul[];
};
type Pencere =
  | { tur: 'ekle'; satir: Satir }
  | { tur: 'duzenle'; ders: Ders };

/* ---------- Yardımcılar ---------- */
const GUN_ADI = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
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
const haftaGunu = (iso: string) => {
  const g = tarihNesne(iso).getUTCDay();
  return g === 0 ? 7 : g;
};
const gunEtiketi = (iso: string, kisa = false) => {
  const t = tarihNesne(iso);
  const ay = t.toLocaleDateString('tr-TR', { month: kisa ? 'short' : 'long', timeZone: 'UTC' });
  return `${t.getUTCDate()} ${ay} ${GUN_ADI[t.getUTCDay()]}`;
};
const gunListesi = (bas: string, bit: string) => {
  const out: string[] = [];
  const t = tarihNesne(bas);
  for (let i = 0; i < 62; i += 1) {
    const iso = t.toISOString().slice(0, 10);
    if (iso > bit) break;
    out.push(iso);
    t.setUTCDate(t.getUTCDate() + 1);
  }
  return out;
};
const blokCoz = (text: string) => {
  const m = String(text || '').match(/^\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*$/);
  if (!m) return null;
  const pad = (n: string) => n.padStart(2, '0');
  return { start_time: `${pad(m[1])}:${m[2]}`, end_time: `${pad(m[3])}:${m[4]}` };
};
const kisaTarih = (iso: string | null) =>
  iso ? tarihNesne(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '—';

function planSayisiHam(durum: { items: { class_id: string; subject_key: string }[] } | null, r: { class_id: string; subject_key: string }) {
  return (durum?.items || []).filter((i) => i.class_id === r.class_id && i.subject_key === r.subject_key).length;
}

async function jsonIstek<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(url, init);
  const j = (await res.json().catch(() => ({}))) as T & { hint?: string; error?: string; message?: string };
  if (!res.ok) throw new Error(j.hint || j.message || j.error || `İşlem başarısız (${res.status})`);
  return j;
}

/* ---------- Sayfa ---------- */
export default function YaziliProgramPage() {
  const [durum, setDurum] = useState<Durum | null>(null);
  const [kurum, setKurum] = useState('');
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const [mesgulIs, setMesgulIs] = useState<string | null>(null);
  const [ayarAcik, setAyarAcik] = useState(false);
  const [ayarTaslak, setAyarTaslak] = useState<Ayar | null>(null);
  const [sinifSuzgec, setSinifSuzgec] = useState('all');
  const [yalnizTarihli, setYalnizTarihli] = useState(true);
  /** Takvimde olup kurumun programında olmayan dersler (Tarih, Felsefe…) varsayılan gizli */
  const [programDisi, setProgramDisi] = useState(false);
  const [kapaliSiniflar, setKapaliSiniflar] = useState<Set<string>>(new Set());
  const [pencere, setPencere] = useState<Pencere | null>(null);
  const [yerlesmeyen, setYerlesmeyen] = useState<{ class_id: string; class_name: string; subject: string; subject_key: string; sebep: string }[]>([]);
  const [yayinSonucu, setYayinSonucu] = useState<{ basarili: number; hatalar: string[] } | null>(null);

  const qs = kurum ? `?institution_id=${encodeURIComponent(kurum)}` : '';
  const opUrl = (op: string) => `/api/yazili-program?op=${op}${kurum ? `&institution_id=${encodeURIComponent(kurum)}` : ''}`;

  const yukle = useCallback(async () => {
    setHata(null);
    try {
      const j = await jsonIstek<Durum>(`/api/yazili-program${qs}`);
      setDurum(j);
      setAyarTaslak(j.ayar);
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Program açılamadı');
    } finally {
      setYukleniyor(false);
    }
  }, [qs]);

  useEffect(() => {
    void yukle();
    // kurum değişince yeniden yükle
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kurum]);

  const post = async (op: string, body: unknown) =>
    jsonIstek<Record<string, unknown>>(opUrl(op), { method: 'POST', body: JSON.stringify(body) });

  const sinifAd = useMemo(() => new Map((durum?.classes || []).map((c) => [c.id, c.name])), [durum]);
  const ogretmenAd = useMemo(() => new Map((durum?.teachers || []).map((t) => [t.id, t.name])), [durum]);
  const satirMap = useMemo(
    () => new Map((durum?.rows || []).map((r) => [`${r.class_id}|${r.subject_key}`, r])),
    [durum]
  );
  const gunler = useMemo(() => (durum ? gunListesi(durum.ayar.baslangic, durum.ayar.bitis) : []), [durum]);

  /** Bir dersin sorunları: çakışma, yazılıdan sonra, öğretmen yok */
  const sorunlar = useCallback(
    (d: { id?: string; class_id: string; subject_key: string; teacher_id: string | null; lesson_date: string; start_time: string; end_time: string }) => {
      if (!durum) return [] as string[];
      const out: string[] = [];
      const satir = satirMap.get(`${d.class_id}|${d.subject_key}`);
      if (satir?.exam_date && d.lesson_date >= satir.exam_date) out.push(`Yazılı ${kisaTarih(satir.exam_date)}; ders yazılıdan sonra`);
      if (!d.teacher_id) out.push('Öğretmen seçilmemiş');
      const dow = haftaGunu(d.lesson_date);
      const ayniGun = (m: Mesgul) => m.lesson_date === d.lesson_date || m.day_of_week === dow;
      const digerleri = durum.items.filter((x) => x.id !== d.id && x.lesson_date === d.lesson_date && cakisir(x, d));
      const sinifCakisan =
        digerleri.find((x) => x.class_id === d.class_id) ||
        [...durum.slots, ...durum.sessions].find((m) => m.class_id === d.class_id && ayniGun(m) && cakisir(m, d));
      if (sinifCakisan) out.push(`Sınıfın aynı saatte dersi var (${sinifCakisan.subject})`);
      if (d.teacher_id) {
        const ogretmenCakisan =
          digerleri.find((x) => x.teacher_id === d.teacher_id) ||
          [...durum.slots, ...durum.sessions].find((m) => m.teacher_id === d.teacher_id && ayniGun(m) && cakisir(m, d));
        if (ogretmenCakisan) {
          out.push(`Öğretmenin aynı saatte dersi var (${sinifAd.get(ogretmenCakisan.class_id) || 'başka sınıf'} · ${ogretmenCakisan.subject})`);
        }
      }
      return out;
    },
    [durum, satirMap, sinifAd]
  );

  /* ---------- İşlemler ---------- */
  const isle = async (anahtar: string, fn: () => Promise<void>) => {
    setMesgulIs(anahtar);
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız');
    } finally {
      setMesgulIs(null);
    }
  };

  const sinavKaydet = (r: Satir, degisiklik: Partial<Pick<Satir, 'exam_date' | 'teacher_id'>>) =>
    isle(`sinav-${r.class_id}-${r.subject_key}`, async () => {
      const yeni = { ...r, ...degisiklik };
      // Ekranda hemen güncelle
      setDurum((d) =>
        d ? { ...d, rows: d.rows.map((x) => (x.class_id === r.class_id && x.subject_key === r.subject_key ? { ...yeni, saved: true } : x)) } : d
      );
      await post('save-exam', {
        class_id: r.class_id,
        subject: r.subject,
        exam_date: yeni.exam_date || null,
        teacher_id: yeni.teacher_id || ''
      });
    });

  const otomatikYerlestir = () =>
    isle('suggest', async () => {
      const j = (await post('suggest', {})) as {
        eklenen: number;
        yerlesmeyen: { class_id: string; class_name: string; subject: string; subject_key: string; sebep: string }[];
      };
      setYerlesmeyen(j.yerlesmeyen || []);
      toast.success(j.eklenen ? `${j.eklenen} taslak ders yerleştirildi.` : 'Yerleştirilecek yeni ders yok.');
      await yukle();
    });

  const taslaklariTemizle = () => {
    if (!window.confirm('Tüm taslak dersler silinsin mi? Yayınlanmış dersler etkilenmez.')) return;
    void isle('clear', async () => {
      const j = (await post('clear-drafts', {})) as { deleted: number };
      toast.success(`${j.deleted} taslak silindi.`);
      setYerlesmeyen([]);
      await yukle();
    });
  };

  const dersSil = (d: Ders) => {
    const mesaj =
      d.status === 'published'
        ? 'Bu ders yayınlandı. Kaldırırsanız canlı ders de iptal edilir. Devam edilsin mi?'
        : 'Taslak ders silinsin mi?';
    if (!window.confirm(mesaj)) return;
    void isle(`sil-${d.id}`, async () => {
      await post('delete-item', { id: d.id });
      toast.success(d.status === 'published' ? 'Ders kaldırıldı ve canlı ders iptal edildi.' : 'Taslak silindi.');
      await yukle();
    });
  };

  const taslaklar = (durum?.items || []).filter((i) => i.status === 'draft');
  const yayinlanabilir = taslaklar.filter((i) => sorunlar(i).length === 0);

  const yayinla = () => {
    if (!durum) return;
    const engelli = taslaklar.length - yayinlanabilir.length;
    const mesaj =
      `${yayinlanabilir.length} taslak ders canlı derse dönüştürülecek (öğrenciler ve öğretmenler görür).` +
      (engelli ? `\n\nSorunlu ${engelli} taslak atlanacak; önce onları düzeltin.` : '') +
      '\n\nDevam edilsin mi?';
    if (!yayinlanabilir.length || !window.confirm(mesaj)) return;
    void isle('publish', async () => {
      let basarili = 0;
      const hatalar: string[] = [];
      for (const d of yayinlanabilir) {
        const etiket = `${sinifAd.get(d.class_id) || 'Sınıf'} · ${d.subject} · ${gunEtiketi(d.lesson_date, true)} ${d.start_time}`;
        try {
          const j = await jsonIstek<{ data?: { id: string }[]; skipped?: unknown[] }>(
            '/api/class-live-lessons?op=bulk-schedule-sessions',
            {
              method: 'POST',
              body: JSON.stringify({
                class_id: d.class_id,
                teacher_id: d.teacher_id,
                lesson_date: d.lesson_date,
                start_time: d.start_time,
                end_time: d.end_time,
                duration_minutes: dk(d.end_time) - dk(d.start_time),
                subject: `${d.subject} (Yazılıya Hazırlık)`,
                repeat_interval_days: 0,
                occurrences: 1
              })
            }
          );
          const sessionId = j.data?.[0]?.id;
          if (!sessionId) throw new Error('Canlı ders oluşturulamadı');
          await post('mark-published', { id: d.id, session_id: sessionId });
          basarili += 1;
        } catch (e) {
          hatalar.push(`${etiket}: ${e instanceof Error ? e.message : 'hata'}`);
        }
      }
      setYayinSonucu({ basarili, hatalar });
      if (basarili) toast.success(`${basarili} ders yayınlandı.`);
      if (hatalar.length) toast.error(`${hatalar.length} ders yayınlanamadı; ayrıntı aşağıda.`);
      await yukle();
    });
  };

  const ayarKaydet = () =>
    isle('settings', async () => {
      if (!ayarTaslak) return;
      await post('save-settings', { ayar: ayarTaslak });
      toast.success('Ayarlar kaydedildi.');
      setAyarAcik(false);
      await yukle();
    });

  /* ---------- Görünüm verileri ---------- */
  const satirGorunur = useCallback(
    (r: Satir) => programDisi || r.in_program || Boolean(r.teacher_id) || planSayisiHam(durum, r) > 0,
    [programDisi, durum]
  );
  const gorunenSiniflar = useMemo(() => {
    if (!durum) return [];
    return durum.classes
      .filter((c) => sinifSuzgec === 'all' || c.id === sinifSuzgec)
      .map((c) => ({
        sinif: c,
        satirlar: durum.rows.filter((r) => r.class_id === c.id && satirGorunur(r) && (!yalnizTarihli || r.exam_date))
      }))
      .filter((g) => g.satirlar.length > 0 || !yalnizTarihli);
  }, [durum, sinifSuzgec, yalnizTarihli, satirGorunur]);

  const gorunenYerlesmeyen = yerlesmeyen.filter((y) => {
    const r = satirMap.get(`${y.class_id}|${y.subject_key}`);
    return !r || satirGorunur(r);
  });
  const planSayisi = (r: Satir) => (durum?.items || []).filter((i) => i.class_id === r.class_id && i.subject_key === r.subject_key).length;
  const ozet = useMemo(() => {
    const tarihli = (durum?.rows || []).filter((r) => r.exam_date && satirGorunur(r));
    const planli = tarihli.filter((r) => planSayisi(r) > 0).length;
    return { tarihli: tarihli.length, planli, taslak: taslaklar.length, yayinda: (durum?.items || []).length - taslaklar.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durum, satirGorunur]);

  if (yukleniyor) {
    return (
      <div className="space-y-4 p-3 md:p-4">
        <PlannerSekmeleri />
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Program hazırlanıyor
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-3 md:p-4">
      <PlannerSekmeleri />

      <div className="rounded-2xl bg-gradient-to-r from-[#173b70] to-indigo-700 p-5 text-white">
        <h1 className="text-xl font-bold">Yazılıya Hazırlık Programı</h1>
        <p className="mt-1 max-w-3xl text-sm text-indigo-100">
          Sınıflar ve dersleri otomatik gelir; {durum?.takvim_adi} ortak takvimi yüklüdür. Her ders yazılısından önceki bir
          saate konur. Taslaklar siz <b>Yayınla</b> diyene kadar öğrencilere görünmez.
        </p>
      </div>

      {hata ? <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950">{hata}</p> : null}

      {durum ? (
        <>
          {/* Araç çubuğu */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
            {durum.institutions.length > 1 ? (
              <select
                value={kurum || durum.institution_id}
                onChange={(e) => {
                  setYukleniyor(true);
                  setKurum(e.target.value);
                }}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                aria-label="Kurum"
              >
                {durum.institutions.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </select>
            ) : null}
            <span className="text-sm text-slate-600">
              <CalendarCheck className="mr-1 inline h-4 w-4 text-indigo-700" />
              {gunEtiketi(durum.ayar.baslangic, true)} – {gunEtiketi(durum.ayar.bitis, true)}
            </span>
            <button
              type="button"
              onClick={() => setAyarAcik((v) => !v)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
            >
              <Settings2 className="h-4 w-4" /> Tarih ve saatler
            </button>
            <div className="ml-auto flex flex-wrap gap-2">
              <button
                type="button"
                onClick={otomatikYerlestir}
                disabled={mesgulIs !== null}
                className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {mesgulIs === 'suggest' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Otomatik yerleştir
              </button>
              <button
                type="button"
                onClick={taslaklariTemizle}
                disabled={mesgulIs !== null || taslaklar.length === 0}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" /> Taslakları temizle
              </button>
              <button
                type="button"
                onClick={yayinla}
                disabled={mesgulIs !== null || yayinlanabilir.length === 0}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {mesgulIs === 'publish' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Yayınla ({yayinlanabilir.length})
              </button>
            </div>
          </div>

          {ayarAcik && ayarTaslak ? (
            <AyarPaneli ayar={ayarTaslak} setAyar={setAyarTaslak} kaydet={ayarKaydet} mesgul={mesgulIs === 'settings'} />
          ) : null}

          {/* Özet */}
          <div className="grid gap-3 sm:grid-cols-4">
            <OzetKart ad="Yazılısı olan sınıf-ders" deger={ozet.tarihli} />
            <OzetKart ad="Hazırlık dersi planlanan" deger={`${ozet.planli} / ${ozet.tarihli}`} vurgu />
            <OzetKart ad="Taslak ders" deger={ozet.taslak} />
            <OzetKart ad="Yayındaki ders" deger={ozet.yayinda} />
          </div>

          {gorunenYerlesmeyen.length ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              <div className="mb-1 flex items-center justify-between">
                <b>Otomatik yerleşmeyen {gorunenYerlesmeyen.length} ders</b>
                <button type="button" onClick={() => setYerlesmeyen([])} aria-label="Kapat">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <ul className="list-disc space-y-0.5 pl-5">
                {gorunenYerlesmeyen.map((y, i) => (
                  <li key={i}>
                    {y.class_name} · {y.subject}: {y.sebep}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {yayinSonucu ? (
            <div className={`rounded-xl border p-3 text-sm ${yayinSonucu.hatalar.length ? 'border-red-200 bg-red-50 text-red-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
              <div className="mb-1 flex items-center justify-between">
                <b>
                  Yayın sonucu: {yayinSonucu.basarili} ders yayınlandı
                  {yayinSonucu.hatalar.length ? `, ${yayinSonucu.hatalar.length} ders yayınlanamadı` : ''}
                </b>
                <button type="button" onClick={() => setYayinSonucu(null)} aria-label="Kapat">
                  <X className="h-4 w-4" />
                </button>
              </div>
              {yayinSonucu.hatalar.length ? (
                <ul className="list-disc space-y-0.5 pl-5">
                  {yayinSonucu.hatalar.map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            {/* Sınav takvimi */}
            <section className="space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <h2 className="text-lg font-bold text-[#173b70]">Yazılı takvimi</h2>
                <select
                  value={sinifSuzgec}
                  onChange={(e) => setSinifSuzgec(e.target.value)}
                  className="ml-auto rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                  aria-label="Sınıf"
                >
                  <option value="all">Tüm sınıflar ({durum.classes.length})</option>
                  {durum.classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1.5 text-sm text-slate-700">
                  <input type="checkbox" checked={yalnizTarihli} onChange={(e) => setYalnizTarihli(e.target.checked)} />
                  Yalnız yazılısı olanlar
                </label>
                <label className="flex items-center gap-1.5 text-sm text-slate-700" title="Takvimde olup haftalık programda olmayan dersler (ör. Tarih, Felsefe)">
                  <input type="checkbox" checked={programDisi} onChange={(e) => setProgramDisi(e.target.checked)} />
                  Programda olmayan dersler
                </label>
              </div>
              {gorunenSiniflar.length === 0 ? (
                <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">
                  Yazılı tarihi girilmiş ders yok. "Yalnız yazılısı olanlar" seçimini kaldırıp tarih girebilirsiniz.
                </p>
              ) : null}
              {gorunenSiniflar.map(({ sinif, satirlar }) => {
                const kapali = kapaliSiniflar.has(sinif.id);
                return (
                  <div key={sinif.id} className="rounded-xl border border-slate-200 bg-white">
                    <button
                      type="button"
                      onClick={() =>
                        setKapaliSiniflar((s) => {
                          const n = new Set(s);
                          if (n.has(sinif.id)) n.delete(sinif.id);
                          else n.add(sinif.id);
                          return n;
                        })
                      }
                      className="flex w-full items-center gap-2 px-3 py-2 text-left"
                    >
                      {kapali ? <ChevronRight className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                      <span className="font-semibold text-slate-800">{sinif.name}</span>
                      <span className="text-xs text-slate-500">{sinif.student_count} öğrenci</span>
                      <span className="ml-auto text-xs text-slate-500">
                        {satirlar.filter((r) => planSayisi(r) > 0).length}/{satirlar.filter((r) => r.exam_date).length} planlı
                      </span>
                    </button>
                    {!kapali ? (
                      satirlar.length === 0 ? (
                        <p className="border-t border-slate-100 px-3 py-3 text-xs text-slate-500">Programda yazılı dersi yok.</p>
                      ) : (
                        <div className="divide-y divide-slate-100 border-t border-slate-100">
                          {satirlar.map((r) => (
                            <SatirSatiri
                              key={r.subject_key}
                              r={r}
                              ogretmenler={durum.teachers}
                              planli={planSayisi(r)}
                              mesgul={mesgulIs === `sinav-${r.class_id}-${r.subject_key}`}
                              kaydet={(d) => void sinavKaydet(r, d)}
                              ekle={() => setPencere({ tur: 'ekle', satir: r })}
                            />
                          ))}
                        </div>
                      )
                    ) : null}
                  </div>
                );
              })}
            </section>

            {/* Gün gün program */}
            <section className="space-y-3">
              <h2 className="text-lg font-bold text-[#173b70]">Program</h2>
              {gunler.map((gun) => {
                const liste = durum.items
                  .filter((i) => i.lesson_date === gun && (sinifSuzgec === 'all' || i.class_id === sinifSuzgec))
                  .sort((a, b) => a.start_time.localeCompare(b.start_time) || (sinifAd.get(a.class_id) || '').localeCompare(sinifAd.get(b.class_id) || '', 'tr'));
                const haftasonu = haftaGunu(gun) >= 6;
                return (
                  <div key={gun} className="rounded-xl border border-slate-200 bg-white">
                    <div className={`flex items-center justify-between rounded-t-xl px-3 py-2 ${haftasonu ? 'bg-indigo-50' : 'bg-slate-50'}`}>
                      <span className="font-semibold text-slate-800">{gunEtiketi(gun)}</span>
                      <span className="text-xs text-slate-500">{liste.length ? `${liste.length} ders` : 'Ders yok'}</span>
                    </div>
                    {liste.length ? (
                      <ul className="divide-y divide-slate-100">
                        {liste.map((d) => {
                          const s = sorunlar(d);
                          return (
                            <li key={d.id} className="flex flex-wrap items-start gap-2 px-3 py-2 text-sm">
                              <span className="w-24 shrink-0 font-semibold tabular-nums text-slate-700">
                                {d.start_time}–{d.end_time}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="font-medium text-slate-800">{sinifAd.get(d.class_id) || 'Sınıf'}</span>
                                <span className="text-slate-600"> · {d.subject}</span>
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
                                  d.status === 'published' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'
                                }`}
                              >
                                {d.status === 'published' ? 'Yayında' : 'Taslak'}
                              </span>
                              <span className="flex gap-1">
                                {d.status === 'draft' ? (
                                  <button
                                    type="button"
                                    onClick={() => setPencere({ tur: 'duzenle', ders: d })}
                                    className="rounded border border-slate-200 p-1 text-slate-600 hover:bg-slate-50"
                                    aria-label="Düzenle"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => dersSil(d)}
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
            </section>
          </div>

          {pencere ? (
            <DersPenceresi
              pencere={pencere}
              durum={durum}
              gunler={gunler}
              satirMap={satirMap}
              sinifAd={sinifAd}
              sorunlar={sorunlar}
              kapat={() => setPencere(null)}
              kaydet={async (veri) => {
                await isle('item', async () => {
                  if (pencere.tur === 'ekle') {
                    await post('add-item', {
                      class_id: pencere.satir.class_id,
                      subject: pencere.satir.subject,
                      ...veri
                    });
                  } else {
                    await post('update-item', { id: pencere.ders.id, ...veri });
                  }
                  setPencere(null);
                  await yukle();
                });
              }}
              mesgul={mesgulIs === 'item'}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/* ---------- Parçalar ---------- */
function OzetKart({ ad, deger, vurgu }: { ad: string; deger: React.ReactNode; vurgu?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-xs font-medium text-slate-500">{ad}</p>
      <p className={`mt-1 text-xl font-bold ${vurgu ? 'text-emerald-700' : 'text-[#173b70]'}`}>{deger}</p>
    </div>
  );
}

function SatirSatiri({
  r,
  ogretmenler,
  planli,
  mesgul,
  kaydet,
  ekle
}: {
  r: Satir;
  ogretmenler: Ogretmen[];
  planli: number;
  mesgul: boolean;
  kaydet: (d: Partial<Pick<Satir, 'exam_date' | 'teacher_id'>>) => void;
  ekle: () => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 px-3 py-2 text-sm sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.3fr)_8.5rem_auto] sm:items-center">
      <div className="min-w-0">
        <span className="font-medium text-slate-800">{r.subject}</span>
        {!r.in_program ? (
          <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">programda yok</span>
        ) : null}
        {r.takvim_not ? <span className="block text-xs text-red-700">{r.takvim_not}</span> : null}
      </div>
      <select
        value={r.teacher_id || ''}
        onChange={(e) => kaydet({ teacher_id: e.target.value || null })}
        className={`min-w-0 rounded-lg border px-2 py-1.5 ${r.teacher_id ? 'border-slate-300' : 'border-amber-300 bg-amber-50'}`}
        aria-label={`${r.subject} öğretmeni`}
      >
        <option value="">Öğretmen seçin</option>
        {ogretmenler.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <input
        type="date"
        value={r.exam_date || ''}
        onChange={(e) => kaydet({ exam_date: e.target.value || null })}
        className="rounded-lg border border-slate-300 px-2 py-1.5"
        aria-label={`${r.subject} yazılı tarihi`}
        title={r.takvim_tarih ? `Ortak takvim: ${kisaTarih(r.takvim_tarih)}` : undefined}
      />
      <div className="flex items-center gap-2">
        {mesgul ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
            planli > 0 ? 'bg-emerald-50 text-emerald-700' : r.exam_date ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-500'
          }`}
          title="Planlanan hazırlık dersi"
        >
          {planli} ders
        </span>
        <button
          type="button"
          onClick={ekle}
          className="inline-flex items-center gap-0.5 rounded-lg border border-indigo-200 px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
        >
          <Plus className="h-3.5 w-3.5" /> Ekle
        </button>
      </div>
    </div>
  );
}

function AyarPaneli({
  ayar,
  setAyar,
  kaydet,
  mesgul
}: {
  ayar: Ayar;
  setAyar: (a: Ayar) => void;
  kaydet: () => void;
  mesgul: boolean;
}) {
  const alan = 'mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';
  return (
    <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-2 lg:grid-cols-4">
      <label className="text-sm text-slate-700">
        Başlangıç
        <input type="date" value={ayar.baslangic} onChange={(e) => setAyar({ ...ayar, baslangic: e.target.value })} className={alan} />
      </label>
      <label className="text-sm text-slate-700">
        Bitiş
        <input type="date" value={ayar.bitis} onChange={(e) => setAyar({ ...ayar, bitis: e.target.value })} className={alan} />
      </label>
      <label className="text-sm text-slate-700">
        Bir sınıfa günde en fazla
        <input
          type="number"
          min={1}
          max={8}
          value={ayar.gunlukEnFazla}
          onChange={(e) => setAyar({ ...ayar, gunlukEnFazla: Number(e.target.value) })}
          className={alan}
        />
      </label>
      <label className="text-sm text-slate-700">
        Her yazılı dersi için hazırlık
        <input
          type="number"
          min={1}
          max={4}
          value={ayar.dersBasinaHazirlik}
          onChange={(e) => setAyar({ ...ayar, dersBasinaHazirlik: Number(e.target.value) })}
          className={alan}
        />
      </label>
      <label className="text-sm text-slate-700 md:col-span-2 lg:col-span-4">
        Otomatik yerleştirme önceliği
        <select
          value={ayar.oncelik}
          onChange={(e) => setAyar({ ...ayar, oncelik: e.target.value === 'yakin' ? 'yakin' : 'haftasonu' })}
          className={alan}
        >
          <option value="haftasonu">Önce yazılıdan önceki hafta sonları, yer kalmazsa hafta içi akşamları</option>
          <option value="yakin">Yazılıya en yakın gün (hafta içi akşamları dahil)</option>
        </select>
      </label>
      <label className="text-sm text-slate-700 md:col-span-2">
        Hafta sonu saatleri (her satır: 10:00-11:00)
        <textarea
          rows={5}
          value={ayar.haftasonu.join('\n')}
          onChange={(e) => setAyar({ ...ayar, haftasonu: e.target.value.split('\n') })}
          className={`${alan} font-mono`}
        />
      </label>
      <label className="text-sm text-slate-700 md:col-span-2">
        Hafta içi saatleri
        <textarea
          rows={5}
          value={ayar.haftaici.join('\n')}
          onChange={(e) => setAyar({ ...ayar, haftaici: e.target.value.split('\n') })}
          className={`${alan} font-mono`}
        />
      </label>
      <div className="flex items-center gap-2 lg:col-span-4">
        <button
          type="button"
          onClick={kaydet}
          disabled={mesgul}
          className="inline-flex items-center gap-1 rounded-lg bg-[#173b70] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {mesgul ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Kaydet
        </button>
        <span className="text-xs text-slate-500">Saat değişikliği mevcut taslakları taşımaz; yeni yerleştirmelerde kullanılır.</span>
      </div>
    </div>
  );
}

function DersPenceresi({
  pencere,
  durum,
  gunler,
  satirMap,
  sinifAd,
  sorunlar,
  kapat,
  kaydet,
  mesgul
}: {
  pencere: Pencere;
  durum: Durum;
  gunler: string[];
  satirMap: Map<string, Satir>;
  sinifAd: Map<string, string>;
  sorunlar: (d: { id?: string; class_id: string; subject_key: string; teacher_id: string | null; lesson_date: string; start_time: string; end_time: string }) => string[];
  kapat: () => void;
  kaydet: (veri: { lesson_date: string; start_time: string; end_time: string; teacher_id: string | null }) => Promise<void>;
  mesgul: boolean;
}) {
  const temel =
    pencere.tur === 'ekle'
      ? { class_id: pencere.satir.class_id, subject: pencere.satir.subject, subject_key: pencere.satir.subject_key, teacher_id: pencere.satir.teacher_id }
      : pencere.ders;
  const satir = satirMap.get(`${temel.class_id}|${temel.subject_key}`);
  const uygunGunler = gunler.filter((g) => !satir?.exam_date || g < satir.exam_date);
  const [tarih, setTarih] = useState(pencere.tur === 'duzenle' ? pencere.ders.lesson_date : uygunGunler[uygunGunler.length - 1] || gunler[0] || '');
  const bloklar = (haftaGunu(tarih || '2026-01-01') >= 6 ? durum.ayar.haftasonu : durum.ayar.haftaici).map(blokCoz).filter(Boolean) as {
    start_time: string;
    end_time: string;
  }[];
  const [bas, setBas] = useState(pencere.tur === 'duzenle' ? pencere.ders.start_time : '');
  const [bit, setBit] = useState(pencere.tur === 'duzenle' ? pencere.ders.end_time : '');
  const [ogretmen, setOgretmen] = useState<string>(temel.teacher_id || '');

  const aday = { id: pencere.tur === 'duzenle' ? pencere.ders.id : undefined, class_id: temel.class_id, subject_key: temel.subject_key, teacher_id: ogretmen || null, lesson_date: tarih, start_time: bas, end_time: bit };
  const blokSorunu = (b: { start_time: string; end_time: string }) => sorunlar({ ...aday, start_time: b.start_time, end_time: b.end_time }).filter((s) => !s.startsWith('Öğretmen seçilmemiş'));
  const gecerli = Boolean(tarih && blokCoz(`${bas}-${bit}`));
  const uyarilar = gecerli ? sorunlar(aday) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h3 className="text-lg font-bold text-[#173b70]">{pencere.tur === 'ekle' ? 'Hazırlık dersi ekle' : 'Dersi düzenle'}</h3>
            <p className="text-sm text-slate-600">
              {sinifAd.get(temel.class_id)} · {temel.subject}
              {satir?.exam_date ? ` · yazılı ${kisaTarih(satir.exam_date)}` : ''}
            </p>
          </div>
          <button type="button" onClick={kapat} aria-label="Kapat" className="rounded p-1 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="block text-sm text-slate-700">
          Gün
          <select value={tarih} onChange={(e) => setTarih(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2">
            {gunler.map((g) => (
              <option key={g} value={g} disabled={!uygunGunler.includes(g)}>
                {gunEtiketi(g)}
                {!uygunGunler.includes(g) ? ' (yazılı sonrası)' : ''}
              </option>
            ))}
          </select>
        </label>

        <p className="mt-3 text-sm text-slate-700">Saat</p>
        <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {bloklar.map((b) => {
            const sorun = blokSorunu(b);
            const secili = b.start_time === bas && b.end_time === bit;
            return (
              <button
                key={b.start_time}
                type="button"
                onClick={() => {
                  setBas(b.start_time);
                  setBit(b.end_time);
                }}
                title={sorun.join('\n') || 'Boş'}
                className={`rounded-lg border px-2 py-1.5 text-sm tabular-nums ${
                  secili
                    ? 'border-[#173b70] bg-[#173b70] text-white'
                    : sorun.length
                      ? 'border-red-200 bg-red-50 text-red-700'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                }`}
              >
                {b.start_time}–{b.end_time}
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex items-center gap-2 text-sm text-slate-700">
          Özel saat:
          <input type="time" value={bas} onChange={(e) => setBas(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1" aria-label="Başlangıç" />
          –
          <input type="time" value={bit} onChange={(e) => setBit(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1" aria-label="Bitiş" />
        </div>
        <p className="mt-1 text-xs text-slate-500">Yeşil: sınıf ve öğretmen boş. Kırmızı: çakışma var (üzerine gelince nedeni görünür).</p>

        <label className="mt-3 block text-sm text-slate-700">
          Öğretmen
          <select value={ogretmen} onChange={(e) => setOgretmen(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">Öğretmen seçin</option>
            {durum.teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>

        {uyarilar.length ? (
          <ul className="mt-3 space-y-1 rounded-lg bg-red-50 p-2 text-xs text-red-800">
            {uyarilar.map((u) => (
              <li key={u} className="flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {u}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={kapat} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
            Vazgeç
          </button>
          <button
            type="button"
            disabled={!gecerli || mesgul}
            onClick={() => void kaydet({ lesson_date: tarih, start_time: bas, end_time: bit, teacher_id: ogretmen || null })}
            className="inline-flex items-center gap-1 rounded-lg bg-[#173b70] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {mesgul ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {uyarilar.length ? 'Yine de kaydet' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
}
