import { supabaseAdmin } from './supabase-admin.js';
import { youtubeNocookieEmbedUrl } from './video-solution-youtube.js';
import {
  VIDEO_SOLUTION_QUESTIONS_TABLE,
  VIDEO_SOLUTION_SETS_TABLE
} from './video-solution-schema.js';

/** Kamuya açık set + soru yanıtı; taslak/arşiv null döner. */
export async function fetchPublishedVideoSolutionBySlug(slug) {
  const s = String(slug || '').trim();
  if (!s) return null;

  const { data: setRow, error: se } = await supabaseAdmin
    .from(VIDEO_SOLUTION_SETS_TABLE)
    .select(
      'id,slug,school_year,grade_level,subject,term,exam_number,work_type,title,description,status,institution_id'
    )
    .eq('slug', s)
    .eq('status', 'published')
    .maybeSingle();
  if (se) throw se;
  if (!setRow) return null;

  const { data: qs, error: qe } = await supabaseAdmin
    .from(VIDEO_SOLUTION_QUESTIONS_TABLE)
    .select('question_number,title,topic,youtube_video_id,status,sort_order')
    .eq('set_id', setRow.id)
    .eq('status', 'published')
    .order('sort_order', { ascending: true })
    .order('question_number', { ascending: true });
  if (qe) throw qe;

  return {
    set: {
      slug: setRow.slug,
      school_year: setRow.school_year,
      grade_level: setRow.grade_level,
      subject: setRow.subject,
      term: setRow.term,
      exam_number: setRow.exam_number,
      work_type: setRow.work_type,
      title: setRow.title,
      description: setRow.description,
      institution_id: setRow.institution_id
    },
    questions: (qs || []).map((q) => ({
      question_number: q.question_number,
      title: q.title,
      topic: q.topic,
      embed_url: youtubeNocookieEmbedUrl(q.youtube_video_id)
    }))
  };
}
