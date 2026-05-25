import { apiFetch } from '../session';
import type {
  EduAnimation,
  EduClass,
  EduHomework,
  EduHomeworkSubmission,
  EduLessonRow,
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

export async function fetchEduLessonRows(): Promise<EduLessonRow[]> {
  const res = await apiFetch('/api/edu-panel?resource=rows');
  const j = await parseJson<{ data: EduLessonRow[] }>(res);
  return j.data || [];
}

export async function createEduLessonRow(values: LessonRowFormValues): Promise<EduLessonRow> {
  const res = await apiFetch('/api/edu-panel?resource=rows', {
    method: 'POST',
    body: JSON.stringify(values)
  });
  const j = await parseJson<{ data: EduLessonRow }>(res);
  return j.data;
}

export async function updateEduLessonRow(
  id: string,
  patch: Partial<LessonRowFormValues> & { status?: LessonStatus }
): Promise<EduLessonRow> {
  const res = await apiFetch(`/api/edu-panel?resource=rows&id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch)
  });
  const j = await parseJson<{ data: EduLessonRow }>(res);
  return j.data;
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

export async function uploadEduAnimation(
  lessonRowId: string,
  file: File
): Promise<EduAnimation> {
  const file_base64 = await fileToBase64(file);
  const res = await apiFetch('/api/edu-panel?resource=animation', {
    method: 'POST',
    body: JSON.stringify({
      lesson_row_id: lessonRowId,
      file_name: file.name,
      file_base64
    })
  });
  const j = await parseJson<{ data: EduAnimation }>(res);
  return j.data;
}

export async function deleteEduAnimation(id: string): Promise<void> {
  const res = await apiFetch(`/api/edu-panel?resource=animation&id=${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
  await parseJson(res);
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
  return res.text();
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
  }
): Promise<EduHomework> {
  const res = await apiFetch('/api/edu-panel?resource=homework', {
    method: 'POST',
    body: JSON.stringify({ lesson_row_id: lessonRowId, ...payload })
  });
  const j = await parseJson<{ data: EduHomework }>(res);
  return j.data;
}

export async function publishEduHomework(id: string): Promise<void> {
  const res = await apiFetch(`/api/edu-panel?resource=homework&id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'published' })
  });
  await parseJson(res);
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
  file: File
): Promise<void> {
  const image_base64 = await fileToBase64(file);
  const res = await apiFetch('/api/edu-panel?resource=submit', {
    method: 'POST',
    body: JSON.stringify({
      homework_id: homeworkId,
      image_base64,
      mime: file.type || 'image/jpeg'
    })
  });
  await parseJson(res);
}

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
