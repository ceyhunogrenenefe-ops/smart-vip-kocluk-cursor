/**
 * WhatsApp / n8n → Soru Sor webhook
 * POST body: { phone, caption, image_base64?, image_url?, institution_id? }
 */
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import {
  uploadQuestionAsset,
  notifyTeachersNewQuestion,
  storagePathForQuestion
} from '../api/_lib/question-help.js';

function parseCaption(text) {
  const raw = String(text || '').trim();
  const lower = raw.toLocaleLowerCase('tr-TR');
  const aliases = {
    mat: 'Matematik',
    matematik: 'Matematik',
    turkce: 'Türkçe',
    türkçe: 'Türkçe',
    fen: 'Fen Bilimleri',
    fizik: 'Fizik',
    kimya: 'Kimya',
    biyoloji: 'Biyoloji',
    geometri: 'Geometri',
    tarih: 'Tarih',
    cografya: 'Coğrafya',
    coğrafya: 'Coğrafya',
    edebiyat: 'Edebiyat',
    felsefe: 'Felsefe',
    ingilizce: 'İngilizce',
    inkilap: 'İnkılap Tarihi',
    din: 'Din Kültürü'
  };
  let grade = null;
  if (/\blgs\b/i.test(raw)) grade = 'LGS';
  else if (/\btyt\b/i.test(raw)) grade = 'TYT';
  else if (/\bayt\b/i.test(raw)) grade = 'AYT';
  else {
    const m = raw.match(/\b(3|4|5|6|7|8|9|10|11|12)\b/);
    if (m) grade = m[1];
  }
  let subject = null;
  for (const [k, v] of Object.entries(aliases)) {
    if (lower.includes(k)) {
      subject = v;
      break;
    }
  }
  return { subject, grade, raw };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const secret = process.env.QUESTION_HELP_WEBHOOK_SECRET || process.env.CRON_SECRET || '';
  const hdr = String(req.headers['x-webhook-secret'] || req.headers['authorization'] || '').replace(
    /^Bearer\s+/i,
    ''
  );
  if (secret && hdr !== secret) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    const body = req.body || {};
    const phone = String(body.phone || body.from || '').replace(/\D/g, '');
    const caption = String(body.caption || body.message || body.text || '').trim();
    const parsed = parseCaption(caption);

    if (!parsed.subject || !parsed.grade) {
      return res.status(400).json({
        error: 'parse_failed',
        hint: 'Örnek: Matematik 12, LGS Fen, TYT Fizik',
        parsed
      });
    }

    let student = null;
    if (body.student_id) {
      const { data } = await supabaseAdmin
        .from('students')
        .select('id, institution_id')
        .eq('id', body.student_id)
        .maybeSingle();
      student = data;
    } else if (phone.length >= 10) {
      const tail = phone.slice(-10);
      const { data: rows } = await supabaseAdmin
        .from('students')
        .select('id, institution_id, phone, parent_phone')
        .or(`phone.ilike.%${tail},parent_phone.ilike.%${tail}`)
        .limit(1);
      student = rows?.[0] || null;
    }

    if (!student?.id) {
      return res.status(404).json({ error: 'student_not_found_by_phone' });
    }

    let imageUrl = body.image_url || null;
    if (body.image_base64) {
      imageUrl = await uploadQuestionAsset({
        base64: body.image_base64,
        mime: body.image_mime || 'image/jpeg',
        path: storagePathForQuestion(student.id, 'jpg')
      });
    }
    if (!imageUrl) return res.status(400).json({ error: 'image_required' });

    const row = {
      institution_id: body.institution_id || student.institution_id || null,
      student_id: student.id,
      subject: parsed.subject,
      grade: parsed.grade,
      topic: body.topic || null,
      description: parsed.raw || caption,
      image_url: imageUrl,
      status: 'waiting',
      source: 'whatsapp',
      ai_metadata: { parser: 'whatsapp', caption }
    };

    const { data, error } = await supabaseAdmin.from('questions').insert(row).select().single();
    if (error) throw error;

    await notifyTeachersNewQuestion(data);
    return res.status(200).json({ ok: true, data });
  } catch (e) {
    console.error('[question-help-webhook]', errorMessage(e));
    return res.status(500).json({ error: errorMessage(e) });
  }
}
