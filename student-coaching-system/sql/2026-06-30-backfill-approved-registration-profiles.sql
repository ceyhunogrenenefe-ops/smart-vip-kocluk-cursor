-- Onaylanmis self-registration kayitlarindan students profil alanlarini geri doldur.
-- Supabase SQL Editor'de bir kez calistirin.

update public.students s
set
  parent_name = coalesce(nullif(trim(s.parent_name), ''), p.parent_name),
  parent_phone = coalesce(nullif(trim(s.parent_phone), ''), p.parent_phone_e164),
  birth_date = coalesce(s.birth_date, p.birth_date),
  class_level = coalesce(nullif(trim(s.class_level), ''), p.class_level),
  branch = coalesce(nullif(trim(s.branch), ''), p.branch),
  school = coalesce(nullif(trim(s.school), ''), p.branch),
  tc_identity_no = coalesce(nullif(trim(s.tc_identity_no), ''), p.tc_identity_no),
  user_id = coalesce(s.user_id, p.approved_user_id),
  platform_user_id = coalesce(s.platform_user_id, p.approved_user_id),
  updated_at = now()
from public.pending_registrations p
where p.status = 'approved'
  and p.approved_user_id is not null
  and (
    lower(s.email) = lower(p.email)
    or s.user_id = p.approved_user_id
    or s.platform_user_id = p.approved_user_id
  );

notify pgrst, 'reload schema';
