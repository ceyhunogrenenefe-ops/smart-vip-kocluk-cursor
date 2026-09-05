/** Kayıt Takibi — merkezi config ve Türkçe etiketler */

export const GRADE_PROGRAMS = [
  { code: 'grade_2', label: '2. Sınıf', sortOrder: 10 },
  { code: 'grade_3', label: '3. Sınıf', sortOrder: 20 },
  { code: 'grade_4', label: '4. Sınıf', sortOrder: 30 },
  { code: 'grade_5', label: '5. Sınıf', sortOrder: 40 },
  { code: 'grade_6', label: '6. Sınıf', sortOrder: 50 },
  { code: 'grade_7', label: '7. Sınıf', sortOrder: 60 },
  { code: 'lgs', label: 'LGS', sortOrder: 70 },
  { code: 'grade_9', label: '9. Sınıf', sortOrder: 80 },
  { code: 'grade_10', label: '10. Sınıf', sortOrder: 90 },
  { code: 'grade_11', label: '11. Sınıf', sortOrder: 100 },
  { code: 'yks', label: 'YKS', sortOrder: 110 },
  { code: 'yos', label: 'YÖS', sortOrder: 120 },
  { code: 'private_lesson', label: 'Özel Ders', sortOrder: 130 }
] as const;

export const GRADE_LABEL: Record<string, string> = Object.fromEntries(
  GRADE_PROGRAMS.map((g) => [g.code, g.label])
);

export const STAGE_LABELS: Record<string, string> = {
  new_lead: 'Yeni kayıt adayı',
  first_contact_pending: 'İlk görüşme yapılacak',
  first_contact_completed: 'İlk görüşme yapıldı',
  presentation_scheduled: 'Tanıtım görüşmesi planlandı',
  trial_lesson_scheduled: 'Deneme dersi planlandı',
  trial_lesson_completed: 'Deneme dersi yapıldı',
  offer_sent: 'Program ve fiyat sunuldu',
  considering: 'Veli düşünüyor',
  follow_up: 'Tekrar aranacak',
  payment_pending: 'Ödeme bekleniyor',
  postponed: 'Daha sonra aranacak',
  confirmed: 'Kesin kayıt',
  lost: 'Olumsuz sonuçlandı'
};

export const TEMPERATURE_LABELS: Record<string, string> = {
  hot: 'Sıcak',
  warm: 'Ilık',
  cold: 'Soğuk'
};

export const LOST_REASON_LABELS: Record<string, string> = {
  price_high: 'Ücret yüksek bulundu',
  other_institution: 'Başka kuruma kayıt oldu',
  no_online: 'Online eğitim istemedi',
  program_mismatch: 'Program uygun olmadı',
  schedule_mismatch: 'Ders saatleri uygun olmadı',
  unreachable: 'Veliye ulaşılamadı',
  postponed: 'Şimdilik erteledi',
  info_only: 'Sadece bilgi aldı',
  not_interested: 'Kayıt düşünmüyor',
  other: 'Diğer'
};

export const KANBAN_STAGES = [
  'new_lead',
  'first_contact_pending',
  'first_contact_completed',
  'presentation_scheduled',
  'trial_lesson_scheduled',
  'trial_lesson_completed',
  'offer_sent',
  'considering',
  'follow_up',
  'payment_pending',
  'postponed'
] as const;

/** Deneme dersi aşamaları (üst filtre + CRM sütunu) */
export const TRIAL_STAGES = ['trial_lesson_scheduled', 'trial_lesson_completed'] as const;

/** Gelen lead / ilk temas aşamaları */
export const INCOMING_STAGES = ['new_lead', 'first_contact_pending'] as const;

/**
 * Bitrix tarzı sade CRM pipeline (Kanban).
 * Her sütun bir veya birden fazla stage’i toplar.
 */
export const CRM_PIPELINE_COLUMNS: {
  id: string;
  label: string;
  stages: readonly string[];
}[] = [
  { id: 'incoming', label: 'Gelen leadler', stages: INCOMING_STAGES },
  {
    id: 'contact',
    label: 'Görüşülüyor',
    stages: ['first_contact_completed', 'presentation_scheduled', 'offer_sent']
  },
  { id: 'trial', label: 'Deneme dersi', stages: TRIAL_STAGES },
  { id: 'thinking', label: 'Düşünüyor / takip', stages: ['considering', 'follow_up', 'postponed'] },
  { id: 'payment', label: 'Ödeme bekleniyor', stages: ['payment_pending'] }
];

/**
 * Üst hızlı filtreler — kullanıcı localStorage ile sırayı/görünürlüğü düzenleyebilir.
 * key: API’ye giden rt_quick değeri
 */
export const CRM_QUICK_FILTERS: {
  key: string;
  label: string;
  defaultVisible: boolean;
}[] = [
  { key: '', label: 'Aktif takip', defaultVisible: true },
  { key: 'incoming', label: 'Gelen leadler', defaultVisible: true },
  { key: 'trial', label: 'Deneme dersi', defaultVisible: true },
  { key: 'payment', label: 'Ödeme bekleyen', defaultVisible: true },
  { key: 'confirmed', label: 'Kesin kayıt', defaultVisible: true },
  { key: 'lost', label: 'Kayıt sildirdi', defaultVisible: true },
  { key: 'today', label: 'Bugün aranacak', defaultVisible: true },
  { key: 'overdue', label: 'Gecikmiş', defaultVisible: true },
  { key: 'all', label: 'Tümü', defaultVisible: false }
];

export const CRM_FILTER_STORAGE_KEY = 'ovip.registrationCrmQuickFilters.v1';

export type CrmFilterPrefs = { order: string[]; hidden: string[] };

export function loadCrmFilterPrefs(): CrmFilterPrefs {
  try {
    const raw = localStorage.getItem(CRM_FILTER_STORAGE_KEY);
    if (!raw) return defaultCrmFilterPrefs();
    const parsed = JSON.parse(raw) as CrmFilterPrefs;
    const known = new Set(CRM_QUICK_FILTERS.map((f) => f.key));
    const order = (parsed.order || []).filter((k) => known.has(k));
    for (const f of CRM_QUICK_FILTERS) {
      if (!order.includes(f.key)) order.push(f.key);
    }
    const hidden = (parsed.hidden || []).filter((k) => known.has(k));
    return { order, hidden };
  } catch {
    return defaultCrmFilterPrefs();
  }
}

export function saveCrmFilterPrefs(prefs: CrmFilterPrefs) {
  localStorage.setItem(CRM_FILTER_STORAGE_KEY, JSON.stringify(prefs));
}

export function defaultCrmFilterPrefs(): CrmFilterPrefs {
  return {
    order: CRM_QUICK_FILTERS.map((f) => f.key),
    hidden: CRM_QUICK_FILTERS.filter((f) => !f.defaultVisible).map((f) => f.key)
  };
}

export function visibleCrmQuickFilters(prefs: CrmFilterPrefs) {
  return prefs.order
    .map((key) => CRM_QUICK_FILTERS.find((f) => f.key === key))
    .filter((f): f is (typeof CRM_QUICK_FILTERS)[number] => Boolean(f))
    .filter((f) => !prefs.hidden.includes(f.key));
}

export function leadCardTone(lead: {
  temperature?: string;
  stage?: string;
  primary_status?: string;
  next_action_at?: string | null;
}) {
  const now = Date.now();
  const overdue =
    lead.next_action_at && new Date(lead.next_action_at).getTime() < now && lead.primary_status === 'tracking';

  if (overdue) return 'overdue';
  if (lead.primary_status === 'confirmed') return 'confirmed';
  if (lead.stage === 'payment_pending') return 'payment';
  if (lead.temperature === 'hot') return 'hot';
  if (lead.temperature === 'warm') return 'warm';
  return 'cold';
}

export const CARD_TONE_CLASS: Record<string, string> = {
  hot: 'border-l-4 border-l-orange-500 bg-orange-50/80 dark:bg-orange-950/30',
  warm: 'border-l-4 border-l-amber-400 bg-amber-50/80 dark:bg-amber-950/20',
  cold: 'border-l-4 border-l-slate-400 bg-slate-50/80 dark:bg-slate-800/50',
  payment: 'border-l-4 border-l-violet-500 bg-violet-50/80 dark:bg-violet-950/30',
  confirmed: 'border-l-4 border-l-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/30',
  overdue: 'border-l-4 border-l-red-600 bg-red-50/90 dark:bg-red-950/40 ring-1 ring-red-300'
};

export function formatIstanbul(iso?: string | null) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('tr-TR', {
      timeZone: 'Europe/Istanbul',
      dateStyle: 'short',
      timeStyle: 'short'
    }).format(new Date(iso));
  } catch {
    return String(iso);
  }
}

export function formatTry(amount?: number | null) {
  if (amount == null) return '—';
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(amount);
}

export function isOverdue(nextActionAt?: string | null) {
  if (!nextActionAt) return false;
  return new Date(nextActionAt).getTime() < Date.now();
}
