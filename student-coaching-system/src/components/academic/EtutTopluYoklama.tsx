import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ClipboardList, Loader2 } from 'lucide-react';
import { AppModal, AppModalBody, AppModalFooter, AppModalHeader } from '../ui/AppModal';
import { apiFetch } from '../../lib/session';
import { todayYmd } from '../../lib/etutSession';
import {
  acikDilimSira,
  bugununDenemeleri,
  bugununEtutleri,
  etutDilimleri,
  type EtutDilim,
  type EtutOturum,
  type EtutSinif
} from '../../lib/etutTopluYoklama';
import type { ExamEntryKey, StudyEntryKey } from '../../lib/academicCenterLinks';

type Durum = 'present' | 'absent' | 'late' | 'excused';

type Satir = {
  session_id: string;
  student_id: string;
  student_name: string;
  className: string;
  saat: string;
  dilim: number;
  status: Durum;
  camera_status: 'on' | 'off' | null;
  /** Öğretmen bu satıra dokunduysa Kaydet’e girer. */
  dirty: boolean;
};

function durumYap(st: string, varsayilan: Durum): Durum {
  const s = String(st || '').trim().toLowerCase();
  if (s === 'absent') return 'absent';
  if (s === 'late') return 'late';
  if (s === 'excused') return 'excused';
  if (s === 'present') return 'present';
  return varsayilan;
}

function kameraYap(status: Durum, raw: string): 'on' | 'off' | null {
  if (status === 'absent' || status === 'excused') return null;
  if (raw === 'off' || raw === 'closed') return 'off';
  return 'on';
}

function kameraDurumu(status: Durum, mevcut: 'on' | 'off' | null): 'on' | 'off' | null {
  if (status === 'absent' || status === 'excused') return null;
  return mevcut === 'off' ? 'off' : 'on';
}

export function EtutTopluYoklama({
  room,
  label,
  institutionId,
  tur = 'etut'
}: {
  room: StudyEntryKey | ExamEntryKey;
  label: string;
  institutionId?: string | null;
  tur?: 'etut' | 'deneme';
}) {
  const deneme = tur === 'deneme';
  const ad = deneme ? 'deneme' : 'etüt';
  const Ad = deneme ? 'Deneme' : 'Etüt';
  const varsayilanDurum: Durum = deneme ? 'absent' : 'present';
  const [acik, setAcik] = useState(false);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [kaydediyor, setKaydediyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [bilgi, setBilgi] = useState<string | null>(null);
  const [satirlar, setSatirlar] = useState<Satir[]>([]);
  const [dilimler, setDilimler] = useState<EtutDilim[]>([]);
  const [seciliDilim, setSeciliDilim] = useState(1);
  const [sinif, setSinif] = useState('');
  const [arama, setArama] = useState('');

  const kapat = () => {
    if (kaydediyor) return;
    setAcik(false);
  };

  const ac = async () => {
    setAcik(true);
    setYukleniyor(true);
    setHata(null);
    setBilgi(null);
    setSatirlar([]);
    setDilimler([]);
    setSeciliDilim(1);
    setSinif('');
    setArama('');
    try {
      const today = todayYmd();
      const ortak = new URLSearchParams();
      if (institutionId) ortak.set('institution_id', institutionId);
      const sinifQs = new URLSearchParams(ortak);
      sinifQs.set('scope', 'classes');
      const oturumQs = new URLSearchParams(ortak);
      oturumQs.set('scope', 'sessions');
      oturumQs.set('from', today);
      oturumQs.set('to', today);
      const [sinifRes, oturumRes] = await Promise.all([
        apiFetch(`/api/class-live-lessons?${sinifQs}`),
        apiFetch(`/api/class-live-lessons?${oturumQs}`)
      ]);
      const sinifJson = await sinifRes.json().catch(() => ({}));
      const oturumJson = await oturumRes.json().catch(() => ({}));
      if (!sinifRes.ok || !oturumRes.ok) {
        setHata(`Sınıf veya ${ad} listesi alınamadı.`);
        return;
      }
      const siniflar = (Array.isArray(sinifJson.data) ? sinifJson.data : []) as EtutSinif[];
      const oturumlar = (Array.isArray(oturumJson.data) ? oturumJson.data : []) as EtutOturum[];
      const secilen = deneme
        ? bugununDenemeleri({
            room: room as ExamEntryKey,
            sessions: oturumlar,
            classes: siniflar,
            today
          })
        : bugununEtutleri({
            room: room as StudyEntryKey,
            sessions: oturumlar,
            classes: siniflar,
            today
          });
      const dilimListe = etutDilimleri(secilen);
      setDilimler(dilimListe);
      const simdi = new Date();
      const acik = acikDilimSira(dilimListe, simdi.getHours() * 60 + simdi.getMinutes());
      setSeciliDilim(acik);
      if (!secilen.length) {
        setBilgi(
          deneme
            ? 'Bugün bu deneme grubunda canlı deneme yok. Yoklama, o gün denemesi olan sınıfların listesinden gelir.'
            : 'Bugün bu etüt grubunda canlı etüt yok. Yoklama, o gün etüdü olan sınıfların listesinden gelir.'
        );
        return;
      }
      const dilimNo = new Map<string, number>();
      for (const d of dilimListe) {
        for (const o of d.oturumlar) dilimNo.set(o.id, d.sira);
      }
      const parcalar = await Promise.all(
        secilen.map(async (oturum) => {
          const res = await apiFetch(
            `/api/class-live-lessons?scope=attendance&session_id=${encodeURIComponent(oturum.id)}`
          );
          const j = await res.json().catch(() => ({}));
          if (!res.ok) return [] as Satir[];
          const kayitlar = Array.isArray(j.data) ? j.data : [];
          const roster = Array.isArray(j.roster) ? j.roster : [];
          const durum = new Map<string, string>();
          const kamera = new Map<string, string>();
          for (const row of kayitlar) {
            const id = String(row.student_id || '').trim();
            if (!id) continue;
            durum.set(id, String(row.status || ''));
            kamera.set(id, String(row.camera_status || ''));
          }
          const saat = `${String(oturum.start_time).slice(0, 5)}–${String(oturum.end_time).slice(0, 5)}`;
          return roster
            .map((row: { student_id?: string; student_name?: string }) => {
              const id = String(row.student_id || '').trim();
              if (!id) return null;
              const status = durumYap(durum.get(id) || '', varsayilanDurum);
              const camera_status = kameraYap(status, kamera.get(id) || '');
              return {
                session_id: oturum.id,
                student_id: id,
                student_name: String(row.student_name || '').trim() || 'Öğrenci',
                className: oturum.className,
                saat,
                dilim: dilimNo.get(oturum.id) || 1,
                status,
                camera_status,
                dirty: false
              } satisfies Satir;
            })
            .filter((row: Satir | null): row is Satir => Boolean(row));
        })
      );
      const liste = parcalar.flat().sort((a, b) => a.student_name.localeCompare(b.student_name, 'tr'));
      setSatirlar(liste);
      if (!liste.length) {
        setBilgi(`Bugünkü ${ad}lerde yoklama listesinde öğrenci yok.`);
      }
    } catch {
      setHata('Yoklama listesi açılamadı.');
    } finally {
      setYukleniyor(false);
    }
  };

  const siniflar = useMemo(() => {
    const adlar = new Set(satirlar.filter((s) => s.dilim === seciliDilim).map((s) => s.className));
    return [...adlar].sort((a, b) => a.localeCompare(b, 'tr'));
  }, [satirlar, seciliDilim]);

  const gorunen = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase('tr-TR');
    return satirlar.filter((s) => {
      if (s.dilim !== seciliDilim) return false;
      if (sinif && s.className !== sinif) return false;
      if (!q) return true;
      return `${s.student_name} ${s.className}`.toLocaleLowerCase('tr-TR').includes(q);
    });
  }, [arama, satirlar, seciliDilim, sinif]);

  const ozet = useMemo(() => {
    let present = 0;
    let late = 0;
    let absent = 0;
    let excused = 0;
    for (const s of gorunen) {
      if (s.status === 'present') present += 1;
      else if (s.status === 'late') late += 1;
      else if (s.status === 'excused') excused += 1;
      else absent += 1;
    }
    return { total: gorunen.length, present, late, absent, excused };
  }, [gorunen]);

  const kaydedilecek = useMemo(
    () => satirlar.filter((s) => s.dilim === seciliDilim && s.dirty),
    [satirlar, seciliDilim]
  );

  const durumSec = (sessionId: string, studentId: string, status: Durum) => {
    setSatirlar((prev) =>
      prev.map((s) =>
        s.session_id === sessionId && s.student_id === studentId
          ? {
              ...s,
              status,
              camera_status: kameraDurumu(status, s.camera_status),
              dirty: true
            }
          : s
      )
    );
  };

  const kameraSec = (sessionId: string, studentId: string, camera: 'on' | 'off') => {
    setSatirlar((prev) =>
      prev.map((s) =>
        s.session_id === sessionId && s.student_id === studentId ? { ...s, camera_status: camera, dirty: true } : s
      )
    );
  };

  const tumunu = (status: Durum) => {
    setSatirlar((prev) =>
      prev.map((s) => {
        if (s.dilim !== seciliDilim) return s;
        if (sinif && s.className !== sinif) return s;
        return { ...s, status, camera_status: kameraDurumu(status, s.camera_status), dirty: true };
      })
    );
  };

  const kaydet = async () => {
    if (!kaydedilecek.length) {
      toast.message('Kaydedilecek değişiklik yok. Önce öğrencilerin durumunu işaretleyin.');
      return;
    }
    setKaydediyor(true);
    setHata(null);
    try {
      const gruplar = new Map<string, Satir[]>();
      for (const s of kaydedilecek) {
        const arr = gruplar.get(s.session_id) || [];
        arr.push(s);
        gruplar.set(s.session_id, arr);
      }
      const sonuclar = await Promise.all(
        [...gruplar.entries()].map(async ([sessionId, rows]) => {
          const res = await apiFetch('/api/class-live-lessons?op=mark-attendance', {
            method: 'POST',
            body: JSON.stringify({
              session_id: sessionId,
              attendance: rows.map((row) => ({
                student_id: row.student_id,
                student_name: row.student_name,
                status: row.status,
                camera_status: row.status === 'absent' || row.status === 'excused' ? 'n_a' : row.camera_status || 'on'
              }))
            })
          });
          return res.ok;
        })
      );
      if (sonuclar.some((ok) => !ok)) {
        setHata('Bazı sınıfların yoklaması kaydedilemedi. Listeyi yenileyip tekrar deneyin.');
        return;
      }
      const savedKeys = new Set(kaydedilecek.map((s) => `${s.session_id}:${s.student_id}`));
      setSatirlar((prev) =>
        prev.map((s) => {
          if (!savedKeys.has(`${s.session_id}:${s.student_id}`)) return s;
          return { ...s, dirty: false };
        })
      );
      toast.success('Yoklama kaydedildi');
      setAcik(false);
    } catch {
      setHata('Yoklama kaydedilemedi.');
    } finally {
      setKaydediyor(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          void ac();
        }}
        className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900 shadow-sm transition hover:bg-amber-100"
      >
        <ClipboardList className="h-4 w-4" />
        Yoklama
      </button>
      {acik ? (
        <AppModal open onClose={kapat} panelClassName="max-w-2xl">
          <AppModalHeader>
            <div>
              <h3 className="font-semibold text-slate-900">{label} yoklaması</h3>
              <p className="mt-0.5 text-xs text-slate-600">
                {deneme
                  ? '1. deneme ve 2. deneme ayrı. Kayıtsız öğrenci katılmadı sayılır; katılanları işaretleyin. Yalnız değiştirdiğiniz satırlar kaydedilir.'
                  : '1. etüt ve 2. etüt ayrı. Kayıt, açık etütteki her öğrencinin kendi sınıf dersine yazılır. Yalnız değiştirdiğiniz satırlar kaydedilir.'}
              </p>
            </div>
            <button type="button" className="shrink-0 text-sm text-slate-500 hover:text-slate-800" onClick={kapat}>
              Kapat
            </button>
          </AppModalHeader>
          <AppModalBody className="max-h-[min(70dvh,640px)] space-y-3 overflow-y-auto">
            {yukleniyor ? (
              <p className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Liste hazırlanıyor…
              </p>
            ) : (
              <>
                {bilgi ? (
                  <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-950">{bilgi}</p>
                ) : null}
                {hata ? (
                  <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{hata}</p>
                ) : null}
                {satirlar.length ? (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {dilimler.map((d) => (
                        <button
                          key={d.sira}
                          type="button"
                          onClick={() => {
                            setSeciliDilim(d.sira);
                            setSinif('');
                          }}
                          className={`min-h-[36px] rounded-lg border px-3 text-xs font-semibold ${
                            seciliDilim === d.sira
                              ? 'border-indigo-600 bg-indigo-600 text-white'
                              : 'border-slate-200 bg-white text-slate-700'
                          }`}
                        >
                          {d.sira}. {Ad} · {d.baslangic}–{d.bitis}
                        </button>
                      ))}
                    </div>
                    <select
                      value={sinif}
                      onChange={(e) => setSinif(e.target.value)}
                      aria-label="Sınıf süz"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    >
                      <option value="">Tüm sınıflar</option>
                      {siniflar.map((ad) => (
                        <option key={ad} value={ad}>
                          {ad}
                        </option>
                      ))}
                    </select>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 sm:grid-cols-5">
                      <span>{ozet.total} öğrenci</span>
                      <span>{ozet.present} katıldı</span>
                      <span>{ozet.late} geç</span>
                      <span>{ozet.absent} katılmadı</span>
                      <span>{ozet.excused} izinli</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => tumunu('present')}
                        className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-800"
                      >
                        Tümünü katıldı
                      </button>
                      <button
                        type="button"
                        onClick={() => tumunu('absent')}
                        className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-800"
                      >
                        Tümünü katılmadı
                      </button>
                    </div>
                    <input
                      value={arama}
                      onChange={(e) => setArama(e.target.value)}
                      placeholder="Öğrenci veya sınıf ara"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                    {gorunen.map((row) => (
                      <div
                        key={`${row.session_id}:${row.student_id}`}
                        className="space-y-2 rounded-xl border border-slate-100 px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-800">{row.student_name}</p>
                          <p className="text-[11px] text-slate-500">
                            {row.className} · {row.saat}
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                          {(
                            [
                              { v: 'present' as const, label: 'Katıldı', active: 'bg-emerald-600 text-white border-emerald-600' },
                              { v: 'absent' as const, label: 'Katılmadı', active: 'bg-rose-600 text-white border-rose-600' },
                              { v: 'late' as const, label: 'Geç', active: 'bg-amber-600 text-white border-amber-600' },
                              { v: 'excused' as const, label: 'İzinli', active: 'bg-violet-600 text-white border-violet-600' }
                            ] as const
                          ).map((opt) => (
                            <button
                              key={opt.v}
                              type="button"
                              onClick={() => durumSec(row.session_id, row.student_id, opt.v)}
                              className={`min-h-[40px] rounded-lg border px-1 text-[11px] font-semibold ${
                                row.status === opt.v ? opt.active : 'border-slate-200 bg-white text-slate-700'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                        {row.status === 'present' || row.status === 'late' ? (
                          <div className="grid grid-cols-2 gap-1.5">
                            <button
                              type="button"
                              onClick={() => kameraSec(row.session_id, row.student_id, 'on')}
                              className={`min-h-[36px] rounded-lg border px-2 text-[11px] font-semibold ${
                                row.camera_status === 'on'
                                  ? 'border-sky-600 bg-sky-600 text-white'
                                  : 'border-slate-200 bg-white text-slate-700'
                              }`}
                            >
                              Kamera açık
                            </button>
                            <button
                              type="button"
                              onClick={() => kameraSec(row.session_id, row.student_id, 'off')}
                              className={`min-h-[36px] rounded-lg border px-2 text-[11px] font-semibold ${
                                row.camera_status === 'off'
                                  ? 'border-slate-700 bg-slate-700 text-white'
                                  : 'border-slate-200 bg-white text-slate-700'
                              }`}
                            >
                              Kamera kapalı
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </>
                ) : null}
              </>
            )}
          </AppModalBody>
          <AppModalFooter className="gap-2">
            <button
              type="button"
              className="min-h-[44px] flex-1 rounded-lg border border-slate-200 text-sm font-medium"
              onClick={kapat}
            >
              İptal
            </button>
            <button
              type="button"
              disabled={yukleniyor || kaydediyor || kaydedilecek.length === 0}
              className="min-h-[44px] flex-1 rounded-lg bg-amber-600 text-sm font-semibold text-white disabled:opacity-50"
              onClick={() => void kaydet()}
            >
              {kaydediyor ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </AppModalFooter>
        </AppModal>
      ) : null}
    </>
  );
}
