import { apiFetch } from './session';

export type DocumentTemplateKind = 'program_pdf' | 'contract' | 'rules';

export interface DocumentTemplateRow {
  id: string;
  institution_id: string | null;
  kind: DocumentTemplateKind;
  name: string;
  academic_year_label: string;
  grade_label: string;
  body: string;
  is_active: boolean;
  copied_from_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProgramPackageRow {
  id: string;
  institution_id: string;
  name: string;
  grade_label: string;
  field_domain: string;
  subjects_json: unknown[];
  weekly_hours: number;
  feature_coaching: boolean;
  feature_trials: boolean;
  feature_etut: boolean;
  feature_discipline: boolean;
  camera_required: boolean;
  price_numeric: number;
  contract_start_date: string | null;
  contract_end_date: string | null;
  pdf_template_id: string | null;
  contract_template_id: string | null;
  rules_template_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface GeneratedContractRow {
  id: string;
  institution_id: string;
  student_id: string;
  program_package_id: string | null;
  primary_kind: string;
  source_template_ids: string[];
  merged_html: string;
  contract_number: string;
  verify_token: string;
  signing_token: string;
  status: string;
  pdf_storage_path: string | null;
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

const JSON_HDR = { 'Content-Type': 'application/json' };

export async function fetchDocumentTemplates(kind?: DocumentTemplateKind | ''): Promise<DocumentTemplateRow[]> {
  const q = kind ? `?kind=${encodeURIComponent(kind)}` : '';
  const res = await apiFetch(`/api/document-templates${q}`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error || `API ${res.status}`);
  return Array.isArray((j as { data?: unknown }).data) ? (j as { data: DocumentTemplateRow[] }).data : [];
}

export async function saveDocumentTemplate(
  row: Partial<DocumentTemplateRow> & { name: string; kind: DocumentTemplateKind }
): Promise<DocumentTemplateRow> {
  const res = await apiFetch('/api/document-templates', { method: 'POST', headers: JSON_HDR, body: JSON.stringify(row) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error || `API ${res.status}`);
  return (j as { data: DocumentTemplateRow }).data;
}

export async function copyDocumentTemplate(fromId: string, name?: string): Promise<DocumentTemplateRow> {
  const res = await apiFetch('/api/document-templates', {
    method: 'POST',
    headers: JSON_HDR,
    body: JSON.stringify({ copy_from_id: fromId, name: name || undefined })
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error || `API ${res.status}`);
  return (j as { data: DocumentTemplateRow }).data;
}

export async function patchDocumentTemplate(id: string, patch: Partial<DocumentTemplateRow>): Promise<DocumentTemplateRow> {
  const res = await apiFetch(`/api/document-templates?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: JSON_HDR,
    body: JSON.stringify(patch)
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error || `API ${res.status}`);
  return (j as { data: DocumentTemplateRow }).data;
}

export async function deleteDocumentTemplate(id: string): Promise<void> {
  const res = await apiFetch(`/api/document-templates?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error((j as { error?: string }).error || `API ${res.status}`);
  }
}

export async function fetchProgramPackages(): Promise<ProgramPackageRow[]> {
  const res = await apiFetch('/api/program-packages');
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error || `API ${res.status}`);
  return Array.isArray((j as { data?: unknown }).data) ? (j as { data: ProgramPackageRow[] }).data : [];
}

export async function saveProgramPackage(
  row: Partial<ProgramPackageRow> & { name: string; institution_id?: string }
): Promise<ProgramPackageRow> {
  const res = await apiFetch('/api/program-packages', { method: 'POST', headers: JSON_HDR, body: JSON.stringify(row) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error || `API ${res.status}`);
  return (j as { data: ProgramPackageRow }).data;
}

export async function patchProgramPackage(id: string, patch: Partial<ProgramPackageRow>): Promise<ProgramPackageRow> {
  const res = await apiFetch(`/api/program-packages?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: JSON_HDR,
    body: JSON.stringify(patch)
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error || `API ${res.status}`);
  return (j as { data: ProgramPackageRow }).data;
}

export async function deleteProgramPackage(id: string): Promise<void> {
  const res = await apiFetch(`/api/program-packages?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error((j as { error?: string }).error || `API ${res.status}`);
  }
}

export async function fetchGeneratedDocuments(params?: { student_id?: string; id?: string }): Promise<GeneratedContractRow[]> {
  const sp = new URLSearchParams();
  if (params?.student_id) sp.set('student_id', params.student_id);
  if (params?.id) sp.set('id', params.id);
  const q = sp.toString() ? `?${sp}` : '';
  const res = await apiFetch(`/api/contract-documents${q}`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error || `API ${res.status}`);
  const d = (j as { data?: GeneratedContractRow | GeneratedContractRow[] }).data;
  if (params?.id) return d && !Array.isArray(d) ? [d as GeneratedContractRow] : [];
  return Array.isArray(d) ? d : [];
}

export async function createGeneratedDocument(body: {
  student_id: string;
  program_package_id?: string;
  template_ids?: string[];
  include_program_pdf?: boolean;
}): Promise<GeneratedContractRow> {
  const res = await apiFetch('/api/contract-documents', { method: 'POST', headers: JSON_HDR, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error || `API ${res.status}`);
  return (j as { data: GeneratedContractRow }).data;
}

export async function patchGeneratedDocument(id: string, patch: { status?: string }): Promise<GeneratedContractRow> {
  const res = await apiFetch(`/api/contract-documents?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: JSON_HDR,
    body: JSON.stringify(patch)
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error || `API ${res.status}`);
  return (j as { data: GeneratedContractRow }).data;
}

export async function verifyDocumentPublic(token: string): Promise<{
  ok: boolean;
  contract_number?: string;
  status?: string;
  signed_at?: string | null;
  institution_name?: string;
  issued_at?: string;
  error?: string;
}> {
  const res = await fetch(`/api/contract-documents?verify=${encodeURIComponent(token)}`);
  return res.json().catch(() => ({ ok: false, error: 'network' }));
}

export async function fetchSigningPayload(token: string): Promise<{
  document_id: string;
  merged_html: string;
  contract_number: string;
  already_signed: boolean;
  signed_at?: string | null;
}> {
  const res = await fetch(`/api/contract-signatures?signing_token=${encodeURIComponent(token)}`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error || `API ${res.status}`);
  return (j as { data: { document_id: string; merged_html: string; contract_number: string; already_signed: boolean; signed_at?: string | null } }).data;
}

export async function submitSignature(payload: {
  signing_token: string;
  signature_png_base64: string;
  accepted_terms: boolean;
}): Promise<void> {
  const res = await fetch('/api/contract-signatures', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error || `API ${res.status}`);
}

export const TEMPLATE_VARIABLES = [
  '{{ogrenci_ad}}',
  '{{ogrenci_soyad}}',
  '{{veli_ad}}',
  '{{veli_soyad}}',
  '{{telefon}}',
  '{{adres}}',
  '{{sinif}}',
  '{{program_adi}}',
  '{{baslangic_tarihi}}',
  '{{bitis_tarihi}}',
  '{{haftalik_ders_saati}}',
  '{{ucret}}',
  '{{koc_adi}}',
  '{{kurum_adi}}',
  '{{kurum_logo_url}}',
  '{{sozlesme_numarasi}}',
  '{{qr_dogrulama_linki}}',
  '{{imza_baglantisi}}'
] as const;
