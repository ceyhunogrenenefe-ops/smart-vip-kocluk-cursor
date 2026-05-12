-- =============================================================================
-- İKİ KURUMA DÜŞÜR: Smart Koçluk + Online VIP Ders ve Koçluk
-- =============================================================================
-- Supabase → SQL Editor’da çalıştırın. Önce yedek / export alın.
--
-- Ne yapar?
-- 1) "Smart" ve "Online VIP" kurumlarını isimden bulur (veya VIP yoksa oluşturur).
-- 2) Bu iki kurum DIŞINDAKI tüm institution_id referanslarını SMART kuruma taşır
--    (öğrenci satırındaki veli adı/telefon/koç alanlarına DOKUNMAZ — sadece institution_id).
-- 3) Diğer kurum satırlarını siler.
--
-- Veli/koç bilgisi "kayboldu" hissi: çoğunlukla yanlış kurum seçimiyle liste boşalır;
-- bu script öğrencileri Smart’a bağlayınca panelde yeniden görünürler. Kolonlar DB’de
-- boşsa yalnızca yedekten veya elle doldurulabilir.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  smart_id text;
  vip_id   text;
  junk_id  text;
BEGIN
  -- Smart: önce tam eşleşme, sonra geniş eşleşme
  SELECT i.id INTO smart_id
  FROM public.institutions i
  WHERE i.name = 'Smart Koçluk Sistemi'
  LIMIT 1;
  IF smart_id IS NULL THEN
    SELECT i.id INTO smart_id
    FROM public.institutions i
    WHERE i.name ILIKE '%smart%koçluk%' OR i.name ILIKE '%smart kocluk%'
    ORDER BY i.created_at ASC NULLS LAST
    LIMIT 1;
  END IF;

  IF smart_id IS NULL THEN
    RAISE EXCEPTION 'Smart Koçluk kurumu bulunamadı. Önce en az bir kurum oluşturun veya adı "Smart Koçluk Sistemi" yapın.';
  END IF;

  -- İsimleri sabitle
  UPDATE public.institutions SET name = 'Smart Koçluk Sistemi', updated_at = now() WHERE id = smart_id;

  -- VIP: varsa bul, yoksa oluştur
  SELECT i.id INTO vip_id
  FROM public.institutions i
  WHERE i.id <> smart_id
    AND (
      i.name = 'Online VIP Ders ve Koçluk'
      OR i.name ILIKE '%online vip%ders%'
      OR i.name ILIKE '%vip ders%koçluk%'
    )
  ORDER BY i.created_at ASC NULLS LAST
  LIMIT 1;

  IF vip_id IS NULL THEN
    INSERT INTO public.institutions (name, email, phone, address, website, logo, plan, is_active, created_at, updated_at)
    VALUES (
      'Online VIP Ders ve Koçluk',
      'info@onlinevipders.com',
      '',
      'Türkiye',
      '',
      null,
      'enterprise',
      true,
      now(),
      now()
    )
    RETURNING id INTO vip_id;
  END IF;

  UPDATE public.institutions SET name = 'Online VIP Ders ve Koçluk', updated_at = now() WHERE id = vip_id;

  -- Referansları SMART’a taşı (iki kurum dışındaki tüm id’ler)
  UPDATE public.users SET institution_id = smart_id
  WHERE institution_id IS NOT NULL AND institution_id NOT IN (smart_id, vip_id);

  UPDATE public.students SET institution_id = smart_id
  WHERE institution_id IS NOT NULL AND institution_id NOT IN (smart_id, vip_id);

  UPDATE public.coaches SET institution_id = smart_id
  WHERE institution_id IS NOT NULL AND institution_id NOT IN (smart_id, vip_id);

  -- Aşağıdakiler bazı projelerde yok; yoksa atlanır (42P01 önlenir)
  IF to_regclass('public.weekly_entries') IS NOT NULL THEN
    EXECUTE format(
      'UPDATE public.weekly_entries SET institution_id = %L WHERE institution_id IS NOT NULL AND institution_id NOT IN (%L, %L)',
      smart_id, smart_id, vip_id
    );
  END IF;
  IF to_regclass('public.book_readings') IS NOT NULL THEN
    EXECUTE format(
      'UPDATE public.book_readings SET institution_id = %L WHERE institution_id IS NOT NULL AND institution_id NOT IN (%L, %L)',
      smart_id, smart_id, vip_id
    );
  END IF;
  IF to_regclass('public.written_exams') IS NOT NULL THEN
    EXECUTE format(
      'UPDATE public.written_exams SET institution_id = %L WHERE institution_id IS NOT NULL AND institution_id NOT IN (%L, %L)',
      smart_id, smart_id, vip_id
    );
  END IF;
  IF to_regclass('public.exam_results') IS NOT NULL THEN
    EXECUTE format(
      'UPDATE public.exam_results SET institution_id = %L WHERE institution_id IS NOT NULL AND institution_id NOT IN (%L, %L)',
      smart_id, smart_id, vip_id
    );
  END IF;

  -- Opsiyonel tablolar (yoksa hata vermemesi için)
  IF to_regclass('public.meetings') IS NOT NULL THEN
    EXECUTE format('UPDATE public.meetings SET institution_id = %L WHERE institution_id IS NOT NULL AND institution_id NOT IN (%L, %L)', smart_id, smart_id, vip_id);
  END IF;
  IF to_regclass('public.teacher_lessons') IS NOT NULL THEN
    EXECUTE format('UPDATE public.teacher_lessons SET institution_id = %L WHERE institution_id IS NOT NULL AND institution_id NOT IN (%L, %L)', smart_id, smart_id, vip_id);
  END IF;
  IF to_regclass('public.student_teacher_lesson_quota') IS NOT NULL THEN
    EXECUTE format('UPDATE public.student_teacher_lesson_quota SET institution_id = %L WHERE institution_id IS NOT NULL AND institution_id NOT IN (%L, %L)', smart_id, smart_id, vip_id);
  END IF;
  IF to_regclass('public.attendance_institution_prefs') IS NOT NULL THEN
    FOR junk_id IN SELECT institution_id FROM public.attendance_institution_prefs WHERE institution_id IS NOT NULL AND institution_id NOT IN (smart_id, vip_id)
    LOOP
      DELETE FROM public.attendance_institution_prefs WHERE institution_id = junk_id;
    END LOOP;
  END IF;

  -- classes / class_sessions: institution_id uuid olabilir; hata olursa atlanır
  IF to_regclass('public.classes') IS NOT NULL THEN
    BEGIN
      EXECUTE format(
        'UPDATE public.classes SET institution_id = %L::uuid WHERE institution_id IS NOT NULL AND institution_id::text NOT IN (%L, %L)',
        smart_id,
        smart_id,
        vip_id
      );
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END IF;
  IF to_regclass('public.class_sessions') IS NOT NULL THEN
    BEGIN
      EXECUTE format(
        'UPDATE public.class_sessions SET institution_id = %L::uuid WHERE institution_id IS NOT NULL AND institution_id::text NOT IN (%L, %L)',
        smart_id,
        smart_id,
        vip_id
      );
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END IF;

  DELETE FROM public.institutions WHERE id NOT IN (smart_id, vip_id);
END $$;

COMMIT;

-- Kontrol:
-- SELECT id, name FROM public.institutions ORDER BY name;
-- SELECT count(*) AS ogrenci, count(*) FILTER (WHERE parent_name IS NULL) AS veli_adi_bos FROM public.students;
