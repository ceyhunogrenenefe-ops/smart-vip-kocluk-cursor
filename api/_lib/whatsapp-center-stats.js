/**
 * WhatsApp Merkezi — günlük istatistik, şablon telemetrisi, cron durumu.
 */

import { getIstanbulDateString, addCalendarDaysYmd } from './istanbul-time.js';

export const EXCLUDE_FROM_SUMMARY_KINDS = new Set(['template_test']);

export const KIND_LABELS_TR = {
  class_lesson_reminder: 'Grup dersi hatırlatma',
  teacher_lesson_reminder: 'Öğretmen ders hatırlatması',
  class_homework_notice: 'Grup ödev bildirimi',
  class_absent_notice_1: 'Devamsızlık (veli)',
  class_absent_notice: 'Devamsızlık',
  lesson_reminder: 'Birebir ders hatırlatma',
  lesson_reminder_parent: 'Veli ders hatırlatma',
  report_reminder: 'Günlük rapor hatırlatma',
  report_reminder_parent: 'Veli rapor hatırlatma',
  meeting_notification: 'Görüşme hatırlatma',
  kitap_siparis_bildirim: 'Kitap siparişi — kitapçı',
  book_order_notify: 'Kitap siparişi — kitapçı',
  template_test: 'Şablon testi',
  coach_whatsapp_auto: 'Koç otomasyon'
};

/** message_templates.type → message_logs.kind eşleşmeleri */
export const TEMPLATE_TYPE_TO_LOG_KINDS = {
  class_lesson_reminder: ['class_lesson_reminder'],
  teacher_lesson_reminder: ['teacher_lesson_reminder'],
  class_homework_notice: ['class_homework_notice'],
  class_absent_notice_1: ['class_absent_notice_1', 'class_absent_notice'],
  class_absent_notice: ['class_absent_notice', 'class_absent_notice_1'],
  lesson_reminder: ['lesson_reminder'],
  lesson_reminder_parent: ['lesson_reminder_parent'],
  report_reminder: ['report_reminder', 'report_reminder_parent'],
  meeting_notification: ['meeting_notification', 'whatsapp_created', 'whatsapp_reminder_10m'],
  kitap_siparis_bildirim: ['kitap_siparis_bildirim', 'book_order_notify']
};

export function istanbulDayUtcRange(ymd) {
  const d = String(ymd || '').trim().slice(0, 10);
  const next = addCalendarDaysYmd(d, 1);
  return {
    startIso: `${d}T00:00:00+03:00`,
    endExclusiveIso: `${next}T00:00:00+03:00`
  };
}

export function logRowOnIstanbulDay(row, ymd) {
  const k = String(ymd || '').slice(0, 10);
  if (!k) return false;
  if (String(row?.log_date || '').slice(0, 10) === k) return true;
  const sent = row?.sent_at ? new Date(row.sent_at).getTime() : NaN;
  if (!Number.isFinite(sent)) return false;
  const { startIso, endExclusiveIso } = istanbulDayUtcRange(k);
  const start = new Date(startIso).getTime();
  const end = new Date(endExclusiveIso).getTime();
  return sent >= start && sent < end;
}

export function isExcludedSummaryKind(kind) {
  return EXCLUDE_FROM_SUMMARY_KINDS.has(String(kind || '').trim());
}

export function isOperationalFailure(row) {
  const err = String(row?.error || row?.twilio_error_code || '').toLowerCase();
  if (!err) return false;
  return (
    err.includes('invalid_phone') ||
    err.includes('no_valid_phone') ||
    err.includes('parent_phone_missing') ||
    err.includes('phone_missing')
  );
}

/** Token / izin / şablon yapılandırması — şablon sağlık rozetini kirletmez */
export function isConfigurationFailure(row) {
  const err = String(row?.error || row?.twilio_error_code || '').toLowerCase();
  if (!err) return false;
  return (
    err.includes('(#3)') ||
    err.includes('granular permission') ||
    err.includes('missing_meta_whatsapp') ||
    err.includes('meta_whatsapp') ||
    err.includes('meta_send_failed') ||
    err.includes('meta_template_name_required') ||
    err.includes('template_not_found') ||
    err.includes('132001') ||
    err.includes('permission')
  );
}

export function logMatchesTemplateType(row, templateType, metaTemplateName) {
  const type = String(templateType || '').trim();
  const kind = String(row?.kind || '').trim();
  if (!type || !kind) return false;
  const kinds = TEMPLATE_TYPE_TO_LOG_KINDS[type] || [type];
  if (kinds.includes(kind)) return true;
  const meta = String(metaTemplateName || '').trim();
  if (meta && String(row?.meta_template_name || '').trim() === meta) return true;
  return false;
}

/**
 * @param {Array<{ kind?: string, status?: string, sent_at?: string, log_date?: string, error?: string, twilio_error_code?: string }>} rows
 * @param {string} todayYmd
 */
export function countMessageStats(rows, todayYmd) {
  let sentToday = 0;
  let failedToday = 0;
  let sent7d = 0;
  let failed7d = 0;
  const horizon7 = Date.now() - 7 * 24 * 60 * 60 * 1000;

  for (const row of rows || []) {
    if (isExcludedSummaryKind(row.kind)) continue;
    const onToday = logRowOnIstanbulDay(row, todayYmd);
    const sentMs = row.sent_at ? new Date(row.sent_at).getTime() : 0;
    const in7d = sentMs >= horizon7;

    if (row.status === 'sent') {
      if (onToday) sentToday += 1;
      if (in7d) sent7d += 1;
    } else if (row.status === 'failed') {
      if (onToday) failedToday += 1;
      if (in7d) failed7d += 1;
    }
  }

  return { sentToday, failedToday, sent7d, failed7d };
}

/**
 * @param {object} tpl message_templates row
 * @param {Array<object>} logsPool
 * @param {string} todayYmd
 */
export function templateTelemetry(tpl, logsPool, todayYmd) {
  const type = String(tpl.type || '');
  const metaName = String(tpl.meta_template_name || '').trim();
  const horizon7 = Date.now() - 7 * 24 * 60 * 60 * 1000;

  let total7d = 0;
  let ok7d = 0;
  let fail7d = 0;
  let okToday = 0;
  let failToday = 0;
  let failTodayOperational = 0;
  let failTodayConfiguration = 0;
  let lastSent = null;

  for (const row of logsPool || []) {
    if (isExcludedSummaryKind(row.kind)) continue;
    if (!logMatchesTemplateType(row, type, metaName)) continue;

    const sentMs = row.sent_at ? new Date(row.sent_at).getTime() : 0;
    const in7d = sentMs >= horizon7;
    const onToday = logRowOnIstanbulDay(row, todayYmd);

    if (in7d) {
      total7d += 1;
      if (row.status === 'sent') ok7d += 1;
      else if (row.status === 'failed') fail7d += 1;
    }
    if (onToday) {
      if (row.status === 'sent') okToday += 1;
      else if (row.status === 'failed') {
        failToday += 1;
        if (isOperationalFailure(row)) failTodayOperational += 1;
        else if (isConfigurationFailure(row)) failTodayConfiguration += 1;
      }
    }
    if (row.status === 'sent' && sentMs && (!lastSent || sentMs > new Date(lastSent).getTime())) {
      lastSent = row.sent_at;
    }
  }

  const isActive = tpl.is_active !== false;
  const metaMissing = !metaName;
  const failTodayReal = failToday - failTodayOperational - failTodayConfiguration;

  let badge = 'active';
  if (!isActive) badge = 'inactive';
  else if (metaMissing) badge = 'meta_missing';
  else if (failTodayReal > okToday && okToday + failTodayReal >= 2) badge = 'unhealthy';
  else if (fail7d > ok7d && total7d > 5 && okToday === 0) badge = 'warning';

  return {
    id: tpl.id,
    name: tpl.name,
    type,
    channel: tpl.channel || 'whatsapp',
    is_active: isActive,
    meta_template_name: tpl.meta_template_name || null,
    meta_template_language: tpl.meta_template_language || 'tr',
    whatsapp_template_status: tpl.whatsapp_template_status || null,
    success_today: okToday,
    failed_today: failToday,
    failed_today_operational: failTodayOperational,
    failed_today_configuration: failTodayConfiguration,
    total_sent_window: total7d,
    success_count: ok7d,
    failed_count: fail7d,
    last_sent_at: lastSent,
    badge,
    meta_missing: metaMissing
  };
}

export function cronVisualState(def, last, nowMs, todayYmd) {
  const ranAt = last?.ran_at ? new Date(last.ran_at).getTime() : 0;
  const ageMin = ranAt ? (nowMs - ranAt) / 60000 : null;

  if (def.awaiting_first_run) return { state: 'pending', age_minutes: null };
  if (!last) return { state: 'stale', age_minutes: null };
  if (last.ok === false && !last.skipped) return { state: 'error', age_minutes: ageMin };

  const expectMin = def.expectEveryMinutes || 60;
  const isDaily = expectMin >= 12 * 60;
  const lastIstDay = last.ran_at ? getIstanbulDateString(new Date(last.ran_at)) : null;

  if (isDaily) {
    if (lastIstDay === todayYmd) return { state: 'ok', age_minutes: ageMin };
    if (ageMin != null && ageMin <= expectMin * 1.35) return { state: 'ok', age_minutes: ageMin };
    return { state: 'stale', age_minutes: ageMin };
  }

  const frequent = expectMin <= 30;
  if (frequent && ageMin != null && ageMin > 60) {
    return { state: 'idle_1h', age_minutes: ageMin };
  }
  if (ageMin != null && ageMin > Math.max(expectMin * 3, 15)) {
    return { state: 'stale', age_minutes: ageMin };
  }
  return { state: 'ok', age_minutes: ageMin };
}

export function cronRowOnIstanbulDay(ranAt, todayYmd) {
  const sent = ranAt ? new Date(ranAt).getTime() : NaN;
  if (!Number.isFinite(sent)) return false;
  const { startIso, endExclusiveIso } = istanbulDayUtcRange(todayYmd);
  return sent >= new Date(startIso).getTime() && sent < new Date(endExclusiveIso).getTime();
}

/**
 * Bugünkü cron koşularını job_key bazında topla.
 * @param {Array<{ job_key: string, ran_at: string, messages_sent?: number, messages_failed?: number, ok?: boolean, skipped?: string }>} cronRows
 * @param {string} todayYmd
 */
export function aggregateCronToday(cronRows, todayYmd) {
  /** @type {Map<string, { runs: number, sent: number, failed: number, last_skip: string | null }>} */
  const map = new Map();
  for (const row of cronRows || []) {
    if (!cronRowOnIstanbulDay(row.ran_at, todayYmd)) continue;
    const k = String(row.job_key || '');
    if (!k) continue;
    if (!map.has(k)) map.set(k, { runs: 0, sent: 0, failed: 0, last_skip: null });
    const agg = map.get(k);
    agg.runs += 1;
    agg.sent += Number(row.messages_sent) || 0;
    agg.failed += Number(row.messages_failed) || 0;
    if (row.skipped) agg.last_skip = String(row.skipped);
  }
  return map;
}

export function kindLabelTr(kind) {
  const k = String(kind || '').trim();
  return KIND_LABELS_TR[k] || k.replace(/_/g, ' ');
}
