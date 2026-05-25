/**
 * Vercel Scheduled Functions zamanları **her zaman UTC** ile yazılır.
 * Üretim özeti: kök `vercel.json` içindeki `crons[]`; bu dosyadaki string sabitleri ile **aynı kalmalıdır**.
 *
 * Türkiye (Europe/Istanbul) için yaz/kış saati uygulanmıyor; yıl boyu **UTC+3** kabul edilir.
 *
 * --- Günlük rapor WhatsApp (handlers/cron-report-check.js) ---
 * Hedef: Her akşam **İstanbul 22:00**.
 * vercel.json: **UTC `0 19 * * *`** (19:00 UTC + 3 saat = 22:00 TR).
 * Handler: `getIstanbulHour() === 22` (Bearer ile saat dışı testte filtre atlanır).
 *
 * --- Canlı ders hatırlatma (handlers/cron-lesson-reminder.js) ---
 * `*/5 * * * *` UTC; pencere üst sınırı `LESSON_REMINDER_MAX_LEAD_MINUTES` (varsayılan 45 dk, en fazla 1440).
 *
 * --- Grup canlı ders hatırlatma (handlers/cron-class-lesson-reminders.js) ---
 * `*/5 * * * *` UTC; gönderim: ders başlangıcına **10 dk** kala (0–10 dk penceresi).
 * `CLASS_LESSON_REMINDER_LEAD_MINUTES` (varsayılan 10). Ardışık aynı sınıf/konu/link oturumunda tekrar yok.
 */

/** vercel.json → crons → daily-report-reminders ile aynı olmalı */
export const CRON_DAILY_REPORT_REMINDERS_UTC = '0 19 * * *';

/** vercel.json → crons → lesson-reminders ile aynı olmalı */
export const CRON_LESSON_REMINDERS_UTC = '*/5 * * * *';
