import { apiFetch } from './session';

/** Sınıf metninden haftalık saat / ücret önerisi (API ile aynı mantık). */
export function suggestHoursAndFeeFromSinif(sinifRaw: string): { hours: number; fee: number } {
  const t = String(sinifRaw || '')
    .trim()
    .toLowerCase();
  const num = t.match(/(\d{1,2})/);
  const n = num ? parseInt(num[1], 10) : NaN;
  if (Number.isFinite(n) && n >= 3 && n <= 5) return { hours: 4, fee: 18000 };
  if (Number.isFinite(n) && n >= 6 && n <= 8) return { hours: 6, fee: 28000 };
  if (n === 9 || t.includes('9.')) return { hours: 8, fee: 42000 };
  if (n === 10) return { hours: 10, fee: 48000 };
  if (n === 11) return { hours: 12, fee: 52000 };
  if (t.includes('maarif') || t === 'tyt-maarif') return { hours: 14, fee: 58000 };
  if (n === 12 || t.includes('tyt') || t.includes('ayt')) return { hours: 14, fee: 58000 };
  if (t.includes('lgs')) return { hours: 10, fee: 45000 };
  return { hours: 6, fee: 25000 };
}

export type SozlesmeTuruKey = 'kullanici_sozlesmesi' | 'satis_sozlesmesi' | 'diger';
export type ParaBirimi = 'TRY' | 'EUR' | 'USD' | 'GBP';

export const PARA_BIRIMI_OPTIONS: { value: ParaBirimi; label: string }[] = [
  { value: 'TRY', label: 'TL — Türk Lirası' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'USD', label: 'USD — Dolar' },
  { value: 'GBP', label: 'GBP — Sterlin' }
];

export function formatParaBirimiLabel(code?: string | null): string {
  const c = String(code || 'TRY').trim().toUpperCase();
  if (c === 'TRY') return 'TL';
  if (PARA_BIRIMI_OPTIONS.some((o) => o.value === c)) return c;
  return 'TL';
}

export function formatUcretWithCurrency(amount: number | string, code?: string | null): string {
  const raw = String(code || 'TRY').trim().toUpperCase();
  const c = raw === 'TRY' ? 'TL' : PARA_BIRIMI_OPTIONS.some((o) => o.value === raw) ? raw : 'TL';
  if (c === 'TL') return `${amount} TL`;
  const sym = c === 'EUR' ? '€' : c === 'USD' ? '$' : c === 'GBP' ? '£' : '';
  return sym ? `${amount} ${c} ${sym}` : `${amount} ${c}`;
}

export type ParentSignInstitutionLegal = {
  institution_id?: string;
  satis_sozlesmesi: string;
  kullanici_sozlesmesi: string;
  gizlilik_politikasi: string;
  kvkk_aydinlatma: string;
  kvkk_doc_url?: string;
  satis_doc_url?: string;
  updated_at?: string;
};

/** Şablon / sözleşme ders satırı */
export interface DersSatiri {
  ders_adi: string;
  haftalik_saat: number;
}

export interface ParentSignClassPresetRow {
  id: string;
  institution_id: string;
  sinif: string;
  program_adi: string;
  haftalik_ders_saati: number;
  ucret?: number;
  taksit_sayisi?: number;
  ders_satirlari?: DersSatiri[] | unknown;
  sozlesme_turu?: SozlesmeTuruKey | string;
  sozlesme_ozel_baslik?: string;
  sablon_ek_detay?: string;
  program_icerik_url?: string;
  created_at: string;
  updated_at: string;
}

export interface ParentSignContractRow {
  id: string;
  institution_id: string;
  created_by: string | null;
  ogrenci_ad: string;
  ogrenci_soyad: string;
  veli_ad: string;
  veli_soyad: string;
  telefon: string;
  adres: string;
  sinif: string;
  program_adi: string;
  baslangic_tarihi: string;
  bitis_tarihi: string;
  haftalik_ders_saati: number;
  ucret: number;
  para_birimi?: ParaBirimi | string;
  taksit_sayisi?: number;
  kurum_kodu: string;
  contract_number: string;
  verify_token: string;
  signing_token: string;
  status: string;
  merged_html: string;
  signature_png_base64: string | null;
  terms_accepted_at: string | null;
  signer_ip: string | null;
  signer_user_agent: string | null;
  signed_at: string | null;
  created_at: string;
  updated_at: string;
  sign_url?: string;
  sozlesme_turu?: string;
  sozlesme_basligi?: string;
  preset_id?: string | null;
  sablon_ek_detay_snapshot?: string;
  student_id?: string | null;
  ogrenci_user_id?: string | null;
  ders_programi_snapshot?: DersSatiri[] | unknown;
  /** Veli öncesi kayıt formu aşaması (phase: needs_form | ready_to_sign) ve muhasebe özeti */
  kayit_formu_json?: Record<string, unknown> | null;
}

export function sumDersSatirlari(rows: { haftalik_saat: number }[]): number {
  return rows.reduce((s, r) => s + (Number.isFinite(Number(r.haftalik_saat)) ? Number(r.haftalik_saat) : 0), 0);
}

export function parseDersSatirlariFromPreset(p: ParentSignClassPresetRow): DersSatiri[] {
  const raw = p.ders_satirlari;
  let arr: unknown[] = [];
  if (Array.isArray(raw)) arr = raw;
  else if (typeof raw === 'string' && raw.trim()) {
    try {
      const x = JSON.parse(raw) as unknown;
      arr = Array.isArray(x) ? x : [];
    } catch {
      arr = [];
    }
  }
  const out: DersSatiri[] = [];
  for (const x of arr) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const name = String(o.ders_adi ?? o.name ?? '').trim();
    const h = Number(o.haftalik_saat ?? o.saat ?? 0);
    if (!name || !Number.isFinite(h) || h <= 0) continue;
    out.push({ ders_adi: name.slice(0, 120), haftalik_saat: Math.min(40, Math.max(0.25, h)) });
  }
  if (out.length) return out;
  const fallback = Number(p.haftalik_ders_saati);
  if (Number.isFinite(fallback) && fallback > 0) return [{ ders_adi: 'Genel', haftalik_saat: fallback }];
  return [{ ders_adi: '', haftalik_saat: 2 }];
}

/** Öğrenci kartı — veli formunda otomatik doldurma */
export interface StudentFillRow {
  id: string;
  name: string;
  parent_name: string | null;
  parent_phone: string | null;
  phone: string | null;
  class_level: string | number | null;
  user_id: string | null;
}

/** Kurumdaki users satırı — rol(ler) öğrenci */
export interface UserStudentFillRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

export function splitAdSoyad(full: string): { ad: string; soyad: string } {
  const t = String(full || '').trim();
  if (!t) return { ad: '', soyad: '' };
  const i = t.indexOf(' ');
  if (i === -1) return { ad: t, soyad: '' };
  return { ad: t.slice(0, i).trim(), soyad: t.slice(i + 1).trim() };
}

const JSON_HDR = { 'Content-Type': 'application/json' };

export interface InstitutionPickRow {
  id: string;
  name: string;
}

/** Yalnızca süper admin — kurum adıyla seçim için */
export async function listInstitutionsForPicker(): Promise<InstitutionPickRow[]> {
  const res = await apiFetch('/api/institutions-list');
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error || `API ${res.status}`);
  return Array.isArray((j as { data?: unknown }).data) ? (j as { data: InstitutionPickRow[] }).data : [];
}

export async function listParentSignContracts(): Promise<ParentSignContractRow[]> {
  const res = await apiFetch('/api/parent-sign-contracts');
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error || `API ${res.status}`);
  return Array.isArray((j as { data?: unknown }).data) ? (j as { data: ParentSignContractRow[] }).data : [];
}

export async function listParentSignFillCandidates(institutionId: string): Promise<{
  students: StudentFillRow[];
  user_students: UserStudentFillRow[];
}> {
  const q = `?fill_students=1&institution_id=${encodeURIComponent(institutionId)}`;
  const res = await apiFetch(`/api/parent-sign-contracts${q}`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error || `API ${res.status}`);
  const inner = (j as { data?: { students?: StudentFillRow[]; user_students?: UserStudentFillRow[] } }).data;
  return {
    students: Array.isArray(inner?.students) ? inner.students : [],
    user_students: Array.isArray(inner?.user_students) ? inner.user_students : []
  };
}

export async function fetchParentSignInstitutionLegal(institutionId: string): Promise<ParentSignInstitutionLegal> {
  const q = institutionId ? `?institution_id=${encodeURIComponent(institutionId)}` : '';
  const res = await apiFetch(`/api/parent-sign-legal${q}`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error || `API ${res.status}`);
  const d = (j as { data?: ParentSignInstitutionLegal }).data;
  return {
    satis_sozlesmesi: String(d?.satis_sozlesmesi || ''),
    kullanici_sozlesmesi: String(d?.kullanici_sozlesmesi || ''),
    gizlilik_politikasi: String(d?.gizlilik_politikasi || ''),
    kvkk_aydinlatma: String(d?.kvkk_aydinlatma || ''),
    kvkk_doc_url: String(d?.kvkk_doc_url || ''),
    satis_doc_url: String(d?.satis_doc_url || '')
  };
}

export async function saveParentSignInstitutionLegal(body: {
  institution_id?: string;
  satis_sozlesmesi?: string;
  kullanici_sozlesmesi?: string;
  gizlilik_politikasi?: string;
  kvkk_aydinlatma?: string;
  kvkk_doc_url?: string;
  satis_doc_url?: string;
}): Promise<ParentSignInstitutionLegal> {
  const res = await apiFetch('/api/parent-sign-legal', {
    method: 'PATCH',
    headers: JSON_HDR,
    body: JSON.stringify(body)
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string; hint?: string }).hint || (j as { error?: string }).error || `API ${res.status}`);
  return (j as { data: ParentSignInstitutionLegal }).data;
}

export async function listParentSignClassPresets(institutionId: string): Promise<ParentSignClassPresetRow[]> {
  const q = institutionId ? `?institution_id=${encodeURIComponent(institutionId)}` : '';
  const res = await apiFetch(`/api/parent-sign-class-presets${q}`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error || `API ${res.status}`);
  return Array.isArray((j as { data?: unknown }).data) ? (j as { data: ParentSignClassPresetRow[] }).data : [];
}

export async function createParentSignClassPreset(body: {
  institution_id?: string;
  sinif: string;
  program_adi: string;
  ders_satirlari: DersSatiri[];
  sozlesme_turu?: SozlesmeTuruKey | string;
  sozlesme_ozel_baslik?: string;
  sablon_ek_detay?: string;
  program_icerik_url?: string;
}): Promise<ParentSignClassPresetRow> {
  const res = await apiFetch('/api/parent-sign-class-presets', {
    method: 'POST',
    headers: JSON_HDR,
    body: JSON.stringify(body)
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error || `API ${res.status}`);
  return (j as { data: ParentSignClassPresetRow }).data;
}

export async function updateParentSignClassPreset(body: {
  id: string;
  sinif: string;
  program_adi: string;
  ders_satirlari: DersSatiri[];
  sozlesme_turu?: SozlesmeTuruKey | string;
  sozlesme_ozel_baslik?: string;
  sablon_ek_detay?: string;
  program_icerik_url?: string;
}): Promise<ParentSignClassPresetRow> {
  const res = await apiFetch('/api/parent-sign-class-presets', {
    method: 'PATCH',
    headers: JSON_HDR,
    body: JSON.stringify(body)
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error || `API ${res.status}`);
  return (j as { data: ParentSignClassPresetRow }).data;
}

export async function deleteParentSignClassPreset(id: string): Promise<void> {
  const res = await apiFetch(`/api/parent-sign-class-presets?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error || `API ${res.status}`);
}

export async function createParentSignContract(body: {
  institution_id?: string;
  ogrenci_ad: string;
  ogrenci_soyad: string;
  veli_ad: string;
  veli_soyad: string;
  telefon: string;
  adres: string;
  sinif: string;
  program_adi: string;
  baslangic_tarihi: string;
  bitis_tarihi: string;
  haftalik_ders_saati?: number;
  ucret?: number;
  para_birimi?: ParaBirimi | string;
  taksit_sayisi?: number;
  preset_id?: string;
  student_id?: string;
  ogrenci_user_id?: string;
  sozlesme_turu?: SozlesmeTuruKey | string;
  sozlesme_basligi?: string;
  sablon_ek_detay_snapshot?: string;
  ders_satirlari?: DersSatiri[];
  /** true ise veli linkinde önce kayıt formu; isim/telefon kurumda boş bırakılabilir */
  registration_student_form?: boolean;
  /** Taksit vade tarihleri (YYYY-MM-DD); eksikse başlangıçtan aylık üretilir */
  taksit_vadeleri?: string[];
  /** Taksit tutarları; eksikse ücretten eşit bölünür */
  taksit_tutarlari?: number[];
}): Promise<ParentSignContractRow> {
  const res = await apiFetch('/api/parent-sign-contracts', { method: 'POST', headers: JSON_HDR, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error || `API ${res.status}`);
  return (j as { data: ParentSignContractRow }).data;
}

/** İmzalanmadan önce kayıt güncelle; `merged_html` formdan üretilir veya `custom_merged_html` ile doğrudan verilir. */
export async function updateParentSignContract(body: {
  id: string;
  ogrenci_ad: string;
  ogrenci_soyad: string;
  veli_ad: string;
  veli_soyad: string;
  telefon: string;
  adres: string;
  sinif: string;
  program_adi: string;
  baslangic_tarihi: string;
  bitis_tarihi: string;
  haftalik_ders_saati?: number;
  ucret?: number;
  para_birimi?: ParaBirimi | string;
  taksit_sayisi?: number;
  sozlesme_turu?: SozlesmeTuruKey | string;
  sozlesme_basligi?: string;
  sablon_ek_detay_snapshot?: string;
  ders_satirlari?: DersSatiri[];
  /** Doluysa şablon yerine bu HTML `merged_html` olarak kaydedilir (yalnız imzalanmamış kayıtta). */
  custom_merged_html?: string;
  /** Taksit satırı ödeme işareti (imzalı veya fiyat sonrası kartlar). */
  taksit_odeme_update?: { index: number; odendi: boolean; not?: string; odendi_tarihi?: string };
  /** Taksit vade tarihleri (YYYY-MM-DD) — ücret/taksit güncellemesinde kullanılır */
  taksit_vadeleri?: string[];
  /** Taksit tutarları — ücret/taksit güncellemesinde kullanılır */
  taksit_tutarlari?: number[];
  /** Tahsilat şekli: aylik_taksit | kredi_karti_tek | kredi_karti_otomatik */
  odeme_sekli?: string;
  /** KK tek çekimde tahsil edildi işareti */
  kk_tahsil_edildi?: boolean;
  /** `kayit_formu_json` ile sığ birleştirme (ör. platform_user_id). */
  kayit_json_merge?: Record<string, unknown>;
}): Promise<ParentSignContractRow> {
  const res = await apiFetch('/api/parent-sign-contracts', {
    method: 'PATCH',
    headers: JSON_HDR,
    body: JSON.stringify(body)
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error || `API ${res.status}`);
  return (j as { data: ParentSignContractRow }).data;
}

export async function deleteParentSignContract(id: string): Promise<void> {
  const res = await apiFetch(`/api/parent-sign-contracts?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error || `API ${res.status}`);
}

/** Sadece `kayit_json_merge`, `taksit_odeme_update` veya `taksit_vade_update` (tam form PATCH’i gerekmez). */
export async function patchParentSignKayitOnly(body: {
  id: string;
  kayit_json_merge?: Record<string, unknown>;
  taksit_odeme_update?: { index: number; odendi: boolean; not?: string; odendi_tarihi?: string };
  taksit_vade_update?: { index: number; vade_tarihi: string };
}): Promise<ParentSignContractRow> {
  const res = await apiFetch('/api/parent-sign-contracts', {
    method: 'PATCH',
    headers: JSON_HDR,
    body: JSON.stringify(body)
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error || `API ${res.status}`);
  return (j as { data: ParentSignContractRow }).data;
}

export type VeliImzaRegistrationHint = {
  program_adi?: string | null;
  programlar?: string[] | null;
  sinif?: string | null;
  baslangic_tarihi?: string | null;
  bitis_tarihi?: string | null;
  ucret?: number | null;
  para_birimi?: ParaBirimi | string | null;
  taksit_sayisi?: number | null;
  /** Kurum / öğrenci kartından otomatik doldurma */
  ogrenci_ad?: string | null;
  ogrenci_soyad?: string | null;
  veli_ad?: string | null;
  veli_soyad?: string | null;
  veli_tel?: string | null;
  ogrenci_tel?: string | null;
  eposta?: string | null;
  dogum_tarihi?: string | null;
  okul_adi?: string | null;
  il?: string | null;
  ilce?: string | null;
  adres_aciklama?: string | null;
};

export type VeliImzaPayload = {
  document_id: string;
  merged_html: string;
  contract_number: string;
  already_signed: boolean;
  signed_at?: string | null;
  institution_name?: string;
  signature_png_base64?: string | null;
  needs_student_form?: boolean;
  awaiting_admin_price?: boolean;
  registration_phase?: string | null;
  registration_hint?: VeliImzaRegistrationHint;
  kvkk_doc_href?: string;
  satis_doc_href?: string;
  program_icerik_href?: string | null;
};

export async function fetchVeliImzaPayload(token: string): Promise<VeliImzaPayload> {
  const q = new URLSearchParams({ signing_token: token, _ts: String(Date.now()) });
  const res = await fetch(`/api/parent-sign-contracts?${q.toString()}`, {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' }
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error || `API ${res.status}`);
  return (j as { data: VeliImzaPayload }).data;
}

const REG_FORM_ERR: Record<string, string> = {
  kvkk_form_required: 'Kayıt için KVKK onayı gereklidir.',
  names_required: 'Ad ve soyad alanlarını doldurun.',
  tc_invalid: 'T.C. kimlik numarası 11 haneli olmalıdır.',
  dogum_required: 'Doğum tarihi zorunludur.',
  okul_required: 'Okul adı zorunludur.',
  eposta_invalid: 'Geçerli bir e-posta girin.',
  il_ilce_required: 'İl ve ilçe zorunludur.',
  adres_required: 'Adres (mahalle, sokak ve kapı bilgisi) zorunludur.',
  il_required: 'İl zorunludur.',
  ilce_required: 'İlçe zorunludur.',
  veli_tel_invalid: 'Veli telefonu en az 10 rakam olmalıdır.',
  ogrenci_tel_invalid: 'Öğrenci telefonu en az 10 rakam olmalıdır.',
  sinif_program_required: 'Sınıf ve program bilgisi zorunludur.',
  registration_form_not_expected: 'Bu bağlantı için kayıt formu adımı beklenmiyor.',
  already_processed: 'Bu belge zaten işlenmiş.',
  not_found: 'Bağlantı bulunamadı veya süresi dolmuş.',
  program_invalid: 'Listeden en az 1, en fazla 2 geçerli program seçin.',
  satis_kvkk_form_required: 'Satış sözleşmesi / bilgilendirme onayı gereklidir.'
};

export async function submitVeliRegistrationForm(payload: {
  signing_token: string;
  ogrenci_ad: string;
  ogrenci_soyad: string;
  veli_ad: string;
  veli_soyad: string;
  tc_kimlik: string;
  dogum_tarihi: string;
  okul_adi: string;
  sinif_form: string;
  /** Birleşik metin (geriye dönük uyumluluk). */
  program_form: string;
  /** 1–2 program. */
  program_formlar?: string[];
  eposta: string;
  il: string;
  ilce: string;
  adres_aciklama?: string;
  veli_tel: string;
  ogrenci_tel: string;
  kvkk_form_ok: boolean;
  satis_kvkk_form_ok: boolean;
  odeme_tercihi_veli?: string;
}): Promise<void> {
  const { signing_token, kvkk_form_ok, satis_kvkk_form_ok, ...rest } = payload;
  const res = await fetch('/api/parent-sign-contracts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'submit_registration_form',
      signing_token,
      kvkk_form_ok,
      satis_kvkk_form_ok,
      ...rest
    })
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = String((j as { error?: string }).error || '');
    throw new Error(REG_FORM_ERR[code] || code || `API ${res.status}`);
  }
}

export async function submitVeliImza(payload: {
  signing_token: string;
  signature_png_base64: string;
  kvkk_ok: boolean;
  contract_ok: boolean;
}): Promise<void> {
  const res = await fetch('/api/parent-sign-contracts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = String((j as { error?: string }).error || '');
    const map: Record<string, string> = {
      registration_form_required_first: 'Önce kayıt bilgilerinizi göndermeniz gerekir.',
      admin_price_required_before_sign: 'Kurum ücreti girilene kadar imza alınamaz. Lütfen daha sonra tekrar deneyin.',
      confirmations_required: 'Onay kutularını işaretleyin.',
      signature_required: 'İmza gerekli.'
    };
    throw new Error(map[code] || code || `API ${res.status}`);
  }
}

export async function verifyParentDocumentPublic(token: string): Promise<{
  ok: boolean;
  contract_number?: string;
  status?: string;
  signed_at?: string | null;
  institution_name?: string;
  issued_at?: string;
  student_label?: string;
  error?: string;
}> {
  const res = await fetch(`/api/parent-sign-contracts?verify=${encodeURIComponent(token)}`);
  return res.json().catch(() => ({ ok: false }));
}

/** İmzalı veli kaydından tam profilli `users` + `students` oluşturur. */
export async function createStudentUserFromParentSign(opts: {
  contractId: string;
  institution_id: string;
  studentName: string;
  email: string;
  phone: string | null;
}): Promise<{ passwordPlain: string; userId: string; studentId?: string }> {
  const res = await apiFetch('/api/parent-sign-contracts', {
    method: 'POST',
    headers: JSON_HDR,
    body: JSON.stringify({
      action: 'provision_student_account',
      id: opts.contractId,
      force: false
    })
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error || `API ${res.status}`);
  const data = (j as { data?: Record<string, unknown> }).data || {};
  const userId = String(data.userId || '');
  if (!userId) throw new Error('Kullanıcı oluşturulamadı veya e-posta eksik.');
  const passwordPlain =
    data.passwordPlain != null && String(data.passwordPlain).trim()
      ? String(data.passwordPlain)
      : data.skipped
        ? '(hesap zaten bağlı — şifre değiştirilmedi)'
        : '';
  return {
    passwordPlain: passwordPlain || '(mevcut hesap)',
    userId,
    studentId: data.studentId != null ? String(data.studentId) : undefined
  };
}
