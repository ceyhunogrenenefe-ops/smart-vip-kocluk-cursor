import { apiFetch } from '../session';
import type {
  EduAnimation,
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

export async function fetchEduLessonRows(): Promise<EduLessonRow[]> {
  const res = await apiFetch('/api/edu-panel?resource=rows');
  const j = await parseJson<{ data: EduLessonRow[] }>(res);
  return j.data || [];
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
