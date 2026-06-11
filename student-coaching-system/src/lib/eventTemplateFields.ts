export type EventFieldKind = 'text' | 'date' | 'time' | 'url' | 'textarea' | 'class_select';

export type EventFieldStorage =
  | 'title'
  | 'event_date'
  | 'event_time'
  | 'meeting_link'
  | 'location'
  | 'description'
  | 'template_vars';

export type EventTemplateFieldDef = {
  variable: string;
  label: string;
  placeholder?: string;
  kind: EventFieldKind;
  storage: EventFieldStorage;
  /** template_vars içindeki anahtar; storage template_vars ise variable ile aynı */
  templateVarKey?: string;
  participantAuto?: boolean;
};

/** Şablon değişken adı → form alanı (alias’lar aynı tanıma yönlendirilir) */
const FIELD_BY_VAR: Record<string, EventTemplateFieldDef> = {
  ad: { variable: 'ad', label: 'Alıcı adı', kind: 'text', storage: 'template_vars', participantAuto: true },
  isim: { variable: 'isim', label: 'Alıcı adı', kind: 'text', storage: 'template_vars', participantAuto: true },
  name: { variable: 'name', label: 'Alıcı adı', kind: 'text', storage: 'template_vars', participantAuto: true },
  ogrenci: { variable: 'ogrenci', label: 'Öğrenci adı', kind: 'text', storage: 'template_vars', participantAuto: true },
  ogrenci_adi: { variable: 'ogrenci_adi', label: 'Öğrenci adı', kind: 'text', storage: 'template_vars', participantAuto: true },
  veli: { variable: 'veli', label: 'Veli adı', kind: 'text', storage: 'template_vars', participantAuto: true },
  student_name: { variable: 'student_name', label: 'Öğrenci adı', kind: 'text', storage: 'template_vars', participantAuto: true },

  etkinlik: { variable: 'etkinlik', label: 'Etkinlik adı', placeholder: 'Veli bilgilendirme toplantısı', kind: 'text', storage: 'title' },
  etkinlik_adi: { variable: 'etkinlik_adi', label: 'Etkinlik adı', kind: 'text', storage: 'title' },
  baslik: { variable: 'baslik', label: 'Başlık', kind: 'text', storage: 'title' },
  title: { variable: 'title', label: 'Başlık', kind: 'text', storage: 'title' },

  tarih: { variable: 'tarih', label: 'Tarih', kind: 'date', storage: 'event_date' },
  date: { variable: 'date', label: 'Tarih', kind: 'date', storage: 'event_date' },
  lesson_date: { variable: 'lesson_date', label: 'Ders tarihi', kind: 'date', storage: 'event_date' },

  saat: { variable: 'saat', label: 'Saat', kind: 'time', storage: 'event_time' },
  time: { variable: 'time', label: 'Saat', kind: 'time', storage: 'event_time' },
  lesson_time: { variable: 'lesson_time', label: 'Ders saati', kind: 'time', storage: 'event_time' },

  link: { variable: 'link', label: 'Katılım bağlantısı', placeholder: 'https://meet.google.com/...', kind: 'url', storage: 'meeting_link' },
  baglanti: { variable: 'baglanti', label: 'Katılım bağlantısı', kind: 'url', storage: 'meeting_link' },
  meeting_link: { variable: 'meeting_link', label: 'Katılım bağlantısı', kind: 'url', storage: 'meeting_link' },

  konum: { variable: 'konum', label: 'Konum', kind: 'text', storage: 'location' },
  location: { variable: 'location', label: 'Konum', kind: 'text', storage: 'location' },

  aciklama: { variable: 'aciklama', label: 'Açıklama', kind: 'textarea', storage: 'description' },
  description: { variable: 'description', label: 'Açıklama', kind: 'textarea', storage: 'description' },

  class_name: { variable: 'class_name', label: 'Sınıf / grup adı', placeholder: '12-A Hazırlık', kind: 'class_select', storage: 'template_vars' },
  subject: { variable: 'subject', label: 'Ders / konu', placeholder: 'Matematik', kind: 'text', storage: 'template_vars' },
  homework: { variable: 'homework', label: 'Ödev', kind: 'textarea', storage: 'template_vars' },
  odev: { variable: 'odev', label: 'Ödev', kind: 'textarea', storage: 'template_vars' },
  lesson_name: { variable: 'lesson_name', label: 'Ders adı', kind: 'text', storage: 'template_vars' },

  deneme_adi: { variable: 'deneme_adi', label: 'Deneme adı', kind: 'text', storage: 'title' },
  sinav_adi: { variable: 'sinav_adi', label: 'Sınav adı', kind: 'text', storage: 'title' },
  sinav_tarihi: { variable: 'sinav_tarihi', label: 'Sınav tarihi', kind: 'date', storage: 'event_date' },
  sinav_saati: { variable: 'sinav_saati', label: 'Sınav saati', kind: 'time', storage: 'event_time' },
  kurum_adi: { variable: 'kurum_adi', label: 'Kurum adı', kind: 'text', storage: 'template_vars' },

  sinav_sistemi_linki: {
    variable: 'sinav_sistemi_linki',
    label: 'Sınav sistemi linki',
    placeholder: 'https://…',
    kind: 'url',
    storage: 'template_vars'
  },
  pdf_linki: {
    variable: 'pdf_linki',
    label: 'Deneme PDF linki',
    placeholder: 'https://…',
    kind: 'url',
    storage: 'template_vars'
  },
  katilim_video_linki: {
    variable: 'katilim_video_linki',
    label: 'Katılım videosu linki',
    placeholder: 'https://…',
    kind: 'url',
    storage: 'template_vars'
  }
};

export function normalizeTemplateVarName(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

export function bindingsListFromTemplate(t: {
  twilio_variable_bindings?: unknown;
  variables?: unknown;
}): string[] {
  const raw = t.twilio_variable_bindings ?? t.variables;
  if (Array.isArray(raw)) return raw.map((x) => normalizeTemplateVarName(String(x))).filter(Boolean);
  return [];
}

export function resolveFieldDef(variable: string): EventTemplateFieldDef | null {
  const key = normalizeTemplateVarName(variable);
  return FIELD_BY_VAR[key] || null;
}

/** Şablondaki değişkenlerden kullanıcının dolduracağı alanlar (alıcı adı hariç) */
export function getEditableFieldsForBindings(bindings: string[]): EventTemplateFieldDef[] {
  const seen = new Set<string>();
  const out: EventTemplateFieldDef[] = [];
  for (const raw of bindings) {
    const def = resolveFieldDef(raw);
    if (def?.participantAuto) continue;
    if (!def) {
      const key = normalizeTemplateVarName(raw);
      if (!key) continue;
      const dedupeKey = `tv:${key}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      out.push({
        variable: key,
        label: key.replace(/_/g, ' '),
        kind: 'text',
        storage: 'template_vars',
        templateVarKey: key
      });
      continue;
    }
    const dedupeKey = def.storage === 'template_vars' ? `tv:${def.variable}` : def.storage;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push(def);
  }
  return out;
}

export type EventFormValues = {
  title: string;
  eventDate: string;
  eventTime: string;
  meetingLink: string;
  location: string;
  description: string;
  templateVars: Record<string, string>;
};

export function getFormValueForField(def: EventTemplateFieldDef, values: EventFormValues): string {
  switch (def.storage) {
    case 'title':
      return values.title;
    case 'event_date':
      return values.eventDate;
    case 'event_time':
      return values.eventTime;
    case 'meeting_link':
      return values.meetingLink;
    case 'location':
      return values.location;
    case 'description':
      return values.description;
    case 'template_vars':
      return values.templateVars[def.templateVarKey || def.variable] || '';
    default:
      return '';
  }
}

export function setFormValueForField(
  def: EventTemplateFieldDef,
  value: string,
  values: EventFormValues
): EventFormValues {
  const next = { ...values, templateVars: { ...values.templateVars } };
  switch (def.storage) {
    case 'title':
      next.title = value;
      break;
    case 'event_date':
      next.eventDate = value;
      break;
    case 'event_time':
      next.eventTime = value;
      break;
    case 'meeting_link':
      next.meetingLink = value;
      break;
    case 'location':
      next.location = value;
      break;
    case 'description':
      next.description = value;
      break;
    case 'template_vars':
      next.templateVars[def.templateVarKey || def.variable] = value;
      break;
    default:
      break;
  }
  return next;
}

export function bindingsNeedMeetingLink(bindings: string[]): boolean {
  return bindings.some((v) => {
    const d = resolveFieldDef(v);
    return d?.storage === 'meeting_link';
  });
}

/** Kullanıcı girdisi veya şablon adından etkinlik başlığı */
export function resolveEventTitleFromForm(
  values: EventFormValues,
  templateName?: string | null,
  templateType?: string
): { title: string; userTitle: string } {
  const userTitle =
    values.title.trim() ||
    values.templateVars.etkinlik?.trim() ||
    values.templateVars.etkinlik_adi?.trim() ||
    values.templateVars.deneme_adi?.trim() ||
    values.templateVars.sinav_adi?.trim() ||
    values.templateVars.baslik?.trim() ||
    values.templateVars.class_name?.trim() ||
    '';
  const title = userTitle || String(templateName || '').trim() || String(templateType || '').trim();
  return { title, userTitle };
}

export function validateEventFormForBindings(
  bindings: string[],
  values: EventFormValues
): string | null {
  const fields = getEditableFieldsForBindings(bindings);
  for (const def of fields) {
    const val = getFormValueForField(def, values).trim();
    if (!val) {
      return `${def.label} alanı gerekli (şablon: {{${def.variable}}})`;
    }
  }
  return null;
}

