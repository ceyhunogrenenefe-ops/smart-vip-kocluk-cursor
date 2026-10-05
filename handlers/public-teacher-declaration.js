/**
 * Öğretmenin aylık çalışma formu — oturumsuz, token ile.
 *
 * Öğretmenler panele her zaman giremiyor; mesajdaki bağlantıyı açıp
 * doldurabilsinler diye bu uç oturum istemez. Bunun yerine her beyan için
 * öğretmene VE aya özel, tahmin edilemez bir anahtar üretilir. Anahtar
 * yalnız kendi beyanını açar; başka öğretmenin verisine erişilemez.
 *
 * Gönderildikten sonra yönetici izin vermedikçe değiştirilemez.
 */
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import {
  DECLARATION_KINDS,
  periodLabel,
  periodRange
} from '../api/_lib/teacher-declaration-core.js';
import { resolveCoachIdByUserSub } from '../api/_lib/enrich-student-actor.js';

const DECL = 'teacher_month_declarations';
const LINES = 'teacher_declaration_lines';

function badToken(res) {
  return res.status(404).json({
    error: 'not_found',
    message: 'Bağlantı geçersiz veya süresi dolmuş. Lütfen yöneticinizden yeni bağlantı isteyin.'
  });
}

/** Anahtarı doğrular ve beyanı döner. Süresi geçmiş anahtar kabul edilmez. */
async function loadByToken(token) {
  const t = String(token || '').trim();
  if (t.length < 20) return null;
  const { data, error } = await supabaseAdmin.from(DECL).select('*').eq('token', t).maybeSingle();
  if (error || !data) return null;
  if (data.token_expires_at && new Date(data.token_expires_at).getTime() < Date.now()) return null;
  return data;
}

/** Formda seçilecek sınıf ve öğrenciler — öğretmenin kendi kayıtlarından. */
async function loadPickLists(teacherId, period, institutionId) {
  const range = periodRange(period);
  const out = { classes: [], students: [], guidance_students: [] };
  if (!range) return out;

  const { data: sessions } = await supabaseAdmin
    .from('class_sessions')
    .select('class_id')
    .eq('teacher_id', teacherId)
    .gte('lesson_date', range.from)
    .lte('lesson_date', range.to)
    .limit(3000);
  const classIds = [...new Set((sessions || []).map((s) => s.class_id).filter(Boolean))];

  // Öğretmenin o ay dersi olmayan sınıfları da seçebilmesi için kurumun
  // sınıfları da eklenir; beyan sistemden geniş olabilir
  let cq = supabaseAdmin.from('classes').select('id, name').order('name').limit(500);
  if (institutionId) cq = cq.eq('institution_id', institutionId);
  const { data: allClasses } = await cq;
  const seen = new Set();
  for (const id of classIds) {
    const c = (allClasses || []).find((x) => String(x.id) === String(id));
    if (c && !seen.has(String(c.id))) {
      seen.add(String(c.id));
      out.classes.push({ id: c.id, name: c.name || '', mine: true });
    }
  }
  for (const c of allClasses || []) {
    if (seen.has(String(c.id))) continue;
    seen.add(String(c.id));
    out.classes.push({ id: c.id, name: c.name || '', mine: false });
  }

  let sq = supabaseAdmin
    .from('students')
    .select('id, name, class_level, coach_id')
    .is('deleted_at', null)
    .order('name')
    .limit(2000);
  if (institutionId) sq = sq.eq('institution_id', institutionId);
  const { data: students } = await sq;
  out.students = (students || []).map((s) => ({
    id: s.id,
    name: s.name || '',
    class_level: s.class_level || ''
  }));

  /**
   * Rehberlik listesi ayrı: görüşmeyi yalnız koçlar yapıyor ve yalnız kendi
   * öğrencileriyle. Tüm kurum öğrencilerini göstermek, öğretmenin kendi
   * öğrencisi olmayan birini seçmesine yol açıyordu.
   *
   * Koç kaydı bulunamazsa liste boş döner; form "size tanımlı öğrenci yok"
   * der, yanlış öğrenci seçilmesindense boş kalması doğrudur.
   */
  try {
    const coachId = await resolveCoachIdByUserSub(teacherId);
    out.guidance_students = coachId
      ? (students || [])
          .filter((s) => String(s.coach_id || '') === String(coachId))
          .map((s) => ({ id: s.id, name: s.name || '', class_level: s.class_level || '' }))
      : [];
  } catch {
    out.guidance_students = [];
  }
  return out;
}

export default async function handler(req, res) {
  const token = String(req.query?.token || req.body?.token || '').trim();

  try {
    const decl = await loadByToken(token);
    if (!decl) return badToken(res);

    const { data: teacher } = await supabaseAdmin
      .from('users')
      .select('id, name')
      .eq('id', decl.teacher_id)
      .maybeSingle();

    /** Formu getir */
    if (req.method === 'GET') {
      // Açılma izi — hatırlatma akışı için
      if (!decl.opened_at) {
        await supabaseAdmin
          .from(DECL)
          .update({ opened_at: new Date().toISOString(), status: decl.status === 'pending' ? 'opened' : decl.status })
          .eq('id', decl.id);
      }

      const { data: lines } = await supabaseAdmin
        .from(LINES)
        .select('*')
        .eq('declaration_id', decl.id)
        .order('created_at');

      const picks = await loadPickLists(decl.teacher_id, decl.period_month, decl.institution_id);

      return res.status(200).json({
        ok: true,
        teacher_name: teacher?.name || 'Öğretmenim',
        period: decl.period_month,
        period_label: periodLabel(decl.period_month),
        status: decl.status,
        submitted_at: decl.submitted_at,
        // Gönderilmiş beyan yalnız yönetici izin verirse düzenlenir
        editable: decl.status !== 'submitted' || decl.edit_allowed === true,
        lines: lines || [],
        kinds: DECLARATION_KINDS,
        classes: picks.classes,
        students: picks.students,
        guidance_students: picks.guidance_students,
        // Takvim bu ayın günlerini gösterir
        period_days: (() => {
          const r = periodRange(decl.period_month);
          return r ? { from: r.from, to: r.to } : null;
        })()
      });
    }

    /** Beyanı gönder */
    if (req.method === 'POST') {
      if (decl.status === 'submitted' && decl.edit_allowed !== true) {
        return res.status(400).json({
          error: 'locked',
          message: 'Formunuz gönderilmiş. Değişiklik için yöneticinizle görüşün.'
        });
      }

      const raw = Array.isArray(req.body?.lines) ? req.body.lines : [];
      const validKinds = new Set(DECLARATION_KINDS.map((k) => k.id));
      const lines = raw
        .map((l) => ({
          declaration_id: decl.id,
          kind: String(l?.kind || '').trim(),
          class_id: l?.class_id || null,
          student_id: l?.student_id || null,
          label: String(l?.label || '').trim().slice(0, 200) || null,
          quantity: Math.max(0, Math.min(9999, Number(l?.quantity) || 0)),
          // Gün gün işaretleme: { 'YYYY-MM-DD': dersSayısı }
          days: l?.days && typeof l.days === 'object' && !Array.isArray(l.days) ? l.days : null,
          note: String(l?.note || '').trim().slice(0, 500) || null
        }))
        .filter((l) => validKinds.has(l.kind) && l.quantity > 0);

      if (!lines.length) {
        return res.status(400).json({
          error: 'empty',
          message: 'En az bir çalışma satırı girmelisiniz.'
        });
      }

      // Satırlar tam olarak formdaki hâliyle saklanır: eskiler silinip
      // yenileri yazılır, böylece düzeltmede artık satır kalmaz
      await supabaseAdmin.from(LINES).delete().eq('declaration_id', decl.id);
      const { error: insErr } = await supabaseAdmin.from(LINES).insert(lines);
      if (insErr) return res.status(500).json({ error: errorMessage(insErr) });

      const now = new Date().toISOString();
      await supabaseAdmin
        .from(DECL)
        .update({
          status: 'submitted',
          submitted_at: now,
          // Düzeltme izni tek kullanımlıktır
          edit_allowed: false,
          note: String(req.body?.note || '').trim().slice(0, 1000) || decl.note,
          updated_at: now
        })
        .eq('id', decl.id);

      return res.status(200).json({
        ok: true,
        message: `${periodLabel(decl.period_month)} çalışma bildiriminiz alındı. Teşekkür ederiz.`
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.warn('[teacher-declaration] hata:', errorMessage(e));
    return res.status(500).json({ error: 'server_error', message: 'İşlem tamamlanamadı.' });
  }
}
