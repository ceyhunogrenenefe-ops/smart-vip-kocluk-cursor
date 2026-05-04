-- SaaS: created_by, managed_by_admin_id, admin_limits, coach_limits
-- users.id TEXT olan şemalar için (TEXT FK uyumlu)
-- Supabase SQL Editor'da çalıştırın.
--
-- Önceki yanlış CREATE ile boş tablolar oluştuysa (içleri boştu):
-- DROP TABLE IF EXISTS public.coach_limits CASCADE;
-- DROP TABLE IF EXISTS public.admin_limits CASCADE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'role'
  ) THEN
    NULL;
  END IF;
END $$;

ALTER TABLE IF EXISTS public.users
  ADD COLUMN IF NOT EXISTS created_by TEXT REFERENCES public.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE IF EXISTS public.coaches
  ADD COLUMN IF NOT EXISTS managed_by_admin_id TEXT REFERENCES public.users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.admin_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id TEXT NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  max_students INT NOT NULL DEFAULT 50 CHECK (max_students >= 0),
  max_coaches INT NOT NULL DEFAULT 10 CHECK (max_coaches >= 0),
  package_label TEXT DEFAULT 'professional',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_limits_admin_id_idx ON public.admin_limits(admin_id);

CREATE TABLE IF NOT EXISTS public.coach_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id TEXT NOT NULL UNIQUE,
  max_students INT NOT NULL DEFAULT 30 CHECK (max_students >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS coach_limits_coach_id_idx ON public.coach_limits(coach_id);

COMMENT ON COLUMN public.users.created_by IS 'Bu kullanıcı kaydını oluşturan kullanıcı (audit)';
COMMENT ON COLUMN public.coaches.managed_by_admin_id IS 'Kurum yöneticisi (users.role=admin) referansı';
COMMENT ON TABLE public.admin_limits IS 'Admin başına kurum öğrenci/koç üst limiti';
COMMENT ON TABLE public.coach_limits IS 'Koç başına öğrenci üst limiti (coach_id = coaches.id string)';
