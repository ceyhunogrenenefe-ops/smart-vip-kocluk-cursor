/**
 * Vercel Scheduled Functions zamanları **her zaman UTC** ile yazılır.
 * Üretim özeti: kök `vercel.json` içindeki `crons[]`; bu dosyadaki string sabitleri ile **aynı kalmalıdır**.
 *
 * Türkiye (Europe/Istanbul) için yaz/kış saati uygulanmıyor; yıl boyu **UTC+3** kabul edilir.
 *
 * --- Günlük rapor WhatsApp (handlers/cron-report-check.js) ---
 * Hedef: Her akşam **İstanbul 22:00** (Meta şablon — varsayılan).
 * vercel.json: **UTC `0 19 * * *`** (19:00 UTC + 3 saat = 22:00 TR).
 * Handler: `getIstanbulHour() === reportReminderIstHour()` (Bearer ile saat dışı testte filtre atlanır).
 * Kanal: Meta şablonu (varsayılan, 22:00 TR). Gateway yalnızca REPORT_REMINDER_CHANNEL=gateway ile.
 *
 * --- Canlı ders hatırlatma (handlers/cron-lesson-reminder.js) ---
 * Her 5 dk UTC; pencere: ders başlamadan 7–13 dk (≈10 dk).
 *
 * --- Grup canlı ders hatırlatma (handlers/cron-class-lesson-reminders.js) ---
 * Her 5 dk UTC; aynı 7–13 dk penceresi. Ardışık aynı sınıf/konu/link oturumunda tekrar yok. */

/** vercel.json → crons → daily-report-reminders ile aynı olmalı (Meta 22:00 İstanbul) */
export const CRON_DAILY_REPORT_REMINDERS_UTC = '0 19 * * *';

/** vercel.json → crons → lesson-reminders ile aynı olmalı */
export const CRON_LESSON_REMINDERS_UTC = '*/5 * * * *';
