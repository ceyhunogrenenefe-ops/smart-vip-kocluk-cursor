-- Profil düzenleme: öğretmen/koç her zaman düzenleyebilir (admin tekrar açmak zorunda değil)
-- Onay öncesi yayın akışı (published_snapshot) değişmez.

update public.teacher_profiles
set editing_enabled = true
where deleted_at is null
  and status not in ('passive', 'deleted')
  and editing_enabled = false;

comment on column public.teacher_profiles.editing_enabled is
  'Geriye uyum alanı. Düzenleme artık status (passive/deleted) ile kısıtlanır; onay sonrası otomatik açık kalır.';
