import { apiFetch } from './session';

/**
 * Haftalık planı başka bir haftaya aktarma.
 * Önizleme hiçbir şey yazmaz; aktarım kipi açıkça seçilir.
 */

export type AktarimKipi = 'iptal' | 'birlestir' | 'degistir';

export type AktarimOnizlemeGorev = {
  id: string;
  subject: string;
  title: string;
  planner_date: string;
  start_time: string;
  end_time: string;
  planned_quantity: number;
  _kaynak_tarih?: string;
};

export type AktarimCakisma = {
  planner_date: string;
  start_time: string;
  end_time: string;
  title: string;
  existing_title: string;
  existing_start: string;
  existing_end: string;
};

export type AktarimOzeti = {
  source_week: string;
  target_week: string;
  source_count: number;
  target_existing_count: number;
  copy_count: number;
  skipped_invalid: number;
  conflict_count: number;
  mergeable_count: number;
};

export type AktarimOnizleme = AktarimOzeti & {
  preview: AktarimOnizlemeGorev[];
  conflicts: AktarimCakisma[];
};

export type AktarimSonucu = AktarimOzeti & {
  inserted: number;
  deleted: number;
  mode: AktarimKipi;
};

async function cagir<T>(op: string, body: Record<string, unknown>): Promise<T> {
  const res = await apiFetch(`/api/weekly-planner-entries?op=${op}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = (await res.json().catch(() => ({}))) as { data?: T; error?: string; message?: string };
  if (!res.ok) {
    const kod = j.error || `API ${res.status}`;
    const metin =
      kod === 'source_week_empty'
        ? 'Kaynak haftada aktarılacak görev yok.'
        : kod === 'target_week_not_empty'
          ? 'Hedef haftada zaten plan var; bir seçenek belirleyin.'
          : kod === 'same_week'
            ? 'Kaynak ve hedef hafta aynı olamaz.'
            : j.message || kod;
    throw new Error(metin);
  }
  return j.data as T;
}

/** Salt okunur: ne olacağını gösterir, hiçbir kayıt oluşturmaz. */
export function haftaAktarimOnizle(params: {
  studentId: string;
  sourceWeek: string;
  targetWeek: string;
}) {
  return cagir<AktarimOnizleme>('copy-week-preview', {
    student_id: params.studentId,
    source_week: params.sourceWeek,
    target_week: params.targetWeek,
  });
}

export function haftaAktar(params: {
  studentId: string;
  sourceWeek: string;
  targetWeek: string;
  mode: AktarimKipi;
}) {
  return cagir<AktarimSonucu>('copy-week', {
    student_id: params.studentId,
    source_week: params.sourceWeek,
    target_week: params.targetWeek,
    mode: params.mode,
  });
}
