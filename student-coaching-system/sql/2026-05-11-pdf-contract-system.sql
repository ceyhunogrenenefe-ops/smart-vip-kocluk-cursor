-- PDF Şablon & Sözleşme altyapısı (Supabase SQL Editor)
-- Storage: Supabase Dashboard → Storage → bucket `generated-contracts` (private) oluşturun; RLS politikalarını kuruma göre ayarlayın.

CREATE TABLE IF NOT EXISTS public.document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id TEXT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('program_pdf', 'contract', 'rules')),
  name TEXT NOT NULL,
  academic_year_label TEXT NOT NULL DEFAULT '',
  grade_label TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  copied_from_id UUID NULL REFERENCES public.document_templates(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS document_templates_institution_idx ON public.document_templates(institution_id);
CREATE INDEX IF NOT EXISTS document_templates_kind_idx ON public.document_templates(kind);

CREATE TABLE IF NOT EXISTS public.program_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id TEXT NOT NULL,
  name TEXT NOT NULL,
  grade_label TEXT NOT NULL DEFAULT '',
  field_domain TEXT NOT NULL DEFAULT '',
  subjects_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  weekly_hours NUMERIC NOT NULL DEFAULT 0,
  feature_coaching BOOLEAN NOT NULL DEFAULT TRUE,
  feature_trials BOOLEAN NOT NULL DEFAULT TRUE,
  feature_etut BOOLEAN NOT NULL DEFAULT FALSE,
  feature_discipline BOOLEAN NOT NULL DEFAULT FALSE,
  camera_required BOOLEAN NOT NULL DEFAULT FALSE,
  price_numeric NUMERIC NOT NULL DEFAULT 0,
  contract_start_date DATE NULL,
  contract_end_date DATE NULL,
  pdf_template_id UUID NULL REFERENCES public.document_templates(id) ON DELETE SET NULL,
  contract_template_id UUID NULL REFERENCES public.document_templates(id) ON DELETE SET NULL,
  rules_template_id UUID NULL REFERENCES public.document_templates(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS program_packages_institution_idx ON public.program_packages(institution_id);

CREATE TABLE IF NOT EXISTS public.generated_contract_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id TEXT NOT NULL,
  student_id TEXT NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  program_package_id UUID NULL REFERENCES public.program_packages(id) ON DELETE SET NULL,
  primary_kind TEXT NOT NULL DEFAULT 'contract',
  source_template_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  merged_html TEXT NOT NULL,
  contract_number TEXT NOT NULL UNIQUE,
  verify_token TEXT NOT NULL UNIQUE,
  signing_token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'signed', 'void')),
  pdf_storage_path TEXT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS generated_contract_documents_student_idx ON public.generated_contract_documents(student_id);
CREATE INDEX IF NOT EXISTS generated_contract_documents_institution_idx ON public.generated_contract_documents(institution_id);
CREATE INDEX IF NOT EXISTS generated_contract_documents_verify_idx ON public.generated_contract_documents(verify_token);

CREATE TABLE IF NOT EXISTS public.contract_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.generated_contract_documents(id) ON DELETE CASCADE,
  signer_role TEXT NOT NULL DEFAULT 'veli',
  signature_png_base64 TEXT NULL,
  ip_address TEXT NULL,
  user_agent TEXT NULL,
  accepted_terms_at TIMESTAMPTZ NULL,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  device_hint TEXT NULL
);

CREATE INDEX IF NOT EXISTS contract_signatures_document_idx ON public.contract_signatures(document_id);

CREATE TABLE IF NOT EXISTS public.contract_automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  channels JSONB NOT NULL DEFAULT '["whatsapp"]'::jsonb,
  message_template TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institution_id, trigger_type)
);

CREATE INDEX IF NOT EXISTS contract_automation_rules_inst_idx ON public.contract_automation_rules(institution_id);

ALTER TABLE IF EXISTS public.students
  ADD COLUMN IF NOT EXISTS program_package_id UUID NULL REFERENCES public.program_packages(id) ON DELETE SET NULL;

COMMENT ON TABLE public.document_templates IS 'PDF/program/sözleşme/kurallar metin şablonları; {{degisken}} yer tutucuları';
COMMENT ON TABLE public.program_packages IS 'Kayıt paketi: şablon bağları ve özellik bayrakları';
COMMENT ON TABLE public.generated_contract_documents IS 'Üretilmiş belge geçmişi; verify_token ve signing_token';
COMMENT ON TABLE public.contract_signatures IS 'Veli dijital imza ve onay kaydı';
COMMENT ON COLUMN public.students.program_package_id IS 'Seçilen program paketi (sözleşme şablonları için)';
