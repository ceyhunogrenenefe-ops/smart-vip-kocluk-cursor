import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import {
  CheckCircle,
  Clock,
  Copy,
  Loader2,
  MessageCircle,
  Phone,
  Plus,
  QrCode,
  RefreshCw,
  Send,
  Smartphone,
  Trash2,
  Unlink,
  User,
  Users,
  Pencil
} from 'lucide-react';
import { formatClassLevelLabel } from '../types';
import type { Student } from '../types';
import { apiFetch, getAuthToken, getGatewaySessionUserId } from '../lib/session';
import { normalizeWhatsAppPhoneForSend } from '../lib/whatsappOutbound';
import { sendWhatsAppMessage } from '../lib/twilio';
import WhatsAppMerkeziPanel from '../components/whatsapp/WhatsAppMerkeziPanel';
import { resolveWhatsAppGatewayBase, emptyGatewayStatusPayload, isGatewayStatusForSession, resolveGatewaySessionPath } from '../lib/whatsappGatewayClient';

type GatewayStatus = 'idle' | 'connecting' | 'qr_ready' | 'connected' | 'logged_out' | 'reconnecting';

const formatPhone = (value: string) => normalizeWhatsAppPhoneForSend(value);

function isValidGatewayEnvUrl(s: string): boolean {
  const t = s.trim();
  return /^https?:\/\/[^\s]+/i.test(t);
}

const DEFAULT_QUICK_STUDENT_TEMPLATE =
  'Merhaba {{name}}, bugün hedefin: {{task}}.\n\n• Kaç soru çözdün?\n• Hangi derslere çalıştın?\n• Kaç sayfa kitap okudun?';

const DEFAULT_QUICK_PARENT_TEMPLATE =
  'Sayın veli,\n{{name}} için bugün kısa durum özeti:\n• Disiplin: [1–10]\n• Odak: [1–10]\n• Ekran süresi: […]\n\nNot: {{task}}';

const DEFAULT_BULK_DENEME_TEMPLATE = `Merhaba {{1}},

Deneme sınavınız planlanmıştır.

📅 Tarih: {{2}}
⏰ Saat: {{3}}

Sınava aşağıdaki bağlantı üzerinden katılabilirsiniz:
🔗 {{4}}

Başarılar dileriz.
Online VIP Dershane`;

function quickTemplatesStorageKey(userId: string) {
  return `coach_wa_quick_templates_${userId}`;
}

function renderQuickTemplate(
  template: string,
  vars: { name?: string; task?: string; coach?: string }
) {
  return template
    .replace(/\{\{\s*name\s*\}\}/gi, vars.name ?? '')
    .replace(/\{\{\s*task\s*\}\}/gi, vars.task ?? '')
    .replace(/\{\{\s*coach\s*\}\}/gi, vars.coach ?? '');
}

function renderBulkTemplate(
  template: string,
  vars: {
    name?: string;
    task?: string;
    coach?: string;
    examDate?: string;
    examTime?: string;
    examLink?: string;
  }
) {
  const name = vars.name ?? '';
  const examDate = vars.examDate ?? '';
  const examTime = vars.examTime ?? '';
  const examLink = vars.examLink ?? '';
  return template
    .replace(/\{\{\s*1\s*\}\}/g, name)
    .replace(/\{\{\s*2\s*\}\}/g, examDate)
    .replace(/\{\{\s*3\s*\}\}/g, examTime)
    .replace(/\{\{\s*4\s*\}\}/g, examLink)
    .replace(/\{\{\s*name\s*\}\}/gi, name)
    .replace(/\{\{\s*task\s*\}\}/gi, vars.task ?? '')
    .replace(/\{\{\s*coach\s*\}\}/gi, vars.coach ?? '')
    .replace(/\{\{\s*date\s*\}\}/gi, examDate)
    .replace(/\{\{\s*time\s*\}\}/gi, examTime)
    .replace(/\{\{\s*link\s*\}\}/gi, examLink);
}

function bulkTemplateUsesExamVars(template: string) {
  return /\{\{\s*[234]\s*\}\}|\{\{\s*(date|time|link)\s*\}\}/i.test(template);
}

interface CoachWaPrefsPayload {
  coach_id: string;
  prefs: {
    daily_report_enabled: boolean;
    daily_report_scope: string;
    updated_at: string | null;
  };
  gateway: {
    connected: boolean;
    label: string;
    status: string;
    error: string | null;
    session_id: string | null;
  };
  recent_logs: Array<{
    id: string;
    student_id: string | null;
    kind: string;
    phone: string | null;
    status: string;
    sent_at: string;
    error: string | null;
    meta_template_name: string | null;
  }>;
}

interface WaScheduleDTO {
  coach_id: string;
  is_active: boolean;
  message_template: string;
  send_hour_tr: number;
  send_minute_tr: number;
  weekdays_only: boolean;
  interval_days: number;
  campaign_days: number | null;
  campaign_started_at: string | null;
  prefer_parent_phone: boolean;
}

interface WaGatewayScheduleDTO {
  id: string;
  coach_id: string;
  label: string | null;
  is_active: boolean;
  message_template: string;
  send_hour_tr: number;
  send_minute_tr: number;
  weekdays_only: boolean;
  interval_days: number;
  campaign_days: number | null;
  campaign_started_at: string | null;
  prefer_parent_phone: boolean;
  gateway_user_id: string | null;
  repeat_mode?: 'once' | 'daily' | 'weekly' | 'interval';
  send_date_tr?: string | null;
  weekday_tr?: number | null;
  target_student_ids?: string[];
  target_class_level?: string | null;
  target_group_name?: string | null;
  recipient_channel?: 'student' | 'parent';
  task_default?: string | null;
  template_var_date?: string | null;
  template_var_time?: string | null;
  template_var_link?: string | null;
}

type GwRepeatMode = 'once' | 'daily' | 'weekly' | 'interval';

interface BulkSavedTemplate {
  id: string;
  name: string;
  template: string;
  task: string;
  examDate?: string;
  examTime?: string;
  examLink?: string;
}

const BUILTIN_BULK_TEMPLATES: BulkSavedTemplate[] = [
  {
    id: 'builtin_deneme_sinavi',
    name: 'Deneme Sınavı',
    template: DEFAULT_BULK_DENEME_TEMPLATE,
    task: '',
    examDate: '',
    examTime: '',
    examLink: ''
  }
];

function mergeBulkTemplatesWithBuiltin(saved: BulkSavedTemplate[]) {
  const custom = saved.filter((x) => !x.id.startsWith('builtin_'));
  const builtins = BUILTIN_BULK_TEMPLATES.map((b) => {
    const over = saved.find((x) => x.id === b.id);
    return over ? { ...b, ...over, id: b.id, name: over.name || b.name } : b;
  });
  return [...builtins, ...custom];
}

const GW_WEEKDAY_OPTS: { value: number; label: string }[] = [
  { value: 1, label: 'Pazartesi' },
  { value: 2, label: 'Salı' },
  { value: 3, label: 'Çarşamba' },
  { value: 4, label: 'Perşembe' },
  { value: 5, label: 'Cuma' },
  { value: 6, label: 'Cumartesi' },
  { value: 7, label: 'Pazar' }
];

function bulkTemplatesStorageKey(userId: string) {
  return `coach_wa_bulk_templates_${userId}`;
}

function gwScheduleApiBody(row: WaGatewayScheduleDTO, restartCampaign = false) {
  return {
    label: row.label,
    is_active: row.is_active,
    message_template: row.message_template,
    send_hour_tr: row.send_hour_tr,
    send_minute_tr: row.send_minute_tr,
    weekdays_only: row.weekdays_only,
    interval_days: row.interval_days,
    campaign_days:
      row.campaign_days === null || row.campaign_days === undefined ? '' : row.campaign_days,
    prefer_parent_phone: row.prefer_parent_phone,
    recipient_channel: row.recipient_channel ?? (row.prefer_parent_phone ? 'parent' : 'student'),
    repeat_mode: row.repeat_mode ?? 'daily',
    send_date_tr: row.repeat_mode === 'once' ? row.send_date_tr ?? null : null,
    weekday_tr: row.repeat_mode === 'weekly' ? row.weekday_tr ?? null : null,
    target_student_ids: row.target_student_ids ?? [],
    target_class_level: row.target_class_level ?? null,
    target_group_name: row.target_group_name ?? null,
    task_default: row.task_default ?? null,
    template_var_date: row.template_var_date ?? null,
    template_var_time: row.template_var_time ?? null,
    template_var_link: row.template_var_link ?? null,
    restart_campaign: restartCampaign
  };
}

export default function CoachWhatsAppSettings() {
  const hook = useAuth();
  const { user, isImpersonating } = hook;
  /** Gateway JWT sub = giriş yapan users.id; taklit (effectiveUser) kullanılmaz — 403 önlenir. */
  const coachId = getGatewaySessionUserId(user?.id);
  const actor =
    (hook as unknown as { effectiveUser?: typeof hook.user | null }).effectiveUser ??
    hook.user ??
    null;
  const isAdminActor = actor?.role === 'super_admin' || actor?.role === 'admin';
  const { students } = useApp();
  const gatewayEnvRaw = String(import.meta.env.VITE_WHATSAPP_GATEWAY_URL || '').trim();
  const gatewayEnvInvalid = Boolean(gatewayEnvRaw && !isValidGatewayEnvUrl(gatewayEnvRaw));
  const gatewayUrl = resolveWhatsAppGatewayBase();
  const gatewayKey = (import.meta.env.VITE_WHATSAPP_GATEWAY_KEY || '').trim();

  const [waScheduleLoading, setWaScheduleLoading] = useState(false);
  const [waScheduleSaving, setWaScheduleSaving] = useState(false);
  const [waScheduleMsg, setWaScheduleMsg] = useState('');
  const [restartCampaignOnSave, setRestartCampaignOnSave] = useState(false);
  const [waDraft, setWaDraft] = useState<WaScheduleDTO | null>(null);

  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<GatewayStatus>('idle');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [lastConnectedAt, setLastConnectedAt] = useState<string | null>(null);
  const [linkedPhone, setLinkedPhone] = useState<string | null>(null);
  /** VPS gateway (Baileys) bağlantı hatası — WhatsApp oturumu düşünce dolabilir */
  const [gatewaySessionError, setGatewaySessionError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [healthCheckBusy, setHealthCheckBusy] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [templateTab, setTemplateTab] = useState<'student' | 'parent'>('student');
  const [templateTask, setTemplateTask] = useState('');
  const [studentQuickTemplate, setStudentQuickTemplate] = useState(DEFAULT_QUICK_STUDENT_TEMPLATE);
  const [parentQuickTemplate, setParentQuickTemplate] = useState(DEFAULT_QUICK_PARENT_TEMPLATE);
  const [templateSendBusy, setTemplateSendBusy] = useState(false);
  const [templateNotice, setTemplateNotice] = useState('');
  const [templateWaUrl, setTemplateWaUrl] = useState<string | null>(null);

  const [bulkClassFilter, setBulkClassFilter] = useState('');
  const [bulkGroupFilter, setBulkGroupFilter] = useState('');
  const [bulkChannel, setBulkChannel] = useState<'student' | 'parent'>('student');
  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkTask, setBulkTask] = useState('');
  const [bulkSendBusy, setBulkSendBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState('');
  const [bulkNotice, setBulkNotice] = useState('');
  const [bulkTemplate, setBulkTemplate] = useState(DEFAULT_QUICK_STUDENT_TEMPLATE);
  const [bulkTemplateName, setBulkTemplateName] = useState('');
  const [bulkSavedTemplates, setBulkSavedTemplates] = useState<BulkSavedTemplate[]>([]);
  const [bulkEditingTemplateId, setBulkEditingTemplateId] = useState<string | null>(null);
  const [bulkRepeatMode, setBulkRepeatMode] = useState<GwRepeatMode>('daily');
  const [bulkSendDate, setBulkSendDate] = useState('');
  const [bulkWeekday, setBulkWeekday] = useState(1);
  const [bulkSendHour, setBulkSendHour] = useState(9);
  const [bulkSendMinute, setBulkSendMinute] = useState(0);
  const [bulkPlanLabel, setBulkPlanLabel] = useState('');
  const [bulkScheduleSaving, setBulkScheduleSaving] = useState(false);
  const [bulkExamDate, setBulkExamDate] = useState('');
  const [bulkExamTime, setBulkExamTime] = useState('');
  const [bulkExamLink, setBulkExamLink] = useState('');

  const [gwSchedulesLoading, setGwSchedulesLoading] = useState(false);
  const [gwSchedulesSavingId, setGwSchedulesSavingId] = useState<string | null>(null);
  const [gwSchedulesDeletingId, setGwSchedulesDeletingId] = useState<string | null>(null);
  const [gwSchedulesMsg, setGwSchedulesMsg] = useState('');
  const [gwSchedules, setGwSchedules] = useState<WaGatewayScheduleDTO[]>([]);
  const [gwRestartCampaignIds, setGwRestartCampaignIds] = useState<Record<string, boolean>>({});
  const [waPrefsLoading, setWaPrefsLoading] = useState(false);
  const [waPrefsSaving, setWaPrefsSaving] = useState(false);
  const [waPrefsMsg, setWaPrefsMsg] = useState('');
  const [waPrefs, setWaPrefs] = useState<CoachWaPrefsPayload | null>(null);
  const fetchGenRef = useRef(0);
  const selectedStudent = students.find((s) => s.id === selectedStudentId);
  const isConnected = status === 'connected';
  const hasServerJwt = Boolean(getAuthToken());
  /** Gateway VPS JWT imzasını doğrular; yalnızca localStorage kullanıcısı (JWT yok) yetmez. */
  const canUseGateway = Boolean(gatewayUrl && coachId && hasServerJwt);
  const needsJwtForGateway = Boolean(gatewayUrl && coachId && !hasServerJwt);

  const loadWaSchedule = useCallback(async () => {
    if (!getAuthToken()) {
      setWaDraft(null);
      return;
    }
    setWaScheduleLoading(true);
    setWaScheduleMsg('');
    try {
      const res = await apiFetch('/api/coach-whatsapp-schedule');
      const payload = (await res.json().catch(() => ({}))) as {
        data?: WaScheduleDTO;
        error?: string;
        hint?: string;
        code?: string;
      };
      if (!res.ok) {
        setWaDraft(null);
        const codePrefix =
          payload?.code === 'no_coach_id'
            ? 'Koç kaydı bulunamadı (users ile coaches e-postası aynı olmalı). '
            : payload?.code === 'wrong_role'
              ? 'Bu uç yalnızca koç veya öğretmen içindir. '
              : '';
        const parts = [
          codePrefix,
          payload?.hint || payload?.error
        ].filter((x): x is string => Boolean(x && String(x).trim()));
        setWaScheduleMsg(parts.length ? parts.join('') : 'Zamanlayıcı ayarları yüklenemedi.');
        return;
      }
      if (payload.data) setWaDraft(payload.data);
    } catch {
      setWaDraft(null);
      setWaScheduleMsg('Zamanlayıcı ayarları yüklenemedi.');
    } finally {
      setWaScheduleLoading(false);
    }
  }, []);

  const loadWaPrefs = useCallback(async () => {
    if (!getAuthToken()) {
      setWaPrefs(null);
      return;
    }
    setWaPrefsLoading(true);
    setWaPrefsMsg('');
    try {
      const res = await apiFetch('/api/coach-whatsapp-notification-prefs');
      const payload = (await res.json().catch(() => ({}))) as CoachWaPrefsPayload & { error?: string };
      if (!res.ok) {
        setWaPrefs(null);
        setWaPrefsMsg(payload?.error || 'WhatsApp ayarları yüklenemedi.');
        return;
      }
      setWaPrefs(payload);
    } catch {
      setWaPrefs(null);
      setWaPrefsMsg('WhatsApp ayarları yüklenemedi.');
    } finally {
      setWaPrefsLoading(false);
    }
  }, []);

  const saveDailyReportPref = async (enabled: boolean) => {
    setWaPrefsSaving(true);
    setWaPrefsMsg('');
    try {
      const res = await apiFetch('/api/coach-whatsapp-notification-prefs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daily_report_enabled: enabled, daily_report_scope: enabled ? 'all' : 'none' })
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; prefs?: CoachWaPrefsPayload['prefs'] };
      if (!res.ok) throw new Error(j?.error || res.statusText);
      setWaPrefsMsg(enabled ? 'Günlük rapor hatırlatması açıldı.' : 'Günlük rapor hatırlatması kapatıldı.');
      void loadWaPrefs();
    } catch (e) {
      setWaPrefsMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setWaPrefsSaving(false);
    }
  };

  useEffect(() => {
    void loadWaPrefs();
  }, [loadWaPrefs]);

  useEffect(() => {
    void loadWaSchedule();
  }, [loadWaSchedule]);

  useEffect(() => {
    if (!coachId) return;
    try {
      const raw = localStorage.getItem(quickTemplatesStorageKey(coachId));
      if (!raw) return;
      const parsed = JSON.parse(raw) as { student?: string; parent?: string };
      if (typeof parsed.student === 'string' && parsed.student.trim()) {
        setStudentQuickTemplate(parsed.student);
      }
      if (typeof parsed.parent === 'string' && parsed.parent.trim()) {
        setParentQuickTemplate(parsed.parent);
      }
    } catch {
      /* yoksay */
    }
  }, [coachId]);

  useEffect(() => {
    if (!coachId) return;
    try {
      localStorage.setItem(
        quickTemplatesStorageKey(coachId),
        JSON.stringify({ student: studentQuickTemplate, parent: parentQuickTemplate })
      );
    } catch {
      /* yoksay */
    }
  }, [coachId, studentQuickTemplate, parentQuickTemplate]);

  useEffect(() => {
    if (!coachId) return;
    try {
      const raw = localStorage.getItem(bulkTemplatesStorageKey(coachId));
      if (!raw) {
        setBulkSavedTemplates(BUILTIN_BULK_TEMPLATES);
        return;
      }
      const parsed = JSON.parse(raw) as BulkSavedTemplate[];
      if (Array.isArray(parsed)) setBulkSavedTemplates(mergeBulkTemplatesWithBuiltin(parsed));
      else setBulkSavedTemplates(BUILTIN_BULK_TEMPLATES);
    } catch {
      setBulkSavedTemplates(BUILTIN_BULK_TEMPLATES);
    }
  }, [coachId]);

  useEffect(() => {
    if (!coachId) return;
    try {
      localStorage.setItem(bulkTemplatesStorageKey(coachId), JSON.stringify(bulkSavedTemplates));
    } catch {
      /* yoksay */
    }
  }, [coachId, bulkSavedTemplates]);

  useEffect(() => {
    setBulkTemplate(bulkChannel === 'student' ? studentQuickTemplate : parentQuickTemplate);
  }, [bulkChannel, studentQuickTemplate, parentQuickTemplate]);

  const loadGwSchedules = useCallback(async () => {
    if (!getAuthToken()) {
      setGwSchedules([]);
      return;
    }
    setGwSchedulesLoading(true);
    setGwSchedulesMsg('');
    try {
      const res = await apiFetch('/api/coach-whatsapp-gateway-schedules');
      const payload = (await res.json().catch(() => ({}))) as {
        data?: WaGatewayScheduleDTO[];
        error?: string;
        hint?: string;
      };
      if (!res.ok) {
        setGwSchedules([]);
        setGwSchedulesMsg(payload?.hint || payload?.error || 'Gateway zamanlayıcıları yüklenemedi.');
        return;
      }
      setGwSchedules(Array.isArray(payload.data) ? payload.data : []);
    } catch {
      setGwSchedules([]);
      setGwSchedulesMsg('Gateway zamanlayıcıları yüklenemedi.');
    } finally {
      setGwSchedulesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadGwSchedules();
  }, [loadGwSchedules]);

  const patchGwSchedule = (id: string, patch: Partial<WaGatewayScheduleDTO>) => {
    setGwSchedules((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const createGwSchedule = async (seed?: Partial<WaGatewayScheduleDTO>) => {
    if (!getAuthToken()) return;
    setGwSchedulesMsg('');
    try {
      const res = await apiFetch('/api/coach-whatsapp-gateway-schedules', {
        method: 'POST',
        body: JSON.stringify(
          gwScheduleApiBody({
            label: seed?.label ?? 'Yeni plan',
            is_active: seed?.is_active ?? false,
            message_template: seed?.message_template ?? DEFAULT_QUICK_STUDENT_TEMPLATE,
            send_hour_tr: seed?.send_hour_tr ?? 9,
            send_minute_tr: seed?.send_minute_tr ?? 0,
            weekdays_only: seed?.weekdays_only ?? false,
            interval_days: seed?.interval_days ?? 1,
            campaign_days: seed?.campaign_days ?? null,
            prefer_parent_phone: seed?.prefer_parent_phone ?? false,
            recipient_channel: seed?.recipient_channel,
            repeat_mode: seed?.repeat_mode ?? 'daily',
            send_date_tr: seed?.send_date_tr ?? null,
            weekday_tr: seed?.weekday_tr ?? null,
            target_student_ids: seed?.target_student_ids ?? [],
            target_class_level: seed?.target_class_level ?? null,
            target_group_name: seed?.target_group_name ?? null,
            task_default: seed?.task_default ?? null,
            id: '',
            coach_id: '',
            campaign_started_at: null,
            gateway_user_id: null
          })
        )
      });
      const payload = (await res.json().catch(() => ({}))) as {
        data?: WaGatewayScheduleDTO;
        error?: string;
      };
      if (!res.ok || !payload.data) {
        setGwSchedulesMsg(payload?.error || 'Plan oluşturulamadı.');
        return;
      }
      setGwSchedules((prev) => [...prev, payload.data!]);
      setGwSchedulesMsg('Yeni toplu mesaj planı eklendi.');
    } catch {
      setGwSchedulesMsg('Plan oluşturulamadı.');
    }
  };

  const saveGwSchedule = async (row: WaGatewayScheduleDTO) => {
    if (!getAuthToken()) return;
    setGwSchedulesSavingId(row.id);
    setGwSchedulesMsg('');
    try {
      const res = await apiFetch(`/api/coach-whatsapp-gateway-schedules/${row.id}`, {
        method: 'PUT',
        body: JSON.stringify(gwScheduleApiBody(row, Boolean(gwRestartCampaignIds[row.id])))
      });
      const payload = (await res.json().catch(() => ({}))) as {
        data?: WaGatewayScheduleDTO;
        error?: string;
      };
      if (!res.ok || !payload.data) {
        setGwSchedulesMsg(payload?.error || 'Kayıt başarısız.');
        return;
      }
      setGwSchedules((prev) => prev.map((s) => (s.id === row.id ? payload.data! : s)));
      setGwRestartCampaignIds((prev) => ({ ...prev, [row.id]: false }));
      setGwSchedulesMsg('Plan kaydedildi. Zamanlanmış gönderimler bağlı WhatsApp gateway oturumunuzdan gider; cron ~15 dk’da bir çalışır.');
    } catch {
      setGwSchedulesMsg('Kayıt başarısız.');
    } finally {
      setGwSchedulesSavingId(null);
    }
  };

  const deleteGwSchedule = async (id: string) => {
    if (!getAuthToken()) return;
    setGwSchedulesDeletingId(id);
    setGwSchedulesMsg('');
    try {
      const res = await apiFetch(`/api/coach-whatsapp-gateway-schedules/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        setGwSchedulesMsg(payload?.error || 'Silinemedi.');
        return;
      }
      setGwSchedules((prev) => prev.filter((s) => s.id !== id));
      setGwSchedulesMsg('Plan silindi.');
    } catch {
      setGwSchedulesMsg('Silinemedi.');
    } finally {
      setGwSchedulesDeletingId(null);
    }
  };

  const duplicateGwSchedule = (row: WaGatewayScheduleDTO) => {
    void createGwSchedule({
      label: row.label ? `${row.label} (kopya)` : 'Plan (kopya)',
      is_active: false,
      message_template: row.message_template,
      send_hour_tr: row.send_hour_tr,
      send_minute_tr: row.send_minute_tr,
      weekdays_only: row.weekdays_only,
      interval_days: row.interval_days,
      campaign_days: row.campaign_days,
      prefer_parent_phone: row.prefer_parent_phone,
      recipient_channel: row.recipient_channel,
      repeat_mode: row.repeat_mode,
      send_date_tr: row.send_date_tr,
      weekday_tr: row.weekday_tr,
      target_student_ids: row.target_student_ids,
      target_class_level: row.target_class_level,
      target_group_name: row.target_group_name,
      task_default: row.task_default
    });
  };

  const saveBulkTemplateToLibrary = () => {
    const name = bulkTemplateName.trim() || `Şablon ${bulkSavedTemplates.length + 1}`;
    if (!bulkTemplate.trim()) {
      setBulkNotice('Kaydetmek için şablon metni girin.');
      return;
    }
    const examFields = {
      examDate: bulkExamDate,
      examTime: bulkExamTime,
      examLink: bulkExamLink
    };
    if (bulkEditingTemplateId) {
      setBulkSavedTemplates((prev) =>
        prev.map((x) =>
          x.id === bulkEditingTemplateId
            ? { ...x, name, template: bulkTemplate, task: bulkTask, ...examFields }
            : x
        )
      );
      setBulkNotice(`«${name}» güncellendi.`);
      return;
    }
    const entry: BulkSavedTemplate = {
      id: `bt_${Date.now()}`,
      name,
      template: bulkTemplate,
      task: bulkTask,
      ...examFields
    };
    setBulkSavedTemplates((prev) => [...prev, entry]);
    setBulkTemplateName('');
    setBulkNotice(`«${name}» kaydedildi.`);
  };

  const startEditBulkSavedTemplate = (id: string) => {
    const t = bulkSavedTemplates.find((x) => x.id === id);
    if (!t) return;
    setBulkEditingTemplateId(id);
    setBulkTemplateName(t.name);
    setBulkTemplate(t.template);
    setBulkTask(t.task);
    setBulkExamDate(t.examDate ?? '');
    setBulkExamTime(t.examTime ?? '');
    setBulkExamLink(t.examLink ?? '');
    setBulkNotice(`«${t.name}» düzenleme modunda — metni değiştirin, «Değişiklikleri kaydet»e basın.`);
  };

  const applyBulkSavedTemplate = (id: string) => {
    startEditBulkSavedTemplate(id);
  };

  const cancelBulkTemplateEdit = () => {
    setBulkEditingTemplateId(null);
    setBulkTemplateName('');
    setBulkNotice('Yeni şablon modu — kayıt yeni bir şablon oluşturur.');
  };

  const deleteBulkSavedTemplate = (id: string) => {
    if (id.startsWith('builtin_')) {
      setBulkNotice('Hazır «Deneme Sınavı» şablonu silinemez; düzenleyip kaydedebilirsiniz.');
      return;
    }
    setBulkSavedTemplates((prev) => prev.filter((x) => x.id !== id));
    if (bulkEditingTemplateId === id) {
      setBulkEditingTemplateId(null);
      setBulkTemplateName('');
    }
  };

  const saveBulkAsScheduledPlan = async () => {
    if (!getAuthToken()) return;
    if (!bulkTemplate.trim()) {
      setBulkNotice('Zamanlayıcı için şablon metni girin.');
      return;
    }
    if (bulkRepeatMode === 'once' && !bulkSendDate) {
      setBulkNotice('Tek seferlik gönderim için tarih seçin.');
      return;
    }
    setBulkScheduleSaving(true);
    setBulkNotice('');
    try {
      const res = await apiFetch('/api/coach-whatsapp-gateway-schedules', {
        method: 'POST',
        body: JSON.stringify({
          label: bulkPlanLabel.trim() || 'Toplu mesaj planı',
          is_active: true,
          message_template: bulkTemplate,
          task_default: bulkTask,
          template_var_date: bulkExamDate || null,
          template_var_time: bulkExamTime || null,
          template_var_link: bulkExamLink || null,
          send_hour_tr: bulkSendHour,
          send_minute_tr: bulkSendMinute,
          repeat_mode: bulkRepeatMode,
          send_date_tr: bulkRepeatMode === 'once' ? bulkSendDate : null,
          weekday_tr: bulkRepeatMode === 'weekly' ? bulkWeekday : null,
          interval_days: 1,
          recipient_channel: bulkChannel,
          prefer_parent_phone: bulkChannel === 'parent',
          target_student_ids: [...bulkSelectedIds],
          target_class_level: bulkClassFilter || null,
          target_group_name: bulkGroupFilter || null
        })
      });
      const payload = (await res.json().catch(() => ({}))) as {
        data?: WaGatewayScheduleDTO;
        error?: string;
      };
      if (!res.ok || !payload.data) {
        setBulkNotice(payload?.error || 'Zamanlanmış plan kaydedilemedi.');
        return;
      }
      setGwSchedules((prev) => [...prev, payload.data!]);
      setBulkNotice(
        'Zamanlanmış plan kaydedildi ve aktif. Mesajlar bağlı WhatsApp gateway oturumunuzdan gönderilir; cron ~15 dk’da bir tetiklenir.'
      );
      void loadGwSchedules();
    } catch {
      setBulkNotice('Zamanlanmış plan kaydedilemedi.');
    } finally {
      setBulkScheduleSaving(false);
    }
  };

  const saveWaSchedule = async () => {
    if (!waDraft || !getAuthToken()) return;
    setWaScheduleSaving(true);
    setWaScheduleMsg('');
    try {
      const res = await apiFetch('/api/coach-whatsapp-schedule', {
        method: 'PUT',
        body: JSON.stringify({
          is_active: waDraft.is_active,
          message_template: waDraft.message_template,
          send_hour_tr: waDraft.send_hour_tr,
          send_minute_tr: waDraft.send_minute_tr,
          weekdays_only: waDraft.weekdays_only,
          interval_days: waDraft.interval_days,
          campaign_days:
            waDraft.campaign_days === null || waDraft.campaign_days === undefined
              ? ''
              : waDraft.campaign_days,
          prefer_parent_phone: waDraft.prefer_parent_phone,
          restart_campaign: restartCampaignOnSave
        })
      });
      const payload = (await res.json().catch(() => ({}))) as {
        data?: WaScheduleDTO;
        error?: string;
      };
      if (!res.ok) {
        setWaScheduleMsg(payload?.error || 'Kayıt başarısız.');
        return;
      }
      if (payload.data) setWaDraft(payload.data);
      setRestartCampaignOnSave(false);
      setWaScheduleMsg('Plan kaydedildi. Gönderimler Meta Cloud API ile sunucudan yapılır (öğrenci telefonları kayıtlı olmalı).');
    } catch {
      setWaScheduleMsg('Kayıt başarısız.');
    } finally {
      setWaScheduleSaving(false);
    }
  };

  const connectionLabel = useMemo(() => {
    if (status === 'connected') return 'Bağlı';
    if (status === 'qr_ready') return 'QR hazır';
    if (status === 'connecting' || status === 'reconnecting') return 'Bağlanıyor…';
    if (status === 'logged_out') return 'Oturum kapalı — QR gerekli';
    return 'Bağlı değil';
  }, [status]);

  const formatGatewaySessionError = (raw: string) => {
    const e = raw.trim().toLowerCase();
    if (e.includes('connection failure')) {
      return 'WhatsApp sunucusuna bağlanılamadı (Connection Failure). Telefonda WhatsApp → Bağlı cihazlar’dan eski «Online VIP Coach» oturumunu kaldırın, sonra «Oturumu sıfırla ve QR al» butonuna basın.';
    }
    if (e.includes('conflict') || e.includes('connection replaced')) {
      return 'Aynı numara başka yerde bağlı. Telefondan diğer WhatsApp Web oturumlarını kapatın ve QR ile yeniden bağlanın.';
    }
    return raw.trim();
  };

  const buildGatewayUnreachableHint = (raw: string) => {
    const t = raw.toLowerCase();
    if (!t.includes('gateway_upstream_unreachable') && !t.includes('gateway_upstream_timeout')) return '';
    return ' Proxy upstream erişilemiyor: Gateway hangi makinede çalışıyorsa Vercel WHATSAPP_GATEWAY_UPSTREAM o makineye işaret etmeli (örn. http://VPS_IP:4010). Eğer gateway yalnızca Windows PC’de açıksa ve public IP yoksa Vercel oraya erişemez.';
  };

  const prettyDate = (iso?: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('tr-TR');
  };

  type GatewayStatusPayload = {
    status: GatewayStatus;
    qr: string | null;
    connectedAt?: string | null;
    lastError?: string | null;
    restoreBlocked?: boolean;
    authOnDisk?: boolean;
    hint?: string | null;
    linkedPhone?: string | null;
    sessionCoachId?: string | null;
    coachId?: string | null;
  };

  useEffect(() => {
    fetchGenRef.current += 1;
    const empty = emptyGatewayStatusPayload();
    setStatus(empty.status);
    setQrDataUrl(null);
    setLastConnectedAt(null);
    setLinkedPhone(null);
    setGatewaySessionError(null);
    setStatusMessage('');
  }, [coachId]);

  const applyGatewayStatusPayload = (data: GatewayStatusPayload) => {
    if (!isGatewayStatusForSession(data, coachId)) {
      const empty = emptyGatewayStatusPayload();
      setStatus(empty.status);
      setQrDataUrl(null);
      setLastConnectedAt(null);
      setLinkedPhone(null);
      setGatewaySessionError(null);
      return;
    }
    setStatus(data.status || 'idle');
    setQrDataUrl(data.qr || null);
    setLastConnectedAt(data.connectedAt || null);
    const lp = String(data.linkedPhone || '').replace(/\D/g, '');
    setLinkedPhone(
      lp.startsWith('90') && lp.length >= 12
        ? `+${lp.slice(0, 2)} ${lp.slice(2, 5)} ${lp.slice(5, 8)} ${lp.slice(8)}`
        : lp
          ? `+${lp}`
          : null
    );
    const err =
      data.status === 'connected' ||
      data.status === 'reconnecting' ||
      data.status === 'connecting'
        ? null
        : typeof data.lastError === 'string' && data.lastError.trim()
          ? data.lastError.trim()
          : data.restoreBlocked && data.hint
            ? data.hint
            : null;
    setGatewaySessionError(err);
  };

  const autoReconnectIfNeeded = async (data: GatewayStatusPayload) => {
    if (!canUseGateway || !hasServerJwt) return;
    const st = data.status || 'idle';
    const transientErr = String(data.lastError || '').toLowerCase().includes('stream errored');
    const canAutoRestore =
      data.authOnDisk &&
      !data.restoreBlocked &&
      (st === 'idle' ||
        st === 'reconnecting' ||
        (st === 'logged_out' && transientErr));
    if (!canAutoRestore) return;
    if (st === 'reconnecting' || st === 'connecting') return;
    try {
      await callGateway<GatewayStatusPayload>(`/sessions/${coachId}/start`, {
        method: 'POST',
        body: JSON.stringify({ purge: false })
      });
    } catch {
      /* status poll will retry */
    }
  };

  const hasConnectionFailure =
    Boolean(gatewaySessionError) &&
    gatewaySessionError!.toLowerCase().includes('connection failure');

  const callGateway = async <T,>(endpoint: string, init?: RequestInit): Promise<T> => {
    if (!gatewayUrl || !coachId) throw new Error('whatsapp_gateway_url_missing');
    const authToken = getAuthToken();
    if (!authToken) throw new Error('jwt_required_log_in_again');
    const resolvedEndpoint = resolveGatewaySessionPath(coachId, endpoint);
    const headers = new Headers(init?.headers || {});
    headers.set('Content-Type', 'application/json');
    if (authToken) headers.set('Authorization', `Bearer ${authToken}`);
    if (gatewayKey) headers.set('x-gateway-key', gatewayKey);

    const isSend = /\/send\/?$/i.test(resolvedEndpoint);
    if (isSend) headers.set('x-gateway-strict-session', '1');

    let body = init?.body;
    if (isSend && body && typeof body === 'string') {
      try {
        const parsed = JSON.parse(body) as Record<string, unknown>;
        body = JSON.stringify({ ...parsed, strict_session: true });
      } catch {
        /* keep original body */
      }
    }

    const timeoutMs = isSend ? 115000 : 28000;
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(`${gatewayUrl}${resolvedEndpoint}`, {
        headers,
        ...init,
        body: body ?? init?.body,
        signal: controller.signal
      });
    } catch (e) {
      clearTimeout(tid);
      if (e instanceof Error && e.name === 'AbortError') {
        throw new Error(
          isSend
            ? 'Mesaj gönderimi zaman aşımına uğradı. VPS gateway yavaş veya kopuk — pm2 restart whatsapp-gateway deneyin.'
            : 'Gateway durumu alınamadı (zaman aşımı).'
        );
      }
      throw e;
    }
    clearTimeout(tid);

    const rawText = await res.text();
    let data: {
      error?: string;
      detail?: string;
      hint?: string;
      ok?: boolean;
    } = {};
    try {
      data = rawText ? (JSON.parse(rawText) as typeof data) : {};
    } catch {
      data = { detail: rawText.slice(0, 400) };
    }
    if (!res.ok) {
      const parts = [data.error, data.detail, data.hint].filter(
        (x): x is string => typeof x === 'string' && x.length > 0
      );
      const base = parts.length
        ? parts.join(' — ')
        : rawText.trim()
          ? `HTTP ${res.status}: ${rawText.slice(0, 200)}`
          : `gateway_request_failed (HTTP ${res.status})`;
      const authHint =
        res.status === 401
          ? data.error === 'invalid_gateway_key'
            ? ' GATEWAY_API_KEY uyuşmuyor: VPS whatsapp-gateway .env dosyasına Vercel’deki GATEWAY_API_KEY değerini yazın, pm2 restart whatsapp-gateway.'
            : ' Oturum (JWT) süresi dolmuş veya APP_JWT_SECRET uyuşmuyor: çıkış yapıp tekrar giriş yapın. VPS gateway .env ile Vercel aynı APP_JWT_SECRET olmalı.'
          : res.status === 502
            ? ' VPS gateway kapalı/erişilemiyor — sunucuda pm2 restart whatsapp-gateway, port 4010 açık mı kontrol edin.'
            : res.status === 504
              ? ' Mesaj gönderimi zaman aşımına uğradı — VPS gateway yavaş veya kopuk; pm2 restart whatsapp-gateway.'
              : res.status === 403
            ? ' URL’deki oturum id (JWT sub) ile eşleşme yok (coach_scope_mismatch) veya erişim reddedildi. Tarayıcıda açık olan kullanıcı = gateway’e giden id; Vercel’de WHATSAPP_GATEWAY_UPSTREAM / proxy çalışıyor olmalı.'
            : '';
      const upstreamUnreachableHint = buildGatewayUnreachableHint(base);
      const err = new Error(`${base}${authHint}${upstreamUnreachableHint}`) as Error & { httpStatus?: number };
      err.httpStatus = res.status;
      throw err;
    }
    if (data.ok === false) {
      const parts = [data.error, data.detail, data.hint].filter(
        (x): x is string => typeof x === 'string' && x.length > 0
      );
      throw new Error(parts.length ? parts.join(' — ') : 'gateway_send_failed');
    }
    if (isSend) {
      const mid = String((data as { id?: string | null; message_id?: string | null }).id || (data as { message_id?: string }).message_id || '').trim();
      if (!mid) {
        throw new Error(
          'Gateway mesaj kimliği dönmedi — gönderim doğrulanamadı. QR oturumunu kontrol edip tekrar deneyin.'
        );
      }
    }
    return data as T;
  };

  /** Eski VPS sürümünde POST /reset yok — /start?purge ile aynı işi yapar. */
  const callGatewayReset = async (): Promise<GatewayStatusPayload & { purged?: boolean; reset?: boolean }> => {
    try {
      return await callGateway<GatewayStatusPayload & { reset?: boolean }>(`/sessions/${coachId}/reset`, {
        method: 'POST'
      });
    } catch (e) {
      const status = (e as Error & { httpStatus?: number }).httpStatus;
      if (status === 404) {
        return callGateway<GatewayStatusPayload & { purged?: boolean }>(`/sessions/${coachId}/start`, {
          method: 'POST',
          body: JSON.stringify({ purge: true })
        });
      }
      throw e;
    }
  };

  const fetchStatus = async () => {
    if (!canUseGateway || !hasServerJwt) return false;
    const gen = ++fetchGenRef.current;
    try {
      const data = await callGateway<GatewayStatusPayload>(`/sessions/${coachId}/status`);
      if (gen !== fetchGenRef.current) return false;
      applyGatewayStatusPayload(data);
      void autoReconnectIfNeeded(data);
      return true;
    } catch (e) {
      if (gen !== fetchGenRef.current) return false;
      const msg = e instanceof Error && e.message ? e.message : 'gateway_request_failed';
      const upstreamHint = msg.includes('whatsapp_gateway_upstream_missing')
        ? ' Vercel ortam değişkeni: WHATSAPP_GATEWAY_UPSTREAM=http://SUNUCU_IP:4010 (WhatsApp gateway VPS).'
        : '';
      setGatewaySessionError(null);
      setStatusMessage(`Gateway durumu: ${msg}.${upstreamHint}`);
      return false;
    }
  };

  useEffect(() => {
    if (!canUseGateway) return;
    let cancelled = false;
    let delayMs = 5000;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      if (cancelled) return;
      const ok = await fetchStatus();
      const fastPoll =
        status === 'connecting' || status === 'reconnecting' || status === 'qr_ready';
      delayMs = ok ? (fastPoll ? 2000 : 5000) : Math.min(delayMs * 2, 30000);
      if (!cancelled) timer = setTimeout(() => void tick(), delayMs);
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [canUseGateway, coachId, hasServerJwt, status]);

  const startConnection = async () => {
    if (!canUseGateway) {
      setStatusMessage(
        needsJwtForGateway
          ? 'Sunucu oturumu (JWT) yok. Çıkış yapıp e-posta ve şifrenizle tekrar giriş yapın; yalnızca tarayıcıda kayıtlı “yerel” oturum WhatsApp gateway için yeterli değil.'
          : 'WhatsApp gateway adresi tanımlı değil (ortam değişkeni).'
      );
      return;
    }
    setIsBusy(true);
    setStatusMessage('');
    setGatewaySessionError(null);
    try {
      if (hasConnectionFailure || status === 'logged_out') {
        const resetData = await callGatewayReset();
        applyGatewayStatusPayload(resetData);
        if (resetData.qr) {
          setStatusMessage('Eski oturum silindi. Yeni QR hazır — telefonunuzdan okutun.');
          return;
        }
      }

      const started = await callGateway<GatewayStatusPayload & { purged?: boolean }>(
        `/sessions/${coachId}/start`,
        {
          method: 'POST',
          body: JSON.stringify({ purge: hasConnectionFailure || status === 'logged_out' })
        }
      );
      applyGatewayStatusPayload(started);
      if (started.purged) {
        setStatusMessage('Bozuk oturum temizlendi. QR bekleniyor…');
      }
      let sawQrOrConnected = Boolean(started?.qr) || started?.status === 'connected';
      for (let i = 0; i < 60; i++) {
        try {
          const snap = await callGateway<GatewayStatusPayload>(`/sessions/${coachId}/status`);
          applyGatewayStatusPayload(snap);
          if (snap.qr || snap.status === 'connected') {
            sawQrOrConnected = true;
            break;
          }
          if (snap.lastError && snap.lastError.toLowerCase().includes('connection failure')) {
            break;
          }
        } catch {
          /* geçici proxy/VPS — kısa aralıkla yeniden dene */
        }
        await new Promise((r) => setTimeout(r, 450));
      }
      await fetchStatus();
      setStatusMessage(
        sawQrOrConnected
          ? 'QR oluşturuldu. WhatsApp → Bağlı cihazlar’dan eski «Online VIP» oturumunu kaldırıp yeni QR’ı okutun.'
          : 'QR henüz gelmedi. «Oturumu sıfırla ve QR al» deneyin; VPS’te pm2 restart whatsapp-gateway ve gateway kodunun güncel olduğundan emin olun.'
      );
    } catch (error) {
      setStatusMessage(`Bağlantı başlatılamadı: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
    }
  };

  const disconnect = async () => {
    if (!canUseGateway) return;
    setIsBusy(true);
    try {
      await callGateway(`/sessions/${coachId}/logout`, { method: 'POST' });
      setStatus('logged_out');
      setQrDataUrl(null);
      setGatewaySessionError(null);
      setStatusMessage('WhatsApp oturumu sıfırlandı. QR ile yeniden bağlanabilirsiniz.');
    } catch (error) {
      setStatusMessage(`Çıkış yapılamadı: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
    }
  };

  const resetGatewaySession = async () => {
    if (!canUseGateway) return;
    setIsBusy(true);
    setStatusMessage('');
    setGatewaySessionError(null);
    setQrDataUrl(null);
    setStatus('connecting');
    try {
      const data = await callGatewayReset();
      applyGatewayStatusPayload(data);
      setStatusMessage(
        data.qr
          ? 'Eski oturum silindi. Yeni QR hazır — telefonda Bağlı cihazlardan eski oturumu kaldırıp okutun.'
          : 'Oturum sıfırlandı. QR gelmezse «QR / Oturum başlat»a basın.'
      );
    } catch (error) {
      setStatusMessage(`Sıfırlanamadı: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
    }
  };

  /** Yeni sekme açılıp açılmadığını döndürür (popup engeli = sessiz görünmezlik olmasın diye). */
  const openWaFallback = (target: string, message: string): { opened: boolean; url: string } => {
    const url = `https://wa.me/${target}?text=${encodeURIComponent(message)}`;
    const w = window.open(url, '_blank', 'noopener,noreferrer');
    const opened = w != null && !w.closed;
    return { opened, url };
  };

  const sendGatewayMessage = async (targetPhone: string, message: string) => {
    const maxAttempts = 2;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        if (attempt > 1) {
          await new Promise((r) => setTimeout(r, 1200));
          try {
            await callGateway(`/sessions/${coachId}/start`, {
              method: 'POST',
              body: JSON.stringify({ purge: false })
            });
          } catch {
            /* warm retry */
          }
          await new Promise((r) => setTimeout(r, 1000));
        } else if (status !== 'connected') {
          await ensureGatewayReadyBeforeSend(5000);
        }

        await callGateway(`/sessions/${coachId}/send`, {
          method: 'POST',
          body: JSON.stringify({ phone: targetPhone, message })
        });
        setStatusMessage('');
        setGatewaySessionError(null);
        void fetchStatus();
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const httpStatus = (error as Error & { httpStatus?: number }).httpStatus;
        const retryable =
          httpStatus === 409 ||
          httpStatus === 502 ||
          httpStatus === 504 ||
          /session_not_connected|timeout|stream errored|zaman aşımı/i.test(lastError.message);
        if (!retryable || attempt >= maxAttempts) break;
      }
    }

    const msg = lastError?.message || 'gateway_send_failed';
    if (/504|zaman aşımı|timeout/i.test(msg)) {
      setStatusMessage(
        'Gönderim yanıtı gecikti — mesaj telefona düşmüş olabilir. «Sağlık testi» ile oturumu doğrulayın.'
      );
    }
    void fetchStatus();
    throw lastError || new Error(msg);
  };

  const ensureGatewayReadyBeforeSend = async (maxWaitMs = 5000): Promise<boolean> => {
    if (!canUseGateway) return false;
    if (status === 'connected') return true;
    try {
      const data = await callGateway<GatewayStatusPayload>(`/sessions/${coachId}/status`);
      if (data.status === 'connected') {
        applyGatewayStatusPayload(data);
        return true;
      }
      if (data.authOnDisk && !data.restoreBlocked) {
        void callGateway(`/sessions/${coachId}/start`, {
          method: 'POST',
          body: JSON.stringify({ purge: false })
        });
        const deadline = Date.now() + Math.max(1500, maxWaitMs);
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 350));
          const st = await callGateway<GatewayStatusPayload>(`/sessions/${coachId}/status`);
          applyGatewayStatusPayload(st);
          if (st.status === 'connected') return true;
          if (st.status === 'qr_ready') return false;
        }
      }
    } catch {
      /* VPS send endpoint may still warm */
    }
    return status === 'connected';
  };

  const buildTemplateMessage = () => {
    if (!selectedStudent) return '';
    const template = templateTab === 'student' ? studentQuickTemplate : parentQuickTemplate;
    const coachName = actor?.name || 'Koçunuz';
    const taskFallback = templateTab === 'student' ? 'görev giriniz' : 'ek not yok';
    return renderQuickTemplate(template, {
      name: selectedStudent.name,
      task: templateTask.trim() || taskFallback,
      coach: coachName
    });
  };

  const bulkClassOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const st of students) {
      const key = st.classLevel != null ? String(st.classLevel) : '';
      if (!key || seen.has(key)) continue;
      seen.set(key, formatClassLevelLabel(st.classLevel));
    }
    return [...seen.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'tr'));
  }, [students]);

  const bulkFilteredStudents = useMemo(() => {
    return students.filter((st) => {
      if (bulkClassFilter && String(st.classLevel ?? '') !== bulkClassFilter) return false;
      if (bulkGroupFilter) {
        const g = String(st.groupName || '').trim();
        if (g !== bulkGroupFilter) return false;
      }
      return true;
    });
  }, [students, bulkClassFilter, bulkGroupFilter]);

  const bulkGroupOptions = useMemo(() => {
    const pool = bulkClassFilter
      ? students.filter((st) => String(st.classLevel ?? '') === bulkClassFilter)
      : students;
    const groups = new Set<string>();
    for (const st of pool) {
      const g = String(st.groupName || '').trim();
      if (g) groups.add(g);
    }
    return [...groups].sort((a, b) => a.localeCompare(b, 'tr'));
  }, [students, bulkClassFilter]);

  const resolveStudentPhone = (st: Student, channel: 'student' | 'parent') => {
    const parentRaw =
      st.parentPhone ||
      (st as unknown as { parent_phone?: string } | undefined)?.parent_phone ||
      '';
    const raw =
      channel === 'student'
        ? String(st.phone || '').trim()
        : String(parentRaw || st.phone || '').trim();
    return formatPhone(raw);
  };

  const buildBulkMessageForStudent = (st: Student) => {
    const taskFallback = bulkChannel === 'student' ? 'görev giriniz' : 'ek not yok';
    return renderBulkTemplate(bulkTemplate, {
      name: st.name,
      task: bulkTask.trim() || taskFallback,
      coach: actor?.name || 'Koçunuz',
      examDate: bulkExamDate,
      examTime: bulkExamTime,
      examLink: bulkExamLink
    });
  };

  const bulkNeedsExamFields = bulkTemplateUsesExamVars(bulkTemplate);

  const toggleBulkStudent = (id: string) => {
    setBulkSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const selectAllBulkVisible = () => {
    setBulkSelectedIds(new Set(bulkFilteredStudents.map((st) => st.id)));
  };

  const clearBulkSelection = () => setBulkSelectedIds(new Set());

  const sendBulkMeta = async () => {
    setBulkNotice('');
    setBulkProgress('');
    if (!bulkSelectedIds.size) {
      setBulkNotice('En az bir öğrenci seçin.');
      return;
    }
    if (!hasServerJwt) {
      setBulkNotice('Toplu gönderim için sunucu oturumu (JWT) gerekli — çıkış yapıp tekrar giriş yapın.');
      return;
    }
    if (canUseGateway && !isConnected) {
      setBulkNotice('WhatsApp gateway bağlı değil. QR ile bağlandıktan sonra tekrar deneyin.');
      return;
    }

    const targets = students.filter((st) => bulkSelectedIds.has(st.id));
    const withPhone = targets.filter((st) => resolveStudentPhone(st, bulkChannel));
    const skipped = targets.length - withPhone.length;
    if (!withPhone.length) {
      setBulkNotice(
        bulkChannel === 'parent'
          ? 'Seçili öğrencilerde veli/öğrenci telefonu yok.'
          : 'Seçili öğrencilerde telefon numarası yok.'
      );
      return;
    }

    const viaGateway = canUseGateway && isConnected;
    setBulkSendBusy(true);
    let ok = 0;
    let fail = 0;
    const errors: string[] = [];
    try {
      for (let i = 0; i < withPhone.length; i++) {
        const st = withPhone[i];
        const phone = resolveStudentPhone(st, bulkChannel);
        const message = buildBulkMessageForStudent(st);
        setBulkProgress(`${i + 1}/${withPhone.length} — ${st.name}`);
        try {
          if (viaGateway) {
            await sendGatewayMessage(phone, message);
            ok += 1;
          } else {
            const sent = await sendWhatsAppMessage({ to: phone, body: message });
            if (sent.ok) ok += 1;
            else {
              fail += 1;
              if (errors.length < 3) errors.push(`${st.name}: ${sent.error || 'meta_send_failed'}`);
            }
          }
        } catch (e) {
          fail += 1;
          const msg = e instanceof Error ? e.message : String(e);
          if (errors.length < 3) errors.push(`${st.name}: ${msg}`);
        }
        if (i < withPhone.length - 1) {
          await new Promise((r) => setTimeout(r, 400));
        }
      }
      const channelLabel = viaGateway ? 'WhatsApp gateway (QR)' : 'Meta Cloud API';
      const parts = [`${ok}/${withPhone.length} mesaj ${channelLabel} üzerinden gönderildi.`];
      if (fail) parts.push(`${fail} başarısız.`);
      if (skipped) parts.push(`${skipped} öğrenci telefonsuz atlandı.`);
      if (errors.length) parts.push(errors.join(' · '));
      setBulkNotice(parts.join(' '));
    } catch (e) {
      setBulkNotice(e instanceof Error ? e.message : 'Toplu gönderim hatası');
    } finally {
      setBulkSendBusy(false);
      setBulkProgress('');
    }
  };

  const sendQuickTemplate = async () => {
    setTemplateNotice('');
    setTemplateWaUrl(null);
    if (!selectedStudentId) {
      setTemplateNotice('Önce öğrenci seçin.');
      return;
    }
    const st = selectedStudent;
    const parentRaw =
      st?.parentPhone ||
      (st as unknown as { parent_phone?: string } | undefined)?.parent_phone ||
      '';
    const targetRaw =
      templateTab === 'student' ? String(st?.phone || '').trim() : String(parentRaw || st?.phone || '').trim();
    const target = formatPhone(targetRaw);
    if (!st || !target) {
      setTemplateNotice(
        templateTab === 'parent'
          ? 'Veli veya öğrenci telefonu kayıtta yok — Öğrenciler sayfasında veli numarasını kontrol edin.'
          : 'Öğrenci telefonu kayıtta yok.'
      );
      return;
    }
    const message = buildTemplateMessage();
    if (!message) {
      setTemplateNotice('Şablon metni oluşturulamadı; öğrenci seçimini doğrulayın.');
      return;
    }

    setTemplateSendBusy(true);
    try {
      if (canUseGateway) {
        try {
          await sendGatewayMessage(target, message);
          setTemplateNotice('Mesaj bağlı WhatsApp oturumundan gönderildi.');
          return;
        } catch {
          /* wa.me yedek */
        }
      }
      const { opened, url } = openWaFallback(target, message);
      setTemplateWaUrl(url);
      if (opened) {
        setTemplateNotice(
          'Oturum yok; whatsapp bağlantısı yeni sekmede açıldı. Görmüyorsanız görev çubuğundaki sekme veya tarayıcı “popup izni” uyarısı.'
        );
      } else {
        setTemplateNotice(
          'Tarayıcı yeni sekme açmayı engelledi. Adresteki kilit/popup ikonundan izin verin veya bağlantıyı aşağıdan kopyalayın.'
        );
      }
      try {
        if (!opened && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(url);
          setTemplateNotice((prev) => `${prev}\n(Metin bağlantısı panoya kopyalandı.)`);
        }
      } catch {
        /* yoksay */
      }
    } catch (error) {
      setTemplateNotice(`Mesaj gönderilemedi: ${(error as Error).message}`);
    } finally {
      setTemplateSendBusy(false);
    }
  };

  const runGatewayHealthTest = async () => {
    setHealthCheckBusy(true);
    try {
      const res = await apiFetch('/api/whatsapp-health');
      const j = (await res.json().catch(() => ({}))) as {
        hint?: string;
        gateway?: {
          gateway_connected?: boolean;
          upstream_reachable?: boolean;
          upstream_error?: string | null;
          connected_live_count?: number;
        };
      };
      const gw = j.gateway;
      const parts: string[] = [];
      if (gw?.upstream_reachable) {
        parts.push('VPS gateway erişilebilir');
      } else {
        parts.push(`VPS erişilemiyor${gw?.upstream_error ? `: ${gw.upstream_error}` : ''}`);
      }
      if (gw?.gateway_connected) {
        parts.push(`${gw.connected_live_count ?? 1} oturum bağlı`);
      } else {
        parts.push('Bağlı QR oturumu yok — QR ile bağlayın');
      }
      setStatusMessage(parts.join(' · '));
      void fetchStatus();
    } catch (e) {
      setStatusMessage(`Sağlık testi başarısız: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setHealthCheckBusy(false);
    }
  };

  const sendTestMessage = async () => {
    const target = formatPhone(phone);
    if (!target) {
      setStatusMessage('Test için ülke kodlu telefon girin.');
      return;
    }
    const message = 'Merhaba, koç paneli WhatsApp bağlantı test mesajı.';
    try {
      if (canUseGateway) {
        try {
          await sendGatewayMessage(target, message);
          setStatusMessage('Test mesajı bağlı oturumdan gönderildi.');
          return;
        } catch {
          /* wa.me yedek */
        }
      }
      const { opened, url } = openWaFallback(target, message);
      setStatusMessage(
        opened
          ? 'Oturum yok; whatsapp bağlantısı yeni sekmede açıldı.'
          : `Tarayıcı yeni sekme açmayı engelledi. Bağlantı:\n${url}`
      );
    } catch (error) {
      setStatusMessage(`Test mesajı gönderilemedi: ${(error as Error).message}`);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-8">
      {/* Üst başlık */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-700 via-teal-800 to-slate-900 p-8 text-white shadow-xl">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
        <div className="relative">
          <p className="text-sm font-medium uppercase tracking-wider text-emerald-200/90">Koç · Mesajlaşma</p>
          <h1 className="mt-1 text-2xl font-bold md:text-3xl">WhatsApp merkezi</h1>
          <p className="mt-2 max-w-xl text-sm text-emerald-100/95">
            Otomatik bildirimler bildirim türüne göre{' '}
            <strong className="text-white">Koç WhatsApp Gateway</strong> veya{' '}
            <strong className="text-white">Meta WhatsApp API</strong> üzerinden gider. Gateway ile kendi hattınızdan
            anlık mesaj ve koç kapsamlı hatırlatmalar gönderilir.
          </p>
        </div>
      </div>

      {/* WhatsApp Ayarları — gateway özeti, bildirim tercihleri, mesaj geçmişi */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-4 border-b border-slate-100 bg-gradient-to-r from-teal-50 to-emerald-50/60 px-6 py-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-600 text-white shadow-md">
            <MessageCircle className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-slate-900">WhatsApp Ayarları</h2>
            <p className="text-sm text-slate-600">
              Gateway bağlantınız, günlük rapor hatırlatması ve son otomasyon mesajlarınız.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void loadWaPrefs();
              void fetchStatus();
            }}
            disabled={waPrefsLoading || !hasServerJwt}
            className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Yenile
          </button>
        </div>
        <div className="grid gap-6 p-6 lg:grid-cols-3">
          <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/80 p-4">
            <h3 className="text-sm font-semibold text-slate-900">Gateway yönetimi</h3>
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle
                className={`h-5 w-5 ${isConnected || waPrefs?.gateway?.connected ? 'text-emerald-600' : 'text-slate-300'}`}
              />
              <span>
                Durum:{' '}
                <strong>{waPrefs?.gateway?.label || connectionLabel}</strong>
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Son bağlantı: {prettyDate(lastConnectedAt)}
            </p>
            <p className="text-xs text-slate-500">
              Bağlantı sağlığı:{' '}
              {waPrefs?.gateway?.error
                ? waPrefs.gateway.error
                : isConnected || waPrefs?.gateway?.connected
                  ? 'Sağlıklı'
                  : 'Gateway bağlı değil — otomatik hatırlatmalar gönderilmez'}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => void startConnection()}
                disabled={isBusy || !canUseGateway}
                className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
              >
                Gateway bağla
              </button>
              <button
                type="button"
                onClick={() => void resetGatewaySession()}
                disabled={isBusy || !canUseGateway}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Yeniden bağlan
              </button>
              <button
                type="button"
                onClick={() => void disconnect()}
                disabled={isBusy || !canUseGateway}
                className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-800 hover:bg-rose-100 disabled:opacity-50"
              >
                Bağlantıyı kaldır
              </button>
            </div>
            <a href="#wa-gateway-qr" className="text-xs font-medium text-teal-700 hover:underline">
              QR ve detaylı gateway ayarları ↓
            </a>
          </div>

          <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/80 p-4">
            <h3 className="text-sm font-semibold text-slate-900">Günlük rapor ayarları</h3>
            <p className="text-xs text-slate-600">
              Rapor girmeyen öğrencilerinize saat 22:00 (İstanbul) civarında hatırlatma — yalnızca sizin gateway
              hesabınızdan gider.
            </p>
            {waPrefsLoading ? (
              <p className="flex items-center gap-2 text-sm text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                Yükleniyor…
              </p>
            ) : (
              <label className="flex cursor-pointer items-center gap-3 text-sm font-medium text-slate-800">
                <input
                  type="checkbox"
                  checked={waPrefs?.prefs?.daily_report_enabled !== false}
                  disabled={waPrefsSaving || !hasServerJwt}
                  onChange={(e) => void saveDailyReportPref(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                Günlük rapor hatırlatması (tüm öğrenciler)
              </label>
            )}
            {waPrefsMsg ? <p className="text-xs text-slate-600">{waPrefsMsg}</p> : null}
          </div>

          <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/80 p-4 lg:col-span-1">
            <h3 className="text-sm font-semibold text-slate-900">Mesaj geçmişi</h3>
            <ul className="max-h-52 space-y-2 overflow-auto text-xs">
              {(waPrefs?.recent_logs || []).length ? (
                waPrefs!.recent_logs.map((l) => (
                  <li key={l.id} className="rounded-lg border border-slate-100 bg-white px-2 py-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-800">{l.kind}</span>
                      <span>{l.status === 'sent' ? '🟢' : '🔴'}</span>
                    </div>
                    <p className="text-slate-500">{l.phone || '—'}</p>
                    <p className="text-slate-400">
                      {l.sent_at ? new Date(l.sent_at).toLocaleString('tr-TR') : ''}
                    </p>
                    {l.error ? <p className="text-rose-700">{l.error}</p> : null}
                  </li>
                ))
              ) : (
                <li className="text-slate-500">Henüz kayıt yok.</li>
              )}
            </ul>
          </div>
        </div>
      </section>

      <WhatsAppMerkeziPanel />

      {/* Otomatik Meta zamanlayıcı */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-4 border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-teal-50/60 px-6 py-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-600 text-white shadow-md">
            <Clock className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-slate-900">Otomatik mesaj (Meta)</h2>
            <p className="text-sm text-slate-600">
              Tüm öğrencilerinize aynı şablonla, seçtiğiniz İstanbul saatinde ve <strong>her N günde bir</strong> gönderilir.
              Kampanya süresi (gün) dolduğunda durur; boş bırakırsanız süresiz çalışır. Sunucuda{' '}
              <code className="rounded bg-slate-100 px-1 text-xs">/api/cron/coach-whatsapp-auto</code> zamanlanmalıdır
              (projede varsayılan: 15 dk).
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadWaSchedule()}
            disabled={waScheduleLoading || !hasServerJwt}
            className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Yenile
          </button>
        </div>
        <div className="space-y-4 p-6">
          {!hasServerJwt && (
            <p className="text-sm text-slate-600">
              Zamanlayıcı için sunucu oturumu (JWT) gerekir. Çıkış yapıp e-postanızla tekrar giriş yapın.
            </p>
          )}
          {actor?.role === 'coach' && actor.coachId == null && hasServerJwt && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              Hesabınız koç olarak görünüyor ancak <strong>koç kaydı</strong> (users ile eşleşen coaches satırı) bulunamadı.
              Otomatik WhatsApp zamanlayıcısı bu yüzden sunucuda reddedilir. Yöneticiniz e-postayı coaches tablosuyla eşleştirmeli.
            </div>
          )}
          {waScheduleLoading ? (
            <p className="flex items-center gap-2 text-slate-600">
              <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
              Zamanlayıcı ayarları yükleniyor…
            </p>
          ) : waDraft ? (
            <>
              <label className="flex cursor-pointer items-center gap-3 text-sm font-medium text-slate-800">
                <input
                  type="checkbox"
                  checked={waDraft.is_active}
                  onChange={(e) => setWaDraft({ ...waDraft, is_active: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                Planlayıcıyı aktif et
              </label>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Mesaj şablonu</label>
                <textarea
                  value={waDraft.message_template}
                  onChange={(e) => setWaDraft({ ...waDraft, message_template: e.target.value })}
                  rows={5}
                  className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Yer tutucular:{' '}
                  <code className="rounded bg-slate-100 px-1">
                    {'{{name}}, {{coach}}, {{date}}'}
                  </code>{' '}
                  (İstanbul tarihi <code className="rounded bg-slate-100 px-1">YYYY-MM-DD</code>).
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Gönderim saati (İstanbul)
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={waDraft.send_hour_tr}
                      onChange={(e) =>
                        setWaDraft({ ...waDraft, send_hour_tr: Math.min(23, Math.max(0, Number(e.target.value))) })
                      }
                      className="w-full rounded-xl border border-slate-200 py-2 px-3 text-sm"
                    >
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>
                          {String(h).padStart(2, '0')}
                        </option>
                      ))}
                    </select>
                    <select
                      value={Math.min(59, Math.max(0, waDraft.send_minute_tr || 0))}
                      onChange={(e) =>
                        setWaDraft({
                          ...waDraft,
                          send_minute_tr: Math.min(59, Math.max(0, Number(e.target.value)))
                        })
                      }
                      className="w-full rounded-xl border border-slate-200 py-2 px-3 text-sm"
                    >
                      {Array.from({ length: 60 }, (_, m) => (
                        <option key={m} value={m}>
                          {String(m).padStart(2, '0')}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Cron ~15 dk’da bir tetiklenir; dakika yaklaşık ±15 dk penceresindedir.
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Tekrar aralığı (gün)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={waDraft.interval_days}
                    onChange={(e) =>
                      setWaDraft({
                        ...waDraft,
                        interval_days: Math.min(365, Math.max(1, Number(e.target.value) || 1))
                      })
                    }
                    className="w-full rounded-xl border border-slate-200 py-2 px-3 text-sm"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Son başarılı gönderimden bu kadar İstanbul günü sonra yeniden gönderilir.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Kampanya süresi (gün)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={3650}
                    value={waDraft.campaign_days ?? ''}
                    placeholder="Boş = süresiz"
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      if (raw === '') {
                        setWaDraft({ ...waDraft, campaign_days: null });
                        return;
                      }
                      const n = Number(raw);
                      if (!Number.isFinite(n)) return;
                      setWaDraft({ ...waDraft, campaign_days: Math.min(3650, Math.max(1, Math.floor(n))) });
                    }}
                    className="w-full rounded-xl border border-slate-200 py-2 px-3 text-sm"
                  />
                  {waDraft.campaign_started_at && waDraft.campaign_days != null && (
                    <p className="mt-1 text-xs text-slate-500">
                      Başlangıç (UTC kayıt): {prettyDate(waDraft.campaign_started_at)}
                    </p>
                  )}
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-3 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={waDraft.weekdays_only}
                  onChange={(e) => setWaDraft({ ...waDraft, weekdays_only: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-teal-600"
                />
                Yalnızca hafta içi (Cumartesi–Pazar atla)
              </label>

              <label className="flex cursor-pointer items-center gap-3 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={waDraft.prefer_parent_phone}
                  onChange={(e) => setWaDraft({ ...waDraft, prefer_parent_phone: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-teal-600"
                />
                Varsa önce veli telefonunu kullan
              </label>

              <label className="flex cursor-pointer items-center gap-3 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={restartCampaignOnSave}
                  onChange={(e) => setRestartCampaignOnSave(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-teal-600"
                />
                Kaydederken kampanya başlangıcını sıfırla (süreli kampanyalar için)
              </label>

              <button
                type="button"
                onClick={() => void saveWaSchedule()}
                disabled={waScheduleSaving || !hasServerJwt}
                className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-6 py-2.5 text-sm font-semibold text-white shadow hover:bg-teal-700 disabled:opacity-50"
              >
                {waScheduleSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Kaydet
              </button>

              {waScheduleMsg ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  {waScheduleMsg}
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-slate-600">Zamanlayıcı verisi alınamadı.</p>
          )}
        </div>
      </section>

      {/* Otomatik toplu mesaj planları (Meta) */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-violet-50/60 px-6 py-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md">
            <Clock className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-slate-900">Otomatik toplu mesaj (Meta)</h2>
            <p className="text-sm text-slate-600">
              Birden fazla plan tanımlayabilirsiniz. Zamanlanmış toplu mesajlar Meta Cloud API ile sunucudan gider; QR
              gateway bağlantısı gerekmez. Cron ~15 dk’da bir çalışır.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadGwSchedules()}
              disabled={gwSchedulesLoading || !hasServerJwt}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Yenile
            </button>
            <button
              type="button"
              onClick={() => void createGwSchedule()}
              disabled={!hasServerJwt}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Plan ekle
            </button>
          </div>
        </div>
        <div className="space-y-4 p-6">
          {!hasServerJwt && (
            <p className="text-sm text-slate-600">
              Toplu mesaj planları için sunucu oturumu (JWT) gerekir.
            </p>
          )}
          {gwSchedulesLoading ? (
            <p className="flex items-center gap-2 text-slate-600">
              <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
              Planlar yükleniyor…
            </p>
          ) : gwSchedules.length === 0 ? (
            <p className="text-sm text-slate-600">
              Henüz toplu mesaj planı yok. «Plan ekle» ile oluşturun; Meta Cloud API yapılandırılmış olmalıdır.
            </p>
          ) : (
            <div className="space-y-6">
              {gwSchedules.map((row, index) => (
                <div
                  key={row.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50/40 p-4 shadow-sm"
                >
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <input
                      value={row.label ?? ''}
                      onChange={(e) => patchGwSchedule(row.id, { label: e.target.value })}
                      placeholder={`Plan ${index + 1}`}
                      className="min-w-[12rem] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => duplicateGwSchedule(row)}
                        disabled={!hasServerJwt}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Kopyala
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteGwSchedule(row.id)}
                        disabled={gwSchedulesDeletingId === row.id || !hasServerJwt}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-medium text-rose-800 hover:bg-rose-100 disabled:opacity-50"
                      >
                        {gwSchedulesDeletingId === row.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        Sil
                      </button>
                    </div>
                  </div>

                  <label className="mb-3 flex cursor-pointer items-center gap-3 text-sm font-medium text-slate-800">
                    <input
                      type="checkbox"
                      checked={row.is_active}
                      onChange={(e) => patchGwSchedule(row.id, { is_active: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    Planı aktif et
                  </label>

                  <div className="mb-3">
                    <label className="mb-1 block text-sm font-medium text-slate-700">Mesaj şablonu</label>
                    <textarea
                      value={row.message_template}
                      onChange={(e) => patchGwSchedule(row.id, { message_template: e.target.value })}
                      rows={4}
                      className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      Yer tutucular:{' '}
                      <code className="rounded bg-slate-100 px-1">{'{{name}}, {{coach}}, {{date}}, {{task}}'}</code>
                    </p>
                  </div>

                  <div className="mb-3 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Tekrar</label>
                      <select
                        value={row.repeat_mode ?? 'daily'}
                        onChange={(e) => {
                          const mode = e.target.value as GwRepeatMode;
                          patchGwSchedule(row.id, {
                            repeat_mode: mode,
                            send_date_tr: mode === 'once' ? row.send_date_tr : null,
                            weekday_tr: mode === 'weekly' ? row.weekday_tr ?? 1 : null
                          });
                        }}
                        className="w-full rounded-xl border border-slate-200 bg-white py-2 px-3 text-sm"
                      >
                        <option value="once">Tek sefer</option>
                        <option value="daily">Her gün</option>
                        <option value="weekly">Haftada bir</option>
                        <option value="interval">Her N gün (gelişmiş)</option>
                      </select>
                    </div>
                    {(row.repeat_mode ?? 'daily') === 'once' ? (
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Tarih</label>
                        <input
                          type="date"
                          value={row.send_date_tr ?? ''}
                          onChange={(e) =>
                            patchGwSchedule(row.id, { send_date_tr: e.target.value || null })
                          }
                          className="w-full rounded-xl border border-slate-200 bg-white py-2 px-3 text-sm"
                        />
                      </div>
                    ) : null}
                    {(row.repeat_mode ?? 'daily') === 'weekly' ? (
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Gün</label>
                        <select
                          value={row.weekday_tr ?? 1}
                          onChange={(e) =>
                            patchGwSchedule(row.id, { weekday_tr: Number(e.target.value) })
                          }
                          className="w-full rounded-xl border border-slate-200 bg-white py-2 px-3 text-sm"
                        >
                          {GW_WEEKDAY_OPTS.map((d) => (
                            <option key={d.value} value={d.value}>
                              {d.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">
                        Gönderim saati (İstanbul)
                      </label>
                      <div className="flex gap-2">
                        <select
                          value={row.send_hour_tr}
                          onChange={(e) =>
                            patchGwSchedule(row.id, {
                              send_hour_tr: Math.min(23, Math.max(0, Number(e.target.value)))
                            })
                          }
                          className="w-full rounded-xl border border-slate-200 bg-white py-2 px-3 text-sm"
                        >
                          {Array.from({ length: 24 }, (_, h) => (
                            <option key={h} value={h}>
                              {String(h).padStart(2, '0')}
                            </option>
                          ))}
                        </select>
                        <select
                          value={Math.min(59, Math.max(0, row.send_minute_tr || 0))}
                          onChange={(e) =>
                            patchGwSchedule(row.id, {
                              send_minute_tr: Math.min(59, Math.max(0, Number(e.target.value)))
                            })
                          }
                          className="w-full rounded-xl border border-slate-200 bg-white py-2 px-3 text-sm"
                        >
                          {Array.from({ length: 60 }, (_, m) => (
                            <option key={m} value={m}>
                              {String(m).padStart(2, '0')}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {(row.repeat_mode ?? 'daily') === 'interval' ? (
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">
                          Tekrar aralığı (gün)
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={365}
                          value={row.interval_days}
                          onChange={(e) =>
                            patchGwSchedule(row.id, {
                              interval_days: Math.min(365, Math.max(1, Number(e.target.value) || 1))
                            })
                          }
                          className="w-full rounded-xl border border-slate-200 bg-white py-2 px-3 text-sm"
                        />
                      </div>
                    ) : null}
                  </div>

                  <div className="mb-3">
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Kampanya süresi (gün)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={3650}
                      value={row.campaign_days ?? ''}
                      placeholder="Boş = süresiz"
                      onChange={(e) => {
                        const raw = e.target.value.trim();
                        if (raw === '') {
                          patchGwSchedule(row.id, { campaign_days: null });
                          return;
                        }
                        const n = Number(raw);
                        if (!Number.isFinite(n)) return;
                        patchGwSchedule(row.id, {
                          campaign_days: Math.min(3650, Math.max(1, Math.floor(n)))
                        });
                      }}
                      className="w-full max-w-xs rounded-xl border border-slate-200 bg-white py-2 px-3 text-sm"
                    />
                    {row.campaign_started_at && row.campaign_days != null && (
                      <p className="mt-1 text-xs text-slate-500">
                        Başlangıç: {prettyDate(row.campaign_started_at)}
                      </p>
                    )}
                  </div>

                  <label className="mb-2 flex cursor-pointer items-center gap-3 text-sm text-slate-800">
                    <input
                      type="checkbox"
                      checked={row.weekdays_only}
                      onChange={(e) => patchGwSchedule(row.id, { weekdays_only: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                    />
                    Yalnızca hafta içi
                  </label>

                  <label className="mb-3 flex cursor-pointer items-center gap-3 text-sm text-slate-800">
                    <input
                      type="checkbox"
                      checked={row.prefer_parent_phone}
                      onChange={(e) =>
                        patchGwSchedule(row.id, { prefer_parent_phone: e.target.checked })
                      }
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                    />
                    Varsa önce veli telefonunu kullan
                  </label>

                  <label className="mb-3 flex cursor-pointer items-center gap-3 text-sm text-slate-800">
                    <input
                      type="checkbox"
                      checked={Boolean(gwRestartCampaignIds[row.id])}
                      onChange={(e) =>
                        setGwRestartCampaignIds((prev) => ({ ...prev, [row.id]: e.target.checked }))
                      }
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                    />
                    Kaydederken kampanya başlangıcını sıfırla
                  </label>

                  <button
                    type="button"
                    onClick={() => void saveGwSchedule(row)}
                    disabled={gwSchedulesSavingId === row.id || !hasServerJwt}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {gwSchedulesSavingId === row.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    Kaydet
                  </button>
                </div>
              ))}
            </div>
          )}

          {gwSchedulesMsg ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              {gwSchedulesMsg}
            </div>
          ) : null}
        </div>
      </section>

      {/* 2 — QR Gateway */}
      <section id="wa-gateway-qr" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50/80 to-white px-6 py-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md">
            <Smartphone className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-slate-900">Kişisel WhatsApp oturumu (QR)</h2>
            <p className="text-sm text-slate-600">
              Yalnızca <strong className="font-medium text-slate-800">sizin hesabınıza</strong> bağlı WhatsApp hattı —
              başka yöneticiler veya koçlar bu oturumu göremez. İstekler{' '}
              <code className="rounded bg-slate-100 px-1 text-xs">/api/whatsapp-gateway</code> üzerinden VPS’e gider.
              {isAdminActor ? (
                <>
                  {' '}
                  Kitap siparişi otomasyonu için ayrıca{' '}
                  <strong className="font-medium text-slate-800">Kitap siparişleri</strong> sayfasındaki gateway bölümünü
                  kullanın.
                </>
              ) : null}
            </p>
          </div>
        </div>
        <div className="space-y-6 p-6">
          {isImpersonating && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              <p className="font-medium">Başka kullanıcı adına görünüyorsunuz</p>
              <p className="mt-2">
                WhatsApp QR yalnızca <strong>giriş yaptığınız hesaba</strong> bağlanır. Taklit modunda gateway
                istekleri reddedilebilir — QR için taklidi kapatın veya kendi hesabınızla giriş yapın.
              </p>
            </div>
          )}
          {needsJwtForGateway && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950">
              <p className="font-medium">WhatsApp için sunucu JWT’si gerekli (401 önler)</p>
              <p className="mt-2">
                Hesabınız açık görünse bile <code className="rounded bg-rose-100 px-1 text-xs">coaching_auth_token</code>{' '}
                yoksa gateway isteği reddedilir.{' '}
                <strong>Çıkış yapın</strong> ve veritabanındaki kullanıcı ile{' '}
                <strong>yeniden giriş</strong> yapın (ilk adımda <code className="rounded bg-rose-100 px-1 text-xs">/api/auth-login</code>{' '}
                token üretmeli). Demo / yalnızca bu cihazda tanımlı deneme hesapları sunucuda yoksa JWT alınamaz.
              </p>
            </div>
          )}

          {!canUseGateway && !needsJwtForGateway && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              {gatewayEnvInvalid ? (
                <>
                  <p className="font-medium">Vercel’deki gateway adresi geçersiz.</p>
                  <p className="mt-2">
                    Değişken <strong>adını</strong> değil, gerçek sunucu adresini yazın (örn.{' '}
                    <code className="rounded bg-amber-100 px-1 text-xs">http://27.102.134.199:4010</code>). Sonda boşluk
                    veya yanlış yapıştırma olmamalı. Kaydettikten sonra projeyi yeniden deploy edin.
                  </p>
                </>
              ) : (
                <>
                  Sunucu JWT veya oturum id eksik. Çıkış yapıp tekrar giriş yapın. Vercel’de{' '}
                  <code className="rounded bg-amber-100 px-1 text-xs">WHATSAPP_GATEWAY_UPSTREAM</code> tanımlı olmalı.
                </>
              )}
            </div>
          )}

          {(status === 'reconnecting' || status === 'logged_out') && canUseGateway && !gatewaySessionError ? (
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
              <p className="font-medium">WhatsApp oturumu düşebilir</p>
              <p className="mt-1 text-sky-900/90">
                VPS yeniden başlayınca veya WhatsApp bağlantıyı kestiğinde QR yeniden gerekebilir.{' '}
                <strong>QR / Oturum başlat</strong> veya <strong>Oturumu sıfırla ve QR al</strong> kullanın.
              </p>
            </div>
          ) : null}

          {gatewaySessionError && canUseGateway ? (
            <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-4 text-sm text-rose-950">
              <p className="font-semibold">Bağlantı hatası</p>
              <p className="mt-2 text-xs leading-relaxed">{formatGatewaySessionError(gatewaySessionError)}</p>
              <ol className="mt-3 list-decimal space-y-1 pl-4 text-xs text-rose-900/90">
                <li>Telefonda WhatsApp → <strong>Bağlı cihazlar</strong> → eski «Online VIP» oturumunu <strong>kaldırın</strong>.</li>
                <li>Aşağıdaki butonla sunucudaki bozuk oturumu silin ve yeni QR alın.</li>
                <li>QR gelince 60 sn içinde okutun; aynı numarayı başka WhatsApp Web’de açık bırakmayın.</li>
              </ol>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void resetGatewaySession()}
                  disabled={isBusy}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isBusy ? 'animate-spin' : ''}`} />
                  Oturumu sıfırla ve QR al
                </button>
                <button
                  type="button"
                  onClick={() => void startConnection()}
                  disabled={isBusy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-medium text-rose-900 hover:bg-rose-100 disabled:opacity-50"
                >
                  QR / Oturum başlat
                </button>
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className={`h-5 w-5 ${isConnected ? 'text-emerald-600' : 'text-slate-300'}`} />
              <span className="font-medium text-slate-800">Durum: {connectionLabel}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void startConnection()}
                disabled={isBusy || !canUseGateway}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-100 px-3 py-2 text-sm font-medium text-indigo-900 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${isBusy ? 'animate-spin' : ''}`} />
                QR / Oturum başlat
              </button>
              <button
                type="button"
                onClick={() => void disconnect()}
                disabled={isBusy || !canUseGateway}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-800 disabled:opacity-50"
              >
                <Unlink className="h-4 w-4" />
                Çıkış
              </button>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Son bağlantı</p>
                  <p className="font-medium text-slate-800">{prettyDate(lastConnectedAt)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Bağlı WhatsApp hattı</p>
                  <p className="font-medium text-slate-800">{linkedPhone || (isConnected ? '—' : 'Bağlı değil')}</p>
                </div>
                <div className="col-span-2 rounded-xl bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Oturum (kullanıcı id)</p>
                  <p className="truncate font-mono text-xs text-slate-700">{coachId || '—'}</p>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-600">Test numarası (ülke kodlu)</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="905551112233"
                    className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void sendTestMessage()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 py-2.5 text-sm font-medium text-white hover:bg-slate-800 px-6"
                >
                  <MessageCircle className="h-4 w-4" />
                  Test mesajı gönder
                </button>
                <button
                  type="button"
                  onClick={() => void runGatewayHealthTest()}
                  disabled={healthCheckBusy || !hasServerJwt}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 px-6"
                >
                  {healthCheckBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Sağlık testi
                </button>
              </div>
            </div>
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">QR kod</p>
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="WhatsApp QR" className="h-52 w-52 rounded-xl border border-white shadow-md" />
              ) : (
                <div className="flex h-52 w-52 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-slate-400">
                  <QrCode className="mb-2 h-12 w-12" />
                  <span className="text-xs">Bağlantı başlatın</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 3 — Hızlı şablonlar */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-4 border-b border-slate-100 bg-gradient-to-r from-green-50 to-emerald-50/50 px-6 py-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-600 text-white shadow-md">
            <MessageCircle className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Hızlı şablonlar</h2>
            <p className="text-sm text-slate-600">
              Öğrenci veya veliye metin hazırlayın. Oturum bağlıysa gateway üzerinden; değilse WhatsApp Web / uygulama
              (wa.me) açılır.
            </p>
          </div>
        </div>
        <div className="space-y-4 p-6">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTemplateTab('student')}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                templateTab === 'student' ? 'bg-blue-100 text-blue-900 ring-2 ring-blue-200' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <User className="h-4 w-4" />
              Öğrenci
            </button>
            <button
              type="button"
              onClick={() => setTemplateTab('parent')}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                templateTab === 'parent' ? 'bg-purple-100 text-purple-900 ring-2 ring-purple-200' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Users className="h-4 w-4" />
              Veli
            </button>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              {templateTab === 'student' ? 'Öğrenci şablonu' : 'Veli şablonu'}
            </label>
            <textarea
              value={templateTab === 'student' ? studentQuickTemplate : parentQuickTemplate}
              onChange={(e) =>
                templateTab === 'student'
                  ? setStudentQuickTemplate(e.target.value)
                  : setParentQuickTemplate(e.target.value)
              }
              rows={7}
              className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-100"
            />
            <p className="mt-1 text-xs text-slate-500">
              Yer tutucular:{' '}
              <code className="rounded bg-slate-100 px-1">{'{{name}}, {{task}}, {{coach}}'}</code> — cihazınızda
              otomatik kaydedilir.
            </p>
          </div>

          <select
            value={selectedStudentId}
            onChange={(e) => setSelectedStudentId(e.target.value)}
            className="w-full rounded-xl border border-slate-200 py-3 px-3 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-100"
          >
            <option value="">Öğrenci seçin</option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.name}
              </option>
            ))}
          </select>

          <input
            value={templateTask}
            onChange={(e) => setTemplateTask(e.target.value)}
            placeholder="Bugünkü görev / ek not"
            className="w-full rounded-xl border border-slate-200 py-3 px-3 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-100"
          />

          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm whitespace-pre-wrap text-slate-800">
            {buildTemplateMessage() || 'Önizleme için öğrenci seçin.'}
          </div>

          {templateNotice ? (
            <div
              role="status"
              aria-live="polite"
              className="rounded-xl border border-slate-200 bg-amber-50/80 px-4 py-3 text-sm whitespace-pre-wrap text-slate-800"
            >
              {templateNotice}
              {templateWaUrl ? (
                <p className="mt-2 break-all">
                  <a
                    href={templateWaUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-green-800 underline decoration-green-700/40 hover:decoration-green-900"
                  >
                    WhatsApp bağlantısını buradan açın
                  </a>
                </p>
              ) : null}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => void sendQuickTemplate()}
            disabled={templateSendBusy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3 text-sm font-semibold text-white shadow-md hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:px-8"
          >
            {templateSendBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <MessageCircle className="h-5 w-5" />}
            {templateSendBusy ? 'Gönderiliyor…' : 'Şablonu gönder'}
          </button>
        </div>
      </section>

      {/* 4 — Toplu mesaj (Meta) */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-4 border-b border-slate-100 bg-gradient-to-r from-teal-50 to-cyan-50/50 px-6 py-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-600 text-white shadow-md">
            <Send className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Toplu mesaj (Meta)</h2>
            <p className="text-sm text-slate-600">
              Sınıf veya gruba göre öğrenci seçin; anında veya tarih/saat ile zamanlayın. Gönderimler Meta Cloud API
              üzerinden yapılır (QR gateway gerekmez).
            </p>
          </div>
        </div>
        <div className="space-y-4 p-6">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setBulkChannel('student')}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                bulkChannel === 'student'
                  ? 'bg-blue-100 text-blue-900 ring-2 ring-blue-200'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <User className="h-4 w-4" />
              Öğrenci hattı
            </button>
            <button
              type="button"
              onClick={() => setBulkChannel('parent')}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                bulkChannel === 'parent'
                  ? 'bg-purple-100 text-purple-900 ring-2 ring-purple-200'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Users className="h-4 w-4" />
              Veli hattı
            </button>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Mesaj şablonu</label>
            <textarea
              value={bulkTemplate}
              onChange={(e) => setBulkTemplate(e.target.value)}
              rows={6}
              className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
            />
            <p className="mt-1 text-xs text-slate-500">
              Yer tutucular:{' '}
              <code className="rounded bg-slate-100 px-1">
                {'{{1}} ad, {{2}} tarih, {{3}} saat, {{4}} link'}
              </code>
              {' · '}
              <code className="rounded bg-slate-100 px-1">{'{{name}}, {{task}}, {{coach}}'}</code>
            </p>
          </div>

          {bulkNeedsExamFields ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700">Deneme tarihi ({'{{2}}'})</span>
                <input
                  type="text"
                  value={bulkExamDate}
                  onChange={(e) => setBulkExamDate(e.target.value)}
                  placeholder="örn. 25.06.2026"
                  className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700">Deneme saati ({'{{3}}'})</span>
                <input
                  type="text"
                  value={bulkExamTime}
                  onChange={(e) => setBulkExamTime(e.target.value)}
                  placeholder="örn. 14:00"
                  className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm"
                />
              </label>
              <label className="text-sm sm:col-span-1">
                <span className="mb-1 block font-medium text-slate-700">Sınav bağlantısı ({'{{4}}'})</span>
                <input
                  type="url"
                  value={bulkExamLink}
                  onChange={(e) => setBulkExamLink(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm"
                />
              </label>
            </div>
          ) : null}

          <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4 space-y-3">
            <p className="text-sm font-medium text-slate-800">Kayıtlı şablonlar</p>
            <p className="text-xs text-slate-500">
              Düzenlemek için listeden şablona tıklayın (veya kalem ikonu). Metni ve görev alanını değiştirin, ardından{' '}
              <strong>Değişiklikleri kaydet</strong> — yeni şablon için <strong>Yeni şablon</strong>.
            </p>
            {bulkEditingTemplateId ? (
              <p className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs text-teal-900">
                Düzenleniyor:{' '}
                <strong>
                  {bulkSavedTemplates.find((x) => x.id === bulkEditingTemplateId)?.name || 'Şablon'}
                </strong>
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <input
                value={bulkTemplateName}
                onChange={(e) => setBulkTemplateName(e.target.value)}
                placeholder="Şablon adı"
                className="min-w-[10rem] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={saveBulkTemplateToLibrary}
                className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-900"
              >
                {bulkEditingTemplateId ? 'Değişiklikleri kaydet' : 'Yeni şablon kaydet'}
              </button>
              {bulkEditingTemplateId ? (
                <button
                  type="button"
                  onClick={cancelBulkTemplateEdit}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Yeni şablon
                </button>
              ) : null}
            </div>
            {bulkSavedTemplates.length ? (
              <ul className="flex flex-wrap gap-2">
                {bulkSavedTemplates.map((t) => {
                  const isEditing = bulkEditingTemplateId === t.id;
                  return (
                    <li
                      key={t.id}
                      className={`inline-flex items-center gap-1 rounded-lg border pl-2 pr-1 py-1 text-xs ${
                        isEditing
                          ? 'border-teal-400 bg-teal-50 ring-1 ring-teal-200'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => applyBulkSavedTemplate(t.id)}
                        className={`font-medium hover:underline ${
                          isEditing ? 'text-teal-900' : 'text-teal-800'
                        }`}
                      >
                        {t.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => startEditBulkSavedTemplate(t.id)}
                        className="rounded p-0.5 text-slate-400 hover:text-teal-700"
                        aria-label="Düzenle"
                        title="Düzenle"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteBulkSavedTemplate(t.id)}
                        disabled={t.id.startsWith('builtin_')}
                        className="rounded p-0.5 text-slate-400 hover:text-rose-600 disabled:opacity-30"
                        aria-label="Sil"
                        title={t.id.startsWith('builtin_') ? 'Hazır şablon silinemez' : 'Sil'}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-xs text-slate-500">Henüz kayıtlı şablon yok.</p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">Sınıf / program</span>
              <select
                value={bulkClassFilter}
                onChange={(e) => {
                  setBulkClassFilter(e.target.value);
                  setBulkGroupFilter('');
                }}
                className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm"
              >
                <option value="">Tüm sınıflar</option>
                {bulkClassOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">Grup / şube</span>
              <select
                value={bulkGroupFilter}
                onChange={(e) => setBulkGroupFilter(e.target.value)}
                disabled={!bulkGroupOptions.length}
                className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm disabled:opacity-50"
              >
                <option value="">Tüm gruplar</option>
                {bulkGroupOptions.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <input
            value={bulkTask}
            onChange={(e) => setBulkTask(e.target.value)}
            placeholder="Ortak görev / ek not ({{task}})"
            className="w-full rounded-xl border border-slate-200 py-3 px-3 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-600">
              {bulkFilteredStudents.length} öğrenci ·{' '}
              <strong className="text-slate-900">{bulkSelectedIds.size}</strong> seçili
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={selectAllBulkVisible}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Görünenleri seç
              </button>
              <button
                type="button"
                onClick={clearBulkSelection}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                Seçimi temizle
              </button>
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200">
            {bulkFilteredStudents.length ? (
              <ul className="divide-y divide-slate-100">
                {bulkFilteredStudents.map((st) => {
                  const phoneOk = Boolean(resolveStudentPhone(st, bulkChannel));
                  return (
                    <li key={st.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-slate-50/80">
                      <input
                        type="checkbox"
                        checked={bulkSelectedIds.has(st.id)}
                        disabled={!phoneOk}
                        onChange={() => toggleBulkStudent(st.id)}
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-teal-600"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-900">{st.name}</p>
                        <p className="text-xs text-slate-500">
                          {formatClassLevelLabel(st.classLevel)}
                          {st.groupName ? ` · ${st.groupName}` : ''}
                          {!phoneOk ? (
                            <span className="text-rose-600"> · telefon yok</span>
                          ) : null}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-4 py-8 text-center text-sm text-slate-500">Filtreye uyan öğrenci yok.</p>
            )}
          </div>

          {bulkProgress ? (
            <p className="flex items-center gap-2 text-sm text-teal-800">
              <Loader2 className="h-4 w-4 animate-spin" />
              Gönderiliyor: {bulkProgress}
            </p>
          ) : null}

          {bulkNotice ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
              {bulkNotice}
            </div>
          ) : null}

          <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-indigo-700" />
              <p className="text-sm font-semibold text-slate-900">Zamanlanmış gönderim</p>
            </div>
            <input
              value={bulkPlanLabel}
              onChange={(e) => setBulkPlanLabel(e.target.value)}
              placeholder="Plan adı (örn. 12-A haftalık hatırlatma)"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            />
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Tekrar</span>
              <select
                value={bulkRepeatMode}
                onChange={(e) => setBulkRepeatMode(e.target.value as GwRepeatMode)}
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-3 text-sm"
              >
                <option value="once">Tek sefer — seçilen tarih ve saatte</option>
                <option value="daily">Her gün — aynı saatte</option>
                <option value="weekly">Haftada bir — seçilen günde</option>
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              {bulkRepeatMode === 'once' ? (
                <label className="text-sm sm:col-span-2">
                  <span className="mb-1 block font-medium text-slate-700">Tarih (İstanbul)</span>
                  <input
                    type="date"
                    value={bulkSendDate}
                    onChange={(e) => setBulkSendDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-3 text-sm"
                  />
                </label>
              ) : null}
              {bulkRepeatMode === 'weekly' ? (
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-slate-700">Gün</span>
                  <select
                    value={bulkWeekday}
                    onChange={(e) => setBulkWeekday(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-3 text-sm"
                  >
                    {GW_WEEKDAY_OPTS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700">Saat (İstanbul)</span>
                <div className="flex gap-2">
                  <select
                    value={bulkSendHour}
                    onChange={(e) => setBulkSendHour(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 bg-white py-2 px-3 text-sm"
                  >
                    {Array.from({ length: 24 }, (_, h) => (
                      <option key={h} value={h}>
                        {String(h).padStart(2, '0')}
                      </option>
                    ))}
                  </select>
                  <select
                    value={bulkSendMinute}
                    onChange={(e) => setBulkSendMinute(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 bg-white py-2 px-3 text-sm"
                  >
                    {Array.from({ length: 60 }, (_, m) => (
                      <option key={m} value={m}>
                        {String(m).padStart(2, '0')}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
            </div>
            <p className="text-xs text-slate-500">
              Seçili öğrenciler + sınıf/grup filtresi plana kaydedilir. Cron ~15 dk’da bir kontrol eder; mesajlar Meta
              Cloud API ile gider. Tek seferlik plan gönderimden sonra otomatik kapanır.
            </p>
            <button
              type="button"
              onClick={() => void saveBulkAsScheduledPlan()}
              disabled={bulkScheduleSaving || !hasServerJwt}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {bulkScheduleSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
              Zamanlanmış plan kaydet
            </button>
          </div>

          <button
            type="button"
            onClick={() => void sendBulkMeta()}
            disabled={bulkSendBusy || !bulkSelectedIds.size || !hasServerJwt}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 py-3 text-sm font-semibold text-white shadow-md hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:px-8"
          >
            {bulkSendBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            {bulkSendBusy ? 'Gönderiliyor…' : isConnected ? 'Şimdi gönder (gateway)' : 'Şimdi gönder (Meta)'}
          </button>
        </div>
      </section>

      {statusMessage && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">{statusMessage}</div>
      )}
    </div>
  );
}
