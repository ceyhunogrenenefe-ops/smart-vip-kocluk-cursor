import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CLASS_LEVELS } from '../types';
import { VELI_KAYIT_PROGRAM_SECENEKLERI } from '../lib/veliKayitConstants';
import {
  VELI_KAYIT_KVKK_DOC_HREF,
  VELI_KAYIT_SATIS_ONBILGI_DOC_HREF,
  absoluteVeliLegalDocUrl,
  resolveKvkkDocUrl,
  resolveSatisDocUrl
} from '../lib/veliKayitLegalLinks';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { isMaarifVeliProgram, resolveSinifFromVeliKayit } from '../lib/veliKayitClassLevel';
import {
  createParentSignClassPreset,
  createParentSignContract,
  createStudentUserFromParentSign,
  updateParentSignContract,
  patchParentSignKayitOnly,
  deleteParentSignClassPreset,
  deleteParentSignContract,
  listInstitutionsForPicker,
  listParentSignClassPresets,
  listParentSignContracts,
  listParentSignFillCandidates,
  fetchParentSignInstitutionLegal,
  saveParentSignInstitutionLegal,
  splitAdSoyad,
  suggestHoursAndFeeFromSinif,
  updateParentSignClassPreset,
  type DersSatiri,
  type InstitutionPickRow,
  type ParentSignClassPresetRow,
  type ParentSignContractRow,
  type SozlesmeTuruKey,
  type StudentFillRow,
  type UserStudentFillRow,
  PARA_BIRIMI_OPTIONS,
  formatParaBirimiLabel,
  formatUcretWithCurrency,
  type ParaBirimi
} from '../lib/parentSignApi';
import {
  classifyTaksit,
  defaultTaksitVadeleri,
  effectiveVadeYmd,
  resizeTaksitTutarlari,
  splitTaksitTutarlari,
  type TaksitKartMuhasebe
} from '../lib/taksitMuhasebe';
import { rolesForProtectedRoute, userHasAnyRole } from '../config/rolePermissions';
import {
  Copy,
  Loader2,
  Link2,
  CheckCircle2,
  Clock,
  Download,
  FileSignature,
  Trash2,
  Pencil,
  Plus,
  Sparkles,
  UserCog
} from 'lucide-react';

function todayPlus(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Liste / UI: imzalı kabul (status veya signed_at) */
function parentContractRowSigned(r: ParentSignContractRow): boolean {
  if (r.signed_at != null && String(r.signed_at).trim() !== '') return true;
  return String(r.status || '').toLowerCase().trim() === 'signed';
}

function kayitFormPhase(r: ParentSignContractRow): string {
  const j = r.kayit_formu_json;
  if (j && typeof j === 'object') {
    return String((j as Record<string, unknown>).phase || '').trim();
  }
  return '';
}

function muhasebeOzetFromRow(r: ParentSignContractRow): string {
  const j = r.kayit_formu_json;
  if (j && typeof j === 'object') {
    return String((j as Record<string, unknown>).muhasebe_ozet || '').trim();
  }
  return '';
}

function kayitJsonRecord(r: ParentSignContractRow): Record<string, unknown> {
  const j = r.kayit_formu_json;
  return j && typeof j === 'object' && !Array.isArray(j) ? (j as Record<string, unknown>) : {};
}

function epostaFromKayitJson(r: ParentSignContractRow): string {
  return String(kayitJsonRecord(r).eposta || '')
    .trim()
    .toLowerCase();
}

function platformUserIdFromKayit(r: ParentSignContractRow): string {
  const v = kayitJsonRecord(r).platform_user_id;
  return typeof v === 'string' ? v.trim() : '';
}

function linkedStudentUserId(r: ParentSignContractRow): string {
  const col = r.ogrenci_user_id != null ? String(r.ogrenci_user_id).trim() : '';
  if (col) return col;
  return platformUserIdFromKayit(r);
}

type TaksitKart = TaksitKartMuhasebe;

function taksitKartlariFromRow(r: ParentSignContractRow): TaksitKart[] {
  const raw = kayitJsonRecord(r).taksit_kartlari;
  if (!Array.isArray(raw)) return [];
  const out: TaksitKart[] = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    out.push({
      no: typeof o.no === 'number' ? o.no : Number(o.no) || undefined,
      tutar_tl: typeof o.tutar_tl === 'number' ? o.tutar_tl : Number(o.tutar_tl) || undefined,
      odendi: Boolean(o.odendi),
      odeme_notu: o.odeme_notu != null ? String(o.odeme_notu) : '',
      vade_tarihi: o.vade_tarihi != null ? String(o.vade_tarihi).slice(0, 10) : undefined,
      odendi_tarihi: o.odendi_tarihi != null ? String(o.odendi_tarihi).slice(0, 10) : undefined
    });
  }
  return out;
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function resizeTaksitVadeleri(prev: string[], baslangic: string, count: number): string[] {
  const n = Math.max(1, Math.min(48, Math.round(count) || 1));
  if (n <= 1) return [];
  const defaults = defaultTaksitVadeleri(baslangic, n);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const p = prev[i];
    out.push(p && YMD_RE.test(p) ? p : defaults[i]);
  }
  return out;
}

type PriceSetupDraft = {
  ucret: number;
  paraBirimi: ParaBirimi;
  taksitSayisi: number;
  vadeler: string[];
  tutarlar: number[];
};

function defaultPriceSetupDraft(r: ParentSignContractRow): PriceSetupDraft {
  const suggested = suggestHoursAndFeeFromSinif(r.sinif);
  const n = Math.max(1, Math.min(48, Math.round(Number(r.taksit_sayisi) || 1)));
  const bas = String(r.baslangic_tarihi || '').slice(0, 10);
  const ucret = Number(r.ucret) > 0 ? Number(r.ucret) : suggested.fee;
  const rawPb = String(r.para_birimi || 'TRY').trim().toUpperCase();
  const paraBirimi = (PARA_BIRIMI_OPTIONS.some((o) => o.value === rawPb) ? rawPb : 'TRY') as ParaBirimi;
  const cards = taksitKartlariFromRow(r);
  if (n <= 1) {
    return { ucret, paraBirimi, taksitSayisi: n, vadeler: [], tutarlar: [] };
  }
  if (cards.length > 0) {
    return {
      ucret,
      paraBirimi,
      taksitSayisi: n,
      vadeler: resizeTaksitVadeleri(
        cards.map((c, i) => effectiveVadeYmd(c, r.baslangic_tarihi, i)),
        bas,
        n
      ),
      tutarlar: resizeTaksitTutarlari(
        cards.map((c) => Number(c.tutar_tl) || 0),
        ucret,
        n
      )
    };
  }
  return {
    ucret,
    paraBirimi,
    taksitSayisi: n,
    vadeler: defaultTaksitVadeleri(bas, n),
    tutarlar: splitTaksitTutarlari(ucret, n)
  };
}

function TaksitPlanEditor(props: {
  taksitSayisi: number;
  ucret: number;
  paraBirimi: ParaBirimi;
  baslangic: string;
  vadeler: string[];
  tutarlar: number[];
  onVadelerChange: (next: string[]) => void;
  onTutarlarChange: (next: number[]) => void;
  onResetMonthly: () => void;
  onResetEqualSplit: () => void;
  compact?: boolean;
}) {
  const n = Math.max(1, Math.min(48, Math.round(props.taksitSayisi) || 1));
  if (n <= 1) return null;
  const tutarToplam = props.tutarlar.reduce((s, t) => s + (Number.isFinite(t) ? t : 0), 0);
  const ucretRounded = Math.round(Number(props.ucret) || 0);
  const toplamUyusmuyor = ucretRounded > 0 && tutarToplam !== ucretRounded;
  const boxCls = props.compact
    ? 'rounded-lg border border-violet-200 bg-violet-50/50 p-2 dark:border-violet-900 dark:bg-violet-950/20'
    : 'sm:col-span-2 rounded-xl border border-dashed border-blue-200 bg-blue-50/40 p-3 dark:border-blue-900 dark:bg-blue-950/20';
  return (
    <div className={boxCls}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Taksit planı (vade + tutar)</span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="text-[11px] font-semibold text-blue-700 hover:underline dark:text-blue-300"
            onClick={props.onResetEqualSplit}
          >
            Ücretten eşit böl
          </button>
          <button
            type="button"
            className="text-[11px] font-semibold text-blue-700 hover:underline dark:text-blue-300"
            onClick={props.onResetMonthly}
          >
            Vadeleri aylık yenile
          </button>
        </div>
      </div>
      {toplamUyusmuyor ? (
        <p className="text-[10px] text-amber-800 dark:text-amber-200 mb-2">
          Taksit toplamı ({formatUcretWithCurrency(tutarToplam, props.paraBirimi)}) ücretten (
          {formatUcretWithCurrency(ucretRounded, props.paraBirimi)}) farklı — kayıtta bu tutarlar aynen kullanılır.
        </p>
      ) : null}
      <ul className="space-y-1.5">
        {props.vadeler.map((vade, idx) => (
          <li key={idx} className="flex flex-wrap items-center gap-2 text-xs">
            <span className="w-16 font-semibold text-slate-600 dark:text-slate-300">{idx + 1}. taksit</span>
            <input
              type="date"
              className="rounded-lg border border-slate-200 px-2 py-1 text-xs dark:bg-slate-950 dark:border-slate-600"
              value={vade}
              onChange={(e) => {
                const next = [...props.vadeler];
                next[idx] = e.target.value;
                props.onVadelerChange(next);
              }}
            />
            <input
              type="number"
              min={0}
              className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-xs dark:bg-slate-950 dark:border-slate-600"
              value={props.tutarlar[idx] ?? 0}
              onChange={(e) => {
                const next = [...props.tutarlar];
                next[idx] = Math.max(0, Math.round(Number(e.target.value) || 0));
                props.onTutarlarChange(next);
              }}
            />
            <span className="text-slate-500">{formatParaBirimiLabel(props.paraBirimi)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** İmzalı kayıt + e-posta: `/user-management` modalını veli/öğrenci bilgileriyle doldurmak için bağlantı. */
function buildVeliSignedUserManagementPrefillUrl(r: ParentSignContractRow, origin: string): string | null {
  if (!parentContractRowSigned(r)) return null;
  if (linkedStudentUserId(r)) return null;
  const email = epostaFromKayitJson(r);
  if (!email || !email.includes('@')) return null;
  const kj = kayitJsonRecord(r);
  const q = new URLSearchParams();
  q.set('veli_hesap', '1');
  q.set('email', email);
  q.set('ad', String(r.ogrenci_ad || '').trim());
  q.set('soyad', String(r.ogrenci_soyad || '').trim());
  const ogTel = String(kj.ogrenci_tel || '')
    .replace(/\D/g, '');
  if (ogTel.length >= 10) q.set('tel', ogTel);
  const veliLine = `${String(r.veli_ad || '').trim()} ${String(r.veli_soyad || '').trim()}`.trim();
  if (veliLine) q.set('veli_adsoyad', veliLine);
  const veliTel = String(kj.veli_tel || r.telefon || '')
    .replace(/\D/g, '');
  if (veliTel.length >= 10) q.set('veli_tel', veliTel);
  const sinif = String(r.sinif || '').trim();
  if (sinif) q.set('sinif', sinif);
  const okul = String(kj.okul_adi || '').trim();
  if (okul) q.set('okul', okul);
  const dogum = String(kj.dogum_tarihi || '')
    .trim()
    .slice(0, 10);
  if (dogum) q.set('dogum', dogum);
  const inst = String(r.institution_id || '').trim();
  if (inst) q.set('kurum_id', inst);
  const cno = String(r.contract_number || '').trim();
  if (cno) q.set('sozlesme', cno);
  const base = origin.replace(/\/+$/, '');
  return `${base}/user-management?${q.toString()}`;
}

function buildPresetShareUrl(presetId: string): string {
  const path = `/veli-onay?preset=${encodeURIComponent(presetId)}`;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${path}`;
  }
  return path;
}

export default function ParentSignFlowPage() {
  const [searchParams] = useSearchParams();
  const { effectiveUser } = useAuth();
  const { activeInstitutionId, institution } = useApp();
  const isSuper = effectiveUser?.role === 'super_admin';
  const [rows, setRows] = useState<ParentSignContractRow[]>([]);
  const [presets, setPresets] = useState<ParentSignClassPresetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingPresets, setLoadingPresets] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [institutionId, setInstitutionId] = useState('');
  const [institutionOptions, setInstitutionOptions] = useState<InstitutionPickRow[]>([]);
  const [loadingInstitutions, setLoadingInstitutions] = useState(false);
  /** Kullanıcı yönetimi rotası yalnızca admin / süper_admin; koç bağlantıya tıklayınca yetkisiz yönlendirme yaşanmasın. */
  const canOpenUserManagement = userHasAnyRole(effectiveUser, rolesForProtectedRoute('/user-management'));
  const effectiveInstitutionId = useMemo(() => {
    if (isSuper) {
      const fromPicker = institutionId.trim();
      if (fromPicker) return fromPicker;
      return String(activeInstitutionId || '').trim();
    }
    return String(activeInstitutionId || effectiveUser?.institution_id || '').trim();
  }, [isSuper, institutionId, activeInstitutionId, effectiveUser?.institution_id]);

  const headerKurumAdi = useMemo(() => {
    if (isSuper && institutionId.trim()) {
      const row = institutionOptions.find((o) => o.id === institutionId.trim());
      if (row?.name) return row.name;
    }
    return institution?.name?.trim() || '';
  }, [isSuper, institutionId, institutionOptions, institution?.name]);

  const [ogrenciAd, setOgrenciAd] = useState('');
  const [ogrenciSoyad, setOgrenciSoyad] = useState('');
  const [veliAd, setVeliAd] = useState('');
  const [veliSoyad, setVeliSoyad] = useState('');
  const [telefon, setTelefon] = useState('');
  const [adres, setAdres] = useState('');
  const [sinif, setSinif] = useState('');
  const [selectedPresetIds, setSelectedPresetIds] = useState<string[]>([]);
  const [veliProgramCustom, setVeliProgramCustom] = useState('');
  const [priceDrafts, setPriceDrafts] = useState<Record<string, PriceSetupDraft>>({});
  const [lastCreatedLink, setLastCreatedLink] = useState<string | null>(null);
  const [baslangic, setBaslangic] = useState(todayPlus(0));
  const [bitis, setBitis] = useState(todayPlus(365));

  const [presetSinif, setPresetSinif] = useState('');
  const [presetProgram, setPresetProgram] = useState('');
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);

  const [fillStudents, setFillStudents] = useState<StudentFillRow[]>([]);
  const [fillUserStudents, setFillUserStudents] = useState<UserStudentFillRow[]>([]);
  const [loadingFillStudents, setLoadingFillStudents] = useState(false);
  /** '' | s:studentRowId | u:userId */
  const [fillPick, setFillPick] = useState('');
  /** Veli linkinde önce kayıt formu; kapalıysa doğrudan e-sözleşme + imza */
  const [ogrenciOnceKayitFormu, setOgrenciOnceKayitFormu] = useState(true);
  const [ucret, setUcret] = useState<number>(25000);
  const [paraBirimi, setParaBirimi] = useState<ParaBirimi>('TRY');
  const [taksitSayisi, setTaksitSayisi] = useState<number>(1);
  const [taksitVadeleri, setTaksitVadeleri] = useState<string[]>([]);
  const [taksitTutarlari, setTaksitTutarlari] = useState<number[]>([]);

  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editOgrenciAd, setEditOgrenciAd] = useState('');
  const [editOgrenciSoyad, setEditOgrenciSoyad] = useState('');
  const [editVeliAd, setEditVeliAd] = useState('');
  const [editVeliSoyad, setEditVeliSoyad] = useState('');
  const [editTelefon, setEditTelefon] = useState('');
  const [editAdres, setEditAdres] = useState('');
  const [editSinif, setEditSinif] = useState('');
  const [editProgramAdi, setEditProgramAdi] = useState('');
  const [editBaslangic, setEditBaslangic] = useState('');
  const [editBitis, setEditBitis] = useState('');
  const [editHaftalikDersSaati, setEditHaftalikDersSaati] = useState(0);
  const [editUcret, setEditUcret] = useState(0);
  const [editParaBirimi, setEditParaBirimi] = useState<ParaBirimi>('TRY');
  const [editTaksitSayisi, setEditTaksitSayisi] = useState(1);
  const [editTaksitVadeleri, setEditTaksitVadeleri] = useState<string[]>([]);
  const [editTaksitTutarlari, setEditTaksitTutarlari] = useState<number[]>([]);
  /** Doğrudan HTML düzenleme (koç/admin/süper admin; yalnız imza öncesi) */
  const [editCustomHtmlMode, setEditCustomHtmlMode] = useState(false);
  const [editMergedHtml, setEditMergedHtml] = useState('');

  const [pdfRowId, setPdfRowId] = useState<string | null>(null);
  /** `contractId:suffix` — taksit / hesap oluşturma */
  const [parentSignRowBusy, setParentSignRowBusy] = useState<string | null>(null);

  const [legalKvkkUrl, setLegalKvkkUrl] = useState('');
  const [legalSatisUrl, setLegalSatisUrl] = useState('');
  const [legalLoading, setLegalLoading] = useState(false);
  const [legalSaving, setLegalSaving] = useState(false);

  const kvkkDocHref = useMemo(
    () => resolveKvkkDocUrl(legalKvkkUrl),
    [legalKvkkUrl]
  );
  const satisDocHref = useMemo(
    () => resolveSatisDocUrl(legalSatisUrl),
    [legalSatisUrl]
  );

  useEffect(() => {
    if (ogrenciOnceKayitFormu) return;
    const n = Math.max(1, Math.min(48, Math.round(taksitSayisi) || 1));
    if (n <= 1) {
      setTaksitVadeleri([]);
      setTaksitTutarlari([]);
      return;
    }
    setTaksitVadeleri((prev) => resizeTaksitVadeleri(prev, baslangic, n));
    setTaksitTutarlari((prev) => resizeTaksitTutarlari(prev, ucret, n));
  }, [ogrenciOnceKayitFormu, taksitSayisi, baslangic, ucret]);

  useEffect(() => {
    if (!editOpen) return;
    const n = Math.max(1, Math.min(48, Math.round(editTaksitSayisi) || 1));
    if (n <= 1) {
      setEditTaksitVadeleri([]);
      setEditTaksitTutarlari([]);
      return;
    }
    setEditTaksitVadeleri((prev) => resizeTaksitVadeleri(prev, editBaslangic, n));
    setEditTaksitTutarlari((prev) => resizeTaksitTutarlari(prev, editUcret, n));
  }, [editOpen, editTaksitSayisi, editBaslangic, editUcret]);

  useEffect(() => {
    setPriceDrafts((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const r of rows) {
        if (kayitFormPhase(r) !== 'awaiting_admin_price') continue;
        if (!next[r.id]) {
          next[r.id] = defaultPriceSetupDraft(r);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [rows]);

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

  const loadInstitutionLegal = useCallback(async () => {
    if (!effectiveInstitutionId) {
      setLegalKvkkUrl('');
      setLegalSatisUrl('');
      return;
    }
    setLegalLoading(true);
    try {
      const row = await fetchParentSignInstitutionLegal(effectiveInstitutionId);
      setLegalKvkkUrl(row.kvkk_doc_url || '');
      setLegalSatisUrl(row.satis_doc_url || '');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Metin linkleri yüklenemedi');
    } finally {
      setLegalLoading(false);
    }
  }, [effectiveInstitutionId]);

  useEffect(() => {
    void loadInstitutionLegal();
  }, [loadInstitutionLegal]);

  const saveInstitutionLegalLinks = async () => {
    if (!effectiveInstitutionId) {
      setMsg('Kurum seçin.');
      return;
    }
    setLegalSaving(true);
    setMsg(null);
    try {
      await saveParentSignInstitutionLegal({
        institution_id: effectiveInstitutionId,
        kvkk_doc_url: legalKvkkUrl.trim(),
        satis_doc_url: legalSatisUrl.trim()
      });
      setMsg('KVKK ve satış metni linkleri kaydedildi — veli kayıt formunda bu adresler kullanılır.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Linkler kaydedilemedi');
    } finally {
      setLegalSaving(false);
    }
  };

  useEffect(() => {
    const pid = searchParams.get('preset')?.trim();
    if (!pid || !presets.length) return;
    const p = presets.find((x) => x.id === pid);
    if (!p) return;
    setSelectedPresetIds((prev) => (prev.includes(pid) ? prev : [pid]));
    setSinif((prev) => {
      if (prev.trim()) return prev;
      if (isMaarifVeliProgram(p.program_adi)) return 'TYT-Maarif';
      return p.sinif;
    });
  }, [presets, searchParams]);

  const copyText = async (text: string, okMsg?: string) => {
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      setMsg(okMsg || 'Panoya kopyalandı.');
    } catch {
      setMsg('Kopyalanamadı — metni elle seçin.');
    }
  };

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

  /** Süper yönetici: üst çubuktaki aktif kurum, sayfadaki kurum seçimi boşken otomatik dolar */
  useEffect(() => {
    if (!isSuper || !activeInstitutionId) return;
    if (institutionId.trim()) return;
    if (!institutionOptions.some((o) => o.id === activeInstitutionId)) return;
    setInstitutionId(activeInstitutionId);
  }, [isSuper, activeInstitutionId, institutionId, institutionOptions]);

  const togglePresetSelection = (id: string) => {
    setSelectedPresetIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      const added = presets.find((p) => p.id === id);
      if (added && !prev.includes(id)) {
        if (isMaarifVeliProgram(added.program_adi)) setSinif('TYT-Maarif');
        else setSinif((s) => (s.trim() ? s : added.sinif));
      }
      return next;
    });
  };

  const resolvedProgramAdi = () => {
    const fromPresets = selectedPresetIds
      .map((id) => presets.find((p) => p.id === id)?.program_adi?.trim())
      .filter((n): n is string => Boolean(n));
    const custom = veliProgramCustom.trim();
    const names = [...fromPresets];
    if (custom && !names.includes(custom)) names.push(custom);
    return names.join(' + ');
  };

  const submit = async () => {
    setMsg(null);
    if (!effectiveInstitutionId) {
      setMsg(
        isSuper
          ? 'Kurum seçin: Ayarlar’daki aktif kurumu değiştirin veya aşağıdan kurum seçin.'
          : 'Aktif kurum bulunamadı. Ayarlar’dan kurum seçin veya hesabınıza kurum atanmasını isteyin.'
      );
      return;
    }
    const program_adi = resolvedProgramAdi();
    if (!program_adi) {
      setMsg('Program adı seçin veya yazın.');
      return;
    }
    const sinifOut =
      resolveSinifFromVeliKayit(program_adi, sinif.trim()) || sinif.trim();
    if (!ogrenciOnceKayitFormu) {
      if (!ogrenciAd.trim() || !ogrenciSoyad.trim() || !veliAd.trim() || !veliSoyad.trim() || !telefon.trim()) {
        setMsg(
          'Öğrenci, veli ve telefon alanları zorunludur — ya da «Önce veli kayıt formunu doldursun» seçeneğini işaretleyin.'
        );
        return;
      }
      if (!sinifOut) {
        setMsg('Sınıf seçin.');
        return;
      }
      if (!(Number(ucret) > 0)) {
        setMsg('Doğrudan e-imza için ücret girin.');
        return;
      }
    } else if (!sinifOut) {
      setMsg('Sınıf seçin (veli formunda varsayılan olarak gösterilir).');
      return;
    }
    try {
      const primaryPresetId = selectedPresetIds[0]?.trim() || '';
      const suggested = suggestHoursAndFeeFromSinif(sinifOut);
      const body = {
        ogrenci_ad: ogrenciAd.trim(),
        ogrenci_soyad: ogrenciSoyad.trim(),
        veli_ad: veliAd.trim(),
        veli_soyad: veliSoyad.trim(),
        telefon: telefon.trim(),
        adres: adres.trim(),
        sinif: sinifOut,
        program_adi,
        baslangic_tarihi: baslangic,
        bitis_tarihi: bitis,
        haftalik_ders_saati: ogrenciOnceKayitFormu ? 0 : suggested.hours,
        ucret: ogrenciOnceKayitFormu ? 0 : ucret,
        para_birimi: ogrenciOnceKayitFormu ? ('TRY' as ParaBirimi) : paraBirimi,
        taksit_sayisi: ogrenciOnceKayitFormu ? 1 : taksitSayisi,
        sozlesme_turu: 'satis_sozlesmesi' as SozlesmeTuruKey,
        ...(primaryPresetId ? { preset_id: primaryPresetId } : {}),
        ...(fillPick.startsWith('s:') ? { student_id: fillPick.slice(2) } : {}),
        ...(fillPick.startsWith('u:') ? { ogrenci_user_id: fillPick.slice(2) } : {}),
        ...(ogrenciOnceKayitFormu ? { registration_student_form: true } : {}),
        ...(!ogrenciOnceKayitFormu && taksitSayisi > 1 && taksitVadeleri.length > 0
          ? { taksit_vadeleri: taksitVadeleri }
          : {}),
        ...(!ogrenciOnceKayitFormu && taksitSayisi > 1 && taksitTutarlari.length > 0
          ? { taksit_tutarlari: taksitTutarlari }
          : {}),
        institution_id: effectiveInstitutionId
      };
      const created = await createParentSignContract(body);
      const url =
        created.sign_url ||
        (typeof window !== 'undefined' && created.signing_token
          ? `${window.location.origin}/veli-imza/${encodeURIComponent(created.signing_token)}`
          : '');
      setLastCreatedLink(url || null);
      if (url) {
        await copyText(
          url,
          ogrenciOnceKayitFormu
            ? 'Kayıt formu linki oluşturuldu ve panoya kopyalandı.'
            : 'Veli e-imza linki oluşturuldu ve panoya kopyalandı.'
        );
      } else {
        setMsg('Kayıt oluşturuldu; link için Kayıtlar listesindeki Link düğmesini kullanın.');
      }
      void load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Kayıt oluşturulamadı');
    }
  };

  const savePreset = async () => {
    setMsg(null);
    if (!effectiveInstitutionId) {
      setMsg(
        isSuper
          ? 'Şablon kaydetmek için kurum gerekli: Ayarlar’dan aktif kurum seçin veya üstteki kurum listesinden seçin.'
          : 'Kurum bilgisi eksik. Ayarlar’dan aktif kurum seçin.'
      );
      return;
    }
    const sinifT = presetSinif.trim();
    const progT = presetProgram.trim();
    if (!sinifT || !progT) {
      setMsg('Şablon için sınıf ve program adı zorunlu.');
      return;
    }
    try {
      const base = {
        sinif: sinifT,
        program_adi: progT,
        ders_satirlari: [] as DersSatiri[],
        sozlesme_turu: 'satis_sozlesmesi' as SozlesmeTuruKey,
        sozlesme_ozel_baslik: '',
        sablon_ek_detay: ''
      };
      if (editingPresetId) {
        await updateParentSignClassPreset({ id: editingPresetId, ...base });
        setMsg('Şablon güncellendi.');
      } else {
        await createParentSignClassPreset({
          ...base,
          ...(effectiveInstitutionId ? { institution_id: effectiveInstitutionId } : {})
        });
        setMsg('Şablon eklendi.');
      }
      setEditingPresetId(null);
      setPresetSinif('');
      setPresetProgram('');
      void loadPresets();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Şablon kaydedilemedi');
    }
  };

  const startEditPreset = (p: ParentSignClassPresetRow) => {
    setEditingPresetId(p.id);
    setPresetSinif(p.sinif);
    setPresetProgram(p.program_adi);
  };

  const cancelEditPreset = () => {
    setEditingPresetId(null);
    setPresetSinif('');
    setPresetProgram('');
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

  const toggleTaksitOdeme = async (r: ParentSignContractRow, index: number, odendi: boolean) => {
    setParentSignRowBusy(`${r.id}:t${index}`);
    setMsg(null);
    try {
      await patchParentSignKayitOnly({ id: r.id, taksit_odeme_update: { index, odendi } });
      void load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Taksit güncellenemedi');
    } finally {
      setParentSignRowBusy(null);
    }
  };

  const patchPriceDraft = (id: string, patch: Partial<PriceSetupDraft>) => {
    setPriceDrafts((prev) => {
      const cur = prev[id];
      if (!cur) return prev;
      const merged = { ...cur, ...patch };
      const n = Math.max(1, Math.min(48, Math.round(merged.taksitSayisi) || 1));
      const bas =
        rows.find((x) => x.id === id)?.baslangic_tarihi != null
          ? String(rows.find((x) => x.id === id)!.baslangic_tarihi).slice(0, 10)
          : todayPlus(0);
      if (patch.taksitSayisi != null || patch.ucret != null) {
        if (n <= 1) {
          merged.vadeler = [];
          merged.tutarlar = [];
        } else {
          merged.vadeler = resizeTaksitVadeleri(merged.vadeler, bas, n);
          merged.tutarlar = resizeTaksitTutarlari(merged.tutarlar, merged.ucret, n);
        }
      }
      return { ...prev, [id]: merged };
    });
  };

  const saveAwaitingAdminPrice = async (r: ParentSignContractRow) => {
    const d = priceDrafts[r.id];
    if (!d || !(Number(d.ucret) > 0)) {
      setMsg('Ücret 0’dan büyük olmalıdır.');
      return;
    }
    setParentSignRowBusy(`${r.id}:price`);
    setMsg(null);
    try {
      await updateParentSignContract({
        id: r.id,
        ogrenci_ad: String(r.ogrenci_ad || '').trim(),
        ogrenci_soyad: String(r.ogrenci_soyad || '').trim(),
        veli_ad: String(r.veli_ad || '').trim(),
        veli_soyad: String(r.veli_soyad || '').trim(),
        telefon: String(r.telefon || '').trim(),
        adres: String(r.adres || '').trim(),
        sinif: String(r.sinif || '').trim(),
        program_adi: String(r.program_adi || '').trim(),
        baslangic_tarihi: String(r.baslangic_tarihi || '').slice(0, 10),
        bitis_tarihi: String(r.bitis_tarihi || '').slice(0, 10),
        ucret: d.ucret,
        para_birimi: d.paraBirimi,
        taksit_sayisi: d.taksitSayisi,
        ...(d.taksitSayisi > 1 && d.vadeler.length > 0 ? { taksit_vadeleri: d.vadeler } : {}),
        ...(d.taksitSayisi > 1 && d.tutarlar.length > 0 ? { taksit_tutarlari: d.tutarlar } : {})
      });
      setPriceDrafts((prev) => {
        const next = { ...prev };
        delete next[r.id];
        return next;
      });
      setMsg('Ücret ve taksit planı kaydedildi; veli e-sözleşmeyi imzalayabilir (aynı link).');
      void load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setParentSignRowBusy(null);
    }
  };

  const updateTaksitVade = async (r: ParentSignContractRow, index: number, vade_tarihi: string) => {
    if (!YMD_RE.test(vade_tarihi)) return;
    setParentSignRowBusy(`${r.id}:v${index}`);
    setMsg(null);
    try {
      await patchParentSignKayitOnly({ id: r.id, taksit_vade_update: { index, vade_tarihi } });
      void load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Vade güncellenemedi');
    } finally {
      setParentSignRowBusy(null);
    }
  };

  const createStudentAccountFromRow = async (r: ParentSignContractRow) => {
    const email = epostaFromKayitJson(r);
    if (!email || !email.includes('@')) {
      setMsg('Kayıt formunda geçerli e-posta yok; veli formunu kontrol edin.');
      return;
    }
    const inst = String(r.institution_id || '').trim();
    if (!inst) {
      setMsg('Kurum bilgisi eksik.');
      return;
    }
    setParentSignRowBusy(`${r.id}:acc`);
    setMsg(null);
    try {
      const fullName = `${String(r.ogrenci_ad || '').trim()} ${String(r.ogrenci_soyad || '').trim()}`.trim() || 'Öğrenci';
      const { passwordPlain } = await createStudentUserFromParentSign({
        contractId: r.id,
        institution_id: inst,
        studentName: fullName,
        email,
        phone: r.telefon != null ? String(r.telefon).trim() : null
      });
      setMsg(
        `Öğrenci girişi oluşturuldu. Kullanıcı yönetiminden e-posta ve şifreyi düzenleyebilirsiniz. Geçici şifre: ${passwordPlain}`
      );
      void load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Hesap oluşturulamadı');
    } finally {
      setParentSignRowBusy(null);
    }
  };

  const openEditContract = (r: ParentSignContractRow) => {
    if (parentContractRowSigned(r)) return;
    setEditId(r.id);
    setEditOgrenciAd(String(r.ogrenci_ad || ''));
    setEditOgrenciSoyad(String(r.ogrenci_soyad || ''));
    setEditVeliAd(String(r.veli_ad || ''));
    setEditVeliSoyad(String(r.veli_soyad || ''));
    setEditTelefon(String(r.telefon || ''));
    setEditAdres(String(r.adres || ''));
    setEditSinif(String(r.sinif || ''));
    setEditProgramAdi(String(r.program_adi || ''));
    setEditBaslangic(String(r.baslangic_tarihi || '').slice(0, 10));
    setEditBitis(String(r.bitis_tarihi || '').slice(0, 10));
    setEditHaftalikDersSaati(Number(r.haftalik_ders_saati) || 0);
    setEditUcret(Number(r.ucret) || 0);
    setEditParaBirimi((String(r.para_birimi || 'TRY').toUpperCase() as ParaBirimi) || 'TRY');
    setEditTaksitSayisi(Number(r.taksit_sayisi) || 1);
    const editTaksitN = Math.max(1, Math.min(48, Math.round(Number(r.taksit_sayisi) || 1)));
    const editCards = taksitKartlariFromRow(r);
    const editBas = String(r.baslangic_tarihi || '').slice(0, 10);
    if (editTaksitN > 1) {
      if (editCards.length > 0) {
        setEditTaksitVadeleri(
          resizeTaksitVadeleri(
            editCards.map((c, i) => effectiveVadeYmd(c, r.baslangic_tarihi, i)),
            editBas,
            editTaksitN
          )
        );
        setEditTaksitTutarlari(
          resizeTaksitTutarlari(
            editCards.map((c) => Number(c.tutar_tl) || 0),
            Number(r.ucret) || 0,
            editTaksitN
          )
        );
      } else {
        setEditTaksitVadeleri(defaultTaksitVadeleri(editBas, editTaksitN));
        setEditTaksitTutarlari(splitTaksitTutarlari(Number(r.ucret) || 0, editTaksitN));
      }
    } else {
      setEditTaksitVadeleri([]);
      setEditTaksitTutarlari([]);
    }
    setEditCustomHtmlMode(false);
    setEditMergedHtml(String(r.merged_html || ''));
    setEditOpen(true);
  };

  const closeEditContract = () => {
    setEditOpen(false);
    setEditId(null);
    setEditSaving(false);
    setEditCustomHtmlMode(false);
    setEditMergedHtml('');
  };

  const saveEditContract = async () => {
    if (!editId) return;
    if (editCustomHtmlMode && editMergedHtml.trim().length < 30) {
      setMsg('Özel HTML modunda sözleşme metni en az 30 karakter olmalıdır.');
      return;
    }
    setEditSaving(true);
    setMsg(null);
    try {
      await updateParentSignContract({
        id: editId,
        ogrenci_ad: editOgrenciAd.trim(),
        ogrenci_soyad: editOgrenciSoyad.trim(),
        veli_ad: editVeliAd.trim(),
        veli_soyad: editVeliSoyad.trim(),
        telefon: editTelefon.trim(),
        adres: editAdres.trim(),
        sinif: editSinif.trim(),
        program_adi: editProgramAdi.trim(),
        baslangic_tarihi: editBaslangic,
        bitis_tarihi: editBitis,
        haftalik_ders_saati: editHaftalikDersSaati,
        ucret: editUcret,
        para_birimi: editParaBirimi,
        taksit_sayisi: editTaksitSayisi,
        sozlesme_turu: 'satis_sozlesmesi',
        ...(editCustomHtmlMode ? { custom_merged_html: editMergedHtml.trim() } : {}),
        ...(editTaksitSayisi > 1 && editTaksitVadeleri.length > 0 ? { taksit_vadeleri: editTaksitVadeleri } : {}),
        ...(editTaksitSayisi > 1 && editTaksitTutarlari.length > 0 ? { taksit_tutarlari: editTaksitTutarlari } : {})
      });
      setMsg(
        editCustomHtmlMode
          ? 'Kayıt ve özel sözleşme HTML’i güncellendi; veli linki aynı kaldı.'
          : 'Kayıt güncellendi; belge şablondan yenilendi; veli linki aynı kaldı.'
      );
      closeEditContract();
      void load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Güncellenemedi');
    } finally {
      setEditSaving(false);
    }
  };

  const downloadListContractPdf = async (r: ParentSignContractRow) => {
    if (!r.merged_html?.trim()) {
      setMsg('Bu kayıtta belge HTML bulunamadı; sayfayı yenileyip tekrar deneyin.');
      return;
    }
    setPdfRowId(r.id);
    setMsg(null);
    try {
      await downloadParentSignContractPdf({
        html: r.merged_html,
        signaturePng: r.signature_png_base64,
        contractNo: r.contract_number
      });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'PDF oluşturulamadı');
    } finally {
      setPdfRowId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/50 dark:from-slate-950 dark:via-slate-900 pb-16">
      <div className="border-b border-slate-200 bg-white/90 dark:bg-slate-900/90 backdrop-blur">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <p className="text-xs font-bold uppercase tracking-widest text-red-600">
            {headerKurumAdi || 'Kurum'}
          </p>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2 mt-1">
            <FileSignature className="w-8 h-8 text-blue-700" />
            Veli onayı & e-imza
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 max-w-2xl">
            <strong className="text-slate-800 dark:text-slate-200">Siz (kurum)</strong> bu sayfadasınız: menüde{' '}
            <strong className="text-slate-800 dark:text-slate-200">Veli onayı &amp; e-imza</strong> veya adres çubuğunda{' '}
            <code className="rounded bg-slate-100 px-1 text-xs dark:bg-slate-800">/veli-onay</code>.{' '}
            <strong className="text-slate-800 dark:text-slate-200">Veliye göndereceğiniz link</strong> ayrıdır: kayıt
            oluşturduktan sonra otomatik panoya kopyalanır ve aşağıdaki <em>Kayıtlar</em> listesinde <strong>Link</strong>{' '}
            düğmesiyle tekrar kopyalanır; veli tarayıcıda{' '}
            <code className="rounded bg-slate-100 px-1 text-xs dark:bg-slate-800">
              …/veli-imza/uzun-kod
            </code>{' '}
            adresini açar (veya <code className="rounded bg-slate-100 px-1 text-xs dark:bg-slate-800">/sign-contract/…</code>
            ). İşaretli kayıtlarda veli önce <strong>kayıt formunu</strong> gönderir; kurum ücreti girince aynı linkte{' '}
            <strong>e-sözleşmeyi imzalar</strong>. İşaretsiz kayıtlarda veli doğrudan sözleşmeyi görür ve imzalar.
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-500 mt-2 max-w-2xl border-l-2 border-blue-200 pl-3">
            <strong>Kurum</strong> süper yöneticide bu sayfadaki liste veya <strong>Ayarlar → aktif kurum</strong> ile
            belirlenir; koç ve yöneticide üst çubuktaki <strong>aktif kurum</strong> kullanılır. Şablonlar ve yeni veli
            kaydı seçilen kuruma yazılır (mevcut şablon satırları değişmez).
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
            <label className="text-sm font-semibold text-slate-800 dark:text-slate-100">Kurum (süper yönetici)</label>
            <p className="text-xs text-slate-500 mt-0.5 mb-2">
              Veli kayıtları ve şablonlar bu seçime veya Ayarlar’daki aktif kuruma göre yüklenir. Boş bırakırsanız aktif
              kurum kullanılır.
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

        <section className="rounded-2xl border border-violet-200 bg-white p-5 shadow-sm dark:border-violet-900 dark:bg-slate-900">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-1">KVKK ve satış metni linkleri</h2>
          <p className="text-xs text-slate-500 mb-4">
            Veli kayıt formundaki mavi bağlantılar buradan gelir. Harici PDF veya web sayfası için tam adres yapıştırın
            (ör. <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">https://…</code>). Boş bırakırsanız site
            içi varsayılan sayfa kullanılır; gövde metnini kodda{' '}
            <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">veliKayitLegalDocs.tsx</code> dosyasından
            düzenleyebilirsiniz.
          </p>
          {!effectiveInstitutionId ? (
            <p className="text-sm text-slate-500">Önce kurum seçin.</p>
          ) : legalLoading ? (
            <Loader2 className="w-6 h-6 animate-spin text-violet-600" />
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500">KVKK metni linki</label>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono dark:bg-slate-950 dark:border-slate-600"
                  value={legalKvkkUrl}
                  onChange={(e) => setLegalKvkkUrl(e.target.value)}
                  placeholder={`Boş = ${VELI_KAYIT_KVKK_DOC_HREF}`}
                />
                <p className="mt-0.5 text-[10px] text-slate-400">
                  Velide açılacak: {kvkkDocHref}
                </p>
              </div>
              <div>
                <label className="text-xs text-slate-500">Satış sözleşmesi / ön bilgilendirme linki</label>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono dark:bg-slate-950 dark:border-slate-600"
                  value={legalSatisUrl}
                  onChange={(e) => setLegalSatisUrl(e.target.value)}
                  placeholder={`Boş = ${VELI_KAYIT_SATIS_ONBILGI_DOC_HREF}`}
                />
                <p className="mt-0.5 text-[10px] text-slate-400">
                  Velide açılacak: {satisDocHref}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  disabled={legalSaving}
                  onClick={() => void saveInstitutionLegalLinks()}
                  className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-600 disabled:opacity-60"
                >
                  {legalSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Linkleri kaydet
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void copyText(
                      absoluteVeliLegalDocUrl(legalSatisUrl, VELI_KAYIT_SATIS_ONBILGI_DOC_HREF),
                      'Satış linki kopyalandı.'
                    )
                  }
                  className="inline-flex items-center gap-2 rounded-xl border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-900 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-100"
                >
                  <Copy className="w-4 h-4" />
                  Satış linkini kopyala
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void copyText(
                      absoluteVeliLegalDocUrl(legalKvkkUrl, VELI_KAYIT_KVKK_DOC_HREF),
                      'KVKK linki kopyalandı.'
                    )
                  }
                  className="inline-flex items-center gap-2 rounded-xl border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-900 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-100"
                >
                  <Copy className="w-4 h-4" />
                  KVKK linkini kopyala
                </button>
                <a
                  href={satisDocHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold text-violet-800 underline dark:text-violet-200"
                >
                  Satış metnini önizle
                </a>
                <a
                  href={kvkkDocHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold text-violet-800 underline dark:text-violet-200"
                >
                  KVKK metnini önizle
                </a>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-1 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-600" />
            Sınıf &amp; sözleşme şablonları
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            Sınıf ve program şablonları tanımlayın. Yeni kayıtta birden fazla program seçilebilir; her şablon için link
            kopyalayarak veli formunu önceden doldurabilirsiniz.
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
                      <th className="px-3 py-2 font-semibold min-w-[120px]">Link</th>
                      <th className="px-3 py-2 w-28" />
                    </tr>
                  </thead>
                  <tbody>
                    {presets.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                          Henüz şablon yok. Aşağıdan ekleyin.
                        </td>
                      </tr>
                    ) : (
                      presets.map((p) => (
                        <tr key={p.id} className="border-t border-slate-100 dark:border-slate-700">
                          <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-100">{p.sinif}</td>
                          <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{p.program_adi}</td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                              onClick={() =>
                                void copyText(buildPresetShareUrl(p.id), 'Şablon linki kopyalandı.')
                              }
                            >
                              <Copy className="w-3 h-3" />
                              Kopyala
                            </button>
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

              <div className="grid gap-3 sm:grid-cols-2 items-end">
                <div>
                  <label className="text-xs text-slate-500">Sınıf</label>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600"
                    value={presetSinif}
                    onChange={(e) => setPresetSinif(e.target.value)}
                  >
                    <option value="">— Seçin —</option>
                    {CLASS_LEVELS.map((lvl) => (
                      <option key={String(lvl.value)} value={String(lvl.value)}>
                        {lvl.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500">Program adı</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600"
                    value={presetProgram}
                    onChange={(e) => setPresetProgram(e.target.value)}
                    placeholder="ör. LGS Hazırlık Paketi"
                    list="veli-preset-program-suggestions"
                  />
                  <datalist id="veli-preset-program-suggestions">
                    {VELI_KAYIT_PROGRAM_SECENEKLERI.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
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
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">Yeni kayıt</h2>
          <p className="text-xs text-slate-500 mb-4">
            Veli linki oluşturun. Kayıt formu modunda veli bilgilerini gönderir; ücreti siz{' '}
            <strong>Kayıtlar</strong> listesinde girip imzaya açarsınız. Doğrudan imza modunda ücreti burada girersiniz.
          </p>

          <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50/90 p-3 dark:border-blue-900 dark:bg-blue-950/40">
            <label className="flex items-start gap-2 text-sm text-slate-800 dark:text-slate-100 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 shrink-0 rounded border-slate-400"
                checked={ogrenciOnceKayitFormu}
                onChange={(e) => setOgrenciOnceKayitFormu(e.target.checked)}
              />
              <span>
                <strong>Önce veli kayıt formunu doldursun</strong> — veli linkinde öğrenci/veli bilgileri, program,
                KVKK ve satış onayı istenir. Veli gönderdikten sonra kayıt kurumda görünür; listeden ücret ve taksiti
                girip <strong>Kaydet ve veliye imzaya aç</strong> ile e-sözleşme açılır (aynı link). Öğrenci/veli adını
                burada boş bırakabilirsiniz. İşareti kaldırırsanız veli doğrudan sözleşmeyi görür ve imzalar; ücreti
                aşağıda girmeniz gerekir.
              </span>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-xs text-slate-500">Sınıf</label>
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600"
                value={sinif}
                onChange={(e) => setSinif(e.target.value)}
              >
                <option value="">— Seçin —</option>
                {CLASS_LEVELS.map((lvl) => (
                  <option key={String(lvl.value)} value={String(lvl.value)}>
                    {lvl.label}
                  </option>
                ))}
              </select>
            </div>

            {presets.length > 0 ? (
              <div className="sm:col-span-2">
                <label className="text-xs text-slate-500">Programlar (şablondan, birden fazla seçilebilir)</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {presets.map((p) => {
                    const checked = selectedPresetIds.includes(p.id);
                    return (
                      <label
                        key={p.id}
                        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs cursor-pointer ${
                          checked
                            ? 'border-blue-400 bg-blue-50 text-blue-900 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-100'
                            : 'border-slate-200 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 rounded"
                          checked={checked}
                          onChange={() => togglePresetSelection(p.id)}
                        />
                        <span>
                          {p.sinif} — {p.program_adi}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="sm:col-span-2">
              <label className="text-xs text-slate-500">Ek program adı (isteğe bağlı)</label>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600"
                value={veliProgramCustom}
                onChange={(e) => {
                  const v = e.target.value;
                  setVeliProgramCustom(v);
                  if (isMaarifVeliProgram(v)) setSinif('TYT-Maarif');
                }}
                placeholder="Şablonda yoksa tek satır program adı"
                list="veli-kayit-program-suggestions"
              />
              <datalist id="veli-kayit-program-suggestions">
                {VELI_KAYIT_PROGRAM_SECENEKLERI.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
              {resolvedProgramAdi() ? (
                <p className="mt-1 text-[11px] text-slate-500">
                  Kayıtta görünecek program: <strong>{resolvedProgramAdi()}</strong>
                </p>
              ) : null}
            </div>

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
              <label className="text-xs text-slate-500">Öğrenci adı (isteğe bağlı)</label>
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

            {!ogrenciOnceKayitFormu ? (
              <>
                <div>
                  <label className="text-xs text-slate-500">Para birimi</label>
                  <select
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600"
                    value={paraBirimi}
                    onChange={(e) => setParaBirimi(e.target.value as ParaBirimi)}
                  >
                    {PARA_BIRIMI_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500">Ücret (zorunlu)</label>
                  <input
                    type="number"
                    min={1}
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
                <TaksitPlanEditor
                  taksitSayisi={taksitSayisi}
                  ucret={ucret}
                  paraBirimi={paraBirimi}
                  baslangic={baslangic}
                  vadeler={taksitVadeleri}
                  tutarlar={taksitTutarlari}
                  onVadelerChange={setTaksitVadeleri}
                  onTutarlarChange={setTaksitTutarlari}
                  onResetMonthly={() => setTaksitVadeleri(defaultTaksitVadeleri(baslangic, taksitSayisi))}
                  onResetEqualSplit={() => setTaksitTutarlari(splitTaksitTutarlari(ucret, taksitSayisi))}
                />
              </>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void submit()}
            className="mt-5 w-full sm:w-auto rounded-xl bg-gradient-to-r from-blue-700 to-red-600 px-6 py-3 text-sm font-bold text-white shadow-md hover:opacity-95"
          >
            {ogrenciOnceKayitFormu
              ? 'Kayıt formu linkini oluştur ve kopyala'
              : 'E-imza linkini oluştur ve kopyala'}
          </button>

          {lastCreatedLink ? (
            <div className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50/90 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
              <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100 flex items-center gap-2">
                <Link2 className="w-4 h-4" />
                Veli linki (veliye bunu gönderin)
              </p>
              <div className="mt-2 flex flex-wrap gap-2 items-stretch">
                <input
                  readOnly
                  value={lastCreatedLink}
                  className="min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-mono text-slate-800 dark:bg-slate-950 dark:border-emerald-900"
                  onFocus={(e) => e.target.select()}
                />
                <button
                  type="button"
                  onClick={() => void copyText(lastCreatedLink, 'Link panoya kopyalandı.')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400 bg-white px-3 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 dark:bg-slate-900 dark:hover:bg-emerald-950"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Kopyala
                </button>
                <a
                  href={lastCreatedLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-600"
                >
                  Aç
                </a>
              </div>
            </div>
          ) : null}
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
                      {formatUcretWithCurrency(r.ucret, r.para_birimi)} · {r.taksit_sayisi ?? 1} taksit · Kod: {r.kurum_kodu}
                      {r.student_id ? (
                        <span className="block mt-0.5 text-[11px] font-mono text-slate-500">
                          Öğrenci kartı: {r.student_id.slice(0, 8)}…
                        </span>
                      ) : null}
                      {linkedStudentUserId(r) ? (
                        <span className="block mt-0.5 text-[11px] font-mono text-slate-500">
                          Kullanıcı (users): {linkedStudentUserId(r).slice(0, 8)}…
                        </span>
                      ) : null}
                    </p>
                    {muhasebeOzetFromRow(r) ? (
                      <div className="mt-2 space-y-1.5 rounded-lg border border-slate-200 bg-white/80 p-2 text-[11px] text-slate-700 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-200">
                        <p className="font-semibold text-slate-800 dark:text-slate-100">Muhasebe / aktarım özeti</p>
                        <p className="whitespace-pre-wrap break-words">{muhasebeOzetFromRow(r)}</p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                            onClick={() => void navigator.clipboard.writeText(muhasebeOzetFromRow(r))}
                          >
                            <Copy className="w-3 h-3" /> Özeti kopyala
                          </button>
                          {canOpenUserManagement ? (
                            <a
                              href={
                                typeof window !== 'undefined' &&
                                parentContractRowSigned(r) &&
                                !linkedStudentUserId(r) &&
                                epostaFromKayitJson(r).includes('@')
                                  ? buildVeliSignedUserManagementPrefillUrl(r, window.location.origin) ||
                                    `${window.location.origin}/user-management`
                                  : `${window.location.origin}/user-management`
                              }
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-900 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-100"
                            >
                              <UserCog className="w-3 h-3" /> Kullanıcı yönetimi
                            </a>
                          ) : (
                            (() => {
                              const prefill =
                                typeof window !== 'undefined' &&
                                parentContractRowSigned(r) &&
                                !linkedStudentUserId(r) &&
                                epostaFromKayitJson(r).includes('@')
                                  ? buildVeliSignedUserManagementPrefillUrl(r, window.location.origin)
                                  : null;
                              if (prefill) {
                                return (
                                  <button
                                    type="button"
                                    className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-950 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
                                    onClick={() => void navigator.clipboard.writeText(prefill)}
                                  >
                                    <Copy className="w-3 h-3" /> Yöneticiye kullanıcı linki kopyala
                                  </button>
                                );
                              }
                              return (
                                <span className="self-center text-[10px] text-slate-500 dark:text-slate-400">
                                  Öğrenci girişi yönetici tarafından açılır.
                                </span>
                              );
                            })()
                          )}
                        </div>
                      </div>
                    ) : null}
                    {kayitFormPhase(r) === 'awaiting_admin_price' && priceDrafts[r.id] ? (
                      <div className="mt-2 rounded-lg border border-violet-300 bg-violet-50/80 p-3 text-[11px] dark:border-violet-800 dark:bg-violet-950/30">
                        <p className="font-semibold text-violet-950 dark:text-violet-100 mb-2">
                          Kayıt formu tamam — ücret ve taksit planını girin
                        </p>
                        <div className="grid gap-2 sm:grid-cols-3 mb-2">
                          <div>
                            <label className="text-[10px] text-slate-500">Para birimi</label>
                            <select
                              className="mt-0.5 w-full rounded border px-2 py-1 text-xs dark:bg-slate-950 dark:border-slate-600"
                              value={priceDrafts[r.id].paraBirimi}
                              onChange={(e) =>
                                patchPriceDraft(r.id, { paraBirimi: e.target.value as ParaBirimi })
                              }
                            >
                              {PARA_BIRIMI_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] text-slate-500">Toplam ücret</label>
                            <input
                              type="number"
                              min={1}
                              className="mt-0.5 w-full rounded border px-2 py-1 text-xs dark:bg-slate-950 dark:border-slate-600"
                              value={priceDrafts[r.id].ucret}
                              onChange={(e) =>
                                patchPriceDraft(r.id, { ucret: Math.max(0, Number(e.target.value) || 0) })
                              }
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-slate-500">Taksit sayısı</label>
                            <input
                              type="number"
                              min={1}
                              max={48}
                              className="mt-0.5 w-full rounded border px-2 py-1 text-xs dark:bg-slate-950 dark:border-slate-600"
                              value={priceDrafts[r.id].taksitSayisi}
                              onChange={(e) =>
                                patchPriceDraft(r.id, {
                                  taksitSayisi: Math.max(1, Math.min(48, Math.round(Number(e.target.value) || 1)))
                                })
                              }
                            />
                          </div>
                        </div>
                        <TaksitPlanEditor
                          compact
                          taksitSayisi={priceDrafts[r.id].taksitSayisi}
                          ucret={priceDrafts[r.id].ucret}
                          paraBirimi={priceDrafts[r.id].paraBirimi}
                          baslangic={String(r.baslangic_tarihi || '').slice(0, 10)}
                          vadeler={priceDrafts[r.id].vadeler}
                          tutarlar={priceDrafts[r.id].tutarlar}
                          onVadelerChange={(vadeler) => patchPriceDraft(r.id, { vadeler })}
                          onTutarlarChange={(tutarlar) => patchPriceDraft(r.id, { tutarlar })}
                          onResetMonthly={() =>
                            patchPriceDraft(r.id, {
                              vadeler: defaultTaksitVadeleri(
                                String(r.baslangic_tarihi || '').slice(0, 10),
                                priceDrafts[r.id].taksitSayisi
                              )
                            })
                          }
                          onResetEqualSplit={() =>
                            patchPriceDraft(r.id, {
                              tutarlar: splitTaksitTutarlari(
                                priceDrafts[r.id].ucret,
                                priceDrafts[r.id].taksitSayisi
                              )
                            })
                          }
                        />
                        <button
                          type="button"
                          disabled={parentSignRowBusy === `${r.id}:price`}
                          onClick={() => void saveAwaitingAdminPrice(r)}
                          className="mt-2 inline-flex items-center gap-1 rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-600 disabled:opacity-50"
                        >
                          {parentSignRowBusy === `${r.id}:price` ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          )}
                          Kaydet ve veliye imzaya aç
                        </button>
                      </div>
                    ) : null}
                    {taksitKartlariFromRow(r).length > 0 ? (
                      <div className="mt-2 rounded-lg border border-slate-200 bg-white/90 p-2 text-[11px] dark:border-slate-600 dark:bg-slate-900/60">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                          <p className="font-semibold text-slate-800 dark:text-slate-100">Taksit / tahsilat</p>
                          <Link
                            to="/tahsilat-muhasebe"
                            className="text-[10px] font-semibold text-blue-700 hover:underline dark:text-blue-300"
                          >
                            Aylık tahsilat panosu →
                          </Link>
                        </div>
                        <ul className="space-y-1">
                          {taksitKartlariFromRow(r).map((tk, idx) => {
                            const vade = effectiveVadeYmd(tk, r.baslangic_tarihi, idx);
                            const dur = classifyTaksit(vade, Boolean(tk.odendi));
                            const vurgu =
                              dur === 'overdue' && !tk.odendi
                                ? 'text-red-700 dark:text-red-300 font-semibold'
                                : dur === 'due_week' && !tk.odendi
                                  ? 'text-amber-800 dark:text-amber-200'
                                  : 'text-slate-700 dark:text-slate-200';
                            return (
                              <li
                                key={idx}
                                className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-1 last:border-0 dark:border-slate-700"
                              >
                                <span className={vurgu}>
                                  {tk.no ?? idx + 1}. taksit ·{' '}
                                  {tk.tutar_tl != null && Number.isFinite(tk.tutar_tl)
                                    ? formatUcretWithCurrency(tk.tutar_tl, r.para_birimi)
                                    : '—'}
                                  {tk.odendi ? (
                                    <span className="ml-1 text-emerald-600 font-semibold dark:text-emerald-400">(tahsil)</span>
                                  ) : dur === 'overdue' ? (
                                    <span className="ml-1 text-red-600 font-semibold dark:text-red-400">(gecikti)</span>
                                  ) : (
                                    <span className="ml-1 text-amber-700 dark:text-amber-300">(bekliyor)</span>
                                  )}
                                </span>
                                <div className="flex flex-wrap items-center gap-2">
                                  <label className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400">
                                    <span className="text-[10px]">Vade</span>
                                    <input
                                      type="date"
                                      className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] dark:bg-slate-950 dark:border-slate-600"
                                      value={vade}
                                      disabled={parentSignRowBusy === `${r.id}:v${idx}`}
                                      onChange={(e) => void updateTaksitVade(r, idx, e.target.value)}
                                    />
                                  </label>
                                <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-600 dark:text-slate-300">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(tk.odendi)}
                                    disabled={parentSignRowBusy === `${r.id}:t${idx}`}
                                    onChange={(e) => void toggleTaksitOdeme(r, idx, e.target.checked)}
                                  />
                                  Ödendi
                                </label>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ) : null}
                    {parentContractRowSigned(r) && !linkedStudentUserId(r) && epostaFromKayitJson(r).includes('@') ? (
                      <div className="mt-2 space-y-2 rounded-lg border border-emerald-200/80 bg-emerald-50/50 p-2 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                        <p className="text-[11px] font-semibold text-emerald-900 dark:text-emerald-100">
                          Öğrenci girişi (yönetici)
                        </p>
                        {(() => {
                          const prefillUrl =
                            typeof window !== 'undefined'
                              ? buildVeliSignedUserManagementPrefillUrl(r, window.location.origin)
                              : null;
                          if (!prefillUrl) return null;
                          return (
                            <div className="flex flex-wrap gap-2">
                              {canOpenUserManagement ? (
                                <a
                                  href={prefillUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-600 bg-emerald-600 px-2 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 dark:border-emerald-500 dark:bg-emerald-700"
                                >
                                  <UserCog className="w-3 h-3" />
                                  Kullanıcı yönetiminde aç (form dolu)
                                </a>
                              ) : null}
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                                onClick={() => void navigator.clipboard.writeText(prefillUrl)}
                              >
                                <Copy className="w-3 h-3" /> Bağlantıyı kopyala
                              </button>
                              {!canOpenUserManagement ? (
                                <p className="w-full text-[10px] text-amber-900/90 dark:text-amber-200/90">
                                  Giriş hesabı yalnızca yönetici oluşturabilir. Bağlantıyı yöneticinize iletin;
                                  siz açmaya çalışırsanız erişim olmaz.
                                </p>
                              ) : null}
                            </div>
                          );
                        })()}
                        <p className="text-[10px] text-slate-600 dark:text-slate-400">
                          Açılan sayfada öğrenci bilgileri doldurulur; yalnızca şifre (en az 6 karakter) girip
                          kaydedin. İsterseniz aşağıdan otomatik hesap da oluşturabilirsiniz.
                        </p>
                        <button
                          type="button"
                          disabled={parentSignRowBusy === `${r.id}:acc`}
                          onClick={() => void createStudentAccountFromRow(r)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                        >
                          {parentSignRowBusy === `${r.id}:acc` ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <UserCog className="w-3 h-3" />
                          )}
                          Otomatik hesap (geçici şifre)
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-stretch gap-2 w-full sm:w-auto sm:min-w-[200px]">
                    {parentContractRowSigned(r) ? (
                      <span className="inline-flex items-center justify-center gap-1 rounded-full bg-emerald-100 text-emerald-800 px-2 py-1 text-xs font-semibold dark:bg-emerald-900/40 dark:text-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5" /> İmzalı
                      </span>
                    ) : kayitFormPhase(r) === 'needs_form' ? (
                      <span className="inline-flex items-center justify-center gap-1 rounded-full bg-sky-100 text-sky-900 px-2 py-1 text-xs font-semibold dark:bg-sky-900/40 dark:text-sky-100">
                        <Clock className="w-3.5 h-3.5" /> Kayıt formu bekleniyor
                      </span>
                    ) : kayitFormPhase(r) === 'awaiting_admin_price' ? (
                      <span className="inline-flex items-center justify-center gap-1 rounded-full bg-violet-100 text-violet-900 px-2 py-1 text-xs font-semibold dark:bg-violet-900/40 dark:text-violet-100">
                        <Clock className="w-3.5 h-3.5" /> Ücret / taksit girilmeli
                      </span>
                    ) : (
                      <span className="inline-flex items-center justify-center gap-1 rounded-full bg-amber-100 text-amber-900 px-2 py-1 text-xs font-semibold dark:bg-amber-900/30 dark:text-amber-100">
                        <Clock className="w-3.5 h-3.5" /> Bekliyor
                      </span>
                    )}
                    <div className="flex flex-wrap gap-2 justify-end">
                      <button
                        type="button"
                        className="inline-flex items-center justify-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-100"
                        onClick={() => void navigator.clipboard.writeText(fullLink(r))}
                      >
                        <Copy className="w-3.5 h-3.5" /> Link
                      </button>
                      <a
                        href={fullLink(r)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                      >
                        <Link2 className="w-3.5 h-3.5" /> Önizle
                      </a>
                      {!parentContractRowSigned(r) ? (
                        <button
                          type="button"
                          className="inline-flex items-center justify-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
                          title="İmzalanmadan önce düzenle"
                          onClick={() => openEditContract(r)}
                        >
                          <Pencil className="w-3.5 h-3.5" /> Düzenle
                        </button>
                      ) : null}
                      {!parentContractRowSigned(r) ? (
                        <button
                          type="button"
                          disabled={pdfRowId === r.id}
                          title="İmza öncesi güncel metin (imza yok)"
                          className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                          onClick={() => void downloadListContractPdf(r)}
                        >
                          {pdfRowId === r.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Download className="w-3.5 h-3.5" />
                          )}
                          PDF (taslak)
                        </button>
                      ) : null}
                      {parentContractRowSigned(r) ? (
                        <button
                          type="button"
                          disabled={pdfRowId === r.id}
                          className="inline-flex items-center justify-center gap-1 rounded-lg border border-emerald-300 bg-emerald-500 px-2.5 py-1.5 text-xs font-bold text-emerald-950 hover:bg-emerald-400 disabled:opacity-50"
                          onClick={() => void downloadListContractPdf(r)}
                        >
                          {pdfRowId === r.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Download className="w-3.5 h-3.5" />
                          )}
                          PDF
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="inline-flex items-center justify-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200"
                        onClick={() => void removeContractRow(r.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Sil
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {editOpen ? (
        <div
          className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-black/50 px-3 py-8 backdrop-blur-sm"
          role="presentation"
          onClick={() => !editSaving && closeEditContract()}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-contract-title"
            className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-600 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2 mb-4">
              <h2 id="edit-contract-title" className="text-lg font-semibold text-slate-900 dark:text-white">
                Kaydı düzenle
              </h2>
              <button
                type="button"
                disabled={editSaving}
                className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                onClick={() => closeEditContract()}
              >
                Kapat
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Veli henüz imzalamadıysa alanları veya aşağıdaki seçenekle <strong>sözleşme HTML metnini</strong> doğrudan
              düzenleyebilirsiniz. Kaydedince belge güncellenir; <strong>veli linki aynı kalır</strong>.
            </p>
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/90 p-3 dark:border-amber-900 dark:bg-amber-950/30">
              <label className="flex items-start gap-2 text-sm text-amber-950 dark:text-amber-100 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-amber-400"
                  checked={editCustomHtmlMode}
                  onChange={(e) => setEditCustomHtmlMode(e.target.checked)}
                />
                <span>
                  <strong>Sözleşme HTML’ini doğrudan düzenle</strong> — işaretliyken kayıtta gösterilen tam metin
                  aşağıdaki kutudan kaydedilir; üstteki şablon alanları veri olarak saklanır ancak HTML bu kutudaki
                  içerik olur. İşareti kaldırırsanız bir sonraki kayıtta metin yine form alanlarından üretilir.
                </span>
              </label>
              {editCustomHtmlMode ? (
                <div className="mt-3">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Sözleşme gövdesi (HTML — veli sayfasında aynen gösterilir)
                  </label>
                  <textarea
                    rows={14}
                    spellCheck={false}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-xs font-mono leading-relaxed dark:bg-slate-950 dark:border-slate-600 dark:text-slate-100"
                    value={editMergedHtml}
                    onChange={(e) => setEditMergedHtml(e.target.value)}
                    placeholder="<p>…</p>"
                  />
                  <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">
                    En az 30 karakter. Güvenilir içerik kullanın; veli linkinde bu HTML işlenir.
                  </p>
                </div>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 max-h-[min(70vh,720px)] overflow-y-auto pr-1">
              <div>
                <label className="text-xs text-slate-500">Öğrenci adı</label>
                <input
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600"
                  value={editOgrenciAd}
                  onChange={(e) => setEditOgrenciAd(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">Öğrenci soyadı</label>
                <input
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600"
                  value={editOgrenciSoyad}
                  onChange={(e) => setEditOgrenciSoyad(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">Veli adı</label>
                <input
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600"
                  value={editVeliAd}
                  onChange={(e) => setEditVeliAd(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">Veli soyadı</label>
                <input
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600"
                  value={editVeliSoyad}
                  onChange={(e) => setEditVeliSoyad(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">Telefon</label>
                <input
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600"
                  value={editTelefon}
                  onChange={(e) => setEditTelefon(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">Adres</label>
                <input
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600"
                  value={editAdres}
                  onChange={(e) => setEditAdres(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">Sınıf</label>
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600"
                  value={editSinif}
                  onChange={(e) => setEditSinif(e.target.value)}
                >
                  <option value="">— Seçin —</option>
                  {CLASS_LEVELS.map((lvl) => (
                    <option key={String(lvl.value)} value={String(lvl.value)}>
                      {lvl.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-slate-500">Program adı</label>
                <input
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600"
                  value={editProgramAdi}
                  onChange={(e) => setEditProgramAdi(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs text-slate-500">Para birimi</label>
                <select
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600"
                  value={editParaBirimi}
                  onChange={(e) => setEditParaBirimi(e.target.value as ParaBirimi)}
                >
                  {PARA_BIRIMI_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500">Ücret</label>
                <input
                  type="number"
                  min={0}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600"
                  value={editUcret}
                  onChange={(e) => setEditUcret(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">Taksit sayısı</label>
                <input
                  type="number"
                  min={1}
                  max={48}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600"
                  value={editTaksitSayisi}
                  onChange={(e) => setEditTaksitSayisi(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">Başlangıç</label>
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600"
                  value={editBaslangic}
                  onChange={(e) => setEditBaslangic(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">Bitiş</label>
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600"
                  value={editBitis}
                  onChange={(e) => setEditBitis(e.target.value)}
                />
              </div>
              <TaksitPlanEditor
                taksitSayisi={editTaksitSayisi}
                ucret={editUcret}
                paraBirimi={editParaBirimi}
                baslangic={editBaslangic}
                vadeler={editTaksitVadeleri}
                tutarlar={editTaksitTutarlari}
                onVadelerChange={setEditTaksitVadeleri}
                onTutarlarChange={setEditTaksitTutarlari}
                onResetMonthly={() => setEditTaksitVadeleri(defaultTaksitVadeleri(editBaslangic, editTaksitSayisi))}
                onResetEqualSplit={() => setEditTaksitTutarlari(splitTaksitTutarlari(editUcret, editTaksitSayisi))}
              />
            </div>
            <div className="mt-5 flex flex-wrap gap-2 justify-end border-t border-slate-100 pt-4 dark:border-slate-700">
              <button
                type="button"
                disabled={editSaving}
                onClick={() => closeEditContract()}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200"
              >
                İptal
              </button>
              <button
                type="button"
                disabled={editSaving}
                onClick={() => void saveEditContract()}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-2 text-sm font-bold text-white hover:bg-blue-600 disabled:opacity-50"
              >
                {editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}
                Kaydet
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
