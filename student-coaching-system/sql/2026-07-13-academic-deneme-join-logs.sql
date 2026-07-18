-- Akademik Merkez BBB deneme/etüt join anı (academic-center-bbb-join)

CREATE TABLE IF NOT EXISTS public.academic_deneme_join_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id TEXT REFERENCES public.students (id) ON DELETE SET NULL,
  user_id TEXT REFERENCES public.users (id) ON DELETE SET NULL,
  institution_id TEXT,
  room TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'exam'
    CHECK (kind IN ('exam', 'study')),
  meeting_id TEXT,
  display_name TEXT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  istanbul_date DATE NOT NULL DEFAULT ((timezone('Europe/Istanbul', now()))::date)
);

CREATE INDEX IF NOT EXISTS academic_deneme_join_logs_student_date_idx
  ON public.academic_deneme_join_logs (student_id, istanbul_date);

CREATE INDEX IF NOT EXISTS academic_deneme_join_logs_inst_date_kind_idx
  ON public.academic_deneme_join_logs (institution_id, istanbul_date, kind);

CREATE INDEX IF NOT EXISTS academic_deneme_join_logs_kind_date_idx
  ON public.academic_deneme_join_logs (kind, istanbul_date);

COMMENT ON TABLE public.academic_deneme_join_logs IS
  'Akademik Merkez BBB deneme/etüt join anı — koç istatistik deneme oda giriş oranı.';

NOTIFY pgrst, 'reload schema';
