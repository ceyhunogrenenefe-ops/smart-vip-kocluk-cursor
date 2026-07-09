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
  file: File;
}): Promise<EduAnimationPoolItem> {
  const file_base64 = await fileToBase64(payload.file);
  const res = await apiFetch('/api/edu-panel?resource=animation-pool', {
    method: 'POST',
    body: JSON.stringify({
      title: payload.title,
      program: payload.program,
      class_level: payload.class_level,
      targets: payload.targets,
      subject_name: payload.subject_name,
      topic_name: payload.topic_name,
      file_name: payload.file.name,
      file_base64
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
  return res.text();
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
    pool_animation_id?: string;
    pool_animation_ids?: string[];
    assignee_mode?: 'class' | 'students';
    assignee_student_ids?: string[];
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
