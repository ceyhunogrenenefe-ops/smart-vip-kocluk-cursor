/**
 * Öğrenciye özel sonuç karnesi. Token başkasının karnesini açmaz.
 * GET /api/deneme-exam-karne?token=
 */
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { examTitle, formatTrDate, pickPublishedResult } from '../api/_lib/deneme-exam-notify-logic.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  const token = String(req.query?.token || '').trim();
  if (!token || token.length < 12 || token === 'test-onizleme') {
    return res.status(404).json({ error: 'karne_bulunamadi' });
  }
  try {
    const { data: row, error } = await supabaseAdmin
      .from('deneme_exam_notify_sends')
      .select('student_id, exam_id, result_id, step')
      .eq('karne_token', token)
      .eq('step', 'karne')
      .maybeSingle();
    if (error) throw error;
    if (!row || row.student_id === '__test__') return res.status(404).json({ error: 'karne_bulunamadi' });

    const [{ data: student }, { data: exam }] = await Promise.all([
      supabaseAdmin.from('students').select('id, name').eq('id', row.student_id).maybeSingle(),
      supabaseAdmin
        .from('exam_calendar')
        .select('id, level, publisher, exam_no, exam_date')
        .eq('id', row.exam_id)
        .maybeSingle()
    ]);

    let result = null;
    if (row.result_id) {
      const { data } = await supabaseAdmin
        .from('exam_results')
        .select('id, student_id, exam_name, date, net_score, correct, wrong, blank, raw_score')
        .eq('id', row.result_id)
        .eq('student_id', row.student_id)
        .maybeSingle();
      result = data;
    }
    if (!result && exam) {
      const { data } = await supabaseAdmin
        .from('exam_results')
        .select('id, student_id, exam_name, date, net_score, correct, wrong, blank, raw_score')
        .eq('student_id', row.student_id)
        .eq('date', String(exam.exam_date).slice(0, 10))
        .limit(20);
      result = pickPublishedResult(data || [], exam);
    }
    if (result && String(result.student_id) !== String(row.student_id)) {
      return res.status(404).json({ error: 'karne_bulunamadi' });
    }

    return res.status(200).json({
      student_name: student?.name || 'Öğrenci',
      exam_title: exam ? examTitle(exam) : 'Deneme sınavı',
      exam_date: exam ? formatTrDate(exam.exam_date) : '',
      result: result
        ? {
            exam_name: result.exam_name || null,
            date: formatTrDate(result.date),
            net_score: result.net_score,
            raw_score: result.raw_score,
            correct: result.correct,
            wrong: result.wrong,
            blank: result.blank
          }
        : null
    });
  } catch (e) {
    return res.status(500).json({ error: errorMessage(e) || 'failed' });
  }
}
