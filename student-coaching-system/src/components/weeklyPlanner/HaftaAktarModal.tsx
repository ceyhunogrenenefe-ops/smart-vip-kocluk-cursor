import { useCallback, useEffect, useMemo, useState } from 'react';
import { addDays, differenceInCalendarDays, format, parseISO, startOfWeek } from 'date-fns';
import { tr } from 'date-fns/locale';
import { AlertTriangle, ArrowRight, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  haftaAktar,
  haftaAktarimOnizle,
  type AktarimKipi,
  type AktarimOnizleme,
} from '../../lib/haftalikPlanAktarApi';
import {
  createCoachWeeklyGoal,
  fetchCoachWeeklyGoals,
  type CoachWeeklyGoalRow,
} from '../../lib/weeklyPlannerApi';

/** Ne aktarılacak: takvim blokları, sağdaki hedefler ya da ikisi */
type AktarimIcerigi = 'tumu' | 'cizelge' | 'hedefler';

function gunKaydir(ymd: string, gun: number): string {
  return format(addDays(parseISO(`${ymd}T12:00:00`), gun), 'yyyy-MM-dd');
}

/** Hedef bu haftada mı başlıyor? (önceki haftadan taşan uzun hedefler aktarılmaz) */
function haftadaBasliyor(g: CoachWeeklyGoalRow, haftaBasi: string): boolean {
  const son = gunKaydir(haftaBasi, 6);
  const gs = String(g.goal_start_date || '').slice(0, 10);
  if (gs) return gs >= haftaBasi && gs <= son;
  return String(g.week_start_date || '').slice(0, 10) === haftaBasi;
}

function hedefAnahtari(g: CoachWeeklyGoalRow): string {
  return [g.subject, g.title, g.quantity_unit].map((x) => String(x || '').trim().toLocaleLowerCase('tr')).join('|');
}

/**
 * "Planı Haftaya Aktar" — kaynak haftanın görevlerini hedef haftaya kopyalar.
 *
 * Aktarım öncesi mutlaka önizleme yapılır; önizleme sunucudan gelir ve
 * hiçbir kayıt oluşturmaz. Hedef haftada plan varsa kullanıcı üç seçenekten
 * birini açıkça seçmeden hiçbir şey yazılmaz.
 *
 * Tamamlanma durumu, gerçekleşen süreler ve koç değerlendirmeleri yeni
 * haftaya taşınmaz; görevler başlangıç durumunda oluşur (sunucu kuralı).
 */

function haftaEtiketi(haftaBasi: string): string {
  try {
    const b = parseISO(`${haftaBasi}T12:00:00`);
    const s = addDays(b, 6);
    return `${format(b, 'd MMMM', { locale: tr })} – ${format(s, 'd MMMM yyyy', { locale: tr })}`;
  } catch {
    return haftaBasi;
  }
}

function haftaBasiYap(ymd: string): string {
  try {
    return format(startOfWeek(parseISO(`${ymd}T12:00:00`), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  } catch {
    return ymd;
  }
}

export default function HaftaAktarModal({
  studentId,
  studentName,
  kaynakHafta,
  canManageGoals = false,
  onClose,
  onDone,
}: {
  studentId: string;
  studentName?: string;
  /** Koç/yönetici: hedefler de aktarılabilir */
  canManageGoals?: boolean;
  /** Ekranda açık olan hafta (pazartesi) */
  kaynakHafta: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [kaynak, setKaynak] = useState(kaynakHafta);
  const [hedef, setHedef] = useState(() => haftaBasiYap(format(addDays(parseISO(`${kaynakHafta}T12:00:00`), 7), 'yyyy-MM-dd')));
  const [onizleme, setOnizleme] = useState<AktarimOnizleme | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [aktariliyor, setAktariliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [kip, setKip] = useState<AktarimKipi>('birlestir');
  const [icerik, setIcerik] = useState<AktarimIcerigi>(canManageGoals ? 'tumu' : 'cizelge');
  const [kaynakHedefler, setKaynakHedefler] = useState<CoachWeeklyGoalRow[]>([]);
  const [tasanHedefSayisi, setTasanHedefSayisi] = useState(0);
  const [hedefHaftaHedefleri, setHedefHaftaHedefleri] = useState<CoachWeeklyGoalRow[]>([]);
  /** Kaynak haftada takvim bloğu yoksa (yalnız hedef varsa) önizleme hatası gösterilmez */
  const [cizelgeBos, setCizelgeBos] = useState(false);

  const hedefDahil = canManageGoals && icerik !== 'cizelge';
  const cizelgeDahil = icerik !== 'hedefler';

  const onizle = useCallback(async () => {
    if (!studentId || !kaynak || !hedef) return;
    setYukleniyor(true);
    setHata(null);
    setOnizleme(null);
    setCizelgeBos(false);
    try {
      if (canManageGoals) {
        const [kg, hg] = await Promise.all([
          fetchCoachWeeklyGoals(studentId, kaynak).catch(() => [] as CoachWeeklyGoalRow[]),
          fetchCoachWeeklyGoals(studentId, hedef).catch(() => [] as CoachWeeklyGoalRow[]),
        ]);
        const basliyan = kg.filter((g) => haftadaBasliyor(g, kaynak));
        setKaynakHedefler(basliyan);
        setTasanHedefSayisi(kg.length - basliyan.length);
        setHedefHaftaHedefleri(hg);
      }
      try {
        setOnizleme(await haftaAktarimOnizle({ studentId, sourceWeek: kaynak, targetWeek: hedef }));
      } catch (e) {
        const m = e instanceof Error ? e.message : '';
        if (/aktarılacak görev yok/i.test(m)) setCizelgeBos(true);
        else throw e;
      }
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Önizleme alınamadı');
    } finally {
      setYukleniyor(false);
    }
  }, [studentId, kaynak, hedef, canManageGoals]);

  useEffect(() => {
    void onizle();
  }, [onizle]);

  const hedefDolu = (onizleme?.target_existing_count ?? 0) > 0;

  const gunlereGore = useMemo(() => {
    const harita = new Map<string, AktarimOnizleme['preview']>();
    for (const g of onizleme?.preview || []) {
      if (!harita.has(g.planner_date)) harita.set(g.planner_date, []);
      harita.get(g.planner_date)!.push(g);
    }
    return [...harita.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [onizleme]);

  /** Hedef haftada aynı ders + başlık + birimle zaten olan hedefler yeniden oluşturulmaz */
  const hedefPlani = useMemo(() => {
    const mevcut = new Map(hedefHaftaHedefleri.map((g) => [hedefAnahtari(g), g.id]));
    const yeni: CoachWeeklyGoalRow[] = [];
    const eslesen: [string, string][] = [];
    for (const g of kaynakHedefler) {
      const var_ = mevcut.get(hedefAnahtari(g));
      if (var_) eslesen.push([g.id, var_]);
      else yeni.push(g);
    }
    return { yeni, eslesen };
  }, [kaynakHedefler, hedefHaftaHedefleri]);

  const hedefleriKopyala = async (): Promise<{ harita: Record<string, string>; olusan: number }> => {
    const kayma = differenceInCalendarDays(parseISO(`${hedef}T12:00:00`), parseISO(`${kaynak}T12:00:00`));
    const harita: Record<string, string> = Object.fromEntries(hedefPlani.eslesen);
    let olusan = 0;
    for (const g of hedefPlani.yeni) {
      const gs = String(g.goal_start_date || '').slice(0, 10) || kaynak;
      const ge = String(g.goal_end_date || '').slice(0, 10) || gunKaydir(kaynak, 6);
      const yeni = await createCoachWeeklyGoal({
        student_id: studentId,
        subject: g.subject,
        title: g.title,
        target_quantity: Number(g.target_quantity) || 0,
        week_start_date: hedef,
        goal_start_date: gunKaydir(gs, kayma),
        goal_end_date: gunKaydir(ge, kayma),
        quantity_unit: g.quantity_unit,
      });
      harita[g.id] = yeni.id;
      olusan += 1;
    }
    return { harita, olusan };
  };

  const aktar = async () => {
    if (icerik === 'hedefler' || (hedefDahil && (!onizleme || onizleme.copy_count === 0))) {
      // Yalnız hedefler (veya takvimde blok yok)
      setAktariliyor(true);
      try {
        const { olusan } = await hedefleriKopyala();
        toast.success(
          `${olusan} hedef aktarıldı` +
            (hedefPlani.eslesen.length ? ` · ${hedefPlani.eslesen.length} hedef hedef haftada zaten vardı` : '')
        );
        onDone();
        onClose();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Hedefler aktarılamadı');
      } finally {
        setAktariliyor(false);
      }
      return;
    }
    if (!onizleme) return;
    const secilenKip: AktarimKipi = hedefDolu ? kip : 'birlestir';
    if (secilenKip === 'degistir') {
      const onay = window.confirm(
        `Hedef haftadaki ${onizleme.target_existing_count} görev SİLİNECEK ve yerine ` +
          `${onizleme.copy_count} görev yazılacak. Devam edilsin mi?`
      );
      if (!onay) return;
    }
    setAktariliyor(true);
    try {
      let goalIdMap: Record<string, string> | undefined;
      let hedefSayisi = 0;
      if (hedefDahil) {
        const { harita, olusan } = await hedefleriKopyala();
        goalIdMap = harita;
        hedefSayisi = olusan;
      }
      const r = await haftaAktar({ studentId, sourceWeek: kaynak, targetWeek: hedef, mode: secilenKip, goalIdMap });
      toast.success(
        (hedefDahil ? `${hedefSayisi} hedef · ` : '') +
        `${r.inserted} görev aktarıldı` +
          (r.deleted ? ` · ${r.deleted} görev değiştirildi` : '') +
          (secilenKip === 'birlestir' && onizleme.conflict_count
            ? ` · ${onizleme.conflict_count} çakışan görev korundu`
            : '')
      );
      onDone();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Aktarım başarısız');
    } finally {
      setAktariliyor(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-start justify-center overflow-y-auto bg-black/50 p-3 py-8 backdrop-blur-sm"
      role="presentation"
      onClick={() => !aktariliyor && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hafta-aktar-baslik"
        className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-600 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
        data-test="hafta-aktar-modal"
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h2 id="hafta-aktar-baslik" className="text-lg font-bold text-slate-900 dark:text-white">
              Planı haftaya aktar
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {studentName ? `${studentName} · ` : ''}Yalnızca bu öğrencinin planı aktarılır
              {canManageGoals ? ' (hedefler ve/veya takvim).' : '.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={aktariliyor}
            className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Kapat"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            Kaynak hafta
            <input
              type="date"
              value={kaynak}
              onChange={(e) => setKaynak(haftaBasiYap(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-950"
              data-test="aktar-kaynak"
            />
            <span className="mt-0.5 block font-normal text-slate-500">{haftaEtiketi(kaynak)}</span>
          </label>
          <div className="flex items-center justify-center pt-5 text-slate-400">
            <ArrowRight className="h-5 w-5" />
          </div>
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            Hedef hafta
            <input
              type="date"
              value={hedef}
              onChange={(e) => setHedef(haftaBasiYap(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-950"
              data-test="aktar-hedef"
            />
            <span className="mt-0.5 block font-normal text-slate-500">{haftaEtiketi(hedef)}</span>
          </label>
        </div>

        {canManageGoals ? (
          <div className="mt-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700" data-test="aktar-icerik">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Ne aktarılsın?</p>
            <div className="mt-1.5 grid gap-1.5 sm:grid-cols-3">
              {(
                [
                  ['tumu', 'Tümü', 'Hedefler + takvim çizelgesi'],
                  ['hedefler', 'Yalnızca hedefler', 'Sağdaki soru/sayfa/süre hedefleri'],
                  ['cizelge', 'Yalnızca takvim', 'Takvimdeki çalışma blokları'],
                ] as [AktarimIcerigi, string, string][]
              ).map(([id, ad, aciklama]) => (
                <label
                  key={id}
                  className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 text-xs ${
                    icerik === id
                      ? 'border-indigo-400 bg-indigo-50 dark:border-indigo-500 dark:bg-indigo-950/40'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="aktarim-icerik"
                    checked={icerik === id}
                    onChange={() => setIcerik(id)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block font-semibold text-slate-800 dark:text-slate-100">{ad}</span>
                    <span className="text-slate-500">{aciklama}</span>
                  </span>
                </label>
              ))}
            </div>
            {hedefDahil && !yukleniyor ? (
              <p className="mt-2 text-[11px] text-slate-600 dark:text-slate-300">
                Aktarılacak hedef: <strong>{hedefPlani.yeni.length}</strong>
                {hedefPlani.eslesen.length
                  ? ` · ${hedefPlani.eslesen.length} hedef hedef haftada zaten var (yeniden oluşturulmaz)`
                  : ''}
                {tasanHedefSayisi
                  ? ` · önceki haftadan devam eden ${tasanHedefSayisi} uzun hedef aktarılmaz`
                  : ''}
                . Hedefler tarihleriyle birlikte kaydırılır; takvim blokları yeni hedeflere bağlanır.
              </p>
            ) : null}
          </div>
        ) : null}

        {cizelgeBos && cizelgeDahil ? (
          <p className="mt-3 rounded-lg bg-slate-50 p-2 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
            Kaynak haftanın takviminde blok yok{hedefDahil ? '; yalnızca hedefler aktarılır.' : '.'}
          </p>
        ) : null}

        {hata ? (
          <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {hata}
          </p>
        ) : null}

        {yukleniyor ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Önizleme hazırlanıyor…
          </p>
        ) : null}

        {onizleme && cizelgeDahil ? (
          <>
            <div className="mt-4 grid gap-2 sm:grid-cols-3" data-test="aktar-ozet">
              <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800/60">
                <p className="text-[11px] font-semibold text-slate-500">Aktarılacak görev</p>
                <p className="text-xl font-bold text-slate-900 dark:text-white">{onizleme.copy_count}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800/60">
                <p className="text-[11px] font-semibold text-slate-500">Hedef haftada mevcut</p>
                <p className="text-xl font-bold text-slate-900 dark:text-white">
                  {onizleme.target_existing_count}
                </p>
              </div>
              <div
                className={`rounded-xl p-2.5 ${
                  onizleme.conflict_count > 0
                    ? 'bg-amber-50 dark:bg-amber-950/30'
                    : 'bg-slate-50 dark:bg-slate-800/60'
                }`}
              >
                <p className="text-[11px] font-semibold text-slate-500">Saat çakışması</p>
                <p className="text-xl font-bold text-slate-900 dark:text-white">
                  {onizleme.conflict_count}
                </p>
              </div>
            </div>

            <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
              Tamamlanma durumu, gerçekleşen süreler ve koç değerlendirmeleri aktarılmaz; görevler
              yeni haftada başlangıç durumunda oluşur. Kaynak hafta değişmez.
            </p>

            {hedefDolu ? (
              <div
                className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30"
                data-test="aktar-kip-secimi"
              >
                <p className="flex items-center gap-1.5 text-sm font-bold text-amber-900 dark:text-amber-200">
                  <AlertTriangle className="h-4 w-4" />
                  Hedef haftada zaten {onizleme.target_existing_count} görev var
                </p>
                <div className="mt-2 space-y-1.5 text-xs text-amber-950 dark:text-amber-100">
                  {(
                    [
                      ['birlestir', `Mevcut planla birleştir — çakışmayan ${onizleme.mergeable_count} görev eklenir, çakışanlar korunur`],
                      ['degistir', `Mevcut planı değiştir — hedef haftadaki ${onizleme.target_existing_count} görev silinir`],
                      ['iptal', 'Mevcut planı koru — hiçbir şey yapılmaz'],
                    ] as [AktarimKipi, string][]
                  ).map(([id, metin]) => (
                    <label key={id} className="flex cursor-pointer items-start gap-2">
                      <input
                        type="radio"
                        name="aktarim-kipi"
                        checked={kip === id}
                        onChange={() => setKip(id)}
                        className="mt-0.5"
                      />
                      <span>{metin}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-3 max-h-56 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700">
              {gunlereGore.length === 0 ? (
                <p className="p-3 text-sm text-slate-500">Aktarılacak görev yok.</p>
              ) : (
                gunlereGore.map(([gun, gorevler]) => (
                  <div key={gun} className="border-b border-slate-100 p-2 last:border-0 dark:border-slate-700">
                    <p className="text-[11px] font-bold uppercase text-slate-500">
                      {format(parseISO(`${gun}T12:00:00`), 'EEEE d MMMM', { locale: tr })}
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {gorevler.map((g) => (
                        <li key={g.id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="min-w-0 truncate text-slate-800 dark:text-slate-100">
                            {g.start_time}–{g.end_time} · {g.subject || 'Görev'} · {g.title}
                          </span>
                          {g.planned_quantity > 0 ? (
                            <span className="shrink-0 text-slate-500">{g.planned_quantity} soru</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={aktariliyor}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200"
          >
            Vazgeç
          </button>
          <button
            type="button"
            onClick={() => void aktar()}
            disabled={
              aktariliyor ||
              yukleniyor ||
              (icerik === 'hedefler'
                ? hedefPlani.yeni.length === 0
                : hedefDahil
                  ? hedefPlani.yeni.length === 0 && (!onizleme || onizleme.copy_count === 0)
                  : !onizleme || onizleme.copy_count === 0) ||
              (cizelgeDahil && hedefDolu && kip === 'iptal' && (onizleme?.copy_count ?? 0) > 0)
            }
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
            data-test="aktar-onayla"
          >
            {aktariliyor ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Aktar
          </button>
        </div>
      </div>
    </div>
  );
}
