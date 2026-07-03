w-- ⚠️ TÜM DOSYAYI TEK SEFERDE ÇALIŞTIRMAYIN — Supabase SQL Editor zaman aşımına uğrar.
-- Her blok ayrı sorgu olarak Run edin (bloklar arası 10–30 sn bekleyin).
-- Önce: sql/2026-07-01-perf-indexes-minimal.sql (3 adım, giriş için yeterli)

-- ── ADIM 1 (giriş hızı — en kritik) ──
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- ── ADIM 2 ──
CREATE INDEX IF NOT EXISTS idx_coaches_email ON coaches (email);

-- ── ADIM 3 ──
CREATE INDEX IF NOT EXISTS idx_students_email ON students (email);

-- ── ADIM 4 (koç öğrenci listesi) ──
CREATE INDEX IF NOT EXISTS idx_students_coach_id ON students (coach_id) WHERE coach_id IS NOT NULL;

-- ── ADIM 5 ──
CREATE INDEX IF NOT EXISTS idx_students_user_id ON students (user_id) WHERE user_id IS NOT NULL;

-- ── ADIM 6 ──
CREATE INDEX IF NOT EXISTS idx_students_institution_created ON students (institution_id, created_at DESC);

-- ── ADIM 7 ──
CREATE INDEX IF NOT EXISTS idx_users_institution_role_created ON users (institution_id, role, created_at DESC);

-- ── ADIM 8 (cron — küçük tablolar) ──
CREATE INDEX IF NOT EXISTS idx_weekly_entries_date_student ON weekly_entries (date, student_id);

-- ── ADIM 9 ──
CREATE INDEX IF NOT EXISTS idx_weekly_planner_date_student ON weekly_planner_entries (planner_date, student_id);

-- ── ADIM 10 ──
CREATE INDEX IF NOT EXISTS idx_class_weekly_slots_dow ON class_weekly_slots (day_of_week);

-- ── ADIM 11 ──
CREATE INDEX IF NOT EXISTS idx_message_logs_kind_date ON message_logs (kind, log_date);

-- teacher_lessons: zaten var → 2026-05-08-teacher-lessons.sql (teacher_lessons_date_status_idx)
-- ANALYZE: ayrı çalıştırın, gerekirse gece — tek tek:
--   ANALYZE users;
--   ANALYZE students;
