import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { enrichStudentActor, actorIsStudentWithProfile } from '../api/_lib/enrich-student-actor.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import {
  uploadQuestionAsset,
  notifyStudentUsersForStudent,
  notifyTeachersNewQuestion,
  teacherProfileMatchesQuestion,
  filterQuestionsForTeacherProfile,
  sendWhatsAppIfPossible,
  storagePathForQuestion,
  storagePathForSolution,
  insertQuestionNotification
} from '../api/_lib/question-help.js';
import { normalizedUserRolesFromDb } from '../api/_lib/user-roles-fetch.js';
import { studentIdsForTeacher } from '../api/_lib/student-teacher-scope.js';

async function getStudentRow(studentId) {
  const { data, error } = await supabaseAdmin
    .from('students')
    .select('id, institution_id, coach_id, user_id')
    .eq('id', studentId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function loadTeacherProfile(userId) {
  const { data, error } = await supabaseAdmin
    .from('question_help_teacher_profiles')
    .select('branches, grades, institution_id, updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    const msg = String(error.message || '');
    if (msg.includes('grades') && msg.includes('column')) {
      const { data: legacy } = await supabaseAdmin
        .from('question_help_teacher_profiles')
        .select('branches, institution_id, updated_at')
        .eq('user_id', userId)
        .maybeSingle();
      return {
        branches: Array.isArray(legacy?.branches) ? legacy.branches.filter(Boolean) : [],
        grades: [],
        institution_id: legacy?.institution_id || null,
        updated_at: legacy?.updated_at || null
      };
    }
    throw error;
  }
  return {
    branches: Array.isArray(data?.branches) ? data.branches.filter(Boolean) : [],
    grades: Array.isArray(data?.grades) ? data.grades.filter(Boolean) : [],
    institution_id: data?.institution_id || null,
    updated_at: data?.updated_at || null
  };
}

function profileMatchesQuestion(profile, subject, grade, institutionId = null) {
  return teacherProfileMatchesQuestion(profile, subject, grade, institutionId);
}

function teacherPoolProfileReady(profile) {
  return Boolean(profile?.branches?.length && profile?.grades?.length);
}

function canManageTeacherProfile(actor, targetUserId) {
  if (!targetUserId) return false;
  if (actor.sub === targetUserId) return true;
  return actor.role === 'super_admin' || actor.role === 'admin';
}

export default async function handler(req, res) {
  try {
    let actor = requireAuthenticatedActor(req);
    actor = await enrichStudentActor(actor);
    const role = String(actor.role || '').trim();
    const action = String(req.query?.action || req.body?.action || '').trim();

    if (req.method === 'GET') {
      const scope = String(req.query?.scope || 'mine').trim();
      const status = String(req.query?.status || '').trim();
      const subject = String(req.query?.subject || '').trim();
      const grade = String(req.query?.grade || '').trim();

      {
        const { actor: stActor, isStudent, hasStudentId } = await actorIsStudentWithProfile(actor);
        actor = stActor;
        if (isStudent) {
          if (!hasStudentId) {
            return res.status(403).json({
              error: 'student_profile_missing',
              hint: 'Öğrenci kartınız hesabınızla eşleşmiyor. Koçunuz veya yönetici ile iletişime geçin.'
            });
          }
          const stRow = await getStudentRow(actor.student_id);
          let q = supabaseAdmin.from('questions').select('*').eq('student_id', actor.student_id);
          if (stRow?.institution_id) {
            q = q.or(
              `institution_id.eq.${stRow.institution_id},institution_id.is.null`
            );
          }
          if (status) q = q.eq('status', status);
          const { data, error } = await q.order('created_at', { ascending: false }).limit(100);
          if (error) throw error;
          return res.status(200).json({ data: data || [] });
        }
      }

      if (req.query?.resource === 'teacher_profile') {
        const targetId = String(req.query?.user_id || actor.sub).trim();
        if (!canManageTeacherProfile(actor, targetId)) {
          return res.status(403).json({ error: 'forbidden' });
        }
        const profile = await loadTeacherProfile(targetId);
        return res.status(200).json({ data: profile });
      }

      if (role === 'teacher' || role === 'coach' || role === 'admin' || role === 'super_admin') {
        const roleTags = await normalizedUserRolesFromDb(actor.sub);
        const isTeacherPoolActor = roleTags.includes('teacher') || role === 'teacher';
        const isCoachOnlyPool =
          (roleTags.includes('coach') || role === 'coach') && !isTeacherPoolActor;

        const profile =
          role === 'admin' || role === 'super_admin'
            ? { branches: [], grades: [] }
            : await loadTeacherProfile(actor.sub);
        let q = supabaseAdmin.from('questions').select('*');

        const effectiveInst =
          actor.institution_id || profile.institution_id || null;

        if (scope === 'pool' || scope === 'waiting') {
          q = q.eq('status', 'waiting');
          const needsProfileFilter =
            isTeacherPoolActor || isCoachOnlyPool || role === 'teacher' || role === 'coach';
          if (needsProfileFilter && role !== 'admin' && role !== 'super_admin') {
            if (!teacherPoolProfileReady(profile)) {
              return res.status(200).json({ data: [] });
            }
            q = q.in('subject', profile.branches).in('grade', profile.grades);
            const linkedStudentIds = await studentIdsForTeacher(actor.sub, effectiveInst);
            if (!linkedStudentIds.length) {
              return res.status(200).json({ data: [] });
            }
            q = q.in('student_id', linkedStudentIds);
            if (effectiveInst) {
              q = q.or(`institution_id.eq.${effectiveInst},institution_id.is.null`);
            }
          }
        } else if (scope === 'mine') {
          q = q.eq('claimed_by', actor.sub);
          if (status) q = q.eq('status', status);
        } else if (scope === 'solved') {
          q = q.eq('status', 'solved');
          if (isTeacherPoolActor || role === 'teacher') q = q.eq('solved_by', actor.sub);
        }

        if (subject) q = q.eq('subject', subject);
        if (grade) q = q.eq('grade', grade);

        if ((role === 'admin' || role === 'super_admin') && actor.institution_id) {
          q = q.or(`institution_id.eq.${actor.institution_id},institution_id.is.null`);
        }
        if (isCoachOnlyPool && actor.coach_id) {
          const { data: sts } = await supabaseAdmin
            .from('students')
            .select('id')
            .eq('coach_id', actor.coach_id);
          const ids = (sts || []).map((s) => s.id);
          if (!ids.length) return res.status(200).json({ data: [] });
          q = q.in('student_id', ids);
        }

        const { data, error } = await q.order('created_at', { ascending: false }).limit(200);
        if (error) throw error;
        let rows = data || [];

        const isStaffPoolViewer =
          role === 'teacher' ||
          role === 'coach' ||
          isTeacherPoolActor ||
          isCoachOnlyPool;

        if ((scope === 'pool' || scope === 'waiting') && isStaffPoolViewer) {
          rows = filterQuestionsForTeacherProfile(rows, profile, actor.institution_id || null);
        } else if ((scope === 'pool' || scope === 'waiting') && role === 'admin' && actor.institution_id) {
          rows = rows.filter(
            (q) =>
              !q.institution_id || String(q.institution_id) === String(actor.institution_id)
          );
        }

        return res.status(200).json({ data: rows.slice(0, 120) });
      }

      return res.status(403).json({ error: 'forbidden' });
    }

    if (req.method === 'POST' && action === 'claim') {
      if (role !== 'teacher' && role !== 'coach' && role !== 'admin' && role !== 'super_admin') {
        return res.status(403).json({ error: 'forbidden' });
      }
      const questionId = String(req.body?.question_id || '').trim();
      const teacherId = actor.sub;
      const claimTags = await normalizedUserRolesFromDb(teacherId);
      if (
        claimTags.includes('teacher') ||
        role === 'teacher' ||
        claimTags.includes('coach') ||
        role === 'coach'
      ) {
        const { data: qRow } = await supabaseAdmin
          .from('questions')
          .select('subject, grade, institution_id, student_id')
          .eq('id', questionId)
          .maybeSingle();
        const profile = await loadTeacherProfile(teacherId);
        const effectiveInst =
          actor.institution_id || profile.institution_id || null;
        const linkedStudentIds = await studentIdsForTeacher(teacherId, effectiveInst);
        if (
          !qRow ||
          !profileMatchesQuestion(profile, qRow.subject, qRow.grade, qRow.institution_id) ||
          !linkedStudentIds.includes(String(qRow.student_id))
        ) {
          return res.status(403).json({ error: 'branch_grade_mismatch' });
        }
      }
      const { data: rpc, error } = await supabaseAdmin.rpc('claim_question_atomic', {
        p_question_id: questionId,
        p_teacher_user_id: teacherId
      });
      if (error) throw error;
      const payload = typeof rpc === 'string' ? JSON.parse(rpc) : rpc || {};
      if (!payload.ok) {
        return res.status(409).json({ error: payload.error || 'claim_failed' });
      }
      const row = payload.data;
      await notifyStudentUsersForStudent(row.student_id, {
        questionId: row.id,
        kind: 'claimed',
        title: 'Sorunuz alındı',
        body: 'Bir öğretmen sorunuzu çözmek üzere üstlendi.'
      });
      return res.status(200).json({ data: row });
    }

    if (req.method === 'POST' && action === 'solve') {
      const questionId = String(req.body?.question_id || '').trim();
      const { data: existing } = await supabaseAdmin
        .from('questions')
        .select('*')
        .eq('id', questionId)
        .maybeSingle();
      if (!existing) return res.status(404).json({ error: 'not_found' });
      if (
        role === 'teacher' &&
        existing.claimed_by &&
        String(existing.claimed_by) !== String(actor.sub)
      ) {
        return res.status(403).json({ error: 'not_your_question' });
      }

      const patch = {
        status: 'solved',
        solved_by: actor.sub,
        solved_text: req.body?.solved_text ?? existing.solved_text,
        updated_at: new Date().toISOString(),
        solved_at: new Date().toISOString()
      };

      if (req.body?.solved_image_base64) {
        patch.solved_image_url = await uploadQuestionAsset({
          base64: req.body.solved_image_base64,
          mime: req.body?.solved_image_mime || 'image/jpeg',
          path: storagePathForSolution(questionId, 'image', 'jpg')
        });
      }
      if (req.body?.solved_pdf_base64) {
        patch.solved_pdf_url = await uploadQuestionAsset({
          base64: req.body.solved_pdf_base64,
          mime: 'application/pdf',
          path: storagePathForSolution(questionId, 'doc', 'pdf')
        });
      }
      if (req.body?.solved_video_url) patch.solved_video_url = String(req.body.solved_video_url);
      if (req.body?.solved_audio_base64) {
        patch.solved_audio_url = await uploadQuestionAsset({
          base64: req.body.solved_audio_base64,
          mime: req.body?.solved_audio_mime || 'audio/mpeg',
          path: storagePathForSolution(questionId, 'audio', 'mp3')
        });
      }

      const { data, error } = await supabaseAdmin
        .from('questions')
        .update(patch)
        .eq('id', questionId)
        .select()
        .single();
      if (error) throw error;

      await supabaseAdmin.from('question_claim_logs').insert({
        question_id: questionId,
        teacher_user_id: actor.sub,
        action: 'solve'
      });

      const { data: prevStats } = await supabaseAdmin
        .from('teacher_question_stats')
        .select('solved_count')
        .eq('teacher_user_id', actor.sub)
        .maybeSingle();
      await supabaseAdmin.from('teacher_question_stats').upsert(
        {
          teacher_user_id: actor.sub,
          institution_id: existing.institution_id,
          solved_count: (prevStats?.solved_count || 0) + 1,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'teacher_user_id' }
      );

      await notifyStudentUsersForStudent(existing.student_id, {
        questionId,
        kind: 'solved',
        title: 'Sorunuz çözüldü',
        body: 'Öğretmen çözümü gönderdi. Uygulamadan inceleyebilirsiniz.'
      });
      const { data: st } = await supabaseAdmin
        .from('students')
        .select('user_id, platform_user_id')
        .eq('id', existing.student_id)
        .maybeSingle();
      const sid = st?.user_id || st?.platform_user_id;
      if (sid) {
        await sendWhatsAppIfPossible(
          sid,
          `Sorunuz çözüldü (${existing.subject}). Smart Koçluk uygulamasından çözümü görüntüleyin.`
        );
      }

      return res.status(200).json({ data });
    }

    if (req.method === 'POST' && action === 'teacher_profile') {
      const targetId = String(req.body?.user_id || actor.sub).trim();
      if (!canManageTeacherProfile(actor, targetId)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const branches = Array.isArray(req.body?.branches)
        ? [...new Set(req.body.branches.map((x) => String(x || '').trim()).filter(Boolean))]
        : [];
      const grades = Array.isArray(req.body?.grades)
        ? [...new Set(req.body.grades.map((x) => String(x || '').trim()).filter(Boolean))]
        : [];
      if (!branches.length) return res.status(400).json({ error: 'branches_required' });
      if (!grades.length) return res.status(400).json({ error: 'grades_required' });

      let institutionId =
        req.body?.institution_id !== undefined
          ? req.body.institution_id
          : actor.institution_id || null;
      if (targetId !== actor.sub && (role === 'admin' || role === 'super_admin')) {
        const { data: uRow } = await supabaseAdmin
          .from('users')
          .select('institution_id')
          .eq('id', targetId)
          .maybeSingle();
        institutionId = uRow?.institution_id ?? institutionId;
      }

      let upsertPayload = {
        user_id: targetId,
        institution_id: institutionId || null,
        branches,
        grades,
        updated_at: new Date().toISOString()
      };
      let { data, error } = await supabaseAdmin
        .from('question_help_teacher_profiles')
        .upsert(upsertPayload, { onConflict: 'user_id' })
        .select()
        .single();
      if (error) {
        const msg = String(error.message || '');
        if (msg.includes('grades') && msg.includes('column')) {
          const { branches: _b, grades: _g, ...legacyPayload } = upsertPayload;
          ({ data, error } = await supabaseAdmin
            .from('question_help_teacher_profiles')
            .upsert(legacyPayload, { onConflict: 'user_id' })
            .select()
            .single());
          if (error) throw error;
          return res.status(200).json({
            data: {
              branches: data.branches,
              grades: [],
              institution_id: data.institution_id,
              updated_at: data.updated_at,
              warning: 'grades_column_missing_run_sql_2026_05_35c'
            }
          });
        }
        throw error;
      }
      return res.status(200).json({
        data: {
          branches: data.branches,
          grades: data.grades,
          institution_id: data.institution_id,
          updated_at: data.updated_at
        }
      });
    }

    if (req.method === 'POST' && !action) {
      const { actor: stActor, isStudent, hasStudentId } = await actorIsStudentWithProfile(actor);
      actor = stActor;
      if (!isStudent) {
        return res.status(403).json({ error: 'forbidden', reason: 'not_student' });
      }
      if (!hasStudentId) {
        return res.status(403).json({
          error: 'student_profile_missing',
          hint: 'Öğrenci kaydınız bulunamadı. Çıkış yapıp tekrar giriş yapın veya koçunuzla iletişime geçin.'
        });
      }
      const body = req.body || {};
      const subject = String(body.subject || '').trim();
      const grade = String(body.grade || '').trim();
      if (!subject || !grade) return res.status(400).json({ error: 'subject_grade_required' });

      const st = await getStudentRow(actor.student_id);
      if (!st) return res.status(404).json({ error: 'student_not_found' });

      let imageUrl = body.image_url || null;
      if (body.image_base64) {
        imageUrl = await uploadQuestionAsset({
          base64: body.image_base64,
          mime: body.image_mime || 'image/jpeg',
          path: storagePathForQuestion(actor.student_id, 'jpg')
        });
      }
      if (!imageUrl) return res.status(400).json({ error: 'image_required' });

      const row = {
        institution_id: st.institution_id || actor.institution_id || null,
        student_id: actor.student_id,
        subject,
        grade,
        topic: body.topic ? String(body.topic).trim() : null,
        description: body.description ? String(body.description).trim() : null,
        image_url: imageUrl,
        status: 'waiting',
        source: body.source || 'web',
        ai_metadata: body.ai_metadata || {},
        priority: Number(body.priority) || 0
      };

      const { data, error } = await supabaseAdmin.from('questions').insert(row).select().single();
      if (error) throw error;

      await notifyTeachersNewQuestion(data);
      return res.status(200).json({ data });
    }

    if (req.method === 'PATCH') {
      const id = String(req.query?.id || req.body?.id || '').trim();
      const { data: existing } = await supabaseAdmin.from('questions').select('*').eq('id', id).maybeSingle();
      if (!existing) return res.status(404).json({ error: 'not_found' });

      if (role === 'student' && existing.student_id !== actor.student_id) {
        return res.status(403).json({ error: 'forbidden' });
      }
      if (action === 'cancel' && existing.student_id === actor.student_id) {
        const { data, error } = await supabaseAdmin
          .from('questions')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return res.status(200).json({ data });
      }
      if (action === 'rate' && existing.student_id === actor.student_id) {
        const rating = Number(req.body?.rating);
        if (rating < 1 || rating > 5) return res.status(400).json({ error: 'invalid_rating' });
        const { data, error } = await supabaseAdmin
          .from('questions')
          .update({ satisfaction_rating: rating, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return res.status(200).json({ data });
      }
      if (action === 'solving' && existing.claimed_by === actor.sub) {
        const { data, error } = await supabaseAdmin
          .from('questions')
          .update({ status: 'solving', updated_at: new Date().toISOString() })
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return res.status(200).json({ data });
      }
      return res.status(400).json({ error: 'unknown_action' });
    }

    if (req.method === 'GET' && req.query?.resource === 'notifications') {
      const { data, error } = await supabaseAdmin
        .from('question_notifications')
        .select('*')
        .eq('user_id', actor.sub)
        .order('created_at', { ascending: false })
        .limit(40);
      if (error) throw error;
      return res.status(200).json({ data: data || [] });
    }

    if (req.method === 'GET' && req.query?.resource === 'stats') {
      if (role === 'coach' && actor.coach_id) {
        const { data: sts } = await supabaseAdmin
          .from('students')
          .select('id')
          .eq('coach_id', actor.coach_id);
        const ids = (sts || []).map((s) => s.id);
        if (!ids.length) return res.status(200).json({ data: { bySubject: [], total: 0 } });
        const { data: qs } = await supabaseAdmin
          .from('questions')
          .select('subject, status, topic, created_at, solved_at')
          .in('student_id', ids)
          .limit(500);
        return res.status(200).json({ data: { questions: qs || [] } });
      }
      if (role === 'teacher') {
        const { data } = await supabaseAdmin
          .from('teacher_question_stats')
          .select('*')
          .eq('teacher_user_id', actor.sub)
          .maybeSingle();
        return res.status(200).json({ data: data || null });
      }
      return res.status(403).json({ error: 'forbidden' });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    const msg = errorMessage(e);
    if (msg.includes('questions') && msg.includes('schema')) {
      return res.status(503).json({
        error: 'schema_missing',
        hint: 'student-coaching-system/sql/2026-05-35-question-help-system.sql'
      });
    }
    console.error('[questions]', msg);
    return res.status(500).json({ error: msg });
  }
}
