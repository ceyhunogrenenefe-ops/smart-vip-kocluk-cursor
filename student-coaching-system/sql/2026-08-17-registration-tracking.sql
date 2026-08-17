-- Kayıt Takibi (Registration Tracking) mini-CRM
-- Toplantı ve Gündem → Kayıt Takibi sekmesi
-- Supabase SQL Editor'da bir kez çalıştırın.

-- =============================================================================
-- 1) Kayıt adayları
-- =============================================================================
CREATE TABLE IF NOT EXISTS registration_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id text NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  academic_period_id uuid NULL REFERENCES coach_enrollment_periods(id) ON DELETE SET NULL,
  academic_period_key text NULL,
  linked_student_id text NULL REFERENCES students(id) ON DELETE SET NULL,
  linked_parent_id text NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  full_name text GENERATED ALWAYS AS (trim(first_name || ' ' || last_name)) STORED,
  parent_full_name text NULL,
  phone text NULL,
  normalized_phone text NULL,
  alternate_phone text NULL,
  normalized_alternate_phone text NULL,
  email text NULL,
  grade_program text NOT NULL,
  interested_package text NULL,
  primary_status text NOT NULL DEFAULT 'tracking'
    CHECK (primary_status IN ('tracking', 'confirmed', 'lost')),
  stage text NOT NULL DEFAULT 'new_lead'
    CHECK (stage IN (
      'new_lead', 'first_contact_pending', 'first_contact_completed',
      'presentation_scheduled', 'trial_lesson_scheduled', 'trial_lesson_completed',
      'offer_sent', 'considering', 'follow_up', 'payment_pending',
      'postponed', 'confirmed', 'lost'
    )),
  temperature text NOT NULL DEFAULT 'warm'
    CHECK (temperature IN ('hot', 'warm', 'cold')),
  probability int NULL CHECK (probability IS NULL OR (probability >= 0 AND probability <= 100)),
  source text NULL,
  assigned_user_id text NULL REFERENCES users(id) ON DELETE SET NULL,
  first_contact_at timestamptz NULL,
  last_contact_at timestamptz NULL,
  next_action_at timestamptz NULL,
  next_action_type text NULL,
  parent_expectations text NULL,
  registration_obstacles text NULL,
  offered_price numeric(12,2) NULL,
  discount_amount numeric(12,2) NULL,
  final_offer_amount numeric(12,2) NULL,
  notes text NULL,
  lost_reason text NULL,
  lost_description text NULL,
  confirmed_at timestamptz NULL,
  confirmed_by text NULL REFERENCES users(id) ON DELETE SET NULL,
  lost_at timestamptz NULL,
  created_by text NULL REFERENCES users(id) ON DELETE SET NULL,
  updated_by text NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_reg_leads_institution ON registration_leads (institution_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_reg_leads_period ON registration_leads (academic_period_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_reg_leads_primary_status ON registration_leads (institution_id, primary_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_reg_leads_stage ON registration_leads (institution_id, stage) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_reg_leads_grade ON registration_leads (institution_id, grade_program) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_reg_leads_assigned ON registration_leads (assigned_user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_reg_leads_phone ON registration_leads (institution_id, normalized_phone) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_reg_leads_next_action ON registration_leads (next_action_at) WHERE deleted_at IS NULL AND primary_status = 'tracking';
CREATE INDEX IF NOT EXISTS idx_reg_leads_confirmed ON registration_leads (confirmed_at) WHERE deleted_at IS NULL AND primary_status = 'confirmed';
CREATE INDEX IF NOT EXISTS idx_reg_leads_created ON registration_leads (institution_id, created_at DESC) WHERE deleted_at IS NULL;

-- Mükerrer uyarısı için (unique değil — aynı velinin farklı çocukları olabilir)
CREATE INDEX IF NOT EXISTS idx_reg_leads_dup_hint
  ON registration_leads (institution_id, academic_period_key, lower(full_name), normalized_phone, grade_program)
  WHERE deleted_at IS NULL;

-- =============================================================================
-- 2) Görüşme / etkileşim geçmişi
-- =============================================================================
CREATE TABLE IF NOT EXISTS registration_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES registration_leads(id) ON DELETE CASCADE,
  institution_id text NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  interaction_type text NOT NULL
    CHECK (interaction_type IN (
      'phone_call', 'whatsapp', 'in_person', 'online_meeting', 'trial_lesson',
      'system_note', 'meeting_decision', 'status_change', 'task_completed', 'other'
    )),
  interaction_at timestamptz NOT NULL DEFAULT now(),
  title text NULL,
  description text NULL,
  result text NULL,
  next_action_type text NULL,
  next_action_at timestamptz NULL,
  attachment_url text NULL,
  created_by text NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reg_interactions_lead ON registration_interactions (lead_id, interaction_at DESC);
CREATE INDEX IF NOT EXISTS idx_reg_interactions_institution ON registration_interactions (institution_id);

-- =============================================================================
-- 3) Görevler / sonraki işlemler
-- =============================================================================
CREATE TABLE IF NOT EXISTS registration_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES registration_leads(id) ON DELETE CASCADE,
  institution_id text NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  meeting_id uuid NULL REFERENCES mt_meetings(id) ON DELETE SET NULL,
  agenda_item_id uuid NULL REFERENCES mt_agenda_items(id) ON DELETE SET NULL,
  assigned_to text NULL REFERENCES users(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NULL,
  task_type text NOT NULL DEFAULT 'other'
    CHECK (task_type IN (
      'call_parent', 'whatsapp', 'presentation', 'trial_lesson_plan',
      'send_program', 'send_offer', 'payment_followup', 'manager_meeting',
      're_evaluate', 'other'
    )),
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled', 'overdue')),
  due_at timestamptz NULL,
  completed_at timestamptz NULL,
  created_by text NULL REFERENCES users(id) ON DELETE SET NULL,
  updated_by text NULL REFERENCES users(id) ON DELETE SET NULL,
  deduplication_key text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_reg_tasks_dedup
  ON registration_tasks (deduplication_key) WHERE deduplication_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reg_tasks_lead ON registration_tasks (lead_id);
CREATE INDEX IF NOT EXISTS idx_reg_tasks_assigned ON registration_tasks (assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_reg_tasks_due ON registration_tasks (due_at) WHERE status IN ('pending', 'in_progress', 'overdue');

-- =============================================================================
-- 4) Aşama geçmişi
-- =============================================================================
CREATE TABLE IF NOT EXISTS registration_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES registration_leads(id) ON DELETE CASCADE,
  old_primary_status text NULL,
  new_primary_status text NULL,
  old_stage text NULL,
  new_stage text NULL,
  reason text NULL,
  changed_by text NULL REFERENCES users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reg_stage_history_lead ON registration_stage_history (lead_id, changed_at DESC);

-- =============================================================================
-- 5) Toplantı bağlantıları
-- =============================================================================
CREATE TABLE IF NOT EXISTS registration_meeting_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES registration_leads(id) ON DELETE CASCADE,
  meeting_id uuid NOT NULL REFERENCES mt_meetings(id) ON DELETE CASCADE,
  agenda_item_id uuid NULL REFERENCES mt_agenda_items(id) ON DELETE SET NULL,
  institution_id text NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  discussion_topic text NULL,
  decision text NULL,
  responsible_user_id text NULL REFERENCES users(id) ON DELETE SET NULL,
  due_at timestamptz NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  created_by text NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reg_meeting_links_meeting ON registration_meeting_links (meeting_id);
CREATE INDEX IF NOT EXISTS idx_reg_meeting_links_lead ON registration_meeting_links (lead_id);

-- =============================================================================
-- 6) Etiketler
-- =============================================================================
CREATE TABLE IF NOT EXISTS registration_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id text NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, name)
);

CREATE TABLE IF NOT EXISTS registration_lead_tags (
  lead_id uuid NOT NULL REFERENCES registration_leads(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES registration_tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lead_id, tag_id)
);

-- =============================================================================
-- 7) Excel import logları
-- =============================================================================
CREATE TABLE IF NOT EXISTS registration_import_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id text NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  import_type text NOT NULL DEFAULT 'excel'
    CHECK (import_type IN ('excel_horizontal', 'excel_standard', 'csv')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'preview', 'completed', 'failed', 'cancelled')),
  total_rows int NOT NULL DEFAULT 0,
  inserted_count int NOT NULL DEFAULT 0,
  updated_count int NOT NULL DEFAULT 0,
  skipped_count int NOT NULL DEFAULT 0,
  error_count int NOT NULL DEFAULT 0,
  preview_json jsonb NULL,
  result_json jsonb NULL,
  created_by text NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL
);

CREATE TABLE IF NOT EXISTS registration_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_log_id uuid NOT NULL REFERENCES registration_import_logs(id) ON DELETE CASCADE,
  row_number int NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'inserted', 'updated', 'skipped', 'error')),
  raw_data jsonb NULL,
  error_message text NULL,
  lead_id uuid NULL REFERENCES registration_leads(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- 8) Audit log
-- =============================================================================
CREATE TABLE IF NOT EXISTS registration_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id text NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  lead_id uuid NULL REFERENCES registration_leads(id) ON DELETE SET NULL,
  action text NOT NULL,
  actor_user_id text NULL REFERENCES users(id) ON DELETE SET NULL,
  old_value jsonb NULL,
  new_value jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reg_audit_lead ON registration_audit_logs (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reg_audit_institution ON registration_audit_logs (institution_id, created_at DESC);

-- =============================================================================
-- 9) Kesin kayda dönüştürme RPC (idempotent transaction)
-- =============================================================================
CREATE OR REPLACE FUNCTION registration_confirm_lead(
  p_lead_id uuid,
  p_actor_user_id text,
  p_grade_program text,
  p_class_group text DEFAULT NULL,
  p_academic_period_key text DEFAULT NULL,
  p_confirmed_at timestamptz DEFAULT now(),
  p_total_amount numeric DEFAULT NULL,
  p_discount_amount numeric DEFAULT NULL,
  p_final_amount numeric DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_down_payment numeric DEFAULT NULL,
  p_remaining_amount numeric DEFAULT NULL,
  p_installment_count int DEFAULT NULL,
  p_coach_id text DEFAULT NULL,
  p_link_existing_student_id text DEFAULT NULL,
  p_create_student boolean DEFAULT false,
  p_student_first_name text DEFAULT NULL,
  p_student_last_name text DEFAULT NULL,
  p_parent_informed boolean DEFAULT false,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead registration_leads%ROWTYPE;
  v_student_id text;
  v_payment_id uuid;
  v_already_confirmed boolean := false;
BEGIN
  SELECT * INTO v_lead FROM registration_leads WHERE id = p_lead_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lead_not_found');
  END IF;

  IF v_lead.primary_status = 'confirmed' AND v_lead.linked_student_id IS NOT NULL THEN
    v_already_confirmed := true;
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'lead_id', v_lead.id,
      'student_id', v_lead.linked_student_id
    );
  END IF;

  -- Öğrenci eşleştirme veya oluşturma
  IF p_link_existing_student_id IS NOT NULL AND p_link_existing_student_id <> '' THEN
    v_student_id := p_link_existing_student_id;
  ELSIF p_create_student AND p_student_first_name IS NOT NULL THEN
    v_student_id := gen_random_uuid()::text;
    INSERT INTO students (
      id, institution_id, name, email, phone, parent_phone, parent_name,
      class_level, coach_id, created_at, updated_at
    ) VALUES (
      v_student_id,
      v_lead.institution_id,
      trim(p_student_first_name || ' ' || coalesce(p_student_last_name, '')),
      coalesce(v_lead.email, ''),
      coalesce(v_lead.phone, ''),
      coalesce(v_lead.normalized_phone, v_lead.phone, ''),
      coalesce(v_lead.parent_full_name, ''),
      coalesce(p_grade_program, v_lead.grade_program),
      p_coach_id,
      now(),
      now()
    );
  ELSE
    v_student_id := v_lead.linked_student_id;
  END IF;

  -- Lead güncelle
  UPDATE registration_leads SET
    primary_status = 'confirmed',
    stage = 'confirmed',
    grade_program = coalesce(p_grade_program, grade_program),
    academic_period_key = coalesce(p_academic_period_key, academic_period_key),
    linked_student_id = coalesce(v_student_id, linked_student_id),
    offered_price = coalesce(p_total_amount, offered_price),
    discount_amount = coalesce(p_discount_amount, discount_amount),
    final_offer_amount = coalesce(p_final_amount, final_offer_amount),
    confirmed_at = coalesce(p_confirmed_at, now()),
    confirmed_by = p_actor_user_id,
    updated_by = p_actor_user_id,
    updated_at = now()
  WHERE id = p_lead_id;

  -- Ödeme kaydı (tablo varsa)
  IF p_final_amount IS NOT NULL AND p_final_amount > 0 THEN
    BEGIN
      INSERT INTO student_payment_records (
        id, institution_id, student_id, payment_type, amount_total, amount_paid,
        status, notes, created_at, updated_at
      ) VALUES (
        gen_random_uuid(),
        v_lead.institution_id,
        v_student_id,
        'donem_kayit',
        p_final_amount,
        coalesce(p_down_payment, 0),
        CASE WHEN coalesce(p_down_payment, 0) >= p_final_amount THEN 'paid'
             WHEN coalesce(p_down_payment, 0) > 0 THEN 'partial'
             ELSE 'unpaid' END,
        coalesce(p_notes, 'Kayıt Takibi kesin kayıt'),
        now(),
        now()
      )
      RETURNING id INTO v_payment_id;
    EXCEPTION WHEN undefined_table OR undefined_column THEN
      v_payment_id := NULL;
    END;
  END IF;

  -- Aşama geçmişi
  INSERT INTO registration_stage_history (lead_id, old_primary_status, new_primary_status, old_stage, new_stage, reason, changed_by)
  VALUES (p_lead_id, v_lead.primary_status, 'confirmed', v_lead.stage, 'confirmed', coalesce(p_notes, 'Kesin kayda dönüştürüldü'), p_actor_user_id);

  -- Audit
  INSERT INTO registration_audit_logs (institution_id, lead_id, action, actor_user_id, old_value, new_value)
  VALUES (
    v_lead.institution_id, p_lead_id, 'confirmed',
    p_actor_user_id,
    jsonb_build_object('primary_status', v_lead.primary_status, 'stage', v_lead.stage),
    jsonb_build_object('primary_status', 'confirmed', 'student_id', v_student_id, 'payment_id', v_payment_id)
  );

  -- Timeline
  INSERT INTO registration_interactions (lead_id, institution_id, interaction_type, title, description, created_by)
  VALUES (p_lead_id, v_lead.institution_id, 'status_change', 'Kesin kayda dönüştürüldü', coalesce(p_notes, ''), p_actor_user_id);

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', v_already_confirmed,
    'lead_id', p_lead_id,
    'student_id', v_student_id,
    'payment_id', v_payment_id
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- Kayıt Gündemi toplantı türü
INSERT INTO mt_meeting_types (institution_id, code, name, description, audience_role, is_board, sort_order)
SELECT NULL, 'kayit_gundemi', 'Kayıt Gündemi', 'Kayıt adayı takip toplantısı', 'admin', false, 15
WHERE NOT EXISTS (
  SELECT 1 FROM mt_meeting_types t WHERE t.institution_id IS NULL AND t.code = 'kayit_gundemi'
);

-- RLS: API service role kullanır; doğrudan client erişimini kısıtla
ALTER TABLE registration_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_meeting_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_lead_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_import_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_audit_logs ENABLE ROW LEVEL SECURITY;

-- Service role bypass; authenticated için deny-all (API üzerinden erişim)
DO $$ BEGIN
  CREATE POLICY reg_leads_deny_anon ON registration_leads FOR ALL TO anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY reg_leads_deny_auth ON registration_leads FOR ALL TO authenticated USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY reg_interactions_deny_anon ON registration_interactions FOR ALL TO anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY reg_interactions_deny_auth ON registration_interactions FOR ALL TO authenticated USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY reg_tasks_deny_anon ON registration_tasks FOR ALL TO anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY reg_tasks_deny_auth ON registration_tasks FOR ALL TO authenticated USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY reg_audit_deny_anon ON registration_audit_logs FOR ALL TO anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY reg_audit_deny_auth ON registration_audit_logs FOR ALL TO authenticated USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE registration_leads IS 'Kayıt Takibi — kayıt adayları (TAKİP / KESİN KAYIT / OLUMSUZ)';
COMMENT ON FUNCTION registration_confirm_lead IS 'Takipten kesin kayda idempotent dönüşüm';

NOTIFY pgrst, 'reload schema';
