import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronUp, Clock, Download, FileUp, Loader2, MessageCircle, Plus, RefreshCw, Send, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/session';
import { userRoleTags } from '../config/rolePermissions';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import {
  downloadEventParticipantTemplateXlsx,
  readEventParticipantImportFile
} from '../lib/eventParticipantImport';
import { normalizeImportedPhone } from '../lib/userBulkImport';
import { buildEventPreviewVars, renderTemplatePreview } from '../lib/eventMessagePreview';
import {
  bindingsListFromTemplate,
  bindingsNeedMeetingLink,
  getEditableFieldsForBindings,
  getFormValueForField,
  setFormValueForField,
  validateEventFormForBindings,
  type EventFormValues
} from '../lib/eventTemplateFields';
import { resolveTenantScopeInstitutionId } from '../lib/activeInstitutionScope';
import { CLASS_LEVELS, formatClassLevelLabel } from '../types';

type WaTemplate = {
  type: string;
  name: string;
  content?: string | null;
  meta_template_name?: string | null;
  variables?: unknown;
  twilio_variable_bindings?: unknown;
};

type MetaTemplateOption = {
  meta_template_name: string;
  meta_template_language: string;
  status?: string;
  imported?: boolean;
};

type ClassOption = {
  id: string;
  name: string;
  class_level?: string | null;
};

type PersonOption = {
  student_id: string;
  name: string;
  phone: string;
  parent_phone?: string;
  parent_name?: string;
  class_level?: string | null;
  class_ids?: string[];
};

type ParticipantRow = {
  student_id?: string | null;
  display_name: string;
  phone: string;
  source_type?: 'student' | 'parent' | 'external';
};

type RecipientKind = 'student' | 'parent';

type EventParticipant = {
  id: string;
  display_name: string;
  phone: string;
  whatsapp_status: string;
  whatsapp_error?: string | null;
  whatsapp_sent_at?: string | null;
  source_type?: string | null;
};

type WhatsAppStats = { total: number; sent: number; failed: number; pending: number };

type InstitutionEvent = {
  id: string;
  title: string;
  description?: string | null;
  event_date?: string | null;
  event_time?: string | null;
  location?: string | null;
  meeting_link?: string | null;
  template_type: string;
  send_mode?: string | null;
  scheduled_send_at?: string | null;
  daily_send_time?: string | null;
  schedule_status?: string | null;
  seminar_sync_key?: string | null;
  seminar_auto_send?: boolean | null;
  created_at?: string;
  participants?: EventParticipant[];
  whatsapp_stats?: WhatsAppStats;
  institution_event_participants?: { count: number }[];
};

type SendMode = 'manual' | 'immediate' | 'once' | 'daily';

function recipientKey(studentId: string, kind: RecipientKind): string {
  return `${studentId}:${kind}`;
}

function parseRecipientKey(key: string): { studentId: string; kind: RecipientKind } | null {
  const idx = key.lastIndexOf(':');
  if (idx <= 0) return null;
  const kind = key.slice(idx + 1) as RecipientKind;
  if (kind !== 'student' && kind !== 'parent') return null;
  return { studentId: key.slice(0, idx), kind };
}

function sourceTypeLabel(source?: string | null): string {
  if (source === 'parent') return 'Veli';
  if (source === 'external') return 'Dış liste';
  return 'Öğrenci';
}

function isValidTrParticipantPhone(phone: string): boolean {
  const digits = normalizeImportedPhone(phone).replace(/\D/g, '');
  if (!digits) return false;
  if (digits.length === 11 && digits.startsWith('05')) return true;
  if (digits.length === 12 && digits.startsWith('90')) return true;
  if (digits.length === 10 && digits.startsWith('5')) return true;
  return false;
}

function scheduleLabel(ev: InstitutionEvent): string | null {
  const mode = String(ev.send_mode || 'manual');
  if (mode === 'once' && ev.scheduled_send_at) {
    const d = new Date(ev.scheduled_send_at);
    return `Planlı: ${d.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}`;
  }
  if (mode === 'daily' && ev.daily_send_time) {
    return `Her gün ${String(ev.daily_send_time).slice(0, 5)} (TR)`;
  }
  if (ev.schedule_status === 'scheduled') return 'Planlandı — bekliyor';
  if (ev.schedule_status === 'completed') return 'Plan tamamlandı';
  if (ev.schedule_status === 'cancelled') return 'Plan iptal';
  return null;
}

export default function EventsPage() {
  const { effectiveUser } = useAuth();
  const { activeInstitutionId, institutions } = useApp();
  const tags = userRoleTags(effectiveUser);
  const canManage = tags.includes('super_admin') || tags.includes('admin') || tags.includes('coach');

  const scopedInstitutionId = useMemo(
    () =>
      resolveTenantScopeInstitutionId({
        role: effectiveUser?.role,
        userInstitutionId: effectiveUser?.institutionId,
        selectedInstitutionId: activeInstitutionId,
        fallbackInstitutionId: institutions[0]?.id ?? null
      }),
    [effectiveUser?.role, effectiveUser?.institutionId, activeInstitutionId, institutions]
  );

  const institutionQuery = scopedInstitutionId
    ? `institution_id=${encodeURIComponent(scopedInstitutionId)}`
    : '';

  const apiEventsPath = (extra = '') => {
    const parts = [extra, institutionQuery].filter(Boolean);
    if (!parts.length) return '/api/institution-events';
    return `/api/institution-events?${parts.join('&')}`;
  };

  const [schemaWarning, setSchemaWarning] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [templates, setTemplates] = useState<WaTemplate[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [people, setPeople] = useState<PersonOption[]>([]);
  const [events, setEvents] = useState<InstitutionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sendBusyId, setSendBusyId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [location, setLocation] = useState('');
  const [meetingLink, setMeetingLink] = useState('');
  const [templateType, setTemplateType] = useState('institution_event_invite');
  const [sendMode, setSendMode] = useState<SendMode>('manual');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [dailySendTime, setDailySendTime] = useState('');
  const [seminarSyncKey, setSeminarSyncKey] = useState('');
  const [seminarAutoSend, setSeminarAutoSend] = useState(true);
  const [seminarSyncBusy, setSeminarSyncBusy] = useState(false);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [eventDetails, setEventDetails] = useState<Record<string, InstitutionEvent>>({});
  const [selectedRecipients, setSelectedRecipients] = useState<Set<string>>(new Set());
  const [classLevelFilter, setClassLevelFilter] = useState<string>('all');
  const [classIdFilter, setClassIdFilter] = useState<string>('all');
  const [externalRows, setExternalRows] = useState<ParticipantRow[]>([]);
  const [importBusy, setImportBusy] = useState(false);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const [peopleSearch, setPeopleSearch] = useState('');
  const [templateVars, setTemplateVars] = useState<Record<string, string>>({});
  const [metaTemplates, setMetaTemplates] = useState<MetaTemplateOption[]>([]);
  const [metaTemplatesOpen, setMetaTemplatesOpen] = useState(false);
  const [metaTemplatesBusy, setMetaTemplatesBusy] = useState(false);
  const [metaImportBusy, setMetaImportBusy] = useState<string | null>(null);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.type === templateType) || null,
    [templates, templateType]
  );

  const templateBindings = useMemo(
    () => (selectedTemplate ? bindingsListFromTemplate(selectedTemplate) : []),
    [selectedTemplate]
  );

  const editableFields = useMemo(
    () => getEditableFieldsForBindings(templateBindings),
    [templateBindings]
  );

  const formValues: EventFormValues = useMemo(
    () => ({
      title,
      eventDate,
      eventTime,
      meetingLink,
      location,
      description,
      templateVars
    }),
    [title, eventDate, eventTime, meetingLink, location, description, templateVars]
  );

  const updateFormField = (def: ReturnType<typeof getEditableFieldsForBindings>[number], value: string) => {
    const next = setFormValueForField(def, value, formValues);
    setTitle(next.title);
    setEventDate(next.eventDate);
    setEventTime(next.eventTime);
    setMeetingLink(next.meetingLink);
    setLocation(next.location);
    setDescription(next.description);
    setTemplateVars(next.templateVars);
  };

  const filteredPeople = useMemo(() => {
    let list = people;
    if (classLevelFilter !== 'all') {
      list = list.filter((p) => String(p.class_level || '') === classLevelFilter);
    }
    if (classIdFilter !== 'all') {
      list = list.filter((p) => (p.class_ids || []).includes(classIdFilter));
    }
    const q = peopleSearch.trim().toLocaleLowerCase('tr');
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLocaleLowerCase('tr').includes(q) ||
          String(p.parent_name || '')
            .toLocaleLowerCase('tr')
            .includes(q)
      );
    }
    return list;
  }, [people, classLevelFilter, classIdFilter, peopleSearch]);

  const classLevelOptions = useMemo(() => {
    const levels = new Set<string>();
    for (const p of people) {
      if (p.class_level) levels.add(String(p.class_level));
    }
    return Array.from(levels).sort((a, b) => a.localeCompare(b, 'tr'));
  }, [people]);

  const previewSampleName = useMemo(() => {
    for (const key of selectedRecipients) {
      const parsed = parseRecipientKey(key);
      if (!parsed) continue;
      const person = people.find((p) => p.student_id === parsed.studentId);
      if (!person) continue;
      if (parsed.kind === 'parent') {
        return person.parent_name?.trim() || `${person.name} Velisi`;
      }
      return person.name;
    }
    const ext = externalRows.find((r) => r.display_name.trim());
    if (ext) return ext.display_name.trim();
    return 'Ahmet Yılmaz';
  }, [selectedRecipients, people, externalRows]);

  const messagePreview = useMemo(() => {
    if (!selectedTemplate?.content) return null;
    const vars = buildEventPreviewVars(
      {
        title: title.trim() || 'Örnek etkinlik',
        event_date: eventDate || null,
        event_time: eventTime ? `${eventTime}:00` : null,
        meeting_link: meetingLink.trim() || null,
        location: location.trim() || null,
        description: description.trim() || null,
        template_vars: templateVars
      },
      previewSampleName
    );
    return renderTemplatePreview(selectedTemplate.content, vars);
  }, [
    selectedTemplate,
    title,
    eventDate,
    eventTime,
    meetingLink,
    location,
    description,
    templateVars,
    previewSampleName
  ]);

  const selectedStudentCount = useMemo(() => {
    let n = 0;
    for (const key of selectedRecipients) {
      if (key.endsWith(':student')) n++;
    }
    return n;
  }, [selectedRecipients]);

  const selectedParentCount = useMemo(() => {
    let n = 0;
    for (const key of selectedRecipients) {
      if (key.endsWith(':parent')) n++;
    }
    return n;
  }, [selectedRecipients]);

  const validExternalCount = useMemo(
    () => externalRows.filter((r) => r.display_name.trim() && r.phone.trim()).length,
    [externalRows]
  );

  const loadAll = useCallback(async () => {
    if (!canManage) return;
    setLoading(true);
    setSchemaWarning(null);
    setLoadError(null);
    try {
      const [tRes, cRes, pRes, eRes] = await Promise.all([
        apiFetch(apiEventsPath('scope=templates')),
        apiFetch(apiEventsPath('scope=classes')),
        apiFetch(apiEventsPath('scope=people')),
        apiFetch(apiEventsPath())
      ]);
      const tj = await tRes.json().catch(() => ({}));
      const cj = await cRes.json().catch(() => ({}));
      const pj = await pRes.json().catch(() => ({}));
      const ej = await eRes.json().catch(() => ({}));
      const failed = [
        [tRes, tj],
        [cRes, cj],
        [pRes, pj],
        [eRes, ej]
      ].find(([res]) => !res.ok);
      if (failed) {
        setLoadError(eventCreateErrorMessage(failed[1] as Record<string, unknown>));
      }
      const warn = [tj, cj, pj, ej].find((j) => j?.warning === 'events_schema_missing' || j?.error === 'events_schema_missing');
      if (warn?.hint) setSchemaWarning(String(warn.hint));
      else if (ej.warning === 'events_schema_missing' && ej.hint) setSchemaWarning(String(ej.hint));
      const tpls = Array.isArray(tj.data) ? (tj.data as WaTemplate[]) : [];
      setTemplates(tpls);
      if (tpls.length && !tpls.some((t) => t.type === templateType)) {
        setTemplateType(tpls[0].type);
      }
      setClasses(Array.isArray(cj.data) ? (cj.data as ClassOption[]) : []);
      setPeople(Array.isArray(pj.data) ? (pj.data as PersonOption[]) : []);
      setEvents(Array.isArray(ej.data) ? (ej.data as InstitutionEvent[]) : []);
    } catch {
      toast.error('Etkinlik verileri yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [canManage, templateType, scopedInstitutionId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const loadMetaTemplates = useCallback(async () => {
    if (!canManage) return;
    setMetaTemplatesBusy(true);
    try {
      const res = await apiFetch(apiEventsPath('scope=meta-templates'));
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error((j as { hint?: string; error?: string }).hint || (j as { error?: string }).error || 'Meta şablonları alınamadı');
        return;
      }
      setMetaTemplates(Array.isArray(j.data) ? (j.data as MetaTemplateOption[]) : []);
      setMetaTemplatesOpen(true);
    } catch {
      toast.error('Meta şablonları yüklenemedi');
    } finally {
      setMetaTemplatesBusy(false);
    }
  }, [canManage, scopedInstitutionId]);

  const importMetaTemplate = async (row: MetaTemplateOption) => {
    const key = `${row.meta_template_name}:${row.meta_template_language}`;
    setMetaImportBusy(key);
    try {
      const res = await apiFetch('/api/institution-events?op=import-meta-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meta_template_name: row.meta_template_name,
          meta_template_language: row.meta_template_language
        })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error((j as { error?: string }).error || 'Şablon eklenemedi');
        return;
      }
      const importedType = String((j as { data?: { type?: string } }).data?.type || '').trim();
      toast.success(`Şablon eklendi: ${row.meta_template_name}`);
      await loadAll();
      if (importedType) setTemplateType(importedType);
      setMetaTemplates((prev) =>
        prev.map((t) =>
          t.meta_template_name === row.meta_template_name && t.meta_template_language === row.meta_template_language
            ? { ...t, imported: true }
            : t
        )
      );
    } catch {
      toast.error('Şablon eklenemedi');
    } finally {
      setMetaImportBusy(null);
    }
  };

  const hasSeminarAutoEvents = useMemo(
    () =>
      events.some(
        (e) => String(e.seminar_sync_key || '').trim() && e.seminar_auto_send !== false
      ),
    [events]
  );

  useEffect(() => {
    if (!canManage || !hasSeminarAutoEvents) return;
    let cancelled = false;
    const runSync = async (silent: boolean) => {
      try {
        const res = await apiFetch('/api/institution-events?op=sync-seminar');
        const j = await res.json().catch(() => ({}));
        if (cancelled || !res.ok) return;
        const d = (j.data || j) as { synced?: number; sent?: number };
        if ((d.synced ?? 0) > 0 || (d.sent ?? 0) > 0) {
          if (!silent) {
            toast.success(`Seminer kaydı: ${d.synced ?? 0} eklendi, ${d.sent ?? 0} WhatsApp`);
          }
          await loadAll();
        }
      } catch {
        /* silent poll */
      }
    };
    void runSync(true);
    const id = window.setInterval(() => void runSync(true), 45000);
    const onFocus = () => void runSync(true);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [canManage, hasSeminarAutoEvents, loadAll]);

  const toggleRecipient = (studentId: string, kind: RecipientKind) => {
    const key = recipientKey(studentId, kind);
    setSelectedRecipients((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllInFilter = (kind: RecipientKind) => {
    setSelectedRecipients((prev) => {
      const next = new Set(prev);
      for (const p of filteredPeople) {
        const phone = kind === 'parent' ? p.parent_phone : p.phone;
        if (phone) next.add(recipientKey(p.student_id, kind));
      }
      return next;
    });
  };

  const clearFilterSelection = (kind?: RecipientKind) => {
    setSelectedRecipients((prev) => {
      const next = new Set(prev);
      for (const p of filteredPeople) {
        if (!kind || kind === 'student') next.delete(recipientKey(p.student_id, 'student'));
        if (!kind || kind === 'parent') next.delete(recipientKey(p.student_id, 'parent'));
      }
      return next;
    });
  };

  const handleExcelImport = async (file: File | null) => {
    if (!file) return;
    setImportBusy(true);
    try {
      const result = await readEventParticipantImportFile(file);
      if (result.headerError) {
        toast.error(result.headerError);
        return;
      }
      if (!result.rows.length) {
        toast.error('Geçerli katılımcı satırı bulunamadı.');
        return;
      }

      const newExternal: ParticipantRow[] = result.rows.map((row) => ({
        display_name: row.display_name,
        phone: row.phone,
        source_type: 'external' as const
      }));

      setExternalRows((prev) => [...prev, ...newExternal]);

      const parts = [`${result.rows.length} satır dış listeye eklendi`];
      if (result.skipped) parts.push(`${result.skipped} satır atlandı (eksik ad/telefon)`);
      toast.success(parts.join(' · '));
    } catch {
      toast.error('Dosya okunamadı. .xlsx veya .csv kullanın.');
    } finally {
      setImportBusy(false);
      if (excelInputRef.current) excelInputRef.current.value = '';
    }
  };

  const buildParticipantsPayload = (): ParticipantRow[] => {
    const fromSystem: ParticipantRow[] = [];
    for (const key of selectedRecipients) {
      const parsed = parseRecipientKey(key);
      if (!parsed) continue;
      const person = people.find((p) => p.student_id === parsed.studentId);
      if (!person) continue;
      if (parsed.kind === 'parent') {
        fromSystem.push({
          student_id: person.student_id,
          source_type: 'parent',
          display_name: person.parent_name?.trim() || `${person.name} Velisi`,
          phone: normalizeImportedPhone(person.parent_phone || '') || person.parent_phone || ''
        });
      } else {
        fromSystem.push({
          student_id: person.student_id,
          source_type: 'student',
          display_name: person.name,
          phone: normalizeImportedPhone(person.phone) || person.phone
        });
      }
    }
    const external = externalRows
      .filter((r) => r.display_name.trim() && r.phone.trim())
      .map((r) => ({
        display_name: r.display_name.trim(),
        phone: normalizeImportedPhone(r.phone) || r.phone.trim(),
        source_type: 'external' as const
      }));
    return [...fromSystem, ...external];
  };

  const eventCreateErrorMessage = (j: Record<string, unknown>): string => {
    const hint = j.hint ? String(j.hint) : '';
    const err = String(j.error || '');
    if (hint) return hint;
    if (err === 'participants_required') {
      const skipped = Array.isArray(j.skipped) ? j.skipped.length : 0;
      if (skipped > 0) {
        return `${skipped} katılımcının telefonu geçersiz. 05xxxxxxxxx formatında girin.`;
      }
      return 'Geçerli telefon numarası olan en az bir katılımcı gerekli (05xx…).';
    }
    if (err === 'events_schema_missing' || err.includes('schema')) {
      return (
        hint ||
        'Veritabanı kurulumu eksik — Supabase\'de 2026-06-08-institution-events-full-setup.sql ve 2026-06-15-institution-events-migrations-bundle.sql çalıştırın.'
      );
    }
    if (err === 'template_not_found') return 'WhatsApp şablonu bulunamadı.';
    if (err === 'institution_required') {
      return hint || 'Kurum bilgisi bulunamadı. Üst menüden kurum seçin veya yöneticinize başvurun.';
    }
    if (err === 'title_required') return 'Etkinlik başlığı gerekli.';
    return err || 'Etkinlik oluşturulamadı';
  };

  const createEvent = async () => {
    const formErr = validateEventFormForBindings(templateBindings, formValues);
    if (formErr) {
      toast.error(formErr);
      return;
    }
    const resolvedTitle = title.trim() || templateVars.etkinlik?.trim() || templateVars.class_name?.trim();
    if (!resolvedTitle) {
      toast.error('Etkinlik başlığı gerekli');
      return;
    }
    const rawParticipants = buildParticipantsPayload();
    const participants = rawParticipants.filter((p) => isValidTrParticipantPhone(p.phone));
    const effectiveSeminarKey = seminarSyncKey.trim() || resolvedTitle;
    if (!participants.length && !effectiveSeminarKey) {
      if (rawParticipants.length > 0) {
        toast.error('Seçilen katılımcıların telefon numaraları geçersiz. 05xxxxxxxxx formatında olmalı.');
      } else {
        toast.error('Katılımcı seçin veya seminer eşleme anahtarı / etkinlik başlığı girin');
      }
      return;
    }
    const needsLink =
      (sendMode === 'immediate' || sendMode === 'once' || sendMode === 'daily') &&
      bindingsNeedMeetingLink(templateBindings);
    if (needsLink && !meetingLink.trim()) {
      toast.error('Bu şablon için WhatsApp gönderiminde katılım bağlantısı gerekli');
      return;
    }
    if (sendMode === 'once' && (!scheduleDate || !scheduleTime)) {
      toast.error('Tek seferlik plan için tarih ve saat seçin');
      return;
    }
    if (sendMode === 'daily' && !dailySendTime) {
      toast.error('Günlük plan için saat seçin');
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch('/api/institution-events', {
        method: 'POST',
        body: JSON.stringify({
          title: resolvedTitle,
          description: description.trim() || null,
          event_date: eventDate || null,
          event_time: eventTime ? `${eventTime}:00` : null,
          location: location.trim() || null,
          meeting_link: meetingLink.trim() || null,
          template_type: templateType,
          template_vars: templateVars,
          send_mode: sendMode,
          send_whatsapp: sendMode === 'immediate',
          schedule_date: sendMode === 'once' ? scheduleDate : null,
          schedule_time: sendMode === 'once' ? scheduleTime : sendMode === 'daily' ? dailySendTime : null,
          daily_send_time: sendMode === 'daily' ? dailySendTime : null,
          institution_id: scopedInstitutionId || undefined,
          seminar_sync_key: effectiveSeminarKey || null,
          seminar_auto_send: seminarAutoSend,
          participants
        })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(eventCreateErrorMessage(j as Record<string, unknown>));
        return;
      }
      const wa = j.whatsapp as {
        sent?: number;
        failed?: number;
        skipped?: boolean;
        hint?: string;
      } | null;
      const skipped = Array.isArray(j.skipped_participants) ? j.skipped_participants.length : 0;
      const semSync = j.seminar_sync as { synced?: number; sent?: number; skips?: Record<string, number> } | null;
      if (sendMode === 'immediate' && wa?.skipped) {
        toast.warning(String(wa.hint || 'Etkinlik oluşturuldu; WhatsApp gönderilmedi.'));
      } else if (sendMode === 'immediate' && wa) {
        toast.success(`Etkinlik oluşturuldu — WhatsApp: ${wa.sent ?? 0} gönderildi, ${wa.failed ?? 0} hata`);
      } else if (sendMode === 'once' || sendMode === 'daily') {
        toast.success('Etkinlik planlandı — mesajlar belirlenen saatte gönderilecek');
      } else {
        toast.success(skipped ? `Etkinlik oluşturuldu (${skipped} geçersiz numara atlandı)` : 'Etkinlik oluşturuldu');
      }
      if (semSync && (semSync.synced ?? 0) > 0) {
        toast.success(`Seminer havuzu: ${semSync.synced} katılımcı eklendi, ${semSync.sent ?? 0} WhatsApp`);
      } else if (semSync?.skips?.no_matching_event) {
        toast.info(
          'Seminer kaydı henüz eşleşmedi — formda seminer_adi/form_adi alanı etkinlik anahtarıyla aynı olmalı.'
        );
      }
      setTitle('');
      setDescription('');
      setEventDate('');
      setEventTime('');
      setLocation('');
      setMeetingLink('');
      setTemplateVars({});
      setSendMode('manual');
      setScheduleDate('');
      setScheduleTime('');
      setDailySendTime('');
      setSelectedRecipients(new Set());
      setExternalRows([]);
      await loadAll();
    } catch {
      toast.error('Sunucuya bağlanılamadı');
    } finally {
      setBusy(false);
    }
  };

  const loadEventDetail = async (eventId: string) => {
    if (expandedEventId === eventId) {
      setExpandedEventId(null);
      return;
    }
    if (eventDetails[eventId]) {
      setExpandedEventId(eventId);
      return;
    }
    setDetailLoadingId(eventId);
    try {
      const res = await apiFetch(apiEventsPath(`id=${encodeURIComponent(eventId)}`));
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.data) {
        setEventDetails((prev) => ({ ...prev, [eventId]: j.data as InstitutionEvent }));
        setExpandedEventId(eventId);
      }
    } finally {
      setDetailLoadingId(null);
    }
  };

  const cancelSchedule = async (eventId: string) => {
    const res = await apiFetch(`/api/institution-events?op=cancel-schedule&id=${encodeURIComponent(eventId)}`, {
      method: 'POST',
      body: JSON.stringify({})
    });
    if (!res.ok) {
      toast.error('Plan iptal edilemedi');
      return;
    }
    toast.success('Plan iptal edildi');
    await loadAll();
  };

  const sendInvites = async (eventId: string) => {
    setSendBusyId(eventId);
    try {
      const res = await apiFetch(`/api/institution-events?op=send&id=${encodeURIComponent(eventId)}`, {
        method: 'POST',
        body: JSON.stringify({})
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(String(j.error || 'Gönderim başarısız'));
        return;
      }
      toast.success(`WhatsApp: ${j.sent ?? 0} gönderildi, ${j.failed ?? 0} hata`);
      await loadAll();
    } finally {
      setSendBusyId(null);
    }
  };

  const deleteEvent = async (eventId: string) => {
    if (!window.confirm('Bu etkinlik silinsin mi?')) return;
    const res = await apiFetch(`/api/institution-events?id=${encodeURIComponent(eventId)}`, {
      method: 'DELETE'
    });
    if (!res.ok) {
      toast.error('Silinemedi');
      return;
    }
    toast.success('Etkinlik silindi');
    await loadAll();
  };

  const syncSeminarRegistrations = async () => {
    setSeminarSyncBusy(true);
    try {
      const res = await apiFetch('/api/institution-events?op=sync-seminar');
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(String(j.error || 'Seminer eşitleme başarısız'));
        return;
      }
      const d = (j.data || j) as {
        synced?: number;
        sent?: number;
        registrations?: number;
        total_in_table?: number | null;
        already_linked?: number;
        eligible_events?: number;
        skipped?: string;
        skips?: Record<string, number>;
      };
      if (d.skipped === 'seminer_kayitlari_missing' || d.skipped === 'seminar_kayitlari_missing') {
        toast.error('seminer_kayitlari tablosu bulunamadı');
        return;
      }
      const skipParts = d.skips
        ? Object.entries(d.skips)
            .filter(([, n]) => n > 0)
            .map(([k, n]) => `${k}: ${n}`)
            .join(', ')
        : '';
      const summary = [
        `${d.synced ?? 0} katılımcı eklendi`,
        `${d.sent ?? 0} WhatsApp`,
        `${d.registrations ?? 0} kayıt tarandı`,
        d.total_in_table != null ? `tabloda ${d.total_in_table}` : null,
        d.eligible_events != null ? `${d.eligible_events} uygun etkinlik` : null,
        skipParts ? `atlanan (${skipParts})` : null
      ]
        .filter(Boolean)
        .join(' · ');
      if ((d.synced ?? 0) === 0 && (d.registrations ?? 0) === 0 && (d.total_in_table ?? 0) > 0) {
        toast.warning(
          `Seminer tablosunda ${d.total_in_table} kayıt var; eklenecek yeni kayıt yok (zaten bağlı: ${d.already_linked ?? '?'})`
        );
      } else if ((d.synced ?? 0) === 0 && (d.skips?.no_matching_event ?? 0) > 0) {
        toast.warning(
          `Eşleşen seminer kaydı yok. Etkinlikteki seminer anahtarı ile seminer_kayitlari satırındaki seminer_adi/form_adi aynı olmalı. ${summary}`
        );
      } else if ((d.synced ?? 0) === 0 && skipParts) {
        toast.warning(`Seminer eşitleme: ${summary}`);
      } else {
        toast.success(`Seminer: ${summary}`);
      }
      await loadAll();
    } finally {
      setSeminarSyncBusy(false);
    }
  };

  if (!canManage) {
    return <p className="p-6 text-sm text-slate-600">Bu sayfaya erişim yetkiniz yok.</p>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-4 md:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <CalendarDays className="h-7 w-7 text-indigo-600" />
          Etkinlikler
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Etkinlik oluşturun, katılımcı ekleyin; Meta onaylı{' '}
          <span className="font-medium">Etkinlik Hatırlatma + Link</span> şablonu ile WhatsApp daveti gönderin.
        </p>
      </div>

      {loadError ? (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-950">
          <p className="font-semibold">Etkinlik verileri yüklenemedi</p>
          <p className="mt-1 text-xs">{loadError}</p>
        </div>
      ) : null}

      {schemaWarning ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">Veritabanı kurulumu gerekli</p>
          <p className="mt-1 text-xs">{schemaWarning}</p>
          <p className="mt-1 text-xs font-mono">2026-06-08-institution-events-full-setup.sql</p>
          <p className="mt-1 text-xs font-mono">2026-06-15-institution-events-migrations-bundle.sql</p>
        </div>
      ) : null}

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
        <h2 className="text-sm font-semibold text-slate-800">Yeni sabit mesaj / etkinlik</h2>
        <p className="text-xs text-slate-500">
          Önce WhatsApp şablonunu seçin; şablondaki değişkenlere göre doldurmanız gereken alanlar otomatik gelir.
          Alıcı adı (<code className="rounded bg-slate-100 px-1">{'{{ad}}'}</code>,{' '}
          <code className="rounded bg-slate-100 px-1">{'{{student_name}}'}</code>) katılımcıdan otomatik doldurulur.
        </p>

        <label className="block text-sm">
          <span className="text-slate-600">WhatsApp şablonu (Meta) *</span>
          {templates.length ? (
            <>
              <select
                value={templateType}
                onChange={(e) => setTemplateType(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {templates.map((t) => (
                  <option key={t.type} value={t.type}>
                    {t.name} ({t.meta_template_name || t.type})
                  </option>
                ))}
              </select>
              {selectedTemplate ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {templateBindings.map((v) => (
                    <span
                      key={v}
                      className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[10px] text-slate-600"
                    >
                      {`{{${v}}}`}
                    </span>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <p className="mt-1 text-xs text-amber-700">
              Aktif Meta şablonu bulunamadı — aşağıdan Meta&apos;daki onaylı şablonu içe aktarın.
            </p>
          )}
          <div className="mt-2 rounded-lg border border-violet-200 bg-violet-50/60 p-2.5 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-violet-900">
                Meta Business&apos;ta yeni eklediğiniz şablon (ör. deneme sınavı) burada görünmüyorsa içe aktarın.
              </p>
              <button
                type="button"
                disabled={metaTemplatesBusy}
                onClick={() => void loadMetaTemplates()}
                className="inline-flex items-center gap-1 rounded-lg border border-violet-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-violet-900 hover:bg-violet-100 disabled:opacity-50"
              >
                {metaTemplatesBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                Meta şablonlarını listele
              </button>
            </div>
            {metaTemplatesOpen ? (
              metaTemplates.length ? (
                <ul className="max-h-40 overflow-y-auto space-y-1 text-xs">
                  {metaTemplates.map((mt) => {
                    const key = `${mt.meta_template_name}:${mt.meta_template_language}`;
                    return (
                      <li
                        key={key}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-violet-100 bg-white px-2 py-1.5"
                      >
                        <span className="font-mono text-[10px] text-slate-700">
                          {mt.meta_template_name}{' '}
                          <span className="text-slate-400">({mt.meta_template_language})</span>
                          {mt.imported ? <span className="ml-1 text-emerald-700">· eklendi</span> : null}
                        </span>
                        {!mt.imported ? (
                          <button
                            type="button"
                            disabled={metaImportBusy === key}
                            onClick={() => void importMetaTemplate(mt)}
                            className="rounded border border-violet-300 px-2 py-0.5 text-[10px] font-semibold text-violet-900 hover:bg-violet-50 disabled:opacity-50"
                          >
                            {metaImportBusy === key ? 'Ekleniyor…' : 'Etkinliklere ekle'}
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-[11px] text-violet-800">Onaylı Meta şablonu bulunamadı.</p>
              )
            ) : null}
          </div>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          {editableFields.length === 0 ? (
            <p className="sm:col-span-2 text-xs text-amber-700">
              Bu şablonda doldurulacak alan tanımlı değil. Mesaj Şablonları sayfasından değişken adlarını kontrol edin.
            </p>
          ) : (
            editableFields.map((field) => {
              const value = getFormValueForField(field, formValues);
              const inputClass = 'mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm';
              return (
                <label
                  key={`${field.storage}:${field.variable}`}
                  className={`block text-sm ${field.kind === 'textarea' ? 'sm:col-span-2' : ''}`}
                >
                  <span className="text-slate-600">
                    {field.label} *
                    <span className="ml-1 font-mono text-[10px] font-normal text-slate-400">{`{{${field.variable}}}`}</span>
                  </span>
                  {field.kind === 'class_select' ? (
                    <>
                      <select
                        value={classes.some((c) => c.name === value) ? value : ''}
                        onChange={(e) => updateFormField(field, e.target.value)}
                        className={inputClass}
                      >
                        <option value="">Sınıf seçin veya aşağıya yazın</option>
                        {classes.map((c) => (
                          <option key={c.id} value={c.name}>
                            {c.name}
                            {c.class_level ? ` (${formatClassLevelLabel(c.class_level)})` : ''}
                          </option>
                        ))}
                      </select>
                      <input
                        value={value}
                        onChange={(e) => updateFormField(field, e.target.value)}
                        className={`${inputClass} mt-2`}
                        placeholder={field.placeholder || 'Sınıf adı'}
                      />
                    </>
                  ) : field.kind === 'textarea' ? (
                    <textarea
                      value={value}
                      onChange={(e) => updateFormField(field, e.target.value)}
                      rows={2}
                      className={inputClass}
                      placeholder={field.placeholder}
                    />
                  ) : (
                    <input
                      type={field.kind === 'date' ? 'date' : field.kind === 'time' ? 'time' : field.kind === 'url' ? 'url' : 'text'}
                      value={value}
                      onChange={(e) => updateFormField(field, e.target.value)}
                      className={inputClass}
                      placeholder={field.placeholder}
                    />
                  )}
                </label>
              );
            })
          )}

          {messagePreview ? (
            <div className="sm:col-span-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
              <p className="text-xs font-semibold text-emerald-900">Mesaj önizleme</p>
              <p className="mt-0.5 text-[10px] text-emerald-800">
                Örnek alıcı: <span className="font-medium">{previewSampleName}</span>
              </p>
              <pre className="mt-2 whitespace-pre-wrap rounded-md bg-white p-3 text-xs leading-relaxed text-slate-800 shadow-inner">
                {messagePreview}
              </pre>
            </div>
          ) : null}

          <div className="sm:col-span-2 rounded-lg border border-violet-200 bg-violet-50/50 p-3 space-y-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-violet-900">
              <Clock className="h-4 w-4" />
              WhatsApp gönderim planı
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ['manual', 'Manuel (sonra gönder)'],
                  ['immediate', 'Hemen gönder'],
                  ['once', 'Planlı — tek sefer'],
                  ['daily', 'Planlı — her gün']
                ] as const
              ).map(([mode, label]) => (
                <label key={mode} className="flex cursor-pointer items-center gap-2 rounded-md border border-violet-100 bg-white px-2 py-1.5 text-xs">
                  <input
                    type="radio"
                    name="sendMode"
                    checked={sendMode === mode}
                    onChange={() => setSendMode(mode)}
                  />
                  {label}
                </label>
              ))}
            </div>
            {sendMode === 'once' ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block text-xs">
                  <span className="text-slate-600">Gönderim tarihi</span>
                  <input
                    type="date"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="block text-xs">
                  <span className="text-slate-600">Gönderim saati (TR)</span>
                  <input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                  />
                  <p className="mt-1 text-[10px] text-slate-500">Seçtiğiniz dakikada gönderilir (örn. 19:57).</p>
                </label>
              </div>
            ) : null}
            {sendMode === 'daily' ? (
              <label className="block text-xs">
                <span className="text-slate-600">Her gün gönderim saati (TR)</span>
                <input
                  type="time"
                  value={dailySendTime}
                  onChange={(e) => setDailySendTime(e.target.value)}
                  className="mt-1 w-full max-w-xs rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                />
                <p className="mt-1 text-[10px] text-slate-500">Etkinlik tarihine kadar her gün tüm katılımcılara hatırlatma gider.</p>
              </label>
            ) : null}
            {sendMode !== 'manual' && bindingsNeedMeetingLink(templateBindings) ? (
              <p className="text-[11px] text-violet-800">Bu şablon için planlı / hemen gönderimde katılım bağlantısı zorunludur.</p>
            ) : null}
          </div>

          <div className="sm:col-span-2 rounded-lg border border-teal-200 bg-teal-50/50 p-3 space-y-2">
            <p className="text-sm font-semibold text-teal-900">Seminer kayıtları (seminer_kayitlari)</p>
            <p className="text-[11px] text-teal-800">
              Yalnızca <strong>bu anahtarla eşleşen</strong> seminer kayıtları eklenir; genel havuzun tamamı
              çekilmez. Anahtar, <code className="rounded bg-white/80 px-1">seminer_kayitlari</code> satırındaki{' '}
              <code className="rounded bg-white/80 px-1">seminer_key</code> /{' '}
              <code className="rounded bg-white/80 px-1">seminer_adi</code> /{' '}
              <code className="rounded bg-white/80 px-1">form_adi</code> ile aynı olmalı (ör.{' '}
              <span className="font-mono">YKS Sınav Stresi Başarını Etkilemesin!</span>).
            </p>
            <label className="block text-xs">
              <span className="text-slate-600">Seminer eşleme anahtarı *</span>
              <input
                value={seminarSyncKey}
                onChange={(e) => setSeminarSyncKey(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                placeholder="YKS Sınav Stresi Başarını Etkilemesin!"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={seminarAutoSend}
                onChange={(e) => setSeminarAutoSend(e.target.checked)}
              />
              Yeni form kaydı → listeye ekle ve WhatsApp gönder (şablonda link varsa bağlantı alanı doldurulmalı)
            </label>
            <p className="text-[10px] text-teal-700">
              Dış formda gizli alan önerisi: <span className="font-mono">seminer_adi</span> = yukarıdaki anahtar.
              Sayfa açıkken veya cron ile ~1 dk içinde otomatik eşitlenir.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
              <Users className="h-4 w-4" />
              Sistemden katılımcı seç
            </span>
            <span className="text-xs text-slate-500">
              {selectedStudentCount} öğrenci · {selectedParentCount} veli
            </span>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <label className="block text-xs">
              <span className="text-slate-600">Sınıf seviyesi</span>
              <select
                value={classLevelFilter}
                onChange={(e) => setClassLevelFilter(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              >
                <option value="all">Tüm sınıflar</option>
                {classLevelOptions.map((lv) => (
                  <option key={lv} value={lv}>
                    {formatClassLevelLabel(lv)}
                  </option>
                ))}
                {classLevelOptions.length === 0
                  ? CLASS_LEVELS.map((lv) => (
                      <option key={String(lv.value)} value={String(lv.value)}>
                        {lv.label}
                      </option>
                    ))
                  : null}
              </select>
            </label>
            <label className="block text-xs">
              <span className="text-slate-600">Canlı ders sınıfı</span>
              <select
                value={classIdFilter}
                onChange={(e) => setClassIdFilter(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              >
                <option value="all">Tüm gruplar</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.class_level ? ` (${formatClassLevelLabel(c.class_level)})` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs">
              <span className="text-slate-600">Ara</span>
              <input
                value={peopleSearch}
                onChange={(e) => setPeopleSearch(e.target.value)}
                placeholder="Ad veya veli adı…"
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => selectAllInFilter('student')}
              className="rounded-md border border-indigo-200 bg-white px-2 py-1 text-[11px] font-medium text-indigo-800 hover:bg-indigo-50"
            >
              Filtredeki öğrencileri seç
            </button>
            <button
              type="button"
              onClick={() => selectAllInFilter('parent')}
              className="rounded-md border border-violet-200 bg-white px-2 py-1 text-[11px] font-medium text-violet-800 hover:bg-violet-50"
            >
              Filtredeki velileri seç
            </button>
            <button
              type="button"
              onClick={() => clearFilterSelection()}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
            >
              Filtre seçimini temizle
            </button>
          </div>

          <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
            {filteredPeople.length === 0 ? (
              <p className="p-2 text-xs text-slate-500">Bu filtrede öğrenci bulunamadı.</p>
            ) : (
              <ul className="space-y-1">
                {filteredPeople.map((p) => (
                  <li key={p.student_id} className="rounded-md border border-slate-100 px-2 py-1.5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                        {p.name}
                        {p.class_level ? (
                          <span className="ml-1 text-[10px] font-normal text-slate-400">
                            ({formatClassLevelLabel(p.class_level)})
                          </span>
                        ) : null}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-3">
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={selectedRecipients.has(recipientKey(p.student_id, 'student'))}
                          onChange={() => toggleRecipient(p.student_id, 'student')}
                          disabled={!p.phone}
                        />
                        <span>Öğrenci</span>
                        <span className="font-mono text-[10px] text-slate-400">{p.phone || '—'}</span>
                      </label>
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={selectedRecipients.has(recipientKey(p.student_id, 'parent'))}
                          onChange={() => toggleRecipient(p.student_id, 'parent')}
                          disabled={!p.parent_phone}
                        />
                        <span>Veli{p.parent_name ? ` (${p.parent_name})` : ''}</span>
                        <span className="font-mono text-[10px] text-slate-400">{p.parent_phone || '—'}</span>
                      </label>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-dashed border-amber-200 bg-amber-50/40 p-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-sm font-medium text-slate-800">Dış liste havuzu</span>
              <p className="text-[11px] text-slate-500">
                Excel / CSV ve manuel eklenen kişiler — sistem öğrencilerinden ayrı tutulur.
              </p>
            </div>
            <span className="text-xs font-medium text-amber-900">{validExternalCount} kişi</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => downloadEventParticipantTemplateXlsx()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" />
              Örnek Excel indir
            </button>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-amber-200 bg-white px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-50">
              {importBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}
              Excel / CSV yükle
              <input
                ref={excelInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,.txt"
                disabled={importBusy}
                className="hidden"
                onChange={(e) => void handleExcelImport(e.target.files?.[0] || null)}
              />
            </label>
            {externalRows.length ? (
              <button
                type="button"
                onClick={() => setExternalRows([])}
                className="rounded-lg border border-red-200 px-2.5 py-1 text-xs text-red-700 hover:bg-red-50"
              >
                Havuzu temizle
              </button>
            ) : null}
          </div>

          {externalRows.length ? (
            <div className="max-h-40 overflow-y-auto rounded-lg border border-amber-100 bg-white p-2">
              <ul className="space-y-1 text-xs">
                {externalRows.map((row, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2 border-b border-slate-50 py-1 last:border-0">
                    <input
                      value={row.display_name}
                      onChange={(e) => {
                        const next = [...externalRows];
                        next[i] = { ...next[i], display_name: e.target.value };
                        setExternalRows(next);
                      }}
                      placeholder="Ad"
                      className="min-w-[100px] flex-1 rounded border border-slate-200 px-2 py-1"
                    />
                    <input
                      value={row.phone}
                      onChange={(e) => {
                        const next = [...externalRows];
                        next[i] = { ...next[i], phone: e.target.value };
                        setExternalRows(next);
                      }}
                      placeholder="05xx…"
                      className="min-w-[120px] flex-1 rounded border border-slate-200 px-2 py-1 font-mono text-[11px]"
                    />
                    <button
                      type="button"
                      onClick={() => setExternalRows(externalRows.filter((_, j) => j !== i))}
                      className="text-red-600 hover:underline"
                    >
                      Kaldır
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">Henüz dış liste yok. Excel yükleyin veya manuel satır ekleyin.</p>
          )}

          <button
            type="button"
            onClick={() =>
              setExternalRows([...externalRows, { display_name: '', phone: '', source_type: 'external' }])
            }
            className="inline-flex items-center gap-1 text-xs font-medium text-amber-900 hover:underline"
          >
            <Plus className="h-3.5 w-3.5" />
            Dış listeye manuel satır ekle
          </button>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => void createEvent()}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}
          {sendMode === 'once' || sendMode === 'daily' ? 'Etkinliği planla' : 'Etkinliği oluştur'}
        </button>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-800">Geçmiş etkinlikler</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={seminarSyncBusy}
              onClick={() => void syncSeminarRegistrations()}
              className="inline-flex items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2 py-1 text-xs text-teal-800 hover:bg-teal-100 disabled:opacity-50"
            >
              {seminarSyncBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Seminer kayıtlarını eşitle
            </button>
            <button
              type="button"
              onClick={() => void loadAll()}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Yenile
            </button>
          </div>
        </div>
        {loading ? (
          <p className="text-sm text-slate-500">Yükleniyor…</p>
        ) : events.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
            Henüz etkinlik yok.
          </p>
        ) : (
          <ul className="space-y-3">
            {events.map((ev) => {
              const stats = ev.whatsapp_stats;
              const total = stats?.total ?? ev.institution_event_participants?.[0]?.count ?? 0;
              const sent = stats?.sent ?? 0;
              const failed = stats?.failed ?? 0;
              const pending = stats?.pending ?? Math.max(0, total - sent - failed);
              const plan = scheduleLabel(ev);
              const detail = eventDetails[ev.id];
              const expanded = expandedEventId === ev.id;
              return (
                <li
                  key={ev.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900">{ev.title}</p>
                      <p className="text-xs text-slate-500">
                        {[ev.event_date, ev.event_time ? String(ev.event_time).slice(0, 5) : null]
                          .filter(Boolean)
                          .join(' · ') || 'Tarih belirtilmedi'}
                        {total ? ` · ${total} katılımcı` : ''}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
                          ✓ {sent} gitti
                        </span>
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-900">
                          ◷ {pending} bekliyor
                        </span>
                        {failed > 0 ? (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-800">
                            ✗ {failed} hata
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-[10px] text-slate-400">Şablon: {ev.template_type}</p>
                      {plan ? <p className="mt-0.5 text-[10px] font-medium text-violet-700">{plan}</p> : null}
                      {ev.seminar_sync_key ? (
                        <p className="mt-0.5 text-[10px] text-teal-700">
                          Seminer: <span className="font-mono">{ev.seminar_sync_key}</span>
                          {ev.seminar_auto_send === false ? ' · otomatik kapalı' : ' · otomatik açık'}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        disabled={detailLoadingId === ev.id}
                        onClick={() => void loadEventDetail(ev.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50"
                      >
                        {detailLoadingId === ev.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : expanded ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                        Rapor
                      </button>
                      {ev.schedule_status === 'scheduled' ? (
                        <button
                          type="button"
                          onClick={() => void cancelSchedule(ev.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-violet-200 px-2 py-1 text-[11px] text-violet-800 hover:bg-violet-50"
                        >
                          Planı iptal
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={sendBusyId === ev.id}
                        onClick={() => void sendInvites(ev.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                      >
                        {sendBusyId === ev.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Send className="h-3 w-3" />
                        )}
                        WhatsApp gönder
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteEvent(ev.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-[11px] text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-3 w-3" />
                        Sil
                      </button>
                    </div>
                  </div>
                  {expanded && detail?.participants?.length ? (
                    <div className="mt-3 overflow-x-auto rounded-lg border border-slate-100">
                      <table className="min-w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-600">
                          <tr>
                            <th className="px-2 py-1.5 font-medium">Ad</th>
                            <th className="px-2 py-1.5 font-medium">Kaynak</th>
                            <th className="px-2 py-1.5 font-medium">Telefon</th>
                            <th className="px-2 py-1.5 font-medium">Durum</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.participants.map((p) => (
                            <tr key={p.id} className="border-t border-slate-100">
                              <td className="px-2 py-1.5">{p.display_name}</td>
                              <td className="px-2 py-1.5 text-[10px] text-slate-500">{sourceTypeLabel(p.source_type)}</td>
                              <td className="px-2 py-1.5 font-mono text-[10px]">{p.phone}</td>
                              <td className="px-2 py-1.5">
                                {p.whatsapp_status === 'sent' ? (
                                  <span className="text-emerald-700">Gönderildi</span>
                                ) : p.whatsapp_status === 'failed' ? (
                                  <span className="text-red-700" title={p.whatsapp_error || ''}>
                                    Hata
                                  </span>
                                ) : (
                                  <span className="text-amber-700">Bekliyor</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="flex items-start gap-2 text-xs text-slate-500">
        <MessageCircle className="mt-0.5 h-4 w-4 shrink-0" />
        Meta şablonu: <code className="rounded bg-slate-100 px-1">etkinlik_hatirlatma_link_891bes</code> (UTILITY, onaylı).
        SQL güncelleme:{' '}
        <code className="rounded bg-slate-100 px-1">2026-06-07-institution-event-meta-template.sql</code>
      </p>
    </div>
  );
}
