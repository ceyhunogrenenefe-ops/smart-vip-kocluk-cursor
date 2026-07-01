-- Supabase kaynak tüketimi: giriş, kullanıcı listesi ve cron sorguları için indeksler.
-- Supabase Dashboard → SQL Editor → Run (tek seferlik, güvenli: IF NOT EXISTS).

-- Giriş / e-posta eşleme (auth-login, coaches, users)
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users (lower(email));
CREATE INDEX IF NOT EXISTS idx_coaches_email_lower ON coaches (lower(email));
CREATE INDEX IF NOT EXISTS idx_students_email_lower ON students (lower(email));

-- Koç → öğrenci listesi (GET /users, GET /students)
CREATE INDEX IF NOT EXISTS idx_students_coach_id ON students (coach_id) WHERE coach_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_students_institution_created ON students (institution_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_institution_role_created ON users (institution_id, role, created_at DESC);

-- Öğrenci profil bağlama (JWT enrich, auth-login)
CREATE INDEX IF NOT EXISTS idx_students_user_id ON students (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_students_platform_user_id ON students (platform_user_id) WHERE platform_user_id IS NOT NULL;

-- Günlük rapor / cron hatırlatmaları
CREATE INDEX IF NOT EXISTS idx_weekly_entries_date_student ON weekly_entries (date, student_id);
CREATE INDEX IF NOT EXISTS idx_weekly_planner_date_student ON weekly_planner_entries (planner_date, student_id);
CREATE INDEX IF NOT EXISTS idx_teacher_lessons_date_status ON teacher_lessons (lesson_date, status);
CREATE INDEX IF NOT EXISTS idx_class_weekly_slots_dow ON class_weekly_slots (day_of_week);
CREATE INDEX IF NOT EXISTS idx_message_logs_kind_date ON message_logs (kind, log_date);

-- İstatistik güncelle (sorgu planlayıcı için)
ANALYZE users;
ANALYZE coaches;
ANALYZE students;
ANALYZE weekly_entries;
ANALYZE weekly_planner_entries;
ANALYZE teacher_lessons;
