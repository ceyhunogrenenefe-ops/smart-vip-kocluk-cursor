-- Kurumsuz (institution_id null) Canlı Grup sınıflarını oluşturan kullanıcının kurumuna bağla.
-- Örn. «YILDIZLAR YKS GRUBU» süper admin ile kurumsuz oluşturulmuşsa düzeltir.
-- NOT: classes.institution_id = uuid, users.institution_id = text (institutions.id)
UPDATE classes c
SET institution_id = u.institution_id::uuid
FROM users u
WHERE c.institution_id IS NULL
  AND c.created_by IS NOT NULL
  AND u.id = c.created_by
  AND u.institution_id IS NOT NULL
  AND btrim(u.institution_id) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

NOTIFY pgrst, 'reload schema';
