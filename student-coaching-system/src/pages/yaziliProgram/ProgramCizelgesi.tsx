import React, { useMemo, useState } from 'react';
import { Download, Loader2, Move, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../../lib/session';
import { subjectTheme } from '../../lib/classScheduleBrandedPng';
import { downloadDatedSchedulePng } from '../../lib/datedSchedulePng';
import { oturumIptal, oturumTasi } from './oturumIslem';
import type { Ders, Durum, Mesgul } from './YaziliProgramPage';

const GUN_ADI = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const HAZIRLIK_RE = /\s*\(yazılıya hazırlık\)\s*$/i;

const tarihNesne = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const gunAdi = (iso: string) => GUN_ADI[tarihNesne(iso).getUTCDay()];
const tarihKisa = (iso: string) =>
  tarihNesne(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const dk = (t: string) => {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};
const satirAnahtar = (bas: string, bit: string) => `${bas}|${bit}`;

type Oturum = Mesgul & { id: string; lesson_date: string };
type Kalem = {
  key: string;
  tur: 'oturum' | 'taslak' | 'yayinli';
  oturum?: Oturum;
  ders?: Ders;
  subject: string;
  teacher_id: string | null;
  lesson_date: string;
  start_time: string;
  end_time: string;
  hazirlik: boolean;
};

async function postProgram(kurumQs: string, op: string, body: unknown) {
  const res = await apiFetch(`/api/yazili-program?op=${op}${kurumQs}`, { method: 'POST', body: JSON.stringify(body) });
  const j = (await res.json().catch(() => ({}))) as { hint?: string; error?: string };
  if (!res.ok) throw new Error(j.hint || j.error || 'İşlem başarısız');
  return j;
}

/**
 * Seçili sınıfın seçili tarih aralığındaki ders programı çizelgesi:
 * sütun = tarih, satır = ders saati. Dersler sürükle-bırak (veya seç → hedefe tıkla) ile taşınır,
 * dolu hücreye bırakınca iki ders yer değiştirir. Çizelge PNG olarak indirilir.
 */
export default function ProgramCizelgesi({
  durum,
  gunler,
  sinifId,
  sinifAd,
  ogretmenAd,
  kurumQs,
  onDuzenle,
  onEkle,
  yenile
}: {
  durum: Durum;
  gunler: string[];
  sinifId: string;
  sinifAd: Map<string, string>;
  ogretmenAd: Map<string, string>;
  kurumQs: string;
  onDuzenle: (o: Oturum) => void;
  onEkle: (tarih: string, bas?: string, bit?: string) => void;
  yenile: () => Promise<void>;
}) {
  const [secili, setSecili] = useState<string | null>(null);
  const [surukle, setSurukle] = useState<string | null>(null);
  const [hedefUstu, setHedefUstu] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState(false);
  const [ekSatirlar, setEkSatirlar] = useState<string[]>([]);
  const [yeniSaat, setYeniSaat] = useState({ bas: '', bit: '' });
  const [pngTaslak, setPngTaslak] = useState(true);
  const [pngBosGun, setPngBosGun] = useState(false);
  const [pngIndiriliyor, setPngIndiriliyor] = useState(false);

  const kalemler = useMemo<Kalem[]>(() => {
    const out: Kalem[] = [];
    for (const s of durum.sessions as Oturum[]) {
      if (s.class_id !== sinifId || !s.id || !s.lesson_date) continue;
      out.push({
        key: `o-${s.id}`,
        tur: 'oturum',
        oturum: s,
        subject: s.subject,
        teacher_id: s.teacher_id,
        lesson_date: s.lesson_date,
        start_time: s.start_time,
        end_time: s.end_time,
        hazirlik: HAZIRLIK_RE.test(s.subject)
      });
    }
    for (const d of durum.items) {
      if (d.class_id !== sinifId) continue;
      out.push({
        key: `d-${d.id}`,
        tur: d.status === 'published' ? 'yayinli' : 'taslak',
        ders: d,
        subject: d.subject,
        teacher_id: d.teacher_id,
        lesson_date: d.lesson_date,
        start_time: d.start_time,
        end_time: d.end_time,
        hazirlik: true
      });
    }
    return out.filter((k) => gunler.includes(k.lesson_date));
  }, [durum.sessions, durum.items, sinifId, gunler]);

  const satirlar = useMemo(() => {
    const set = new Set<string>(ekSatirlar);
    for (const k of kalemler) set.add(satirAnahtar(k.start_time, k.end_time));
    return [...set].sort((a, b) => dk(a.split('|')[0]) - dk(b.split('|')[0]) || dk(a.split('|')[1]) - dk(b.split('|')[1]));
  }, [kalemler, ekSatirlar]);

  const hucreKalemleri = (gun: string, satir: string) =>
    kalemler.filter((k) => k.lesson_date === gun && satirAnahtar(k.start_time, k.end_time) === satir);

  /** Bir kalemi hedef tarih/saate taşır (tür ne olursa olsun) */
  const tasi = async (k: Kalem, lesson_date: string, start_time: string, end_time: string) => {
    if (k.tur === 'taslak' && k.ders) {
      await postProgram(kurumQs, 'update-item', { id: k.ders.id, lesson_date, start_time, end_time, teacher_id: k.ders.teacher_id });
      return;
    }
    if (k.tur === 'yayinli' && k.ders) {
      if (!k.ders.session_id) throw new Error('Yayındaki dersin canlı kaydı bulunamadı.');
      const yeniId = await oturumTasi(
        {
          id: k.ders.session_id,
          class_id: k.ders.class_id,
          subject: `${k.ders.subject} (Yazılıya Hazırlık)`,
          teacher_id: k.ders.teacher_id,
          lesson_date: k.ders.lesson_date,
          start_time: k.ders.start_time,
          end_time: k.ders.end_time
        },
        { lesson_date, start_time, end_time }
      );
      await postProgram(kurumQs, 'sync-published', { id: k.ders.id, session_id: yeniId, lesson_date, start_time, end_time });
      return;
    }
    if (k.oturum) await oturumTasi(k.oturum, { lesson_date, start_time, end_time });
  };

  const birak = async (kaynakKey: string, gun: string, satir: string) => {
    const k = kalemler.find((x) => x.key === kaynakKey);
    if (!k) return;
    const [bas, bit] = satir.split('|');
    if (k.lesson_date === gun && k.start_time === bas && k.end_time === bit) return;
    const dolu = hucreKalemleri(gun, satir);
    setMesgul(true);
    try {
      if (dolu.length === 1) {
        const diger = dolu[0];
        if (
          !window.confirm(
            `${gunAdi(gun)} ${bas} saatinde ${diger.subject.replace(HAZIRLIK_RE, '')} dersi var.\n` +
              `İki ders yer değiştirsin mi?\n\n${k.subject.replace(HAZIRLIK_RE, '')} → ${tarihKisa(gun)} ${bas}\n` +
              `${diger.subject.replace(HAZIRLIK_RE, '')} → ${tarihKisa(k.lesson_date)} ${k.start_time}`
          )
        ) {
          return;
        }
        if (k.teacher_id && k.teacher_id === diger.teacher_id && k.lesson_date === gun) {
          throw new Error('İki ders aynı öğretmenin ve aynı gün; yer değiştirmek için önce birini boş bir saate taşıyın.');
        }
        await tasi(k, gun, bas, bit);
        try {
          await tasi(diger, k.lesson_date, k.start_time, k.end_time);
        } catch (e) {
          await tasi({ ...k, lesson_date: gun, start_time: bas, end_time: bit }, k.lesson_date, k.start_time, k.end_time).catch(() => {});
          throw e;
        }
        toast.success('Dersler yer değiştirdi.');
      } else {
        if (dolu.length > 1 && !window.confirm('Bu hücrede birden çok ders var. Yine de buraya taşınsın mı?')) return;
        await tasi(k, gun, bas, bit);
        toast.success(
          `${k.subject.replace(HAZIRLIK_RE, '')} → ${tarihKisa(gun)} ${gunAdi(gun)} ${bas}${k.tur === 'taslak' ? ' (taslak)' : ''}`
        );
      }
      await yenile();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Taşınamadı');
      await yenile();
    } finally {
      setMesgul(false);
      setSecili(null);
      setSurukle(null);
      setHedefUstu(null);
    }
  };

  /** Dersi kaldırır: canlı ders iptal edilir, hazırlık taslağı silinir */
  const kaldir = async (k: Kalem) => {
    const ad = k.subject.replace(HAZIRLIK_RE, '');
    const ne =
      k.tur === 'taslak'
        ? 'Taslak hazırlık dersi silinecek.'
        : 'Ders iptal edilecek; öğrenciler ve öğretmen artık bu dersi görmez.';
    if (!window.confirm(`${tarihKisa(k.lesson_date)} ${gunAdi(k.lesson_date)} ${k.start_time} · ${ad}\n\n${ne}\nDevam edilsin mi?`)) return;
    setMesgul(true);
    try {
      if (k.ders) await postProgram(kurumQs, 'delete-item', { id: k.ders.id });
      else if (k.oturum) await oturumIptal(k.oturum.id);
      toast.success(k.tur === 'taslak' ? 'Taslak silindi.' : 'Ders kaldırıldı.');
      await yenile();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaldırılamadı');
    } finally {
      setMesgul(false);
      setSecili(null);
    }
  };

  const satirEkle = () => {
    if (!(dk(yeniSaat.bit) > dk(yeniSaat.bas))) {
      toast.error('Geçerli bir başlangıç ve bitiş saati girin.');
      return;
    }
    const k = satirAnahtar(yeniSaat.bas, yeniSaat.bit);
    setEkSatirlar((s) => (s.includes(k) ? s : [...s, k]));
    setYeniSaat({ bas: '', bit: '' });
  };

  const pngIndir = async () => {
    const pngKalem = kalemler.filter((k) => pngTaslak || k.tur !== 'taslak');
    const pngGunler = pngBosGun ? gunler : gunler.filter((g) => pngKalem.some((k) => k.lesson_date === g));
    const pngSatirlar = satirlar.filter((s) => pngKalem.some((k) => satirAnahtar(k.start_time, k.end_time) === s));
    if (!pngKalem.length) {
      toast.error('PNG için bu aralıkta ders yok.');
      return;
    }
    setPngIndiriliyor(true);
    try {
      const ad = sinifAd.get(sinifId) || 'Sınıf';
      await downloadDatedSchedulePng({
        title: ad,
        subtitle: 'Yazılıya Hazırlık Ders Programı',
        rangeLabel: `${tarihKisa(gunler[0])} – ${tarihKisa(gunler[gunler.length - 1])}`,
        days: pngGunler.map((g) => ({ iso: g, title: gunAdi(g), subtitle: tarihKisa(g) })),
        rows: pngSatirlar.map((s) => ({ key: s, time: s.replace('|', '–') })),
        lessons: pngKalem.map((k) => ({
          dayIso: k.lesson_date,
          rowKey: satirAnahtar(k.start_time, k.end_time),
          subject: k.subject.replace(HAZIRLIK_RE, ''),
          teacher: k.teacher_id ? ogretmenAd.get(k.teacher_id) || '' : '',
          time: `${k.start_time}–${k.end_time}`,
          badge: k.hazirlik ? 'Yazılıya hazırlık' : null
        })),
        filename: `${ad.replace(/[\\/:*?"<>|]+/g, ' ').trim()} - yazililara hazirlik programi.png`
      });
      toast.success('PNG indirildi.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'PNG oluşturulamadı');
    } finally {
      setPngIndiriliyor(false);
    }
  };

  const seciliKalem = secili ? kalemler.find((k) => k.key === secili) : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm">
        <span className="flex items-center gap-1 text-slate-600">
          <Move className="h-4 w-4 text-indigo-700" />
          Dersi sürükleyip bırakın ya da derse tıklayıp hedef hücreye tıklayın. Dolu hücreye bırakırsanız iki ders yer değiştirir.
          Kaldırmak için dersin üzerindeki çöp kutusuna basın.
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-slate-700">
            <input type="checkbox" checked={pngTaslak} onChange={(e) => setPngTaslak(e.target.checked)} /> Taslaklar PNG'de olsun
          </label>
          <label className="flex items-center gap-1.5 text-slate-700">
            <input type="checkbox" checked={pngBosGun} onChange={(e) => setPngBosGun(e.target.checked)} /> Boş günler PNG'de olsun
          </label>
          <button
            type="button"
            onClick={() => void pngIndir()}
            disabled={pngIndiriliyor || !kalemler.length}
            className="inline-flex items-center gap-1 rounded-lg bg-[#173b70] px-3 py-2 font-semibold text-white disabled:opacity-50"
          >
            {pngIndiriliyor ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} PNG indir
          </button>
        </div>
      </div>

      {seciliKalem ? (
        <div className="flex items-center justify-between rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-950">
          <span>
            <b>{seciliKalem.subject.replace(HAZIRLIK_RE, '')}</b> seçildi — taşımak istediğiniz hücreye tıklayın ya da kaldırın.
          </span>
          <span className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void kaldir(seciliKalem)}
              className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
            >
              <Trash2 className="h-3.5 w-3.5" /> Dersi kaldır
            </button>
            <button type="button" onClick={() => setSecili(null)} aria-label="Seçimi bırak">
              <X className="h-4 w-4" />
            </button>
          </span>
        </div>
      ) : null}

      <div className="relative overflow-x-auto rounded-xl border border-slate-200 bg-white">
        {mesgul ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/60">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-700" />
          </div>
        ) : null}
        <table className="w-full border-collapse text-sm" style={{ minWidth: 110 + gunler.length * 150 }}>
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-[110px] border border-slate-200 bg-[#E9F0FB] px-2 py-2 text-left text-xs font-bold text-[#1F478F]">
                Saat
              </th>
              {gunler.map((g) => {
                const hs = [0, 6].includes(tarihNesne(g).getUTCDay());
                return (
                  <th
                    key={g}
                    className={`border border-slate-200 px-2 py-2 text-center ${hs ? 'bg-indigo-50' : 'bg-slate-50'}`}
                  >
                    <span className="block text-sm font-bold text-slate-800">{gunAdi(g)}</span>
                    <span className="block text-xs font-medium text-slate-500">{tarihKisa(g)}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {satirlar.length === 0 ? (
              <tr>
                <td colSpan={gunler.length + 1} className="px-4 py-8 text-center text-slate-500">
                  Bu sınıfın seçili tarihlerde dersi yok. Aşağıdan bir saat satırı ekleyip ders ekleyebilirsiniz.
                </td>
              </tr>
            ) : null}
            {satirlar.map((satir) => {
              const [bas, bit] = satir.split('|');
              return (
                <tr key={satir}>
                  <td className="sticky left-0 z-10 border border-slate-200 bg-[#E9F0FB] px-2 py-2 align-top text-xs font-bold tabular-nums text-[#1F478F]">
                    {bas}–{bit}
                  </td>
                  {gunler.map((gun) => {
                    const hk = `${gun}|${satir}`;
                    const icerik = hucreKalemleri(gun, satir);
                    const hedef = hedefUstu === hk;
                    return (
                      <td
                        key={gun}
                        onDragOver={(e) => {
                          if (!surukle) return;
                          e.preventDefault();
                          if (hedefUstu !== hk) setHedefUstu(hk);
                        }}
                        onDragLeave={() => hedefUstu === hk && setHedefUstu(null)}
                        onDrop={(e) => {
                          e.preventDefault();
                          const key = e.dataTransfer.getData('text/plain') || surukle;
                          if (key) void birak(key, gun, satir);
                        }}
                        onClick={() => {
                          if (secili) void birak(secili, gun, satir);
                        }}
                        className={`group h-16 min-w-[150px] border border-slate-200 p-1 align-top ${
                          hedef ? 'bg-indigo-100 outline outline-2 outline-indigo-400' : secili ? 'cursor-pointer hover:bg-indigo-50' : ''
                        }`}
                      >
                        {icerik.map((k) => {
                          const t = subjectTheme(k.subject.replace(HAZIRLIK_RE, ''));
                          const sec = secili === k.key;
                          return (
                            <div
                              key={k.key}
                              draggable={!mesgul}
                              onDragStart={(e) => {
                                e.dataTransfer.setData('text/plain', k.key);
                                e.dataTransfer.effectAllowed = 'move';
                                setSurukle(k.key);
                              }}
                              onDragEnd={() => {
                                setSurukle(null);
                                setHedefUstu(null);
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (secili && secili !== k.key) {
                                  void birak(secili, gun, satir);
                                  return;
                                }
                                setSecili(sec ? null : k.key);
                              }}
                              onDoubleClick={(e) => {
                                e.stopPropagation();
                                if (k.oturum) onDuzenle(k.oturum);
                              }}
                              title={k.oturum ? 'Sürükleyin · tıklayıp seçin · çift tıklayıp düzenleyin' : 'Sürükleyin · tıklayıp seçin'}
                              style={{ background: t.bg, borderLeftColor: t.bd, color: t.fg }}
                              className={`group/chip relative mb-1 cursor-grab select-none rounded-lg border-l-4 px-2 py-1.5 pr-6 last:mb-0 active:cursor-grabbing ${
                                sec ? 'ring-2 ring-[#173b70] ring-offset-1' : ''
                              } ${k.tur === 'taslak' ? 'border-dashed opacity-80' : ''}`}
                            >
                              <button
                                type="button"
                                draggable={false}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void kaldir(k);
                                }}
                                className={`absolute right-1 top-1 rounded p-0.5 text-red-700 hover:bg-white/80 ${
                                  sec ? 'block' : 'hidden group-hover/chip:block'
                                }`}
                                aria-label={`${k.subject.replace(HAZIRLIK_RE, '')} dersini kaldır`}
                                title="Dersi kaldır"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                              <span className="block text-[13px] font-bold leading-tight">{k.subject.replace(HAZIRLIK_RE, '')}</span>
                              <span className="block text-[11px] leading-tight text-slate-600">
                                {k.teacher_id ? ogretmenAd.get(k.teacher_id) || 'Öğretmen' : 'Öğretmen yok'}
                              </span>
                              {k.hazirlik ? (
                                <span
                                  className={`mt-0.5 inline-block rounded-full px-1.5 text-[10px] font-bold ${
                                    k.tur === 'taslak' ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-800'
                                  }`}
                                >
                                  {k.tur === 'taslak' ? 'Hazırlık · taslak' : 'Yazılıya hazırlık'}
                                </span>
                              ) : null}
                            </div>
                          );
                        })}
                        {!icerik.length && !secili ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onEkle(gun, bas, bit);
                            }}
                            className="hidden h-full w-full items-center justify-center rounded text-xs text-slate-400 hover:bg-slate-50 group-hover:flex"
                            aria-label={`${tarihKisa(gun)} ${bas} ders ekle`}
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
        Saat satırı ekle:
        <input
          type="time"
          value={yeniSaat.bas}
          onChange={(e) => setYeniSaat((s) => ({ ...s, bas: e.target.value }))}
          className="rounded-lg border border-slate-300 px-2 py-1"
          aria-label="Başlangıç"
        />
        –
        <input
          type="time"
          value={yeniSaat.bit}
          onChange={(e) => setYeniSaat((s) => ({ ...s, bit: e.target.value }))}
          className="rounded-lg border border-slate-300 px-2 py-1"
          aria-label="Bitiş"
        />
        <button type="button" onClick={satirEkle} className="rounded-lg border border-indigo-200 px-3 py-1 font-semibold text-indigo-700 hover:bg-indigo-50">
          Ekle
        </button>
        <span className="text-xs text-slate-500">Boş satıra ders sürükleyebilir ya da hücredeki + ile ders ekleyebilirsiniz.</span>
      </div>
    </div>
  );
}
