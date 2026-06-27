-- Ders programı planlayıcı: kurum bazlı taslaklar (yaz dönemi aracı JSON)
CREATE TABLE IF NOT EXISTS class_schedule_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  planner_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_class_schedule_plans_institution ON class_schedule_plans(institution_id);
CREATE INDEX IF NOT EXISTS idx_class_schedule_plans_updated ON class_schedule_plans(updated_at DESC);

COMMENT ON TABLE class_schedule_plans IS 'Grup ders programı planlayıcı taslakları; Canlı Grup Dersi haftalık şablonlarına aktarılabilir.';

NOTIFY pgrst, 'reload schema';
