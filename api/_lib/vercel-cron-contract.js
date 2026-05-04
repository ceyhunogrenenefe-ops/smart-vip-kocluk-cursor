/**
 * Vercel Scheduled Functions zamanları **her zaman UTC** ile yazılır.
 * Üretim özeti: kök `vercel.json` içindeki `crons[]`; bu dosyadaki string sabitleri ile **aynı kalmalıdır**.
 *
 * Türkiye (Europe/Istanbul) için yaz/kış saati uygulanmıyor; yıl boyu **UTC+3** kabul edilir.
 *
 * --- Günlük rapor WhatsApp (handlers/cron-report-check.js) ---
 * Hedef: Her akşam **İstanbul 22:00**.
 * Bu yüzden vercel.json içinde **UTC olarak `0 19 * * *`** kullanılır (19:00 UTC + 3 saat = 22:00 TR).
 *
 * **Yanlış:** `0 22 * * *` (UTC) → İstanbul’da **01:00** tetiklenir; kullanmayın.
 *
 * Handler yine de `getIstanbulHour() === 22` ile filtreler (Bearer ile saat dışı testte yanlış gönderimi önler).
 *
 * --- Canlı ders hatırlatma (handlers/cron-lesson-reminder.js) ---
 * `*/5 * * * *` UTC; en fazla 5 dk gecikmeli pencereler (son 10 dk içinde gönderim).
 */

/** vercel.json → crons → daily-report-reminders ile aynı olmalı */
export const CRON_DAILY_REPORT_REMINDERS_UTC = '0 19 * * *';

/** vercel.json → crons → lesson-reminders ile aynı olmalı */
export const CRON_LESSON_REMINDERS_UTC = '*/5 * * * *';
