import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/session';
import { useApp } from '../context/AppContext';

type ExamRow = {
  id: string;
  level: string;
  publisher: string;
  exam_no: string | null;
  difficulty: string | null;
  exam_date: string;
  content: string | null;
  source: string | null;
  /** Yonetici isareti; null ise isaretlenmemis demektir */
  status?: 'yapildi' | 'yapilmadi' | 'planlandi' | null;
  /** Sunucunun hesapladigi etkin durum — kural tek yerde dursun diye */
  etkin_durum?: 'yapildi' | 'yapilmadi' | 'planlandi';
  durum_elle?: boolean;
};

type Durum = 'yapildi' | 'yapilmadi' | 'planlandi';

/**
 * Tarihi gecen sinav KENDILIGINDEN "yapildi" sayilmaz. Takvim satiri ile
 * gercek sinav sonuclari arasinda veritabani bagi yok; gerceklesme
 * yalnizca yoneticinin isaretlemesiyle belirlenir. Sunucu etkin_durum
 * donduruyor, burasi yalnizca o deger gelmezse ayni kurali uygular.
 */
function etkinDurumOf(r: ExamRow, bugun: string): Durum {
  if (r.etkin_durum) return r.etkin_durum;
  if (r.status === 'yapildi' || r.status === 'yapilmadi' || r.status === 'planlandi') return r.status;
  return r.exam_date >= bugun ? 'planlandi' : 'yapilmadi';
}

const DURUM_ETIKET: Record<Durum, string> = {
  yapildi: 'Yapıldı',
  yapilmadi: 'Yapılmadı',
  planlandi: 'Planlandı'
};

const DURUM_ROZET: Record<Durum, string> = {
  yapildi: 'bg-emerald-100 text-emerald-800',
  yapilmadi: 'bg-orange-100 text-orange-800',
  planlandi: 'bg-sky-100 text-sky-800'
};

const DURUM_NOKTA: Record<Durum, string> = {
  yapildi: '🟢',
  yapilmadi: '🟠',
  planlandi: '🔵'
};

type Payload = {
  data: ExamRow[];
  bugun?: string;
  scope: 'student' | 'staff';
  level: string | null;
  class_level?: string | null;
  can_edit?: boolean;
};

/** Sunucudaki EXAM_CALENDAR_LEVELS ile aynı sıra ve kimlikler */
const LEVELS: Array<{ id: string; label: string; badge: string; border: string }> = [
  { id: '3', label: '3. Sınıf', badge: 'bg-teal-50 text-teal-800', border: 'border-l-teal-600' },
  { id: '4', label: '4. Sınıf', badge: 'bg-teal-50 text-teal-800', border: 'border-l-teal-600' },
  { id: '5', label: '5. Sınıf', badge: 'bg-emerald-50 text-emerald-800', border: 'border-l-emerald-600' },
  { id: '6', label: '6. Sınıf', badge: 'bg-emerald-50 text-emerald-800', border: 'border-l-emerald-600' },
  { id: '7', label: '7. Sınıf', badge: 'bg-emerald-50 text-emerald-800', border: 'border-l-emerald-600' },
  { id: 'lgs', label: 'LGS (8. Sınıf)', badge: 'bg-rose-50 text-rose-800', border: 'border-l-rose-600' },
  { id: '9', label: '9. Sınıf', badge: 'bg-sky-50 text-sky-800', border: 'border-l-sky-600' },
  { id: '10', label: '10. Sınıf', badge: 'bg-orange-50 text-orange-800', border: 'border-l-orange-600' },
  { id: '11', label: '11. Sınıf', badge: 'bg-purple-50 text-purple-800', border: 'border-l-purple-700' },
  { id: 'yks', label: 'YKS (12 / Mezun)', badge: 'bg-amber-50 text-amber-900', border: 'border-l-amber-600' }
];

const DIFFICULTY_STYLE: Record<string, string> = {
  KOLAY: 'bg-emerald-50 text-emerald-700',
  'TADINDA KOLAY': 'bg-emerald-50 text-emerald-700',
  ORTA: 'bg-amber-50 text-amber-800',
  ZOR: 'bg-rose-50 text-rose-700'
};

function levelMeta(id: string) {
  return LEVELS.find((l) => l.id === id) || LEVELS[0];
}

function todayYmd() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
}

function fmtDate(ymd: string) {
  const d = new Date(`${ymd}T12:00:00`);
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });
}

function daysUntil(ymd: string) {
  const a = new Date(`${todayYmd()}T12:00:00`).getTime();
  const b = new Date(`${ymd}T12:00:00`).getTime();
  return Math.round((b - a) / 86400000);
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message || json?.error || 'İşlem başarısız');
  return json as T;
}

const EMPTY_EDIT = { id: '', level: '9', publisher: '', exam_no: '', difficulty: 'ORTA', exam_date: '', content: '' };

/** Deneme sınav takvimi — öğrenci yalnız kendi sınıfı; personel tüm sınıflar; süper admin düzenler. */
export default function ExamCalendarPage() {
  // Takvim kurum bazlı: açık olan kurumun takvimi gösterilir
  const { institution } = useApp();
  const institutionId = String(institution?.id || '').trim();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [level, setLevel] = useState('9');
  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [edit, setEdit] = useState<typeof EMPTY_EDIT | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = institutionId ? `?institution_id=${encodeURIComponent(institutionId)}` : '';
      setPayload(await api<Payload>(`/api/exam-calendar${qs}`));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Takvim yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [institutionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const [durumFiltre, setDurumFiltre] = useState<Durum | ''>('');
  const [tarihBas, setTarihBas] = useState('');
  const [tarihBit, setTarihBit] = useState('');
  const [durumBusy, setDurumBusy] = useState<string | null>(null);

  const isStudent = payload?.scope === 'student';
  const activeLevel = isStudent ? payload?.level || '' : level;
  const today = todayYmd();

  const bugun = payload?.bugun || today;

  /**
   * Sinif + arama + zorluk suzmesi. Tarih suzmesi YOK: gecmis sinavlar
   * listede kalir. Onceki surum listeyi "yaklasan" ve kapali duran
   * "gecmis" akordeonuna boluyordu; tarihi gecen sinav gozden kayboluyordu.
   */
  const temelListe = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr');
    return (payload?.data || [])
      .filter((r) => r.level === activeLevel)
      .filter((r) => !difficulty || (r.difficulty || '') === difficulty)
      .filter((r) => !q || `${r.publisher} ${r.content || ''}`.toLocaleLowerCase('tr').includes(q));
  }, [payload, activeLevel, difficulty, search]);

  const durumSayac = useMemo(() => {
    const c: Record<Durum, number> = { yapildi: 0, yapilmadi: 0, planlandi: 0 };
    for (const r of temelListe) c[etkinDurumOf(r, bugun)] += 1;
    return c;
  }, [temelListe, bugun]);

  /** Durum ve tarih araligi filtreleri — hicbir kaydi silmez, yalniz secer */
  const gorunenler = useMemo(() => {
    const liste = temelListe.filter((r) => {
      if (durumFiltre && etkinDurumOf(r, bugun) !== durumFiltre) return false;
      if (tarihBas && r.exam_date < tarihBas) return false;
      if (tarihBit && r.exam_date > tarihBit) return false;
      return true;
    });
    // Yaklasanlar once, sonra gecmisler yeniden eskiye
    const ileri = liste.filter((r) => r.exam_date >= bugun);
    const geri = liste.filter((r) => r.exam_date < bugun).reverse();
    return [...ileri, ...geri];
  }, [temelListe, durumFiltre, tarihBas, tarihBit, bugun]);

  const filtreAktif = Boolean(durumFiltre || tarihBas || tarihBit);

  const difficulties = useMemo(
    () => [...new Set((payload?.data || []).map((r) => r.difficulty).filter(Boolean) as string[])].sort(),
    [payload]
  );

  /**
   * Sinavin gerceklesme durumunu elle isaretler.
   * Yalniz status alanini gonderir; sinavin diger alanlarina, sonuclara
   * ve ogrenci analizlerine dokunmaz. Bos deger isareti kaldirir.
   */
  const durumAta = async (r: ExamRow, yeni: Durum | '') => {
    setDurumBusy(r.id);
    try {
      await api('/api/exam-calendar', {
        method: 'PATCH',
        body: JSON.stringify({ id: r.id, status: yeni || null })
      });
      await load();
      toast.success(yeni ? `"${r.publisher}" → ${DURUM_ETIKET[yeni]}` : 'İşaret kaldırıldı');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Durum güncellenemedi');
    } finally {
      setDurumBusy(null);
    }
  };

  const save = async () => {
    if (!edit) return;
    if (!edit.publisher.trim() || !edit.exam_date) {
      toast.error('Yayınevi ve tarih zorunlu');
      return;
    }
    setSaving(true);
    try {
      await api('/api/exam-calendar', {
        method: edit.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...edit,
          institution_id: institutionId || undefined,
          source: institution?.name || undefined
        })
      });
      toast.success(edit.id ? 'Sınav güncellendi' : 'Sınav eklendi');
      setEdit(null);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r: ExamRow) => {
    if (!window.confirm(`${r.publisher} (${fmtDate(r.exam_date)}) silinsin mi?`)) return;
    try {
      const instQs = institutionId ? `&institution_id=${encodeURIComponent(institutionId)}` : '';
      await api(`/api/exam-calendar?id=${encodeURIComponent(r.id)}${instQs}`, { method: 'DELETE' });
      toast.success('Silindi');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Silinemedi');
    }
  };

  const renderCard = (r: ExamRow, isNext: boolean, isPast: boolean) => {
    const meta = levelMeta(r.level);
    const d = daysUntil(r.exam_date);
    const durum = etkinDurumOf(r, bugun);
    return (
      <div
        key={r.id}
        className={`rounded-xl border border-slate-200 border-l-4 ${meta.border} bg-white p-4 shadow-sm ${
          isNext ? 'ring-2 ring-indigo-400' : ''
        } ${isPast ? 'opacity-60' : ''}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-slate-900">{r.publisher}</p>
            <p className="text-xs text-slate-500">Deneme #{r.exam_no || '-'}</p>
            <span
              className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${DURUM_ROZET[durum]}`}
              data-test="sinav-durum-rozeti"
              title={r.durum_elle ? 'Yönetici işaretledi' : 'Tarihe göre otomatik'}
            >
              {DURUM_NOKTA[durum]} {DURUM_ETIKET[durum]}
              {r.durum_elle ? '' : ' (otomatik)'}
            </span>
          </div>
          {r.difficulty ? (
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${DIFFICULTY_STYLE[r.difficulty] || 'bg-slate-100 text-slate-700'}`}>
              {r.difficulty}
            </span>
          ) : null}
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-slate-800">
          <CalendarDays className="h-4 w-4 text-indigo-600" />
          {fmtDate(r.exam_date)}
          {!isPast ? (
            <span className="ml-auto rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-semibold text-indigo-700">
              {d === 0 ? 'Bugün' : d === 1 ? 'Yarın' : `${d} gün`}
            </span>
          ) : null}
        </p>
        {r.content ? <p className="mt-2 text-xs leading-relaxed text-slate-600">{r.content}</p> : null}
        {payload?.can_edit ? (
          <div className="mt-3 border-t border-slate-100 pt-2">
            <label className="mb-2 flex items-center gap-1.5 text-[11px] text-slate-500">
              Durum
              <select
                value={r.status || ''}
                disabled={durumBusy === r.id}
                onChange={(e) => void durumAta(r, e.target.value as Durum | '')}
                className="rounded border border-slate-200 px-1.5 py-1 text-[11px] disabled:opacity-50"
                data-test="sinav-durum-secici"
              >
                <option value="">Otomatik (tarihe göre)</option>
                <option value="yapildi">🟢 Yapıldı</option>
                <option value="yapilmadi">🟠 Yapılmadı</option>
                <option value="planlandi">🔵 Planlandı</option>
              </select>
            </label>
            <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                setEdit({
                  id: r.id,
                  level: r.level,
                  publisher: r.publisher,
                  exam_no: r.exam_no || '',
                  difficulty: r.difficulty || '',
                  exam_date: r.exam_date,
                  content: r.content || ''
                })
              }
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50"
            >
              <Pencil className="h-3.5 w-3.5" /> Düzenle
            </button>
            <button
              type="button"
              onClick={() => void remove(r)}
              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
            >
              <Trash2 className="h-3.5 w-3.5" /> Sil
            </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-sky-600 p-5 text-white shadow">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <CalendarDays className="h-6 w-6" /> Deneme Sınav Takvimi
        </h1>
        <p className="mt-1 text-sm text-indigo-100">
          {isStudent
            ? payload?.level
              ? `${levelMeta(payload.level).label} deneme sınavlarınız`
              : 'Sınıfınız için tanımlı deneme takvimi yok.'
            : 'Online VIP Dershane 2026–2027 deneme programı'}
        </p>
      </div>

      {!isStudent ? (
        <div className="flex flex-wrap gap-2">
          {LEVELS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setLevel(l.id)}
              className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                level === l.id ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {l.label}
              <span className="ml-1.5 text-xs opacity-75">{(payload?.data || []).filter((r) => r.level === l.id).length}</span>
            </button>
          ))}
          {payload?.can_edit ? (
            <button
              type="button"
              onClick={() => setEdit({ ...EMPTY_EDIT, level })}
              className="ml-auto inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              <Plus className="h-4 w-4" /> Sınav ekle
            </button>
          ) : null}
        </div>
      ) : null}

      {activeLevel ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Yayınevi veya konu ara…"
              className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-3 text-sm"
            />
          </div>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-2 text-sm"
          >
            <option value="">Tüm zorluklar</option>
            {difficulties.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-xs text-slate-500">
            Başlangıç
            <input
              type="date"
              value={tarihBas}
              onChange={(e) => setTarihBas(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              data-test="sinav-tarih-bas"
            />
          </label>
          <label className="flex items-center gap-1 text-xs text-slate-500">
            Bitiş
            <input
              type="date"
              value={tarihBit}
              onChange={(e) => setTarihBit(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              data-test="sinav-tarih-bit"
            />
          </label>
          {filtreAktif ? (
            <button
              type="button"
              onClick={() => {
                setDurumFiltre('');
                setTarihBas('');
                setTarihBit('');
              }}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
            >
              Filtreleri temizle
            </button>
          ) : null}
        </div>
      ) : null}

      {activeLevel ? (
        <div className="flex flex-wrap gap-2" data-test="sinav-durum-filtreleri">
          {([
            ['', 'Tüm sınavlar', temelListe.length],
            ['yapildi', '🟢 Yapılanlar', durumSayac.yapildi],
            ['yapilmadi', '🟠 Yapılmayanlar', durumSayac.yapilmadi],
            ['planlandi', '🔵 Planlananlar', durumSayac.planlandi]
          ] as [Durum | '', string, number][]).map(([id, ad, adet]) => (
            <button
              key={id || 'tumu'}
              type="button"
              onClick={() => setDurumFiltre(id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                durumFiltre === id
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {ad} <span className="opacity-75">({adet})</span>
            </button>
          ))}
        </div>
      ) : null}

      {loading && !payload ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
        </p>
      ) : !activeLevel ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
          Bu takvim 9, 10, 11. sınıf ve YKS öğrencileri içindir.
          {payload?.class_level ? ` Kayıtlı sınıfınız: ${payload.class_level}.` : ''} Sınıfınız yanlışsa koçunuza bildirin.
        </div>
      ) : (
        <>
          <div>
            <h2 className="mb-2 text-sm font-semibold text-slate-700">
              Sınavlar{' '}
              <span className="font-normal text-slate-500" data-test="sinav-sayaci">
                ({filtreAktif ? `${gorunenler.length} / ${temelListe.length}` : temelListe.length})
              </span>
            </h2>
            {gorunenler.length === 0 ? (
              <p className="text-sm text-slate-500">
                {temelListe.length === 0 ? 'Bu sınıfta sınav yok.' : 'Bu filtrelere uyan sınav yok.'}
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-test="sinav-listesi">
                {gorunenler.map((r) => {
                  const gecmis = r.exam_date < bugun;
                  const ilkYaklasan = !gecmis && r.id === gorunenler.find((x) => x.exam_date >= bugun)?.id;
                  return renderCard(r, Boolean(ilkYaklasan), gecmis);
                })}
              </div>
            )}
          </div>
        </>
      )}

      {edit ? (
        <div className="fixed inset-0 z-[300] flex items-end justify-center bg-black/40 p-3 sm:items-center">
          <div className="w-full max-w-lg space-y-3 rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">{edit.id ? 'Sınavı düzenle' : 'Sınav ekle'}</h3>
              <button type="button" onClick={() => setEdit(null)} className="rounded p-1 hover:bg-slate-100" aria-label="Kapat">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-slate-600">
                Sınıf
                <select
                  value={edit.level}
                  onChange={(e) => setEdit({ ...edit, level: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                >
                  {LEVELS.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-600">
                Tarih
                <input
                  type="date"
                  value={edit.exam_date}
                  onChange={(e) => setEdit({ ...edit, exam_date: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                />
              </label>
              <label className="col-span-2 text-xs text-slate-600">
                Yayınevi
                <input
                  value={edit.publisher}
                  onChange={(e) => setEdit({ ...edit, publisher: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                />
              </label>
              <label className="text-xs text-slate-600">
                Deneme no
                <input
                  value={edit.exam_no}
                  onChange={(e) => setEdit({ ...edit, exam_no: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                />
              </label>
              <label className="text-xs text-slate-600">
                Zorluk
                <select
                  value={edit.difficulty}
                  onChange={(e) => setEdit({ ...edit, difficulty: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                >
                  {['KOLAY', 'TADINDA KOLAY', 'ORTA', 'ZOR'].map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <label className="col-span-2 text-xs text-slate-600">
                Kapsam / açıklama
                <textarea
                  value={edit.content}
                  onChange={(e) => setEdit({ ...edit, content: e.target.value })}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                />
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEdit(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                Vazgeç
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Kaydet
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
