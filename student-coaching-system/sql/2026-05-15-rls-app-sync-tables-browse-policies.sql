-- Tarayıcıdan doğrudan PostgREST (anon / authenticated) ile yazılan tablolar:
-- RLS açıksa ve politika yoksa INSERT/UPDATE reddedilir.
-- Bu projede çoğu veri /api + service role ile gider; bu dört tablo istemciden upsert ediliyor.
-- Güvenlik: anon key zaten client’ta public; ince RLS için ileride JWT claims veya yalnızca /api’ye taşıyın.

-- ---------- institution_written_exam_prefs ----------
alter table if exists public.institution_written_exam_prefs enable row level security;

drop policy if exists "institution_written_exam_prefs_all_anon_auth" on public.institution_written_exam_prefs;
create policy "institution_written_exam_prefs_all_anon_auth"
  on public.institution_written_exam_prefs
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- ---------- reading_logs ----------
alter table if exists public.reading_logs enable row level security;

drop policy if exists "reading_logs_all_anon_auth" on public.reading_logs;
create policy "reading_logs_all_anon_auth"
  on public.reading_logs
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- ---------- ai_coach_suggestions ----------
alter table if exists public.ai_coach_suggestions enable row level security;

drop policy if exists "ai_coach_suggestions_all_anon_auth" on public.ai_coach_suggestions;
create policy "ai_coach_suggestions_all_anon_auth"
  on public.ai_coach_suggestions
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- ---------- exam_results (app_payload ile istemci upsert) ----------
alter table if exists public.exam_results enable row level security;

drop policy if exists "exam_results_all_anon_auth" on public.exam_results;
create policy "exam_results_all_anon_auth"
  on public.exam_results
  for all
  to anon, authenticated
  using (true)
  with check (true);
