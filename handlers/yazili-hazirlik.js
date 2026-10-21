/**
 * Yazılıya hazırlık PDF rafları.
 * GET                         — sınıf, ders ve dosya listesi
 * POST ?op=upload-url         — öğretmen PDF’yi doğrudan depoya koyar
 * POST ?op=commit             — yüklenen dosyayı rafa yazar
 * GET  ?op=download&id=       — öğrenci / öğretmen indirme bağlantısı
 * DELETE ?id=                 — öğretmen kendi dosyasını kaldırır
 */
import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { actorRoleSet, roleSetHasAdmin, roleSetHasSuperAdmin } from '../api/_lib/actor-roles.js';
import { enrichStudentActor } from '../api/_lib/enrich-student-actor.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { getTeacherPanelClassIds } from '../api/_lib/teacher-class-scope.js';
import {
  ensureYaziliHazirlikSchema,
  yaziliHazirlikDosyaSil,
  yaziliHazirlikIndirmeLinki,
  yaziliHazirlikYuklemeLinki,
  YAZILI_HAZIRLIK_TABLE
} from '../api/_lib/yazili-hazirlik.js';
import {
  MAX_PDF_BYTES,
  parseSlot,
  temizKonu,
  yolBuOgretmeneAit,
  yuklemeYolu
} from '../api/_lib/yazili-hazirlik-slots.js';

function parseBody(req) {
  const b = req.body;
  if (Buffer.isBuffer(b)) {
    try {
      return JSON.parse(b.toString('utf8') || '{}');
    } catch {
      return {};
    }
  }
  if (b && typeof b === 'object') return b;
  if (typeof b === 'string') {
    try {
      return JSON.parse(b || '{}');
    } catch {
      return {};
    }
  }
  return {};
}

function hataYaniti(res, status, error, hint) {
  return res.status(status).json({ error, hint: hint || error });
}

function canUpload(roles) {
  return (
    roles.has('teacher') ||
    roles.has('coach') ||
    roles.has('admin') ||
    roles.has('super_admin')
  );
}

async function visibleClassIds(actor, roles) {
  if (roleSetHasSuperAdmin(roles) || roleSetHasAdmin(roles)) {
    let q = supabaseAdmin.from('classes').select('id,name').order('name', { ascending: true });
    if (actor.institution_id && !roleSetHasSuperAdmin(roles)) {
      q = q.eq('institution_id', actor.institution_id);
    }
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }
  if (roles.has('teacher') || roles.has('coach')) {
    const ids = await getTeacherPanelClassIds(actor.sub);
    if (!ids.length) return [];
    const { data, error } = await supabaseAdmin.from('classes').select('id,name').in('id', ids).order('name');
    if (error) throw error;
    return data || [];
  }
  const studentId = String(actor.student_id || '').trim();
  if (!studentId) return [];
  const { data: members, error: me } = await supabaseAdmin
    .from('class_students')
    .select('class_id')
    .eq('student_id', studentId);
  if (me) throw me;
  const ids = [...new Set((members || []).map((r) => r.class_id).filter(Boolean))];
  if (!ids.length) return [];
  const { data, error } = await supabaseAdmin.from('classes').select('id,name').in('id', ids).order('name');
  if (error) throw error;
  return data || [];
}

async function assertClassAllowed(actor, roles, classId) {
  const classes = await visibleClassIds(actor, roles);
  const row = classes.find((c) => String(c.id) === String(classId));
  if (!row) return null;
  return row;
}

async function subjectsFor(classIds, teacherId) {
  if (!classIds.length) return {};
  let q = supabaseAdmin.from('class_weekly_slots').select('class_id,subject').in('class_id', classIds);
  if (teacherId) q = q.eq('teacher_id', teacherId);
  const { data, error } = await q;
  if (error) return {};
  const map = {};
  for (const row of data || []) {
    const konu = temizKonu(row.subject);
    if (!konu || !row.class_id) continue;
    const list = map[row.class_id] || [];
    if (!list.includes(konu)) list.push(konu);
    map[row.class_id] = list;
  }
  return map;
}

async function decorateFiles(rows) {
  const teacherIds = [...new Set(rows.map((r) => r.teacher_user_id).filter(Boolean))];
  const classIds = [...new Set(rows.map((r) => r.class_id).filter(Boolean))];
  const names = {};
  const classes = {};
  if (teacherIds.length) {
    const { data } = await supabaseAdmin.from('users').select('id,name').in('id', teacherIds);
    for (const u of data || []) names[u.id] = u.name || '';
  }
  if (classIds.length) {
    const { data } = await supabaseAdmin.from('classes').select('id,name').in('id', classIds);
    for (const c of data || []) classes[c.id] = c.name || '';
  }
  return rows.map((r) => ({
    id: r.id,
    class_id: r.class_id,
    class_name: classes[r.class_id] || '',
    teacher_user_id: r.teacher_user_id,
    teacher_name: names[r.teacher_user_id] || '',
    subject: r.subject,
    donem: r.donem,
    yazili: r.yazili,
    calisma: r.calisma,
    file_name: r.file_name,
    updated_at: r.updated_at
  }));
}

export default async function handler(req, res) {
  try {
    let actor = requireAuthenticatedActor(req);
    actor = await enrichStudentActor(actor);
    const roles = await actorRoleSet(actor);
    const student = roles.has('student') && !canUpload(roles);
    const uploader = canUpload(roles);
    if (!student && !uploader) return res.status(403).json({ error: 'forbidden' });

    const ready = await ensureYaziliHazirlikSchema();
    if (!ready.ok) return res.status(503).json({ error: 'schema_missing', hint: ready.hint });

    const op = String(req.query?.op || '').trim();

    if (req.method === 'GET' && op === 'download') {
      const id = String(req.query?.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id_required' });
      const { data: row, error } = await supabaseAdmin.from(YAZILI_HAZIRLIK_TABLE).select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!row) return res.status(404).json({ error: 'not_found' });
      const allowed = await assertClassAllowed(actor, roles, row.class_id);
      if (!allowed) return res.status(403).json({ error: 'forbidden' });
      const url = await yaziliHazirlikIndirmeLinki(row.storage_path);
      return res.status(200).json({ url, name: row.file_name });
    }

    if (req.method === 'GET') {
      const classes = await visibleClassIds(actor, roles);
      const classIds = classes.map((c) => c.id);
      let files = [];
      if (classIds.length) {
        const { data, error } = await supabaseAdmin
          .from(YAZILI_HAZIRLIK_TABLE)
          .select('*')
          .in('class_id', classIds)
          .order('updated_at', { ascending: false });
        if (error) throw error;
        const decorated = await decorateFiles(data || []);
        const yonetici = roleSetHasAdmin(roles) || roleSetHasSuperAdmin(roles);
        files = decorated.map((f) => ({
          ...f,
          mine: yonetici || String(f.teacher_user_id) === String(actor.sub)
        }));
      }
      const teacherFilter = uploader && !roleSetHasAdmin(roles) && !roleSetHasSuperAdmin(roles) ? actor.sub : '';
      const subjectsByClass = await subjectsFor(classIds, teacherFilter);
      return res.status(200).json({
        canUpload: uploader,
        classes: classes.map((c) => ({ id: c.id, name: c.name || 'Sınıf' })),
        subjectsByClass,
        files
      });
    }

    if (req.method === 'POST' && op === 'upload-url') {
      if (!uploader) return res.status(403).json({ error: 'forbidden' });
      const body = parseBody(req);
      const slot = parseSlot(body);
      const subject = temizKonu(body.subject);
      const classId = String(body.class_id || '').trim();
      const fileSize = Number(body.file_size || 0);
      const maxMb = Math.round(MAX_PDF_BYTES / (1024 * 1024));
      if (!slot) return hataYaniti(res, 400, 'gecersiz_raf', 'Dönem, yazılı veya çalışma seçilemedi. Sayfayı yenileyip tekrar deneyin.');
      if (!subject) return hataYaniti(res, 400, 'ders_gerekli', 'Önce ders adını yazın.');
      if (!classId) return hataYaniti(res, 400, 'sinif_gerekli', 'Önce sınıf seçin.');
      if (fileSize > MAX_PDF_BYTES) {
        return hataYaniti(res, 400, 'pdf_too_large', `PDF en fazla ${maxMb} MB olabilir`);
      }
      const allowed = await assertClassAllowed(actor, roles, classId);
      if (!allowed) return res.status(403).json({ error: 'forbidden' });
      const path = yuklemeYolu(actor.sub, classId, slot, body.file_name);
      const signed = await yaziliHazirlikYuklemeLinki(path);
      return res.status(200).json({
        data: { ...signed, file_name: body.file_name || 'calisma.pdf' }
      });
    }

    if (req.method === 'POST' && op === 'commit') {
      if (!uploader) return res.status(403).json({ error: 'forbidden' });
      const body = parseBody(req);
      const slot = parseSlot(body);
      const subject = temizKonu(body.subject);
      const classId = String(body.class_id || '').trim();
      const path = String(body.path || '').trim();
      const fileName = String(body.file_name || 'calisma.pdf').trim().slice(0, 180);
      if (!slot || !subject || !classId || !path) {
        return res.status(400).json({ error: 'eksik_alan' });
      }
      if (!yolBuOgretmeneAit(path, actor.sub, classId, slot)) {
        return res.status(400).json({ error: 'invalid_pdf_path' });
      }
      const allowed = await assertClassAllowed(actor, roles, classId);
      if (!allowed) return res.status(403).json({ error: 'forbidden' });

      const { data: existing, error: findErr } = await supabaseAdmin
        .from(YAZILI_HAZIRLIK_TABLE)
        .select('*')
        .eq('class_id', classId)
        .eq('teacher_user_id', actor.sub)
        .eq('subject', subject)
        .eq('donem', slot.donem)
        .eq('yazili', slot.yazili)
        .eq('calisma', slot.calisma)
        .maybeSingle();
      if (findErr) throw findErr;

      const now = new Date().toISOString();
      let saved;
      if (existing) {
        const { data, error } = await supabaseAdmin
          .from(YAZILI_HAZIRLIK_TABLE)
          .update({ file_name: fileName, storage_path: path, updated_at: now })
          .eq('id', existing.id)
          .select()
          .single();
        if (error) throw error;
        saved = data;
        if (existing.storage_path && existing.storage_path !== path) {
          await yaziliHazirlikDosyaSil(existing.storage_path);
        }
      } else {
        const { data, error } = await supabaseAdmin
          .from(YAZILI_HAZIRLIK_TABLE)
          .insert({
            institution_id: actor.institution_id || null,
            class_id: classId,
            teacher_user_id: actor.sub,
            subject,
            donem: slot.donem,
            yazili: slot.yazili,
            calisma: slot.calisma,
            file_name: fileName,
            storage_path: path,
            updated_at: now
          })
          .select()
          .single();
        if (error) throw error;
        saved = data;
      }
      const [decorated] = await decorateFiles([saved]);
      return res.status(200).json({ data: decorated });
    }

    if (req.method === 'DELETE') {
      if (!uploader) return res.status(403).json({ error: 'forbidden' });
      const id = String(req.query?.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id_required' });
      const { data: row, error } = await supabaseAdmin.from(YAZILI_HAZIRLIK_TABLE).select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!row) return res.status(404).json({ error: 'not_found' });
      const allowed = await assertClassAllowed(actor, roles, row.class_id);
      if (!allowed) return res.status(403).json({ error: 'forbidden' });
      const owns = String(row.teacher_user_id) === String(actor.sub);
      if (!owns && !roleSetHasAdmin(roles) && !roleSetHasSuperAdmin(roles)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const { error: delErr } = await supabaseAdmin.from(YAZILI_HAZIRLIK_TABLE).delete().eq('id', id);
      if (delErr) throw delErr;
      await yaziliHazirlikDosyaSil(row.storage_path);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    const msg = errorMessage(e);
    if (/missing token|invalid token|token expired|invalid signature/i.test(msg)) {
      return res.status(401).json({ error: msg });
    }
    const status = Number(e?.status || e?.statusCode) || 500;
    const code = status >= 400 && status < 600 ? status : 500;
    return res.status(code).json({ error: msg, hint: msg });
  }
}
