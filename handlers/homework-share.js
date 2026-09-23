/**
 * Ödev paylaşım bağlantısı — /api/homework-share?token=...
 *
 * Oturum gerektirmez: gruba atılan bağlantıya tıklayan öğrenci ödevin ne olduğunu görür.
 * KİŞİSEL VERİ DÖNMEZ — öğrenci listesi, iletişim bilgisi, teslim durumu burada yoktur.
 * Teslim için öğrencinin panele girmesi gerekir.
 */
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { isHomeworkModuleEnabled } from '../api/_lib/homework-module.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  const token = String(req.query?.token || '').trim();
  if (!token || token.length < 20) return res.status(400).json({ error: 'token_required' });

  try {
    const { data: hw, error } = await supabaseAdmin
      .from('edu_homework')
      .select(
        'id, title, description, subject_name, topic_label, target_question_count, target_minutes, resource_url, due_date, status, share_expires_at, institution_id, lesson_row_id'
      )
      .eq('share_token', token)
      .maybeSingle();
    if (error) throw error;
    if (!hw) return res.status(404).json({ error: 'not_found' });

    if (String(hw.status || '') !== 'published') {
      return res.status(404).json({ error: 'not_published' });
    }
    if (hw.share_expires_at && new Date(hw.share_expires_at).getTime() < Date.now()) {
      return res.status(410).json({ error: 'link_expired', message: 'Bu ödev bağlantısının süresi doldu.' });
    }

    let institutionId = hw.institution_id ? String(hw.institution_id) : '';
    if (!institutionId && hw.lesson_row_id) {
      const { data: row } = await supabaseAdmin
        .from('edu_lesson_rows')
        .select('institution_id')
        .eq('id', hw.lesson_row_id)
        .maybeSingle();
      institutionId = row?.institution_id ? String(row.institution_id) : '';
    }
    if (!(await isHomeworkModuleEnabled(institutionId))) {
      return res.status(404).json({ error: 'not_found' });
    }

    let institutionName = null;
    if (institutionId) {
      const { data: inst } = await supabaseAdmin
        .from('institutions')
        .select('name')
        .eq('id', institutionId)
        .maybeSingle();
      institutionName = inst?.name || null;
    }

    return res.status(200).json({
      data: {
        homework_id: hw.id,
        title: hw.title,
        description: hw.description,
        subject_name: hw.subject_name,
        topic_label: hw.topic_label,
        target_question_count: hw.target_question_count,
        target_minutes: hw.target_minutes,
        resource_url: hw.resource_url,
        due_date: hw.due_date,
        institution_name: institutionName
      }
    });
  } catch (e) {
    console.error('[homework-share]', e instanceof Error ? e.message : e);
    return res.status(500).json({ error: 'server_error' });
  }
}
