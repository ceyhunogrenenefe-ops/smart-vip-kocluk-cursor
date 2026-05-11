import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  createParentSignClassPreset,
  createParentSignContract,
  deleteParentSignClassPreset,
  deleteParentSignContract,
  listInstitutionsForPicker,
  listParentSignClassPresets,
  listParentSignContracts,
  listParentSignFillCandidates,
  parseDersSatirlariFromPreset,
  splitAdSoyad,
  suggestHoursAndFeeFromSinif,
  sumDersSatirlari,
  updateParentSignClassPreset,
  type DersSatiri,
  type InstitutionPickRow,
  type ParentSignClassPresetRow,
  type ParentSignContractRow,
  type SozlesmeTuruKey,
  type StudentFillRow,
  type UserStudentFillRow
} from '../lib/parentSignApi';
import {
  Copy,
  Loader2,
  Link2,
  CheckCircle2,
  Clock,
  FileSignature,
  Trash2,
  Pencil,
  Plus,
  Sparkles
} from 'lucide-react';

function todayPlus(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function uniquePrograms(presets: ParentSignClassPresetRow[]): string[] {
  const s = new Set<string>();
  for (const p of presets) {
    const n = String(p.program_adi || '').trim();
    if (n) s.add(n);
  }
  return [...s].sort((a, b) => a.localeCompare(b, 'tr'));
}

function turKisaEtiket(t?: string) {
  if (t === 'kullanici_sozlesmesi') return 'Kullanıcı';
  if (t === 'diger') return 'Diğer';
  return 'Satış';
}

function presetDersOzeti(p: ParentSignClassPresetRow): string {
  const rows = parseDersSatirlariFromPreset(p).filter((r) => r.ders_adi.trim());
  if (!rows.length) return '';
  return rows.map((r) => `${r.ders_adi} ${r.haftalik_saat}s`).join(', ');
}

function validDersRows(rows: DersSatiri[]): DersSatiri[] {
  return rows
    .map((r) => ({
      ders_adi: String(r.ders_adi || '').trim().slice(0, 120),
      haftalik_saat: Math.min(40, Math.max(0.25, Number(r.haftalik_saat) || 0))
    }))
    .filter((r) => r.ders_adi.length > 0 && r.haftalik_saat > 0);
}

export default function ParentSignFlowPage() {
  const { effectiveUser } = useAuth();
  const isSuper = effectiveUser?.role === 'super_admin';
  const [rows, setRows] = useState<ParentSignContractRow[]>([]);
  const [presets, setPresets] = useState<ParentSignClassPresetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingPresets, setLoadingPresets] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [institutionId, setInstitutionId] = useState('');
  const [institutionOptions, setInstitutionOptions] = useState<InstitutionPickRow[]>([]);
  const [loadingInstitutions, setLoadingInstitutions] = useState(false);
  const effectiveInstitutionId = useMemo(() => {
    if (isSuper) return institutionId.trim();
    return String(effectiveUser?.institution_id || '').trim();
  }, [isSuper, institutionId, effectiveUser?.institution_id]);

  const [ogrenciAd, setOgrenciAd] = useState('');
  const [ogrenciSoyad, setOgrenciSoyad] = useState('');
  const [veliAd, setVeliAd] = useState('');
  const [veliSoyad, setVeliSoyad] = useState('');
  const [telefon, setTelefon] = useState('');
  const [adres, setAdres] = useState('');
  const [sinif, setSinif] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [programSource, setProgramSource] = useState<'list' | 'custom'>('custom');
  const [programSelectValue, setProgramSelectValue] = useState('');
  const [programCustom, setProgramCustom] = useState('');
  const [haftalikDersSaati, setHaftalikDersSaati] = useState<number>(6);
  const [ucret, setUcret] = useState<number>(25000);
  const [taksitSayisi, setTaksitSayisi] = useState<number>(1);
  const [baslangic, setBaslangic] = useState(todayPlus(0));
  const [bitis, setBitis] = useState(todayPlus(365));

  const [presetSinif, setPresetSinif] = useState('');
  const [presetProgram, setPresetProgram] = useState('');
  const [presetDersler, setPresetDersler] = useState<DersSatiri[]>([{ ders_adi: '', haftalik_saat: 2 }]);
  const [presetSozlesmeTuru, setPresetSozlesmeTuru] = useState<SozlesmeTuruKey>('satis_sozlesmesi');
  const [presetOzelBaslik, setPresetOzelBaslik] = useState('');
  const [presetEkDetay, setPresetEkDetay] = useState('');
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);

  const [fillStudents, setFillStudents] = useState<StudentFillRow[]>([]);
  const [fillUserStudents, setFillUserStudents] = useState<UserStudentFillRow[]>([]);
  const [loadingFillStudents, setLoadingFillStudents] = useState(false);
  /** '' | s:studentRowId | u:userId */
  const [fillPick, setFillPick] = useState('');
  const [sozlesmeTuru, setSozlesmeTuru] = useState<SozlesmeTuruKey>('satis_sozlesmesi');
  const [sozlesmeBasligiOverride, setSozlesmeBasligiOverride] = useState('');
  const [contractEkSatirlar, setContractEkSatirlar] = useState('');
  /** Veli kaydı: şablondan kopyalanır veya elle düzenlenir; doluysa APIye gönderilir */
  const [contractDersler, setContractDersler] = useState<DersSatiri[]>([]);

  const programs = useMemo(() => uniquePrograms(presets), [presets]);

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

  const loadPresets = useCallback(async () => {
    if (!effectiveInstitutionId) {
      setPresets([]);
      return;
    }
    setLoadingPresets(true);
    try {
      setPresets(await listParentSignClassPresets(effectiveInstitutionId));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Şablonlar yüklenemedi');
      setPresets([]);
    } finally {
      setLoadingPresets(false);
    }
  }, [effectiveInstitutionId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadPresets();
  }, [loadPresets]);

  const loadFillStudents = useCallback(async () => {
    if (!effectiveInstitutionId) {
      setFillStudents([]);
      setFillUserStudents([]);
      return;
    }
    setLoadingFillStudents(true);
    try {
      const pack = await listParentSignFillCandidates(effectiveInstitutionId);
      setFillStudents(pack.students);
      setFillUserStudents(pack.user_students);
    } catch {
      setFillStudents([]);
      setFillUserStudents([]);
    } finally {
      setLoadingFillStudents(false);
    }
  }, [effectiveInstitutionId]);

  useEffect(() => {
    void loadFillStudents();
  }, [loadFillStudents]);

  useEffect(() => {
    setFillPick('');
  }, [effectiveInstitutionId]);

  useEffect(() => {
    const vd = validDersRows(contractDersler);
    if (vd.length) setHaftalikDersSaati(sumDersSatirlari(vd));
  }, [contractDersler]);

  useEffect(() => {
    if (!isSuper) {
      setInstitutionOptions([]);
      return;
    }
    let cancelled = false;
    setLoadingInstitutions(true);
    void listInstitutionsForPicker()
      .then((list) => {
        if (!cancelled) setInstitutionOptions(list);
      })
      .catch(() => {
        if (!cancelled) setInstitutionOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingInstitutions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isSuper]);

  const applyPresetToForm = (p: ParentSignClassPresetRow) => {
    setSinif(p.sinif);
    setProgramSource('list');
    setProgramSelectValue(p.program_adi);
    setProgramCustom('');
    const rows = parseDersSatirlariFromPreset(p);
    setContractDersler(rows.map((r) => ({ ...r })));
    const vd = validDersRows(rows);
    setHaftalikDersSaati(vd.length ? sumDersSatirlari(vd) : Number(p.haftalik_ders_saati) || 0);
    const tur = (p.sozlesme_turu || 'satis_sozlesmesi') as SozlesmeTuruKey;
    setSozlesmeTuru(['kullanici_sozlesmesi', 'satis_sozlesmesi', 'diger'].includes(tur) ? tur : 'satis_sozlesmesi');
    setSozlesmeBasligiOverride('');
  };

  const applySuggestFromSinif = () => {
    const { hours, fee } = suggestHoursAndFeeFromSinif(sinif);
    setHaftalikDersSaati(hours);
    setUcret(fee);
  };

  const resolvedProgramAdi = () => {
    if (programSource === 'custom') return programCustom.trim();
    return programSelectValue.trim();
  };

  const submit = async () => {
    setMsg(null);
    const program_adi = resolvedProgramAdi();
    if (!program_adi) {
      setMsg('Program adı seçin veya yazın.');
      return;
    }
    try {
      const vd = validDersRows(contractDersler);
      const haftalikOut = vd.length ? sumDersSatirlari(vd) : haftalikDersSaati;
      const body = {
        ogrenci_ad: ogrenciAd.trim(),
        ogrenci_soyad: ogrenciSoyad.trim(),
        veli_ad: veliAd.trim(),
        veli_soyad: veliSoyad.trim(),
        telefon: telefon.trim(),
        adres: adres.trim(),
        sinif: sinif.trim(),
        program_adi,
        baslangic_tarihi: baslangic,
        bitis_tarihi: bitis,
        haftalik_ders_saati: haftalikOut,
        ucret,
        taksit_sayisi: taksitSayisi,
        sozlesme_turu: sozlesmeTuru,
        ...(vd.length ? { ders_satirlari: vd } : {}),
        ...(sozlesmeBasligiOverride.trim() ? { sozlesme_basligi: sozlesmeBasligiOverride.trim() } : {}),
        ...(contractEkSatirlar.trim() ? { sablon_ek_detay_snapshot: contractEkSatirlar.trim() } : {}),
        ...(selectedPresetId.trim() ? { preset_id: selectedPresetId.trim() } : {}),
        ...(fillPick.startsWith('s:') ? { student_id: fillPick.slice(2) } : {}),
        ...(fillPick.startsWith('u:') ? { ogrenci_user_id: fillPick.slice(2) } : {}),
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

  const savePreset = async () => {
    setMsg(null);
    if (!effectiveInstitutionId) {
      setMsg(isSuper ? 'Şablon kaydetmek için üstte kurum seçin.' : 'Kurum bilgisi eksik.');
      return;
    }
    const sinifT = presetSinif.trim();
    const progT = presetProgram.trim();
    if (!sinifT || !progT) {
      setMsg('Şablon için sınıf ve program adı zorunlu.');
      return;
    }
    const dersOk = validDersRows(presetDersler);
    if (!dersOk.length) {
      setMsg('En az bir ders satırı girin (ders adı ve haftalık saat > 0).');
      return;
    }
    try {
      const base = {
        sinif: sinifT,
        program_adi: progT,
        ders_satirlari: dersOk,
        sozlesme_turu: presetSozlesmeTuru,
        sozlesme_ozel_baslik: presetOzelBaslik.trim(),
        sablon_ek_detay: presetEkDetay.trim()
      };
      if (editingPresetId) {
        await updateParentSignClassPreset({ id: editingPresetId, ...base });
        setMsg('Şablon güncellendi.');
      } else {
        await createParentSignClassPreset({
          ...base,
          ...(isSuper ? { institution_id: effectiveInstitutionId } : {})
        });
        setMsg('Şablon eklendi.');
      }
      setEditingPresetId(null);
      setPresetSinif('');
      setPresetProgram('');
      setPresetDersler([{ ders_adi: '', haftalik_saat: 2 }]);
      setPresetSozlesmeTuru('satis_sozlesmesi');
      setPresetOzelBaslik('');
      setPresetEkDetay('');
      void loadPresets();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Şablon kaydedilemedi');
    }
  };

  const startEditPreset = (p: ParentSignClassPresetRow) => {
    setEditingPresetId(p.id);
    setPresetSinif(p.sinif);
    setPresetProgram(p.program_adi);
    setPresetDersler(parseDersSatirlariFromPreset(p));
    const tur = (p.sozlesme_turu || 'satis_sozlesmesi') as SozlesmeTuruKey;
    setPresetSozlesmeTuru(['kullanici_sozlesmesi', 'satis_sozlesmesi', 'diger'].includes(tur) ? tur : 'satis_sozlesmesi');
    setPresetOzelBaslik(String(p.sozlesme_ozel_baslik || ''));
    setPresetEkDetay(String(p.sablon_ek_detay || ''));
  };

  const cancelEditPreset = () => {
    setEditingPresetId(null);
    setPresetSinif('');
    setPresetProgram('');
    setPresetDersler([{ ders_adi: '', haftalik_saat: 2 }]);
    setPresetSozlesmeTuru('satis_sozlesmesi');
    setPresetOzelBaslik('');
    setPresetEkDetay('');
  };

  const removeContractRow = async (id: string) => {
    if (!window.confirm('Bu sözleşme kaydını silmek istediğinize emin misiniz?')) return;
    setMsg(null);
    try {
      await deleteParentSignContract(id);
      void load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Silinemedi');
    }
  };

  const removePreset = async (id: string) => {
    if (!window.confirm('Bu şablonu silmek istiyor musunuz?')) return;
    setMsg(null);
    try {
      await deleteParentSignClassPreset(id);
      void loadPresets();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Silinemedi');
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
            Bu ekranın adı: <strong className="text-slate-800 dark:text-slate-200">Veli onayı &amp; e-imza</strong> (menüde
            genelde <strong className="text-slate-800 dark:text-slate-200">/veli-onay</strong> rotası). Sınıf şablonlarını
            aşağıdaki <em>Sınıf &amp; sözleşme şablonları</em> kutusunda tablonun altındaki formdan ekleyip düzenlersiniz;
            yeni veli kaydında üstteki şablondan seçim yapılır. Şablonda <strong>sözleşme türü</strong> (satış / kullanıcı /
            diğer) ve <strong>ek metin</strong> tanımlanır; kayıtta kurumdaki <strong>öğrenci kartı</strong>ndan otomatik
            doldurma yapılabilir ve sözleşme satırında saklanır.
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-500 mt-2 max-w-2xl border-l-2 border-blue-200 pl-3">
            <strong>Kurum</strong> seçimi yalnızca süper yönetici için görünür; liste veritabanındaki kayıtlardan gelir.
            Koç / admin kullanıcılarında kurum hesaba zaten bağlıdır, ek seçim gerekmez.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 mt-8 space-y-8">
        {msg ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            {msg}
          </div>
        ) : null}

        {isSuper ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <label className="text-sm font-semibold text-slate-800 dark:text-slate-100">Kurum</label>
            <p className="text-xs text-slate-500 mt-0.5 mb-2">
              Veli kayıtları ve sözleşme şablonları seçtiğiniz kuruma yazılır.
            </p>
            {loadingInstitutions ? (
              <Loader2 className="w-5 h-5 animate-spin text-blue-600 mt-2" />
            ) : (
              <select
                className="mt-1 w-full max-w-xl rounded-lg border border-slate-200 px-3 py-2.5 text-sm dark:bg-slate-950 dark:border-slate-600"
                value={institutionId}
                onChange={(e) => setInstitutionId(e.target.value)}
              >
                <option value="">— Kurum seçin —</option>
                {institutionOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            )}
            {!loadingInstitutions && institutionOptions.length === 0 ? (
              <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
                Kurum listesi boş veya yüklenemedi. Supabase&apos;de <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">institutions</code>{' '}
                tablosunda kayıt olduğundan emin olun.
              </p>
            ) : null}
          </section>
        ) : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-1 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-600" />
            Sınıf &amp; sözleşme şablonları
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            Şablonda <strong>sınıf, program</strong> ve <strong>ders bazlı haftalık saat</strong> tanımlayın (satır ekleyip
            çıkarabilirsiniz). Ücret ve taksit şablonda yok; veli kaydı oluştururken girilir.
          </p>
          {!isSuper && effectiveInstitutionId ? (
            <p className="text-xs text-emerald-800 dark:text-emerald-200/90 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-lg px-3 py-2 mb-3">
              Hesabınız bir kuruma bağlı; kurum seçmeniz gerekmez. Şablonları doğrudan bu bölümden yönetin.
            </p>
          ) : null}
          {!effectiveInstitutionId ? (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {isSuper
                ? 'Şablon eklemek veya listelemek için sayfanın üstündeki Kurum listesinden bir kurum seçin.'
                : 'Kullanıcınıza kurum atanmamış; yöneticiden kurum bağlantısı isteyin.'}
            </p>
          ) : loadingPresets ? (
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          ) : (
            <>
              <div className="rounded-xl border border-slate-100 dark:border-slate-700 overflow-hidden mb-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/80 text-left text-xs text-slate-500 uppercase tracking-wide">
                      <th className="px-3 py-2 font-semibold">Sınıf</th>
                      <th className="px-3 py-2 font-semibold">Program</th>
                      <th className="px-3 py-2 font-semibold w-20">Tür</th>
                      <th className="px-3 py-2 font-semibold w-16">Toplam saat</th>
                      <th className="px-3 py-2 font-semibold min-w-[140px]">Dersler</th>
                      <th className="px-3 py-2 w-24" />
                    </tr>
                  </thead>
                  <tbody>
                    {presets.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                          Henüz şablon yok. Aşağıdan ekleyin.
                        </td>
                      </tr>
                    ) : (
                      presets.map((p) => (
                        <tr key={p.id} className="border-t border-slate-100 dark:border-slate-700">
                          <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-100">{p.sinif}</td>
                          <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{p.program_adi}</td>
                          <td className="px-3 py-2 text-xs text-slate-600">{turKisaEtiket(p.sozlesme_turu)}</td>
                          <td className="px-3 py-2 font-medium">{p.haftalik_ders_saati}</td>
                          <td className="px-3 py-2 text-xs text-slate-600 max-w-[220px] truncate" title={presetDersOzeti(p)}>
                            {presetDersOzeti(p) || '—'}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex gap-1 justify-end">
                              <button
                                type="button"
                                className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                                title="Düzenle"
                                onClick={() => startEditPreset(p)}
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                                title="Sil"
                                onClick={() => void removePreset(p.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 items-end">
                <div>
                  <label className="text-xs text-slate-500">Sınıf</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600"
                    value={presetSinif}
                    onChange={(e) => setPresetSinif(e.target.value)}
                    placeholder="ör. 9 veya TYT"
                  />
                </div>
                <div className="lg:col-span-2">
                  <label className="text-xs text-slate-500">Program adı</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600"
                    value={presetProgram}
                    onChange={(e) => setPresetProgram(e.target.value)}
                    placeholder="ör. LGS Hazırlık Paketi"
                  />
                </div>
                <div className="sm:col-span-3">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="text-xs text-slate-500 font-semibold">Haftalık dersler (ders adı + saat)</label>
                    <button
                      type="button"
                      className="text-xs font-semibold text-blue-700 hover:underline inline-flex items-center gap-1"
                      onClick={() => setPresetDersler((prev) => [...prev, { ders_adi: '', haftalik_saat: 2 }])}
                    >
                      <Plus className="w-3.5 h-3.5" /> Satır ekle
                    </button>
                  </div>
                  <div className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-600">
                    {presetDersler.map((row, idx) => (
                      <div key={idx} className="flex flex-wrap gap-2 items-end">
                        <div className="flex-1 min-w-[120px]">
                          <label className="text-[10px] text-slate-400">Ders</label>
                          <input
                            className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:bg-slate-950 dark:border-slate-600"
                            value={row.ders_adi}
                            onChange={(e) => {
                              const v = e.target.value;
                              setPresetDersler((prev) => prev.map((r, i) => (i === idx ? { ...r, ders_adi: v } : r)));
                            }}
                            placeholder="ör. Matematik"
                          />
                        </div>
                        <div className="w-24">
                          <label className="text-[10px] text-slate-400">Saat/hafta</label>
                          <input
                            type="number"
                            min={0.25}
                            step={0.5}
                            max={40}
                            className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:bg-slate-950 dark:border-slate-600"
                            value={row.haftalik_saat}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              setPresetDersler((prev) =>
                                prev.map((r, i) => (i === idx ? { ...r, haftalik_saat: v } : r))
                              );
                            }}
                          />
                        </div>
                        <button
                          type="button"
                          disabled={presetDersler.length <= 1}
                          className="mb-0.5 p-2 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-30 dark:hover:bg-red-950/30"
                          title="Satırı sil"
                          onClick={() => setPresetDersler((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Toplam: <strong>{sumDersSatirlari(validDersRows(presetDersler))}</strong> saat/hafta (geçerli satırların toplamı)
                  </p>
                </div>
                <div>
                  <label className="text-xs text-slate-500">Sözleşme türü</label>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600"
                    value={presetSozlesmeTuru}
                    onChange={(e) => setPresetSozlesmeTuru(e.target.value as SozlesmeTuruKey)}
                  >
                    <option value="satis_sozlesmesi">Satış sözleşmesi</option>
                    <option value="kullanici_sozlesmesi">Kullanıcı / üyelik sözleşmesi</option>
                    <option value="diger">Diğer (özel başlık)</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-slate-500">Özel belge başlığı (yalnızca &quot;Diğer&quot; veya başlığı ezmek için)</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600"
                    value={presetOzelBaslik}
                    onChange={(e) => setPresetOzelBaslik(e.target.value)}
                    placeholder="ör. Mesafeli eğitim hizmeti sözleşmesi"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="text-xs text-slate-500">Ek şartlar / ayrıntı metni (düz metin, satırlar paragraf olur)</label>
                  <textarea
                    rows={5}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600 font-mono"
                    value={presetEkDetay}
                    onChange={(e) => setPresetEkDetay(e.target.value)}
                    placeholder="İade koşulları, fesih, kampanya notu…"
                  />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void savePreset()}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white"
                >
                  {editingPresetId ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  {editingPresetId ? 'Şablonu güncelle' : 'Şablon ekle'}
                </button>
                {editingPresetId ? (
                  <button type="button" onClick={cancelEditPreset} className="text-sm text-slate-600 underline">
                    İptal
                  </button>
                ) : null}
              </div>
            </>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">Yeni kayıt</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {presets.length > 0 ? (
              <div className="sm:col-span-2">
                <label className="text-xs text-slate-500">Şablon uygula (isteğe bağlı)</label>
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600"
                  value={selectedPresetId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedPresetId(id);
                    if (!id) return;
                    const p = presets.find((x) => x.id === id);
                    if (p) applyPresetToForm(p);
                  }}
                >
                  <option value="">— Seçin —</option>
                  {presets.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{turKisaEtiket(p.sozlesme_turu)}] {p.sinif} — {p.program_adi} · {p.haftalik_ders_saati} sa/hafta
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="sm:col-span-2">
              <label className="text-xs text-slate-500">Öğrenci / kullanıcıdan doldur</label>
              {loadingFillStudents ? (
                <Loader2 className="mt-2 w-5 h-5 animate-spin text-blue-600" />
              ) : (
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600"
                  value={fillPick}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFillPick(v);
                    if (!v) return;
                    if (v.startsWith('s:')) {
                      const id = v.slice(2);
                      const s = fillStudents.find((x) => x.id === id);
                      if (!s) return;
                      const o = splitAdSoyad(s.name);
                      const pv = splitAdSoyad(s.parent_name || '');
                      setOgrenciAd(o.ad);
                      setOgrenciSoyad(o.soyad);
                      setVeliAd(pv.ad);
                      setVeliSoyad(pv.soyad);
                      setTelefon(String(s.parent_phone || s.phone || '').trim());
                      setSinif(s.class_level != null && s.class_level !== '' ? String(s.class_level) : '');
                      return;
                    }
                    if (v.startsWith('u:')) {
                      const id = v.slice(2);
                      const u = fillUserStudents.find((x) => x.id === id);
                      if (!u) return;
                      const o = splitAdSoyad(u.name);
                      setOgrenciAd(o.ad);
                      setOgrenciSoyad(o.soyad);
                      setTelefon(String(u.phone || '').trim());
                      setVeliAd('');
                      setVeliSoyad('');
                      setSinif('');
                    }
                  }}
                >
                  <option value="">— Elle girin veya listeden seçin —</option>
                  {fillStudents.length > 0 ? (
                    <optgroup label="Öğrenci kartı (students)">
                      {fillStudents.map((s) => (
                        <option key={`s:${s.id}`} value={`s:${s.id}`}>
                          {s.name}
                          {s.class_level != null && s.class_level !== '' ? ` (${s.class_level})` : ''}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  {fillUserStudents.length > 0 ? (
                    <optgroup label="Platform öğrenci (users)">
                      {fillUserStudents.map((u) => (
                        <option key={`u:${u.id}`} value={`u:${u.id}`}>
                          {u.name}
                          {u.email ? ` · ${u.email}` : ''}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
              )}
              <p className="mt-1 text-[11px] text-slate-500">
                Kart seçilirse veli alanları da dolar ve <code className="rounded bg-slate-100 px-0.5 dark:bg-slate-800">student_id</code> kaydedilir.
                Yalnızca <strong>users</strong> hesabı seçilirse öğrenci adı ve telefon gelir; veli bilgisini elle girin — kayıtta{' '}
                <code className="rounded bg-slate-100 px-0.5 dark:bg-slate-800">ogrenci_user_id</code> saklanır.
              </p>
            </div>

            <div>
              <label className="text-xs text-slate-500">Bu kayıt için sözleşme türü</label>
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600"
                value={sozlesmeTuru}
                onChange={(e) => setSozlesmeTuru(e.target.value as SozlesmeTuruKey)}
              >
                <option value="satis_sozlesmesi">Satış sözleşmesi</option>
                <option value="kullanici_sozlesmesi">Kullanıcı / üyelik sözleşmesi</option>
                <option value="diger">Diğer</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500">Belge başlığı (isteğe bağlı)</label>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600"
                value={sozlesmeBasligiOverride}
                onChange={(e) => setSozlesmeBasligiOverride(e.target.value)}
                placeholder="Boşsa türe göre otomatik"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-slate-500">Bu kayda özel ek satırlar (şablondakine eklenir)</label>
              <textarea
                rows={3}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600"
                value={contractEkSatirlar}
                onChange={(e) => setContractEkSatirlar(e.target.value)}
                placeholder="Tek seferlik not; şablondaki ek metnin altına eklenir."
              />
            </div>

            <div>
              <label className="text-xs text-slate-500">Öğrenci adı</label>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600"
                value={ogrenciAd}
                onChange={(e) => setOgrenciAd(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">Öğrenci soyadı</label>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600"
                value={ogrenciSoyad}
                onChange={(e) => setOgrenciSoyad(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">Veli adı</label>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600"
                value={veliAd}
                onChange={(e) => setVeliAd(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">Veli soyadı</label>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600"
                value={veliSoyad}
                onChange={(e) => setVeliSoyad(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">Telefon</label>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600"
                value={telefon}
                onChange={(e) => setTelefon(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">Adres</label>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600"
                value={adres}
                onChange={(e) => setAdres(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">Sınıf (ör. 9 veya LGS)</label>
              <div className="mt-1 flex gap-2">
                <input
                  className="flex-1 rounded-lg border px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600"
                  value={sinif}
                  onChange={(e) => setSinif(e.target.value)}
                />
                <button
                  type="button"
                  title="Sınıfa göre saat ve ücret öner"
                  onClick={applySuggestFromSinif}
                  className="shrink-0 rounded-lg border border-slate-200 px-2 py-2 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
                >
                  <Sparkles className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="text-xs text-slate-500">Program adı</label>
              {programs.length > 0 ? (
                <div className="mt-1 space-y-2">
                  <select
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600"
                    value={programSource === 'custom' ? '__custom__' : programSelectValue}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '__custom__') {
                        setProgramSource('custom');
                      } else {
                        setProgramSource('list');
                        setProgramSelectValue(v);
                      }
                    }}
                  >
                    <option value="">— Program seçin —</option>
                    {programs.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                    <option value="__custom__">Diğer (elle yazın)</option>
                  </select>
                  {programSource === 'custom' ? (
                    <input
                      className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600"
                      value={programCustom}
                      onChange={(e) => setProgramCustom(e.target.value)}
                      placeholder="Program adı"
                    />
                  ) : null}
                </div>
              ) : (
                <input
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600"
                  value={programCustom}
                  onChange={(e) => {
                    setProgramCustom(e.target.value);
                    setProgramSource('custom');
                  }}
                  placeholder="Önce şablon ekleyin veya program adını yazın"
                />
              )}
            </div>

            <div className="sm:col-span-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4 dark:border-slate-600 dark:bg-slate-800/30">
              <div className="flex items-center justify-between gap-2 mb-2">
                <label className="text-xs text-slate-600 dark:text-slate-300 font-semibold">
                  Veli kaydı — haftalık ders dağılımı (isteğe bağlı)
                </label>
                <button
                  type="button"
                  className="text-xs font-semibold text-blue-700 hover:underline inline-flex items-center gap-1"
                  onClick={() =>
                    setContractDersler((prev) =>
                      prev.length ? [...prev, { ders_adi: '', haftalik_saat: 2 }] : [{ ders_adi: '', haftalik_saat: 2 }]
                    )
                  }
                >
                  <Plus className="w-3.5 h-3.5" /> Ders satırı ekle
                </button>
              </div>
              {contractDersler.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Boş bırakırsanız şablondaki ders listesi kullanılır. Kendi listenizi yazmak için &quot;Ders satırı ekle&quot;ye
                  basın.
                </p>
              ) : (
                <div className="space-y-2">
                  {contractDersler.map((row, idx) => (
                    <div key={idx} className="flex flex-wrap gap-2 items-end">
                      <div className="flex-1 min-w-[120px]">
                        <input
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:bg-slate-950 dark:border-slate-600"
                          value={row.ders_adi}
                          onChange={(e) => {
                            const v = e.target.value;
                            setContractDersler((prev) => prev.map((r, i) => (i === idx ? { ...r, ders_adi: v } : r)));
                          }}
                          placeholder="Ders adı"
                        />
                      </div>
                      <div className="w-24">
                        <input
                          type="number"
                          min={0.25}
                          step={0.5}
                          max={40}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:bg-slate-950 dark:border-slate-600"
                          value={row.haftalik_saat}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setContractDersler((prev) =>
                              prev.map((r, i) => (i === idx ? { ...r, haftalik_saat: v } : r))
                            );
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        className="p-2 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                        onClick={() => setContractDersler((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <p className="text-[11px] text-slate-500">
                    Bu liste doluysa belgede bu satırlar kullanılır ve toplam saat buna göre ayarlanır (
                    {sumDersSatirlari(validDersRows(contractDersler)) || '—'} saat).
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="text-xs text-slate-500">Haftalık ders saati (toplam)</label>
              <input
                type="number"
                min={0}
                max={80}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600"
                value={haftalikDersSaati}
                onChange={(e) => setHaftalikDersSaati(Number(e.target.value))}
              />
              <p className="mt-0.5 text-[10px] text-slate-400">Ders listesi dolduğunda kayıtta otomatik güncellenir.</p>
            </div>
            <div>
              <label className="text-xs text-slate-500">Ücret (TL)</label>
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600"
                value={ucret}
                onChange={(e) => setUcret(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">Taksit sayısı</label>
              <input
                type="number"
                min={1}
                max={48}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600"
                value={taksitSayisi}
                onChange={(e) => setTaksitSayisi(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">Başlangıç</label>
              <input
                type="date"
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600"
                value={baslangic}
                onChange={(e) => setBaslangic(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">Bitiş</label>
              <input
                type="date"
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600"
                value={bitis}
                onChange={(e) => setBitis(e.target.value)}
              />
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
                      {r.sozlesme_basligi ? (
                        <span className="font-medium text-slate-700 dark:text-slate-300">{r.sozlesme_basligi} · </span>
                      ) : null}
                      {r.program_adi ? `${r.program_adi} · ` : ''}Sınıf: {r.sinif} · {r.haftalik_ders_saati} sa/hafta ·{' '}
                      {r.ucret} TL · {r.taksit_sayisi ?? 1} taksit · Kod: {r.kurum_kodu}
                      {r.student_id ? (
                        <span className="block mt-0.5 text-[11px] font-mono text-slate-500">
                          Öğrenci kartı: {r.student_id.slice(0, 8)}…
                        </span>
                      ) : null}
                      {r.ogrenci_user_id ? (
                        <span className="block mt-0.5 text-[11px] font-mono text-slate-500">
                          Kullanıcı (users): {r.ogrenci_user_id.slice(0, 8)}…
                        </span>
                      ) : null}
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
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:underline"
                      onClick={() => void removeContractRow(r.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Sil
                    </button>
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
