/**
 * Deneme takvimi — tanıtım sitesi için genel okuma ucu.
 *
 * onlinevipdershane.com'daki Deneme Kulübü sayfaları takvimi buradan okur.
 * Takvim panelde tek yerde yönetilir; sitede ikinci bir kopya tutulmaz, tarih
 * panelde değişince site de değişir.
 *
 * Yetki istemez ama yalnız OKUR ve yalnız takvimin kamuya açık alanlarını
 * döner: sınıf, sıra no, yayın, tarih, zorluk, içerik. Öğrenci, kurum ya da
 * başka hiçbir kişisel veri bu uçtan çıkmaz.
 */
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import {
  EXAM_CALENDAR_LEVELS,
  EXAM_CALENDAR_LEVEL_LABELS,
  examCalendarInstitutionId
} from '../api/_lib/exam-calendar.js';

/** Siteden okunduğu için izinli kaynaklar sabit; joker (*) kullanılmaz. */
const ALLOWED_ORIGINS = new Set([
  'https://onlinevipdershane.com',
  'https://www.onlinevipdershane.com',
  'https://dersonlinevipkocluk.com',
  'https://www.dersonlinevipkocluk.com'
]);

function applyCors(req, res) {
  const origin = String(req.headers?.origin || '').trim();
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  try {
    const institutionId = examCalendarInstitutionId(null);
    const wanted = String(req.query?.level || '').trim().toLocaleLowerCase('tr-TR');
    const level = EXAM_CALENDAR_LEVELS.includes(wanted) ? wanted : null;

    let q = supabaseAdmin
      .from('exam_calendar')
      .select('level, exam_no, publisher, exam_date, difficulty, content, sort_order')
      .eq('institution_id', institutionId)
      .order('exam_date', { ascending: true })
      .limit(2000);
    if (level) q = q.eq('level', level);

    const { data, error } = await q;
    if (error) throw error;

    const rows = (data || []).map((r) => ({
      level: r.level,
      exam_no: r.exam_no,
      publisher: r.publisher,
      exam_date: r.exam_date,
      difficulty: r.difficulty,
      content: r.content
    }));

    /** Sınıf bazlı sayılar — site kartlarında "x deneme" yazabilsin */
    const counts = {};
    for (const l of EXAM_CALENDAR_LEVELS) counts[l] = 0;
    for (const r of rows) {
      if (counts[r.level] != null) counts[r.level] += 1;
    }

    // Takvim gün gün değişmiyor; kenarda 10 dk tutulur, arka planda tazelenir
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
    return res.status(200).json({
      ok: true,
      level,
      levels: EXAM_CALENDAR_LEVELS,
      level_labels: EXAM_CALENDAR_LEVEL_LABELS,
      counts: level ? { [level]: counts[level] || 0 } : counts,
      data: rows
    });
  } catch (e) {
    console.warn('[public-exam-calendar]', errorMessage(e));
    return res.status(500).json({ error: 'server_error' });
  }
}
