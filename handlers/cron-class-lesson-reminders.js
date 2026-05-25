import { authorizeVercelOrCronSecret } from '../api/_lib/cron-auth.js';
import { runClassLessonRemindersJob } from '../api/_lib/run-class-lesson-reminders-job.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const auth = authorizeVercelOrCronSecret(req);
  if (!auth.ok) return res.status(401).json({ error: 'Unauthorized cron' });

  try {
    const result = await runClassLessonRemindersJob({ triggeredBy: 'class-lesson-reminders' });
    return res.status(200).json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[cron-class-lesson-reminders] fatal', msg);
    const { recordCronRun } = await import('../api/_lib/cron-run-log.js');
    await recordCronRun({ jobKey: 'class_lesson_reminders', ok: false, detail: { error: msg } });
    return res.status(500).json({ ok: false, error: msg });
  }
}
