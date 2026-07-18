import { apiFetch } from '../session';
import type {
  EduAnimation,
  EduAnimationPoolItem,
  EduClass,
  EduHomework,
  EduHomeworkSubmission,
  EduLessonRow,
  EduLessonRowProgress,
  EduRowStudentProgress,
  HomeworkStatus,
  LessonRowFormValues,
  LessonStatus
} from '../../types/eduPanel.types';

async function parseJson<T>(res: Response): Promise<T> {
  const j = (await res.json()) as T & { error?: string; hint?: string };
  if (!res.ok) {
    throw new Error(j.hint || j.error || res.statusText || 'İstek başarısız');
  }
  return j;
}

export type EduLessonRowsResult = {
  data: EduLessonRow[];
  progress?: EduLessonRowProgress[];
  hint?: string;
  message?: string;
};

export async function fetchEduLessonRows(): Promise<EduLessonRow[]> {
  const res = await apiFetch('/api/edu-panel?resource=rows');
  const j = await parseJson<{ data: EduLessonRow[]; hint?: string; message?: string }>(res);
  return j.data || [];
}

/** Öğrenci paneli: boş liste ipucu / mesaj ile birlikte; progress tek istekte gelir */
export async function fetchEduLessonRowsDetailed(): Promise<EduLessonRowsResult> {
  const res = await apiFetch('/api/edu-panel?resource=rows');
  const j = await parseJson<{
    data: EduLessonRow[];
    progress?: EduLessonRowProgress[];
    hint?: string;
    message?: string;
  }>(res);
  return {
    data: j.data || [],
    progress: j.progress,
    hint: j.hint,
    message: j.message
  };
}

export async function fetchHomeworkAttachmentUrl(homeworkId: string): Promise<string | null> {
  const res = await apiFetch(
    `/api/edu-panel?resource=homework-attachment&homework_id=${encodeURIComponent(homeworkId)}`
  );
  const j = await parseJson<{ url: string | null }>(res);
  return j.url || null;
}

export async function createEduLessonRow(
  values: LessonRowFormValues
): Promise<{ data: EduLessonRow; warning?: string; hint?: string }> {
  const res = await apiFetch('/api/edu-panel?resource=rows', {
    method: 'POST',
    body: JSON.stringify(values)
  });
  const j = await parseJson<{ data: EduLessonRow; warning?: string; hint?: string }>(res);
  return { data: j.data, warning: j.warning, hint: j.hint };
}

export async function updateEduLessonRow(
  id: string,
  patch: Partial<LessonRowFormValues> & { status?: LessonStatus }
): Promise<{ data: EduLessonRow; warning?: string }> {
  const res = await apiFetch(`/api/edu-panel?resource=rows&id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch)
  });
  const j = await parseJson<{ data: EduLessonRow; warning?: string }>(res);
  return { data: j.data, warning: j.warning };
}

export async function deleteEduLessonRow(id: string): Promise<void> {
  const res = await apiFetch(`/api/edu-panel?resource=rows&id=${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
  await parseJson<{ ok: boolean }>(res);
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** İzleme / iframe: animasyonu sayfa ortasında göster; mevcut dosyalara da uygulanır. */
export function ensureEduAnimationCenteredHtml(raw: string): string {
  let html = String(raw || '');
  if (!html.trim()) return html;
  if (/id=["']edu-anim-layout["']/.test(html)) return html;

  const style =
    `<style id="edu-anim-layout">` +
    `html{height:100%;}` +
    `body{margin:0!important;padding:0;min-height:100vh;min-height:100dvh;width:100%;` +
    `display:flex!important;flex-direction:column;align-items:center;justify-content:center;` +
    `box-sizing:border-box;background:#f8fafc;overflow:auto;}` +
    `body>*{max-width:min(100%,1100px);}` +
    `img,canvas,svg,video,iframe{max-width:100%;height:auto;}` +
    `</style>` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"/>`;

  if (!/<html[\s>]/i.test(html) && !/<!DOCTYPE/i.test(html)) {
    return (
      `<!DOCTYPE html>\n<html lang="tr">\n<head>\n` +
      `<meta charset="utf-8"/>\n<title>Animasyon</title>\n${style}\n</head>\n` +
      `<body>\n${html}\n</body>\n</html>\n`
    );
  }

  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${style}</head>`);
  }
  if (/<body[^>]*>/i.test(html)) {
    return html.replace(/<body([^>]*)>/i, `<head>${style}</head><body$1>`);
  }
  return html;
}

/** Yapıştırılan HTML kodunu animasyon dosyasına çevirir (dosya yükleme API’si ile aynı yol). */
export function htmlStringToAnimationFile(
  rawHtml: string,
  fileName = 'animation.html'
): File {
  const trimmed = String(rawHtml || '').trim();
  if (!trimmed) {
    throw new Error('HTML kodu boş');
  }
  const content = ensureEduAnimationCenteredHtml(trimmed);
  const safe =
    String(fileName || 'animation.html')
      .replace(/[^\w.\u00C0-\u024F\-]+/gi, '_')
      .replace(/\.+/g, '.')
      .replace(/^\./, '') || 'animation.html';
  const name = /\.html?$/i.test(safe) ? safe : `${safe}.html`;
  return new File([content], name, { type: 'text/html;charset=utf-8' });
}

/** https URL doğrula (NotebookLM, Canva vb.) */
export function normalizeExternalAnimationUrl(raw: string): string {
  const s = String(raw || '').trim();
  if (!s) throw new Error('Link boş');
  let url: URL;
  try {
    url = new URL(s.includes('://') ? s : `https://${s}`);
  } catch {
    throw new Error('Geçersiz link');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Sadece http/https linkleri kabul edilir');
  }
  if (url.protocol === 'http:') {
    url.protocol = 'https:';
  }
  return url.toString();
}

function escapeHtmlText(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Dış link için öğrenciye ortalanmış açılış sayfası HTML’i */
export function externalLinkToAnimationHtml(url: string, title = 'İçerik'): string {
  const href = normalizeExternalAnimationUrl(url);
  const safeTitle = escapeHtmlText(title || 'İçerik');
  const safeHref = escapeHtmlText(href);
  let host = '';
  try {
    host = escapeHtmlText(new URL(href).hostname);
  } catch {
    host = '';
  }
  const isNotebook = /notebooklm\.google/i.test(href);
  const cta = isNotebook ? 'NotebookLM’de aç' : 'Linki aç';
  return ensureEduAnimationCenteredHtml(
    `<div id="edu-link-launch" style="font-family:system-ui,sans-serif;text-align:center;padding:2rem;max-width:28rem;width:100%">` +
      `<div style="font-size:2.5rem;margin-bottom:0.75rem" aria-hidden="true">${isNotebook ? '📓' : '🔗'}</div>` +
      `<h1 style="font-size:1.25rem;margin:0 0 0.5rem;color:#0f172a">${safeTitle}</h1>` +
      `<p style="margin:0 0 1.25rem;color:#64748b;font-size:0.875rem">` +
      `Bu içerik dış bir linkte${host ? ` (${host})` : ''}. Aşağıdan açın — tam ekran önerilir.` +
      `</p>` +
      `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" ` +
      `style="display:inline-block;background:#7c3aed;color:#fff;font-weight:700;text-decoration:none;` +
      `padding:0.85rem 1.5rem;border-radius:0.75rem;font-size:0.95rem">${cta}</a>` +
      `<p style="margin:1rem 0 0;font-size:0.7rem;color:#94a3b8;word-break:break-all">${safeHref}</p>` +
      `</div>`
  );
}

export function externalLinkToAnimationFile(url: string, title = 'link', fileName?: string): File {
  const href = normalizeExternalAnimationUrl(url);
  const html = externalLinkToAnimationHtml(href, title);
  let host = 'link';
  try {
    host = new URL(href).hostname.replace(/^www\./, '');
  } catch {
    /* ignore */
  }
  const name =
    fileName ||
    `${String(title || host)
      .slice(0, 40)
      .replace(/[^\w.\u00C0-\u024F\-]+/gi, '_') || 'link'}.html`;
  return new File([html], name.endsWith('.html') ? name : `${name}.html`, {
    type: 'text/html;charset=utf-8'
  });
}

export async function uploadEduAnimation(
  lessonRowId: string,
  file: File,
  opts?: { external_url?: string }
): Promise<EduAnimation & { pooled?: boolean }> {
  const file_base64 = await fileToBase64(file);
  const externalUrl = opts?.external_url?.trim()
    ? normalizeExternalAnimationUrl(opts.external_url)
    : '';
  const res = await apiFetch('/api/edu-panel?resource=animation', {
    method: 'POST',
    body: JSON.stringify({
      lesson_row_id: lessonRowId,
      file_name: file.name,
      file_base64,
      add_to_pool: true,
      ...(externalUrl ? { external_url: externalUrl, source_kind: 'link' } : {})
    })
  });
  const j = await parseJson<{ data: EduAnimation; pooled?: boolean }>(res);
  return { ...j.data, pooled: j.pooled };
}

export async function uploadEduAnimationFromHtml(
  lessonRowId: string,
  html: string,
  fileName?: string
): Promise<EduAnimation & { pooled?: boolean }> {
  return uploadEduAnimation(lessonRowId, htmlStringToAnimationFile(html, fileName));
}

export async function deleteEduAnimation(id: string): Promise<void> {
  const res = await apiFetch(`/api/edu-panel?resource=animation&id=${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
  await parseJson(res);
}

export async function fetchEduAnimationPool(params?: {
  program?: string;
  class_level?: string;
  subject_name?: string;
  q?: string;
}): Promise<EduAnimationPoolItem[]> {
  const sp = new URLSearchParams({ resource: 'animation-pool' });
  if (params?.program) sp.set('program', params.program);
  if (params?.class_level) sp.set('class_level', params.class_level);
  if (params?.subject_name) sp.set('subject_name', params.subject_name);
  if (params?.q) sp.set('q', params.q);
  const res = await apiFetch(`/api/edu-panel?${sp.toString()}`);
  const j = await parseJson<{ data: EduAnimationPoolItem[] }>(res);
  return j.data || [];
}

export async function uploadEduPoolAnimation(payload: {
  title: string;
  program?: string;
  class_level?: string;
  targets?: { program: string; class_level: string }[];
  subject_name: string;
  topic_name: string;
  file?: File | null;
  html_code?: string;
  external_url?: string;
}): Promise<EduAnimationPoolItem> {
  let file = payload.file || null;
  let externalUrl = '';
  if (!file && payload.external_url?.trim()) {
    externalUrl = normalizeExternalAnimationUrl(payload.external_url);
    file = externalLinkToAnimationFile(externalUrl, payload.title.trim() || 'link');
  }
  if (!file && payload.html_code?.trim()) {
    const slug =
      payload.title
        .trim()
        .slice(0, 40)
        .replace(/[^\w.\u00C0-\u024F\-]+/gi, '_') || 'animation';
    file = htmlStringToAnimationFile(payload.html_code, `${slug}.html`);
  }
  if (!file) {
    throw new Error('HTML dosyası, kodu veya link gerekli');
  }
  const file_base64 = await fileToBase64(file);
  const res = await apiFetch('/api/edu-panel?resource=animation-pool', {
    method: 'POST',
    body: JSON.stringify({
      title: payload.title,
      program: payload.program,
      class_level: payload.class_level,
      targets: payload.targets,
      subject_name: payload.subject_name,
      topic_name: payload.topic_name,
      file_name: file.name,
      file_base64,
      ...(externalUrl
        ? { external_url: externalUrl, source_kind: 'link' }
        : { source_kind: 'html' })
    })
  });
  const j = await parseJson<{ data: EduAnimationPoolItem }>(res);
  return j.data;
}

export async function updateEduPoolAnimation(
  id: string,
  patch: Partial<
    Pick<
      EduAnimationPoolItem,
      'title' | 'program' | 'class_level' | 'subject_name' | 'topic_name' | 'targets'
    >
  >
): Promise<EduAnimationPoolItem> {
  const res = await apiFetch(`/api/edu-panel?resource=animation-pool&id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch)
  });
  const j = await parseJson<{ data: EduAnimationPoolItem }>(res);
  return j.data;
}

export async function deleteEduPoolAnimation(id: string): Promise<void> {
  const res = await apiFetch(`/api/edu-panel?resource=animation-pool&id=${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
  await parseJson(res);
}

export async function attachPoolAnimationToLessonRow(
  lessonRowId: string,
  poolId: string
): Promise<EduAnimation> {
  const res = await apiFetch('/api/edu-panel?resource=animation-attach-pool', {
    method: 'POST',
    body: JSON.stringify({ lesson_row_id: lessonRowId, pool_id: poolId })
  });
  const j = await parseJson<{ data: EduAnimation }>(res);
  return j.data;
}

/** Animasyon HTML — doğru charset ile; iframe için blob URL üretin. */
export async function fetchAnimationHtml(animationId: string): Promise<string> {
  const res = await apiFetch(
    `/api/edu-panel?resource=animation-html&animation_id=${encodeURIComponent(animationId)}`
  );
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = (await res.json()) as { error?: string; hint?: string };
      msg = j.hint || j.error || msg;
    } catch {
      /* text/html hata gövdesi olabilir */
    }
    throw new Error(msg || 'Animasyon yüklenemedi');
  }
  return ensureEduAnimationCenteredHtml(await res.text());
}

/** Havuz animasyonu HTML — önizleme için blob URL üretin. */
export async function fetchPoolAnimationHtml(poolId: string): Promise<string> {
  const res = await apiFetch(
    `/api/edu-panel?resource=pool-animation-html&pool_id=${encodeURIComponent(poolId)}`
  );
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = (await res.json()) as { error?: string; hint?: string };
      msg = j.hint || j.error || msg;
    } catch {
      /* text/html hata gövdesi olabilir */
    }
    throw new Error(msg || 'Animasyon yüklenemedi');
  }
  return ensureEduAnimationCenteredHtml(await res.text());
}

export async function createEduHomework(
  lessonRowId: string,
  payload: {
    title: string;
    book_name?: string;
    question_range?: string;
    description?: string;
    due_date?: string;
    status?: HomeworkStatus;
    pool_animation_id?: string;
    pool_animation_ids?: string[];
    assignee_mode?: 'class' | 'students';
    assignee_student_ids?: string[];
    pdf_file?: File | null;
  }
): Promise<{ homework: EduHomework; notified: number }> {
  const { pdf_file, ...rest } = payload;
  const body: Record<string, unknown> = { lesson_row_id: lessonRowId, ...rest };
  if (pdf_file && (pdf_file.type === 'application/pdf' || /\.pdf$/i.test(pdf_file.name))) {
    if (pdf_file.size > 15 * 1024 * 1024) {
      throw new Error('PDF en fazla 15 MB olabilir');
    }
    // Vercel ~4.5MB body limiti — PDF asla base64 ile API’ye gitmesin
    const uploaded = await uploadHomeworkPdfDirect(pdf_file);
    body.pdf_path = uploaded.path;
    body.pdf_name = uploaded.file_name;
  }
  const res = await apiFetch('/api/edu-panel?resource=homework', {
    method: 'POST',
    body: JSON.stringify(body)
  });
  if (res.status === 413) {
    throw new Error(
      'İstek çok büyük (413). PDF’yi yeniden seçip tekrar deneyin; sorun sürerse dosyayı küçültün.'
    );
  }
  const j = await parseJson<{ data: EduHomework; notify?: { notified?: number } }>(res);
  return { homework: j.data, notified: Number(j.notify?.notified || 0) };
}

async function uploadHomeworkPdfDirect(file: File): Promise<{ path: string; file_name: string }> {
  const prep = await apiFetch('/api/edu-panel?resource=homework-pdf-upload', {
    method: 'POST',
    body: JSON.stringify({
      file_name: file.name || 'odev.pdf',
      file_size: file.size
    })
  });
  if (!prep.ok) {
    const j = await prep.json().catch(() => ({}));
    throw new Error(
      (j as { hint?: string; error?: string }).hint ||
        (j as { error?: string }).error ||
        `PDF yükleme hazırlığı başarısız (${prep.status})`
    );
  }
  const prepJson = (await prep.json()) as {
    data: { path: string; signedUrl?: string | null; token?: string | null; file_name: string };
  };
  const { path, signedUrl, token, file_name } = prepJson.data || ({} as { path: string; file_name: string });
  if (!path) throw new Error('PDF yükleme yolu alınamadı');

  if (signedUrl) {
    const put = await fetch(signedUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/pdf',
        'x-upsert': 'true'
      },
      body: file
    });
    if (!put.ok) {
      const t = await put.text().catch(() => '');
      throw new Error(t.slice(0, 200) || `PDF Storage’a yüklenemedi (${put.status})`);
    }
    return { path, file_name: file_name || file.name || 'odev.pdf' };
  }

  // Eski Supabase yanıtı: token ile uploadToSignedUrl benzeri POST
  if (token) {
    const put = await fetch(signedUrl || '', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/pdf',
        Authorization: `Bearer ${token}`,
        'x-upsert': 'true'
      },
      body: file
    });
    if (put.ok) return { path, file_name: file_name || file.name || 'odev.pdf' };
  }

  throw new Error('PDF yükleme bağlantısı (signedUrl) alınamadı — Storage ayarını kontrol edin');
}

export async function publishEduHomework(id: string): Promise<{ notified: number }> {
  const res = await apiFetch(`/api/edu-panel?resource=homework&id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'published' })
  });
  const j = await parseJson<{ notify?: { notified?: number } }>(res);
  return { notified: Number(j.notify?.notified || 0) };
}

export async function fetchMyEduSubmission(
  homeworkId: string
): Promise<EduHomeworkSubmission | null> {
  const res = await apiFetch(
    `/api/edu-panel?resource=my-submission&homework_id=${encodeURIComponent(homeworkId)}`
  );
  const j = await parseJson<{ data: EduHomeworkSubmission | null }>(res);
  return j.data;
}

export async function submitEduHomework(
  homeworkId: string,
  payload?: { photos?: File[]; video?: File | null }
): Promise<void> {
  const photos = (payload?.photos || []).filter((f) => f && f.type.startsWith('image/'));
  const video = payload?.video && payload.video.type.startsWith('video/') ? payload.video : null;

  const body: Record<string, unknown> = { homework_id: homeworkId };
  if (photos.length === 1 && !video) {
    body.image_base64 = await fileToBase64(photos[0]);
    body.mime = photos[0].type || 'image/jpeg';
  } else {
    if (photos.length) {
      body.photos_base64 = await Promise.all(
        photos.map(async (file) => ({
          data: await fileToBase64(file),
          mime: file.type || 'image/jpeg'
        }))
      );
    }
    if (video) {
      body.video_base64 = await fileToBase64(video);
      body.video_mime = video.type || 'video/mp4';
    }
  }

  const res = await apiFetch('/api/edu-panel?resource=submit', {
    method: 'POST',
    body: JSON.stringify(body)
  });
  await parseJson(res);
}

export async function fetchEduHomeworkSubmissions(
  homeworkId: string
): Promise<EduHomeworkSubmission[]> {
  const res = await apiFetch(
    `/api/edu-panel?resource=submissions&homework_id=${encodeURIComponent(homeworkId)}`
  );
  const j = await parseJson<{ data: EduHomeworkSubmission[] }>(res);
  return j.data || [];
}

export type EduTeacherStudentOption = {
  id: string;
  name: string;
  user_id?: string | null;
  class_id?: string | null;
};

export async function fetchEduTeacherStudents(
  lessonRowId?: string | null
): Promise<EduTeacherStudentOption[]> {
  const q = lessonRowId
    ? `&lesson_row_id=${encodeURIComponent(lessonRowId)}`
    : '';
  const res = await apiFetch(`/api/edu-panel?resource=teacher-students${q}`);
  const j = await parseJson<{ data: EduTeacherStudentOption[] }>(res);
  return j.data || [];
}

export type EduHomeworkStatsPayload = {
  submitted: number;
  pending: number;
  late: number;
  total: number;
  rate: number;
  earliest?: { name: string; at: string } | null;
  latest?: { name: string; at: string } | null;
  missingNames: string[];
  photoCount: number;
  videoCount: number;
  roster: { id: string; name: string; user_id?: string | null; status: 'submitted' | 'pending' | 'late' }[];
};

export async function fetchEduHomeworkStats(homeworkId: string): Promise<EduHomeworkStatsPayload> {
  const res = await apiFetch(
    `/api/edu-panel?resource=homework-stats&homework_id=${encodeURIComponent(homeworkId)}`
  );
  const j = await parseJson<{ data: EduHomeworkStatsPayload }>(res);
  return j.data;
}

export async function patchEduHomeworkSubmission(
  submissionId: string,
  patch: {
    teacher_note?: string;
    grade?: string;
    status?: EduHomeworkSubmission['status'];
    delete_media?: boolean;
  }
): Promise<EduHomeworkSubmission> {
  const res = await apiFetch(
    `/api/edu-panel?resource=submissions&id=${encodeURIComponent(submissionId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(patch)
    }
  );
  const j = await parseJson<{ data: EduHomeworkSubmission }>(res);
  return j.data;
}

export async function fetchMyEduProgress(): Promise<EduLessonRowProgress[]> {
  const res = await apiFetch('/api/edu-panel?resource=progress');
  const j = await parseJson<{ data: EduLessonRowProgress[] }>(res);
  return j.data || [];
}

export async function saveEduLessonProgress(
  lessonRowId: string,
  patch: {
    animation_completed?: boolean;
    homework_percent?: number;
    topic_completed?: boolean;
  }
): Promise<EduLessonRowProgress> {
  const res = await apiFetch('/api/edu-panel?resource=progress', {
    method: 'POST',
    body: JSON.stringify({ lesson_row_id: lessonRowId, ...patch })
  });
  const j = await parseJson<{ data: EduLessonRowProgress }>(res);
  return j.data;
}

export async function markEduAnimationViewed(lessonRowId: string): Promise<void> {
  const res = await apiFetch('/api/edu-panel?resource=progress', {
    method: 'POST',
    body: JSON.stringify({ lesson_row_id: lessonRowId, animation_completed: true })
  });
  await parseJson(res);
}

export async function fetchEduRowStudentProgress(
  lessonRowId: string,
  classId?: string | null
): Promise<{ data: EduRowStudentProgress[]; classes: { id: string; name: string }[] }> {
  const q = classId
    ? `&class_id=${encodeURIComponent(classId)}`
    : '';
  const res = await apiFetch(
    `/api/edu-panel?resource=row-progress&lesson_row_id=${encodeURIComponent(lessonRowId)}${q}`
  );
  const j = await parseJson<{ data: EduRowStudentProgress[]; classes?: { id: string; name: string }[] }>(res);
  return { data: j.data || [], classes: j.classes || [] };
}

export type { EduRowStudentProgress };

export async function fetchEduClasses(): Promise<EduClass[]> {
  const res = await apiFetch('/api/class-live-lessons?scope=classes');
  const j = await parseJson<{ data: EduClass[] }>(res);
  return j.data || [];
}

export const SUBJECT_COLORS = [
  { value: 'blue', label: 'Mavi' },
  { value: 'green', label: 'Yeşil' },
  { value: 'amber', label: 'Turuncu' },
  { value: 'red', label: 'Kırmızı' },
  { value: 'purple', label: 'Mor' },
  { value: 'pink', label: 'Pembe' },
  { value: 'gray', label: 'Gri' }
] as const;
