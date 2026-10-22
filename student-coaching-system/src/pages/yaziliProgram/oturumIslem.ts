import { apiFetch } from '../../lib/session';

export type OturumHedef = {
  lesson_date: string;
  start_time: string;
  end_time: string;
  subject?: string;
  teacher_id?: string | null;
};
export type OturumKaynak = {
  id: string;
  class_id: string;
  subject: string;
  teacher_id: string | null;
  lesson_date: string;
  start_time: string;
  end_time: string;
};

const dk = (t: string) => {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};

async function istek<T = Record<string, unknown>>(url: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(url, init);
  const j = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string; hint?: string };
  if (!res.ok) {
    const msg = j.message || j.hint || j.error || `İşlem başarısız (${res.status})`;
    throw new Error(/teacher_required/.test(String(msg)) ? 'Öğretmen seçin.' : String(msg));
  }
  return j;
}

/** Yeni canlı ders oluşturur (öğretmen çakışması sunucuda kontrol edilir). Oturum id döner. */
export async function oturumOlustur(p: {
  class_id: string;
  teacher_id: string;
  subject: string;
  lesson_date: string;
  start_time: string;
  end_time: string;
}): Promise<string> {
  const j = await istek<{ data?: { id: string }[] }>('/api/class-live-lessons?op=bulk-schedule-sessions', {
    method: 'POST',
    body: JSON.stringify({
      ...p,
      duration_minutes: dk(p.end_time) - dk(p.start_time),
      repeat_interval_days: 0,
      occurrences: 1
    })
  });
  const id = j.data?.[0]?.id;
  if (!id) throw new Error('Canlı ders oluşturulamadı');
  return id;
}

export async function oturumIptal(sessionId: string) {
  await istek(`/api/class-live-lessons?session_id=${encodeURIComponent(sessionId)}&apply_scope=single`, { method: 'DELETE' });
}

/**
 * Canlı dersi taşır / düzenler.
 * - Aynı gün: doğrudan düzenler.
 * - Başka gün: önce hedef güne yeni ders oluşturur, sonra eskisini iptal eder. Tarihi değiştirilen
 *   şablon dersi, günlük otomatik iş tarafından eski güne yeniden üretiliyordu; iptal kaydı bunu önler.
 * @returns geçerli oturum id (gün değiştiyse yeni id)
 */
export async function oturumTasi(o: OturumKaynak, h: OturumHedef): Promise<string> {
  const subject = (h.subject ?? o.subject).trim();
  const teacherId = (h.teacher_id === undefined ? o.teacher_id : h.teacher_id) || '';
  if (h.lesson_date === o.lesson_date) {
    const patch: Record<string, string> = { id: o.id, apply_scope: 'single' };
    if (h.start_time !== o.start_time) patch.start_time = h.start_time;
    if (h.end_time !== o.end_time) patch.end_time = h.end_time;
    if (subject !== o.subject) patch.subject = subject;
    if (teacherId && teacherId !== (o.teacher_id || '')) patch.teacher_id = teacherId;
    if (Object.keys(patch).length > 2) {
      await istek('/api/class-live-lessons', { method: 'PATCH', body: JSON.stringify(patch) });
    }
    return o.id;
  }
  if (!teacherId) throw new Error('Bu dersin öğretmeni yok; başka güne taşımak için önce öğretmen seçin.');
  const yeniId = await oturumOlustur({
    class_id: o.class_id,
    teacher_id: teacherId,
    subject,
    lesson_date: h.lesson_date,
    start_time: h.start_time,
    end_time: h.end_time
  });
  try {
    await oturumIptal(o.id);
  } catch (e) {
    // Eski ders iptal edilemediyse yeni dersi geri al: iki kopya kalmasın
    await oturumIptal(yeniId).catch(() => {});
    throw e;
  }
  return yeniId;
}
