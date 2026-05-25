-- topic_progress.student_id: students.id text ile uyumlu (uuid migration hatası düzeltmesi)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'topic_progress'
      AND column_name = 'student_id'
      AND udt_name = 'uuid'
  ) THEN
    ALTER TABLE public.topic_progress DROP CONSTRAINT IF EXISTS topic_progress_student_id_fkey;
    ALTER TABLE public.topic_progress
      ALTER COLUMN student_id TYPE text USING student_id::text;
    ALTER TABLE public.topic_progress
      ADD CONSTRAINT topic_progress_student_id_fkey
      FOREIGN KEY (student_id) REFERENCES public.students (id) ON DELETE CASCADE;
  END IF;
END $$;
