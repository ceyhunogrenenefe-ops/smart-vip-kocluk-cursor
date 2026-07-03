-- GİRİŞ + koç listesi için minimum indeksler (Supabase SQL Editor).
-- Her satırı TEK TEK seçip Run — hepsini birden çalıştırmayın.

-- 1/3 — auth-login users lookup
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- 2/3 — koç ataması
CREATE INDEX IF NOT EXISTS idx_students_coach_id ON students (coach_id) WHERE coach_id IS NOT NULL;

-- 3/3 — öğrenci e-posta
CREATE INDEX IF NOT EXISTS idx_students_email ON students (email);
