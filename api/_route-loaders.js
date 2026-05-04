/** Ortak: `[[...segments]].js` ve çok segment rewrite (`deep-api.js`) aynı haritayı kullanır. */

export const routeLoaders = {
  'auth-login': () => import('../handlers/auth-login.js'),
  students: () => import('../handlers/students.js'),
  coaches: () => import('../handlers/coaches.js'),
  users: () => import('../handlers/users.js'),
  quota: () => import('../handlers/quota.js'),
  'weekly-entries': () => import('../handlers/weekly-entries.js'),
  'book-readings': () => import('../handlers/book-readings.js'),
  'written-exams': () => import('../handlers/written-exams.js'),
  'ai-chat': () => import('../handlers/ai-chat.js'),
  meetings: () => import('../handlers/meetings.js'),
  twilio: () => import('../handlers/twilio.js'),
  'whatsapp/send': () => import('../handlers/whatsapp-send.js'),
  'message-templates': () => import('../handlers/message-templates.js'),
  'coach-whatsapp-schedule': () => import('../handlers/coach-whatsapp-schedule.js'),
  'google/oauth': () => import('../handlers/google-oauth.js'),
  'google/callback': () => import('../handlers/google-callback.js'),
  'cron/meeting-reminders': () => import('../handlers/cron-meeting-reminders.js'),
  'cron/coach-whatsapp-auto': () => import('../handlers/cron-coach-whatsapp-auto.js'),
  'cron/teacher-lessons': () => import('../handlers/cron-teacher-lessons.js'),
  'cron/lesson-reminder': () => import('../handlers/cron-lesson-reminder.js'),
  'cron/lesson-reminders': () => import('../handlers/cron-lesson-reminder.js'),
  'cron/report-check': () => import('../handlers/cron-report-check.js'),
  'cron/daily-report-reminders': () => import('../handlers/cron-report-check.js'),
  'teacher-lessons': () => import('../handlers/teacher-lessons.js'),
  'student-teacher-lesson-quota': () => import('../handlers/student-teacher-lesson-quota.js')
};
