/**
 * Deneme sınav takvimi (9 / 10 / 11 / YKS).
 * - Öğrenci: yalnız kendi sınıfının takvimi (sunucuda filtrelenir).
 * - Öğretmen / koç / yönetici: tüm sınıflar, salt görüntüleme.
 * - Süper admin: ekle / düzenle / sil.
 */
import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { enrichStudentActor } from '../api/_lib/enrich-student-actor.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { resolveStudentRowForUser } from '../api/_lib/resolve-student-id.js';
import {
  EXAM_CALENDAR_LEVELS,
  ensureExamCalendarSeeded,
  examCalendarLevelForClassLevel
} from '../api/_lib/exam-calendar.js';

const STAFF_ROLES = ['super_admin', 'admin', 'coach', 'teacher'];
const COLUMNS = 'id, level, publisher, exam_no, difficulty, exam_date, content, source, sort_order, updated_at';

function parseBody(req) {
  const b = req.body;
  if (b && typeof b === 'object' && !Buffer.isBuffer(b)) return b;
  if (typeof b === 'string') {
    try {
      return JSON.parse(b || '{}');
    } catch {
      return {};
    }
  }
  return {};
}

async function actorTags(actor) {
  const tags = new Set([String(actor.role || '').trim()].filter(Boolean));
  const { data } = await supabaseAdmin.from('users').select('role, roles').eq('id', actor.sub).maybeSingle();
  if (data?.role) tags.add(String(data.role));
  if (Array.isArray(data?.roles)) for (const r of data.roles) tags.add(String(r));
  return tags;
}

async function studentLevel(actor) {
  let sid = actor.student_id ? String(actor.student_id).trim() : '';
  if (!sid) {
    const { data: u } = await supabaseAdmin.from('users').select('email, institution_id').eq('id', actor.sub).maybeSingle();
    const row = await resolveStudentRowForUser({
      userId: actor.sub,
      email: u?.email,
      institutionId: u?.institution_id ?? actor.institution_id ?? null
    });
    sid = row?.id ? String(row.id) : '';
  }
  let classLevel = '';
  if (sid) {
    const { data } = await supabaseAdmin.from('students').select('class_level').eq('id', sid).maybeSingle();
    classLevel = String(data?.class_level || '');
  }
  return { classLevel, level: examCalendarLevelForClassLevel(classLevel) };
}

function cleanRow(body) {
  const level = String(body.level || '').trim().toLowerCase();
  const date = String(body.exam_date || '').trim().slice(0, 10);
  const publisher = String(body.publisher || '').trim().slice(0, 200);
  if (!EXAM_CALENDAR_LEVELS.includes(level)) return { error: 'Geçersiz sınıf (9, 10, 11 veya yks).' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Tarih YYYY-AA-GG olmalı.' };
  if (!publisher) return { error: 'Yayınevi zorunlu.' };
  return {
    row: {
      level,
      exam_date: date,
      publisher,
      exam_no: String(body.exam_no ?? '').trim().slice(0, 20) || null,
      difficulty: String(body.difficulty || '').trim().toUpperCase().slice(0, 40) || null,
      content: String(body.content || '').trim().slice(0, 1000) || null,
      source: String(body.source || 'ONLİNE VİP DERSHANE').trim().slice(0, 120)
    }
  };
}

export default async function handler(req, res) {
  let actor;
  try {
    actor = await enrichStudentActor(requireAuthenticatedActor(req));
  } catch {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    const tags = await actorTags(actor);
    const isSuper = tags.has('super_admin');
    const isStaff = STAFF_ROLES.some((r) => tags.has(r));
    const isStudentOnly = tags.has('student') && !isStaff;
    if (!isStaff && !isStudentOnly) return res.status(403).json({ error: 'forbidden' });

    await ensureExamCalendarSeeded();

    if (req.method === 'GET') {
      let q = supabaseAdmin.from('exam_calendar').select(COLUMNS).order('exam_date', { ascending: true }).order('sort_order');
      let myLevel = null;
      let classLevel = null;
      if (isStudentOnly) {
        ({ level: myLevel, classLevel } = await studentLevel(actor));
        if (!myLevel) {
          return res.status(200).json({ data: [], scope: 'student', level: null, class_level: classLevel || null });
        }
        q = q.eq('level', myLevel);
      } else {
        const lv = String(req.query?.level || '').trim().toLowerCase();
        if (EXAM_CALENDAR_LEVELS.includes(lv)) q = q.eq('level', lv);
      }
      const { data, error } = await q.limit(1000);
      if (error) throw new Error(error.message);
      return res.status(200).json({
        data: data || [],
        scope: isStudentOnly ? 'student' : 'staff',
        level: myLevel,
        class_level: classLevel,
        can_edit: isSuper
      });
    }

    if (!isSuper) return res.status(403).json({ error: 'forbidden', message: 'Takvimi yalnız süper admin düzenleyebilir.' });
    const body = parseBody(req);

    if (req.method === 'POST' || req.method === 'PATCH') {
      const { row, error: vErr } = cleanRow(body);
      if (vErr) return res.status(400).json({ error: 'invalid', message: vErr });
      const stamp = { updated_at: new Date().toISOString(), updated_by: String(actor.sub || '') };
      if (req.method === 'PATCH') {
        const id = String(body.id || req.query?.id || '').trim();
        if (!id) return res.status(400).json({ error: 'id_required' });
        const { data, error } = await supabaseAdmin
          .from('exam_calendar')
          .update({ ...row, ...stamp })
          .eq('id', id)
          .select(COLUMNS)
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) return res.status(404).json({ error: 'not_found' });
        return res.status(200).json({ data });
      }
      const id = `ex_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const { data, error } = await supabaseAdmin
        .from('exam_calendar')
        .insert({ id, ...row, sort_order: 100, ...stamp })
        .select(COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      return res.status(200).json({ data });
    }

    if (req.method === 'DELETE') {
      const id = String(req.query?.id || body.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id_required' });
      const { error } = await supabaseAdmin.from('exam_calendar').delete().eq('id', id);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    console.error('[exam-calendar]', e instanceof Error ? e.message : e);
    return res.status(500).json({ error: 'server_error', message: e instanceof Error ? e.message : String(e) });
  }
}
