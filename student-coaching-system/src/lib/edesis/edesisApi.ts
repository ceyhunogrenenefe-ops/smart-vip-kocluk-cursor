import { apiFetch } from '../session';

export type EdesisProbeResult = {
  ok: boolean;
  connected?: boolean;
  baseUrl?: string;
  path?: string;
  rowCount?: number;
  hasData?: boolean;
  warning?: string | null;
  hint?: string;
  error?: string;
  attempts?: unknown[];
};

export type EdesisSyncResult = {
  ok: boolean;
  error?: string;
  baseUrl?: string;
  path?: string;
  studentsInDb?: number;
  fetched?: number;
  rowsWithStudentFields?: number;
  sampleRowKeys?: string[];
  fetchMode?: string;
  httpStatus?: number | null;
  jsonShape?: { type?: string; keys?: string[]; hint?: Record<string, string>; unwrappedLength?: number } | null;
  apiHint?: string | null;
  matched?: number;
  imported?: number;
  skipped?: number;
  unmatchedCount?: number;
  unmatchedSample?: unknown[];
  matchedByMethod?: Record<string, number>;
  matchingGuide?: string[];
  diagnosis?: string | null;
  errors?: { id: string; error: string }[];
  hint?: string;
};

export type EdesisStatus = {
  configured: boolean;
  institutionCode: string;
  baseUrl: string;
  examsPath: string | null;
  authMode: string;
  studentsInDb?: number;
  studentsWithEdesisId?: number;
  studentsWithEmail?: number;
  matchingGuide?: string[];
  hint?: string;
};

export async function fetchEdesisStatus(): Promise<EdesisStatus> {
  const res = await apiFetch('/api/edesis-sync?op=status');
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || res.statusText);
  return j as EdesisStatus;
}

export async function probeEdesis(): Promise<EdesisProbeResult> {
  const res = await apiFetch('/api/edesis-sync?op=probe');
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || res.statusText);
  return j as EdesisProbeResult;
}

export async function syncEdesis(): Promise<EdesisSyncResult> {
  const res = await apiFetch('/api/edesis-sync?op=sync', { method: 'POST' });
  const j = await res.json().catch(() => ({}));
  return j as EdesisSyncResult;
}

export async function importEdesisJson(rows: unknown[]): Promise<EdesisSyncResult> {
  const res = await apiFetch('/api/edesis-sync?op=import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows })
  });
  const j = await res.json().catch(() => ({}));
  return j as EdesisSyncResult;
}
