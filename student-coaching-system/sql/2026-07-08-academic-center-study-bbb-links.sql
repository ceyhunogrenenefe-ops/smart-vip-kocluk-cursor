-- Akademik Merkez: tüm etüt sınıfları → BBB otomatik (bbb:auto)

CREATE OR REPLACE FUNCTION public.patch_academic_study_bbb_links(links jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  bbb jsonb := '{"class56":"bbb:auto","class78":"bbb:auto","class911":"bbb:auto","yks":"bbb:auto"}'::jsonb;
  result jsonb;
  inst_key text;
BEGIN
  result := COALESCE(links, '{}'::jsonb);

  -- Eski düz format: { studyClasses, exams, questionPools }
  IF result ? 'studyClasses' AND NOT (result ? 'default') THEN
    RETURN jsonb_set(result, '{studyClasses}', bbb, true);
  END IF;

  -- Yeni store: { default, byInstitution }
  IF result ? 'default' THEN
    result := jsonb_set(result, '{default,studyClasses}', bbb, true);
  ELSE
    result := jsonb_set(
      result,
      '{default}',
      jsonb_build_object(
        'studyClasses', bbb,
        'exams', COALESCE(result->'exams', '{}'::jsonb),
        'questionPools', COALESCE(result->'questionPools', '{}'::jsonb)
      ),
      true
    );
  END IF;

  IF result ? 'byInstitution' AND jsonb_typeof(result->'byInstitution') = 'object' THEN
    FOR inst_key IN SELECT jsonb_object_keys(result->'byInstitution')
    LOOP
      result := jsonb_set(result, ARRAY['byInstitution', inst_key, 'studyClasses'], bbb, true);
    END LOOP;
  END IF;

  RETURN result;
END;
$$;

INSERT INTO public.platform_academic_center_links (id, links, payload, updated_at)
VALUES (
  1,
  public.patch_academic_study_bbb_links('{}'::jsonb),
  public.patch_academic_study_bbb_links('{}'::jsonb),
  now()
)
ON CONFLICT (id) DO UPDATE
SET
  links = public.patch_academic_study_bbb_links(
    COALESCE(platform_academic_center_links.links, platform_academic_center_links.payload, '{}'::jsonb)
  ),
  payload = public.patch_academic_study_bbb_links(
    COALESCE(platform_academic_center_links.links, platform_academic_center_links.payload, '{}'::jsonb)
  ),
  updated_at = now();

COMMENT ON FUNCTION public.patch_academic_study_bbb_links IS 'Akademik Merkez etüt sınıflarını bbb:auto yapar (5-6, 7-8, 9-10-11, YKS).';
