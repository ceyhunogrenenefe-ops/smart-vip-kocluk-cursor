-- Toplantı ve Gündem Takip Sistemi
-- Supabase SQL Editor'da bir kez çalıştırın.

-- 1) Toplantı türleri (dinamik; kodda sabitlemeyin)
CREATE TABLE IF NOT EXISTS mt_meeting_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id text NULL REFERENCES institutions(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text NULL,
  audience_role text NULL CHECK (audience_role IS NULL OR audience_role IN ('admin', 'coach', 'teacher', 'all')),
  is_board boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_mt_meeting_types_inst_code
  ON mt_meeting_types (institution_id, code) WHERE institution_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mt_meeting_types_global_code
  ON mt_meeting_types (code) WHERE institution_id IS NULL;

-- 2) Toplantılar
CREATE TABLE IF NOT EXISTS mt_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id text NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  meeting_type_id uuid NOT NULL REFERENCES mt_meeting_types(id),
  title text NOT NULL,
  description text NULL,
  meeting_date date NOT NULL,
  start_time time NULL,
  end_time time NULL,
  location_or_link text NULL,
  manager_user_id text NULL REFERENCES users(id) ON DELETE SET NULL,
  open_to_role boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('draft', 'planned', 'held', 'closed', 'cancelled')),
  reminder_at timestamptz NULL,
  created_by text NULL REFERENCES users(id) ON DELETE SET NULL,
  closed_by text NULL REFERENCES users(id) ON DELETE SET NULL,
  closed_at timestamptz NULL,
  archived_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mt_meetings_institution_date
  ON mt_meetings (institution_id, meeting_date DESC);
CREATE INDEX IF NOT EXISTS idx_mt_meetings_type ON mt_meetings (meeting_type_id);
CREATE INDEX IF NOT EXISTS idx_mt_meetings_status ON mt_meetings (institution_id, status);

-- 3) Katılımcılar
CREATE TABLE IF NOT EXISTS mt_meeting_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES mt_meetings(id) ON DELETE CASCADE,
  user_id text NULL REFERENCES users(id) ON DELETE CASCADE,
  role_scope text NULL CHECK (role_scope IS NULL OR role_scope IN ('coach', 'teacher', 'admin')),
  is_required boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meeting_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_mt_participants_user ON mt_meeting_participants (user_id);

-- 4) Gündem maddeleri
CREATE TABLE IF NOT EXISTS mt_agenda_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES mt_meetings(id) ON DELETE CASCADE,
  institution_id text NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NULL,
  sort_order int NOT NULL DEFAULT 0,
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_discussion', 'discussed', 'deferred', 'cancelled')),
  discussion_note text NULL,
  decision_text text NULL,
  created_by text NULL REFERENCES users(id) ON DELETE SET NULL,
  related_user_ids text[] NULL,
  carried_from_meeting_id uuid NULL REFERENCES mt_meetings(id) ON DELETE SET NULL,
  carried_from_agenda_id uuid NULL REFERENCES mt_agenda_items(id) ON DELETE SET NULL,
  is_carried_forward boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mt_agenda_meeting_order
  ON mt_agenda_items (meeting_id, sort_order);

-- 5) Kararlar (gündemden ayrı da tutulabilir)
CREATE TABLE IF NOT EXISTS mt_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES mt_meetings(id) ON DELETE CASCADE,
  agenda_item_id uuid NULL REFERENCES mt_agenda_items(id) ON DELETE SET NULL,
  institution_id text NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NULL,
  created_by text NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mt_decisions_meeting ON mt_decisions (meeting_id);

-- 6) Görevler
CREATE TABLE IF NOT EXISTS mt_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id text NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  meeting_id uuid NOT NULL REFERENCES mt_meetings(id) ON DELETE CASCADE,
  agenda_item_id uuid NULL REFERENCES mt_agenda_items(id) ON DELETE SET NULL,
  decision_id uuid NULL REFERENCES mt_decisions(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NULL,
  status text NOT NULL DEFAULT 'todo'
    CHECK (status IN ('todo', 'in_progress', 'done', 'overdue', 'deferred', 'cancelled')),
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  start_date date NULL,
  due_date date NULL,
  reviewer_user_id text NULL REFERENCES users(id) ON DELETE SET NULL,
  completion_note text NULL,
  created_by text NULL REFERENCES users(id) ON DELETE SET NULL,
  completed_by text NULL REFERENCES users(id) ON DELETE SET NULL,
  completed_at timestamptz NULL,
  source_task_id uuid NULL REFERENCES mt_tasks(id) ON DELETE SET NULL,
  carried_to_meeting_id uuid NULL REFERENCES mt_meetings(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mt_tasks_institution_status ON mt_tasks (institution_id, status);
CREATE INDEX IF NOT EXISTS idx_mt_tasks_meeting ON mt_tasks (meeting_id);
CREATE INDEX IF NOT EXISTS idx_mt_tasks_due ON mt_tasks (due_date) WHERE status NOT IN ('done', 'cancelled');

-- 7) Görev sorumluları
CREATE TABLE IF NOT EXISTS mt_task_assignees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES mt_tasks(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_mt_task_assignees_user ON mt_task_assignees (user_id);

-- 8) Toplantı notları
CREATE TABLE IF NOT EXISTS mt_meeting_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES mt_meetings(id) ON DELETE CASCADE,
  institution_id text NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_by text NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mt_notes_meeting ON mt_meeting_notes (meeting_id, created_at DESC);

-- 9) Ekler (URL / meta; dosya storage ayrı)
CREATE TABLE IF NOT EXISTS mt_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id text NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  meeting_id uuid NULL REFERENCES mt_meetings(id) ON DELETE CASCADE,
  agenda_item_id uuid NULL REFERENCES mt_agenda_items(id) ON DELETE CASCADE,
  task_id uuid NULL REFERENCES mt_tasks(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  mime_type text NULL,
  file_size int NULL,
  uploaded_by text NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mt_attachments_meeting ON mt_attachments (meeting_id);

-- 10) Şablonlar
CREATE TABLE IF NOT EXISTS mt_meeting_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id text NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  meeting_type_id uuid NULL REFERENCES mt_meeting_types(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text NULL,
  agenda_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by text NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mt_templates_institution ON mt_meeting_templates (institution_id);

-- 11) İşlem geçmişi (silinemez audit)
CREATE TABLE IF NOT EXISTS mt_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id text NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  meeting_id uuid NULL REFERENCES mt_meetings(id) ON DELETE SET NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL,
  actor_user_id text NULL REFERENCES users(id) ON DELETE SET NULL,
  old_value jsonb NULL,
  new_value jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mt_activity_meeting ON mt_activity_logs (meeting_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mt_activity_institution ON mt_activity_logs (institution_id, created_at DESC);

-- Global varsayılan türler (institution_id NULL)
INSERT INTO mt_meeting_types (institution_id, code, name, description, audience_role, is_board, sort_order)
SELECT NULL, v.code, v.name, v.description, v.audience_role, v.is_board, v.sort_order
FROM (VALUES
  ('yonetim_kurulu', 'Yönetim Kurulu Toplantısı', 'Yalnızca süper admin', 'admin', true, 10),
  ('rehberlik_koc', 'Rehberlik/Koç Toplantısı', 'Koç ve rehberlik', 'coach', false, 20),
  ('ogretmen', 'Öğretmen Toplantısı', 'Öğretmenler', 'teacher', false, 30)
) AS v(code, name, description, audience_role, is_board, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM mt_meeting_types t WHERE t.institution_id IS NULL AND t.code = v.code
);

COMMENT ON TABLE mt_meetings IS 'Toplantı ve Gündem Takip — kurum toplantıları';
COMMENT ON TABLE mt_meeting_types IS 'Dinamik toplantı türleri; is_board=true yönetim kurulu (admin göremez)';

NOTIFY pgrst, 'reload schema';
