-- Öğretmen grup dersi dönem ödemesi (muhasebe — ödendi işareti)
CREATE TABLE IF NOT EXISTS teacher_group_lesson_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id text NOT NULL,
  institution_id uuid NULL,
  period_from date NOT NULL,
  period_to date NOT NULL,
  amount_tl numeric(12, 2) NULL,
  paid_at timestamptz NOT NULL DEFAULT now(),
  paid_by text NULL,
  notes text NULL,
  UNIQUE (teacher_id, institution_id, period_from, period_to)
);

CREATE INDEX IF NOT EXISTS idx_teacher_group_lesson_payouts_period
  ON teacher_group_lesson_payouts (period_from, period_to);

CREATE INDEX IF NOT EXISTS idx_teacher_group_lesson_payouts_institution
  ON teacher_group_lesson_payouts (institution_id);

COMMENT ON TABLE teacher_group_lesson_payouts IS 'Grup dersi öğretmen ödemeleri — seçili dönem için ödendi işareti';
