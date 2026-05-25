import { supabaseAdmin } from './supabase-admin.js';
import { sendMetaTextMessage, normalizePhoneToE164 } from './meta-whatsapp.js';

const BUCKET = 'question-help';

export async function uploadQuestionAsset({ base64, mime, path }) {
  const buf = Buffer.from(String(base64 || ''), 'base64');
  if (!buf.length) throw new Error('empty_file');
  const contentType = mime || 'image/jpeg';
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, buf, {
    contentType,
    upsert: true
  });
  if (error) throw error;
  const { data: signed } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 7);
  return signed?.signedUrl || null;
}

export async function insertQuestionNotification({ userId, questionId, kind, title, body }) {
  if (!userId) return;
  await supabaseAdmin.from('question_notifications').insert({
    user_id: userId,
    question_id: questionId || null,
    kind,
    title,
    body: body || null
  });
}

export async function notifyStudentUsersForStudent(studentId, { questionId, kind, title, body }) {
  const { data: st } = await supabaseAdmin
    .from('students')
    .select('user_id, platform_user_id, parent_phone, phone')
    .eq('id', studentId)
    .maybeSingle();
  const uid = st?.user_id || st?.platform_user_id;
  if (uid) await insertQuestionNotification({ userId: uid, questionId, kind, title, body });
}

/** Havuz / bildirim — branş + sınıf + (varsa) kurum eşleşmesi zorunlu */
export function teacherProfileMatchesQuestion(profile, subject, grade, questionInstitutionId = null) {
  const sub = String(subject || '').trim();
  const gr = String(grade || '').trim();
  const branches = Array.isArray(profile?.branches) ? profile.branches : [];
  const grades = Array.isArray(profile?.grades) ? profile.grades : [];
  if (!branches.length || !branches.includes(sub)) return false;
  if (!grades.length || !grades.includes(gr)) return false;
  const qInst = questionInstitutionId ? String(questionInstitutionId).trim() : '';
  const pInst = profile?.institution_id ? String(profile.institution_id).trim() : '';
  if (qInst && pInst && pInst !== qInst) return false;
  if (qInst && !pInst && profile?.actor_institution_id) {
    const aInst = String(profile.actor_institution_id).trim();
    if (aInst && aInst !== qInst) return false;
  }
  return true;
}

export function filterQuestionsForTeacherProfile(rows, profile, actorInstitutionId = null) {
  const enriched = {
    ...profile,
    actor_institution_id: actorInstitutionId || profile?.institution_id || null
  };
  if (!Array.isArray(enriched.branches) || !enriched.branches.length) return [];
  if (!Array.isArray(enriched.grades) || !enriched.grades.length) return [];
  return (rows || []).filter((q) =>
    teacherProfileMatchesQuestion(enriched, q.subject, q.grade, q.institution_id)
  );
}

export async function notifyTeachersNewQuestion(question) {
  const subject = String(question.subject || '').trim();
  const inst = question.institution_id || null;
  const grade = String(question.grade || '').trim();
  const { data: profiles } = await supabaseAdmin
    .from('question_help_teacher_profiles')
    .select('user_id, branches, grades, institution_id')
    .limit(500);
  const teacherIds = (profiles || [])
    .filter((p) => teacherProfileMatchesQuestion(p, subject, grade, inst))
    .map((p) => p.user_id);

  if (!teacherIds.length) return;

  for (const tid of teacherIds) {
    await insertQuestionNotification({
      userId: tid,
      questionId: question.id,
      kind: 'new_question',
      title: 'Yeni soru',
      body: `${subject} — ${question.grade}`
    });
  }
}

export async function sendWhatsAppIfPossible(userId, message) {
  try {
    const { data: u } = await supabaseAdmin.from('users').select('phone').eq('id', userId).maybeSingle();
    const e164 = normalizePhoneToE164(u?.phone);
    if (!e164 || !message) return;
    await sendMetaTextMessage({ toE164: e164, text: message });
  } catch (e) {
    console.warn('[question-help] WhatsApp skip:', e?.message || e);
  }
}

export function storagePathForQuestion(studentId, ext = 'jpg') {
  const ts = Date.now();
  return `questions/${studentId}/${ts}.${ext}`;
}

export function storagePathForSolution(questionId, kind, ext) {
  return `solutions/${questionId}/${kind}-${Date.now()}.${ext}`;
}
