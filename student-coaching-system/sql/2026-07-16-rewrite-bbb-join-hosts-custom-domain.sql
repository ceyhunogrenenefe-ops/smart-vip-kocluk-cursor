-- BBB özel alan adı: kayıtlı join URL host'larını güncelle
-- Yalnızca host değişir; path (/bigbluebutton/Ceyhun01/...) korunur.
-- Vercel BBB_API_ENDPOINT örneği:
--   https://ders.dersonlinevipkocluk.com/bigbluebutton/Ceyhun01/
-- Supabase SQL Editor'da çalıştırın.

BEGIN;

-- Önizleme (çalıştırmadan önce bakın):
-- SELECT id, meeting_link FROM class_sessions
-- WHERE meeting_link ~* 'meetingID=' AND meeting_link !~* 'ders\.dersonlinevipkocluk\.com'
-- LIMIT 20;

UPDATE class_sessions
SET
  meeting_link = regexp_replace(meeting_link, '^https?://[^/?#]+', 'https://ders.dersonlinevipkocluk.com'),
  meeting_link_moderator = CASE
    WHEN meeting_link_moderator IS NULL OR btrim(meeting_link_moderator) = '' THEN meeting_link_moderator
    WHEN meeting_link_moderator ~* 'meetingID=' OR meeting_link_moderator ~* '/join'
      THEN regexp_replace(meeting_link_moderator, '^https?://[^/?#]+', 'https://ders.dersonlinevipkocluk.com')
    ELSE meeting_link_moderator
  END
WHERE
  (meeting_link ~* 'meetingID=' OR meeting_link ~* '/join' OR meeting_link ~* 'bigbluebutton|biggerbluebutton')
  AND meeting_link !~* 'ders\.dersonlinevipkocluk\.com';

UPDATE class_weekly_slots
SET
  meeting_link = regexp_replace(meeting_link, '^https?://[^/?#]+', 'https://ders.dersonlinevipkocluk.com'),
  meeting_link_moderator = CASE
    WHEN meeting_link_moderator IS NULL OR btrim(meeting_link_moderator) = '' THEN meeting_link_moderator
    WHEN meeting_link_moderator ~* 'meetingID=' OR meeting_link_moderator ~* '/join'
      THEN regexp_replace(meeting_link_moderator, '^https?://[^/?#]+', 'https://ders.dersonlinevipkocluk.com')
    ELSE meeting_link_moderator
  END
WHERE
  meeting_link IS NOT NULL
  AND btrim(meeting_link) <> ''
  AND meeting_link <> 'bbb:auto'
  AND (meeting_link ~* 'meetingID=' OR meeting_link ~* '/join' OR meeting_link ~* 'bigbluebutton|biggerbluebutton')
  AND meeting_link !~* 'ders\.dersonlinevipkocluk\.com';

UPDATE teacher_lessons
SET
  meeting_link = regexp_replace(meeting_link, '^https?://[^/?#]+', 'https://ders.dersonlinevipkocluk.com'),
  meeting_link_moderator = CASE
    WHEN meeting_link_moderator IS NULL OR btrim(meeting_link_moderator) = '' THEN meeting_link_moderator
    WHEN meeting_link_moderator ~* 'meetingID=' OR meeting_link_moderator ~* '/join'
      THEN regexp_replace(meeting_link_moderator, '^https?://[^/?#]+', 'https://ders.dersonlinevipkocluk.com')
    ELSE meeting_link_moderator
  END
WHERE
  meeting_link IS NOT NULL
  AND btrim(meeting_link) <> ''
  AND meeting_link <> 'bbb:auto'
  AND (meeting_link ~* 'meetingID=' OR meeting_link ~* '/join' OR meeting_link ~* 'bigbluebutton|biggerbluebutton')
  AND meeting_link !~* 'ders\.dersonlinevipkocluk\.com';

UPDATE meetings
SET
  meet_link = CASE
    WHEN meet_link ~* 'meetingID=' OR meet_link ~* 'bigbluebutton|biggerbluebutton'
      THEN regexp_replace(meet_link, '^https?://[^/?#]+', 'https://ders.dersonlinevipkocluk.com')
    ELSE meet_link
  END,
  link_bbb = CASE
    WHEN link_bbb IS NULL OR btrim(link_bbb) = '' THEN link_bbb
    WHEN link_bbb ~* 'meetingID=' OR link_bbb ~* 'bigbluebutton|biggerbluebutton'
      THEN regexp_replace(link_bbb, '^https?://[^/?#]+', 'https://ders.dersonlinevipkocluk.com')
    ELSE link_bbb
  END
WHERE
  (meet_link ~* 'meetingID=' OR meet_link ~* 'bigbluebutton|biggerbluebutton'
    OR link_bbb ~* 'meetingID=' OR link_bbb ~* 'bigbluebutton|biggerbluebutton')
  AND (
    meet_link !~* 'ders\.dersonlinevipkocluk\.com'
    OR COALESCE(link_bbb, '') !~* 'ders\.dersonlinevipkocluk\.com'
  );

UPDATE institution_events
SET meeting_link = regexp_replace(meeting_link, '^https?://[^/?#]+', 'https://ders.dersonlinevipkocluk.com')
WHERE
  meeting_link IS NOT NULL
  AND btrim(meeting_link) <> ''
  AND (meeting_link ~* 'meetingID=' OR meeting_link ~* 'bigbluebutton|biggerbluebutton')
  AND meeting_link !~* 'ders\.dersonlinevipkocluk\.com';

COMMIT;
