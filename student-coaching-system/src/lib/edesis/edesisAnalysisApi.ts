import { apiFetch } from '../session';

export type AnalysisWindow = 'last5' | 'last10' | 'all';

export async function fetchEdesisStudentAnalysis(params: {
  studentId: string;
  family?: string;
  window?: AnalysisWindow | string;
  from?: string;
  to?: string;
  examIds?: string[];
}) {
  const qs = new URLSearchParams({ op: 'student-analysis', studentId: params.studentId });
  if (params.family) qs.set('family', params.family);
  if (params.window) qs.set('window', params.window);
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  const res = await apiFetch(`/api/edesis-analysis?${qs.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || j.hint || res.statusText);
  return j;
}

export async function fetchEdesisAnalysisDashboard() {
  const res = await apiFetch('/api/edesis-analysis?op=dashboard');
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || res.statusText);
  return j;
}

export async function fetchEdesisEvaluations(studentId: string) {
  const res = await apiFetch(`/api/edesis-analysis?op=list-evaluations&studentId=${encodeURIComponent(studentId)}`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || res.statusText);
  return j as { ok: boolean; items: Record<string, unknown>[]; hint?: string };
}

export async function saveEdesisEvaluation(body: Record<string, unknown>) {
  const res = await apiFetch('/api/edesis-analysis?op=save-evaluation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || j.hint || res.statusText);
  return j;
}

export async function publishEdesisEvaluation(studentId: string, reportId: string) {
  const res = await apiFetch('/api/edesis-analysis?op=publish-evaluation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId, reportId })
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || j.hint || res.statusText);
  return j;
}

export async function generateEdesisAnalysisPdf(body: {
  studentId: string;
  examId: string;
  reportCodes: number[];
  examTitle?: string;
  forceNew?: boolean;
  termId?: string | number;
}) {
  const res = await apiFetch('/api/edesis-analysis?op=generate-pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || j.hint || j.message || res.statusText);
  return j as { ok: boolean; reportUrl?: string; jobId?: string; status?: string; message?: string; items?: unknown[] };
}

export async function listEdesisGeneratedPdfs(studentId: string) {
  const res = await apiFetch(`/api/edesis-analysis?op=list-pdfs&studentId=${encodeURIComponent(studentId)}`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || res.statusText);
  return j as { ok: boolean; items: Record<string, unknown>[] };
}

export async function pollEdesisAnalysisPdf(params: { studentId: string; jobId?: string; reportId?: string }) {
  const qs = new URLSearchParams({ op: 'poll-pdf', studentId: params.studentId });
  if (params.jobId) qs.set('jobId', params.jobId);
  if (params.reportId) qs.set('reportId', params.reportId);
  const res = await apiFetch(`/api/edesis-analysis?${qs.toString()}`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || j.hint || res.statusText);
  return j as { ok: boolean; reportUrl?: string; status?: string; jobId?: string; message?: string };
}

export async function fetchEdesisReportVersions(studentId: string, reportId: string) {
  const qs = new URLSearchParams({ op: 'list-versions', studentId, reportId });
  const res = await apiFetch(`/api/edesis-analysis?${qs.toString()}`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || res.statusText);
  return j as { ok: boolean; items: Record<string, unknown>[] };
}

export async function archiveEdesisEvaluation(studentId: string, reportId: string) {
  const res = await apiFetch('/api/edesis-analysis?op=archive-evaluation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId, reportId })
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || j.hint || res.statusText);
  return j;
}

export async function fetchEdesisConnectionStatus() {
  const res = await apiFetch('/api/edesis-analysis?op=connection-status');
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || res.statusText);
  return j as { ok: boolean; connected?: boolean; keyConfigured?: boolean; hint?: string };
}

export async function logEdesisReportShare(body: Record<string, unknown>) {
  const res = await apiFetch('/api/edesis-analysis?op=share-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const j = await res.json().catch(() => ({}));
  if (res.status === 409) return { ...j, duplicate: true };
  if (!res.ok) throw new Error(j.error || j.hint || res.statusText);
  return j;
}

export const EVAL_SECTION_KEYS: { key: string; label: string }[] = [
  { key: 'genel', label: 'Genel değerlendirme' },
  { key: 'sonSinav', label: 'Son sınav' },
  { key: 'son5', label: 'Son 5 sınav' },
  { key: 'son10', label: 'Son 10 sınav' },
  { key: 'netGelisimi', label: 'Toplam net gelişimi' },
  { key: 'dersBazli', label: 'Ders bazlı değerlendirme' },
  { key: 'gucluDersler', label: 'Güçlü dersler' },
  { key: 'gelistirilecekDersler', label: 'Geliştirilmesi gereken dersler' },
  { key: 'kritikKonular', label: 'Kritik konu eksikleri' },
  { key: 'ogretmen', label: 'Öğretmen değerlendirmesi' },
  { key: 'koc', label: 'Koç değerlendirmesi' },
  { key: 'haftalikOneri', label: 'Haftalık çalışma önerisi' },
  { key: 'soruHedefi', label: 'Soru çözüm hedefleri' },
  { key: 'etut', label: 'Etüt önerileri' },
  { key: 'ozelDers', label: 'Özel ders önerisi' },
  { key: 'ogrenciMesaj', label: 'Öğrenciye mesaj' },
  { key: 'veliMesaj', label: 'Veliye mesaj' },
  { key: 'sonrakiHedef', label: 'Bir sonraki sınav hedefi' }
];
