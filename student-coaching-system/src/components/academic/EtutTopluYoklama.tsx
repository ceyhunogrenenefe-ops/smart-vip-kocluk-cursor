import { useMemo, useState } from 'react';
import { ClipboardList, Loader2 } from 'lucide-react';
import { AppModal, AppModalBody, AppModalFooter, AppModalHeader } from '../ui/AppModal';
import { apiFetch } from '../../lib/session';
import { todayYmd } from '../../lib/etutSession';
import { buSaattekiEtutler, type EtutOturum, type EtutSinif } from '../../lib/etutTopluYoklama';
import type { StudyEntryKey } from '../../lib/academicCenterLinks';

type Durum = 'present' | 'absent' | 'late';

type Satir = {
  session_id: string;
  student_id: string;
  student_name: string;
  className: string;
  saat: string;
  status: Durum;
  camera_status: 'on' | 'off' | null;
};

function durumYap(st: string): Durum {
  if (st === 'absent') return 'absent';
  if (st === 'late') return 'late';
  return 'present';
}

function kameraYap(status: Durum, raw: string): 'on' | 'off' | null {
  if (status === 'absent') return null;
  if (raw === 'off' || raw === 'closed') return 'off';
  return 'on';
}

export function EtutTopluYoklama({
  room,
  label,
  institutionId
}: {
  room: StudyEntryKey;
  label: string;
  institutionId?: string | null;
}) {
  const [acik, setAcik] = useState(false);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [kaydediyor, setKaydediyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [bilgi, setBilgi] = useState<string | null>(null);
  const [satirlar, setSatirlar] = useState<Satir[]>([]);
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
        setHata('Sınıf veya etüt listesi alınamadı.');
        return;
      }
      const siniflar = (Array.isArray(sinifJson.data) ? sinifJson.data : []) as EtutSinif[];
      const oturumlar = (Array.isArray(oturumJson.data) ? oturumJson.data : []) as EtutOturum[];
      const simdi = new Date();
      const secilen = buSaattekiEtutler({
        room,
        sessions: oturumlar,
        classes: siniflar,
        today,
        nowMinutes: simdi.getHours() * 60 + simdi.getMinutes()
      });
      if (!secilen.length) {
        setBilgi('Bu saatte bu etüt grubunda canlı ders yok. Yoklama, o saatte etüdü olan sınıfların listesinden gelir.');
        return;
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
              const status = durumYap(durum.get(id) || '');
              return {
                session_id: oturum.id,
                student_id: id,
                student_name: String(row.student_name || '').trim() || 'Öğrenci',
                className: oturum.className,
                saat,
                status,
                camera_status: kameraYap(status, kamera.get(id) || '')
              } satisfies Satir;
            })
            .filter((row: Satir | null): row is Satir => Boolean(row));
        })
      );
      const liste = parcalar.flat().sort((a, b) => a.student_name.localeCompare(b.student_name, 'tr'));
      setSatirlar(liste);
      const gruplar = [...new Set(secilen.map((s) => `${s.className} ${String(s.start_time).slice(0, 5)}`))];
      setBilgi(gruplar.length ? gruplar.join(' · ') : null);
      if (!liste.length) {
        setBilgi('Bu saatteki etütlerde yoklama listesinde öğrenci yok.');
      }
    } catch {
      setHata('Yoklama listesi açılamadı.');
    } finally {
      setYukleniyor(false);
    }
  };

  const gorunen = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase('tr-TR');
    if (!q) return satirlar;
    return satirlar.filter((s) => `${s.student_name} ${s.className}`.toLocaleLowerCase('tr-TR').includes(q));
  }, [arama, satirlar]);

  const ozet = useMemo(() => {
    let present = 0;
    let late = 0;
    let absent = 0;
    for (const s of satirlar) {
      if (s.status === 'present') present += 1;
      else if (s.status === 'late') late += 1;
      else absent += 1;
    }
    return { total: satirlar.length, present, late, absent };
  }, [satirlar]);

  const durumSec = (sessionId: string, studentId: string, status: Durum) => {
    setSatirlar((prev) =>
      prev.map((s) =>
        s.session_id === sessionId && s.student_id === studentId
          ? {
              ...s,
              status,
              camera_status: status === 'absent' ? null : s.camera_status === 'off' ? 'off' : 'on'
            }
          : s
      )
    );
  };

  const kameraSec = (sessionId: string, studentId: string, camera: 'on' | 'off') => {
    setSatirlar((prev) =>
      prev.map((s) =>
        s.session_id === sessionId && s.student_id === studentId ? { ...s, camera_status: camera } : s
      )
    );
  };

  const tumunu = (status: Durum) => {
    setSatirlar((prev) =>
      prev.map((s) => ({
        ...s,
        status,
        camera_status: status === 'absent' ? null : s.camera_status === 'off' ? 'off' : 'on'
      }))
    );
  };

  const kaydet = async () => {
    if (!satirlar.length) return;
    setKaydediyor(true);
    setHata(null);
    try {
      const gruplar = new Map<string, Satir[]>();
      for (const s of satirlar) {
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
                camera_status: row.status === 'absent' ? 'n_a' : row.camera_status || 'on'
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
        onClick={() => void ac()}
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
                Bu saatteki etütler tek listede. Kayıt, her öğrencinin kendi sınıf dersine yazılır.
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
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 sm:grid-cols-4">
                      <span>{ozet.total} öğrenci</span>
                      <span>{ozet.present} katıldı</span>
                      <span>{ozet.late} geç</span>
                      <span>{ozet.absent} katılmadı</span>
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
                        <div className="grid grid-cols-3 gap-1.5">
                          {(
                            [
                              { v: 'present' as const, label: 'Katıldı', active: 'bg-emerald-600 text-white border-emerald-600' },
                              { v: 'absent' as const, label: 'Katılmadı', active: 'bg-rose-600 text-white border-rose-600' },
                              { v: 'late' as const, label: 'Geç', active: 'bg-amber-600 text-white border-amber-600' }
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
                        {row.status !== 'absent' ? (
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
              disabled={yukleniyor || kaydediyor || satirlar.length === 0}
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
