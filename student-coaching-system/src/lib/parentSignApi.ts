import { apiFetch } from './session';

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

export async function listParentSignContracts(): Promise<ParentSignContractRow[]> {
  const res = await apiFetch('/api/parent-sign-contracts');
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error || `API ${res.status}`);
  return Array.isArray((j as { data?: unknown }).data) ? (j as { data: ParentSignContractRow[] }).data : [];
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
