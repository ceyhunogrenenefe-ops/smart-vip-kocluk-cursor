-- Excel tahtası (KESİN KAYIT + TAKİP) — idempotent
-- Önce 2026-08-17-registration-tracking.sql çalışmış olmalı.

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'YAĞIZ MEHMET', 'TÜRKER', 'grade_9', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'grade_9'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('YAĞIZ MEHMET TÜRKER'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'ABDULSAMET', 'OLGUN', 'grade_9', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'grade_9'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('ABDULSAMET OLGUN'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'Mehmet Yaman', 'Gültekin', 'grade_10', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'grade_10'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('Mehmet Yaman Gültekin'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'CEYLİN', 'OKUMUŞ', 'grade_10', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'grade_10'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('CEYLİN OKUMUŞ'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'MERVE BURCU', 'KÖSE', 'grade_10', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'grade_10'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('MERVE BURCU KÖSE'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'ECEMNAZ', 'SEVİMLİ', 'grade_10', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'grade_10'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('ECEMNAZ SEVİMLİ'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'MEHMET EMRE', 'BAYKARA', 'grade_10', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'grade_10'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('MEHMET EMRE BAYKARA'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'HALİL İBRAHİM', 'AKTAŞ', 'grade_10', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'grade_10'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('HALİL İBRAHİM AKTAŞ'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'MUSTAFA EFE', 'YILDIRIM', 'grade_10', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'grade_10'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('MUSTAFA EFE YILDIRIM'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'TUANA ELİF', 'YILDIZ', 'grade_10', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'grade_10'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('TUANA ELİF YILDIZ'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'CEYLİN', 'SOMYÜREK', 'grade_10', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'grade_10'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('CEYLİN SOMYÜREK'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'ELA NUR', 'AYER', 'grade_10', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'grade_10'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('ELA NUR AYER'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'BAYRAM ÖMÜR', 'YILDIRIM', 'grade_11', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'grade_11'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('BAYRAM ÖMÜR YILDIRIM'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'CEMRE', 'ÇELİK', 'grade_11', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'grade_11'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('CEMRE ÇELİK'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'MELTEM', 'ACAR', 'grade_11', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'grade_11'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('MELTEM ACAR'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'ALİ İHSAN', 'URHAN', 'grade_11', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'grade_11'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('ALİ İHSAN URHAN'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'ASUDE', 'KÜLAHLI', 'grade_11', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'grade_11'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('ASUDE KÜLAHLI'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'AYŞE NAZ', 'BAŞARSLAN', 'grade_11', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'grade_11'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('AYŞE NAZ BAŞARSLAN'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'BEGÜM TÜRKHAN', 'KEYİF', 'grade_11', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'grade_11'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('BEGÜM TÜRKHAN KEYİF'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'BERRAK ECE', 'GÜMÜŞTAŞ', 'grade_11', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'grade_11'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('BERRAK ECE GÜMÜŞTAŞ'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'ECRİN', 'TAŞ', 'grade_11', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'grade_11'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('ECRİN TAŞ'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'EFE', 'KARACA', 'grade_11', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'grade_11'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('EFE KARACA'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'ERVA', 'KARACA', 'grade_11', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'grade_11'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('ERVA KARACA'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'EYLÜL NİSA', 'YILDIRIM', 'grade_11', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'grade_11'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('EYLÜL NİSA YILDIRIM'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'YAĞMUR', 'TUĞ', 'grade_11', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'grade_11'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('YAĞMUR TUĞ'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'ZEYNEP', 'ASLANHAN', 'grade_11', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'grade_11'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('ZEYNEP ASLANHAN'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'ZEYNEP ESLEM', 'BOZKURT', 'grade_11', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'grade_11'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('ZEYNEP ESLEM BOZKURT'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'AHMET RENAS', 'KORKUSUZ', 'yks', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'yks'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('AHMET RENAS KORKUSUZ'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'AJİTA', 'HASHİMİ', 'yks', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'yks'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('AJİTA HASHİMİ'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'BETÜL FATMA', 'ÖZCAN', 'yks', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'yks'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('BETÜL FATMA ÖZCAN'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'BURÇİN', 'BAYRAK', 'yks', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'yks'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('BURÇİN BAYRAK'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'HATİCE YAREN', 'AÇIKGÖZ', 'yks', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'yks'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('HATİCE YAREN AÇIKGÖZ'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'EFE', 'ÇONKAR', 'yks', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'yks'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('EFE ÇONKAR'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'M.EMİN', 'ATEŞ', 'yks', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'yks'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('M.EMİN ATEŞ'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'M.ORHUN', 'GEÇİMLİ', 'yks', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'yks'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('M.ORHUN GEÇİMLİ'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'NESİBE ESMA', 'YAVUZ', 'yks', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'yks'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('NESİBE ESMA YAVUZ'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'RAVZA BAHAR', 'BAYDAROĞLU', 'yks', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'yks'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('RAVZA BAHAR BAYDAROĞLU'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'VEDAT', 'PEHLİVAN', 'yks', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'yks'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('VEDAT PEHLİVAN'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'VİLDAN', 'KÖPRÜLÜ', 'yks', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'yks'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('VİLDAN KÖPRÜLÜ'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'ZEYNEP BETÜL', 'TIĞLI', 'yks', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'yks'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('ZEYNEP BETÜL TIĞLI'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'ADİL', 'DEMİRTAŞ', 'yks', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'yks'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('ADİL DEMİRTAŞ'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'ARİF FARUK', 'TÜFEKÇİ', 'yos', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'yos'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('ARİF FARUK TÜFEKÇİ'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'CEMİLE', 'YILDIZ', 'yos', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'yos'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('CEMİLE YILDIZ'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'FİRDEVS', 'GEBEL', 'yos', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'yos'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('FİRDEVS GEBEL'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'GÖKDENİZ', 'AYRAN', 'yos', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'yos'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('GÖKDENİZ AYRAN'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'HANSA YAĞMUR', 'ÇİÇEK', 'yos', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'yos'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('HANSA YAĞMUR ÇİÇEK'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'M.EMİN', 'ÇELENK', 'yos', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'yos'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('M.EMİN ÇELENK'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'NURSEREN FİLİZ', 'AKAR', 'yos', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'yos'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('NURSEREN FİLİZ AKAR'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'VEHBİ', 'HOCAOĞLU', 'yos', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'yos'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('VEHBİ HOCAOĞLU'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'YAVUZ SELİM', 'DOS', 'yos', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'yos'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('YAVUZ SELİM DOS'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'YUSUF FURKAN', 'DURNA', 'yos', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'yos'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('YUSUF FURKAN DURNA'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'ZEHRA', 'ÜLKER', 'yos', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'yos'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('ZEHRA ÜLKER'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'AYÇA', 'ÇETİNER', 'private_lesson', 'confirmed', 'confirmed', 'hot', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', now()
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'private_lesson'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('AYÇA ÇETİNER'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'AYŞE SENA', 'TUNCER', 'grade_9', 'tracking', 'new_lead', 'warm', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'grade_9'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('AYŞE SENA TUNCER'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'KEREM', 'DEMİR', 'grade_9', 'tracking', 'new_lead', 'warm', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'grade_9'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('KEREM DEMİR'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'MESUDE', 'OLGUN', 'grade_9', 'tracking', 'new_lead', 'warm', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'grade_9'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('MESUDE OLGUN'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'GÜLSÜM ELİF', 'EKŞİOĞLU', 'grade_10', 'tracking', 'new_lead', 'warm', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'grade_10'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('GÜLSÜM ELİF EKŞİOĞLU'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'MERT ASLAN', 'YILDIZ', 'grade_10', 'tracking', 'new_lead', 'warm', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'grade_10'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('MERT ASLAN YILDIZ'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'EKİN', 'SEVİNÇ', 'grade_10', 'tracking', 'new_lead', 'warm', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'grade_10'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('EKİN SEVİNÇ'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'MELİS', 'OKUTURLAR', 'grade_10', 'tracking', 'new_lead', 'warm', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'grade_10'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('MELİS OKUTURLAR'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'CANSU ILGIN', 'AKÇA', 'grade_11', 'tracking', 'new_lead', 'warm', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'grade_11'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('CANSU ILGIN AKÇA'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'BENGİSU ELİF', 'ARDIÇ', 'grade_11', 'tracking', 'new_lead', 'warm', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'grade_11'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('BENGİSU ELİF ARDIÇ'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'HAMZA', 'SAKA', 'grade_11', 'tracking', 'new_lead', 'warm', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'grade_11'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('HAMZA SAKA'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'M.FURKAN', 'BİLEN', 'grade_11', 'tracking', 'new_lead', 'warm', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'grade_11'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('M.FURKAN BİLEN'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'SALİH KEREM', 'EKİCİ', 'grade_11', 'tracking', 'new_lead', 'warm', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'grade_11'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('SALİH KEREM EKİCİ'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'ZEYNEP BERRA', 'GÖKÇE', 'grade_11', 'tracking', 'new_lead', 'warm', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'grade_11'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('ZEYNEP BERRA GÖKÇE'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'ZÜBEYDE BADE', 'MERSİN', 'grade_11', 'tracking', 'new_lead', 'warm', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'grade_11'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('ZÜBEYDE BADE MERSİN'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'DİLA', 'ÖZTÜRK', 'yks', 'tracking', 'new_lead', 'warm', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'yks'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('DİLA ÖZTÜRK'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'BELİZ', 'KIZILYÜCE', 'private_lesson', 'tracking', 'new_lead', 'warm', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'private_lesson'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('BELİZ KIZILYÜCE'))
);

INSERT INTO registration_leads (institution_id, academic_period_key, first_name, last_name, grade_program, primary_status, stage, temperature, source, notes, confirmed_at)
SELECT '73323d75-eea1-4552-8bba-d50555423589', '2026-2027', 'BELEN', 'RODOPLU', 'private_lesson', 'tracking', 'new_lead', 'warm', 'excel_board_2026_08', 'Excel kayıt tahtasından aktarıldı', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM registration_leads x
  WHERE x.institution_id = '73323d75-eea1-4552-8bba-d50555423589' AND x.deleted_at IS NULL
    AND x.grade_program = 'private_lesson'
    AND lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim('BELEN RODOPLU'))
);

NOTIFY pgrst, 'reload schema';
