-- CRM görev: ajana due_at'ten 5 dk önce hatırlatma (idempotent işaret)
ALTER TABLE public.registration_tasks
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_reg_tasks_reminder_due
  ON public.registration_tasks (due_at)
  WHERE status IN ('pending', 'in_progress', 'overdue') AND reminder_sent_at IS NULL;
