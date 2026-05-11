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
  if (n === 12 || t.includes('tyt') || t.includes('ayt')) return { hours: 14, fee: 58000 };
  if (t.includes('lgs')) return { hours: 10, fee: 45000 };
  return { hours: 6, fee: 25000 };
}

export interface ParentSignClassPresetRow {
  id: string;
  institution_id: string;
  sinif: string;
  program_adi: string;
  haftalik_ders_saati: number;
  ucret: number;
  taksit_sayisi: number;
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
  haftalik_ders_saati: number;
  ucret: number;
  taksit_sayisi: number;
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
  haftalik_ders_saati: number;
  ucret: number;
  taksit_sayisi: number;
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
  taksit_sayisi?: number;
}): Promise<ParentSignContractRow> {
  const res = await apiFetch('/api/parent-sign-contracts', { method: 'POST', headers: JSON_HDR, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error || `API ${res.status}`);
  return (j as { data: ParentSignContractRow }).data;
}

export async function fetchVeliImzaPayload(token: string) {
  const res = await fetch(`/api/parent-sign-contracts?signing_token=${encodeURIComponent(token)}`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error || `API ${res.status}`);
  return (j as { data: { document_id: string; merged_html: string; contract_number: string; already_signed: boolean; signed_at?: string | null } }).data;
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
  if (!res.ok) throw new Error((j as { error?: string }).error || `API ${res.status}`);
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
