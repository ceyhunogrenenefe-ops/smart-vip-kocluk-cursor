-- Akademik Merkez: Lise Deneme Sınavı giriş → Zoom

CREATE OR REPLACE FUNCTION public.patch_academic_lise_deneme_zoom(links jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  zoom text := 'https://us06web.zoom.us/j/3565095951?pwd=Rk56NGhXeEYrZkZOWEVVbG5pa0RjUT09';
  result jsonb;
  inst_key text;
BEGIN
  result := COALESCE(links, '{}'::jsonb);

  IF result ? 'exams' AND NOT (result ? 'default') THEN
    result := jsonb_set(result, '{exams,lise}', to_jsonb(zoom), true);
    IF result->'exams' ? 'exam' THEN
      result := jsonb_set(result, '{exams,exam}', to_jsonb(zoom), true);
    END IF;
    RETURN result;
  END IF;

  IF result ? 'default' THEN
    result := jsonb_set(result, '{default,exams,lise}', to_jsonb(zoom), true);
    IF result->'default'->'exams' ? 'exam' THEN
      result := jsonb_set(result, '{default,exams,exam}', to_jsonb(zoom), true);
    END IF;
  ELSE
    result := jsonb_set(
      result,
      '{default}',
      jsonb_build_object(
        'studyClasses', COALESCE(result->'studyClasses', '{}'::jsonb),
        'exams', jsonb_build_object('lise', zoom),
        'questionPools', COALESCE(result->'questionPools', '{}'::jsonb)
      ),
      true
    );
  END IF;

  IF result ? 'byInstitution' AND jsonb_typeof(result->'byInstitution') = 'object' THEN
    FOR inst_key IN SELECT jsonb_object_keys(result->'byInstitution')
    LOOP
      result := jsonb_set(result, ARRAY['byInstitution', inst_key, 'exams', 'lise'], to_jsonb(zoom), true);
    END LOOP;
  END IF;

  RETURN result;
END;
$$;

INSERT INTO public.platform_academic_center_links (id, links, payload, updated_at)
VALUES (
  1,
  public.patch_academic_lise_deneme_zoom('{}'::jsonb),
  public.patch_academic_lise_deneme_zoom('{}'::jsonb),
  now()
)
ON CONFLICT (id) DO UPDATE
SET
  links = public.patch_academic_lise_deneme_zoom(
    COALESCE(platform_academic_center_links.links, platform_academic_center_links.payload, '{}'::jsonb)
  ),
  payload = public.patch_academic_lise_deneme_zoom(
    COALESCE(platform_academic_center_links.links, platform_academic_center_links.payload, '{}'::jsonb)
  ),
  updated_at = now();

COMMENT ON FUNCTION public.patch_academic_lise_deneme_zoom IS 'Akademik Merkez Lise Deneme Sınavı giriş Zoom linki.';
