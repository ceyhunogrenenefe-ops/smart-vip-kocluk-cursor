import { requireAuthenticatedActor, hasInstitutionAccess } from '../api/_lib/auth.js';
import { supabaseAdmin, getSupabaseAdmin, hasSupabaseServiceRoleKey } from '../api/_lib/supabase-admin.js';
import { normalizeUuidOrGenerate } from '../api/_lib/uuid.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { upsertCoachProfile } from '../api/_lib/user-bulk-import.js';

const STAFF_ROLES = new Set(['admin', 'coach', 'teacher']);

function normalizeRole(raw) {
  const v = String(raw || '').trim().toLowerCase();
  return ['admin', 'coach', 'teacher', 'student'].includes(v) ? v : '';
}

function normalizeInstitutionId(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  return s.length ? s : null;
}

/** Kurum yöneticisi onayında kurum her zaman kendi kurumudur; süper admin form/kayıt kurumunu veya body override kullanır. */
function resolveApprovedInstitutionId(actor, pending, bodyOverride) {
  const override = normalizeInstitutionId(bodyOverride);
  if (actor.role === 'admin' && actor.institution_id) {
    return String(actor.institution_id).trim();
  }
  if (override) return override;
  return normalizeInstitutionId(pending?.institution_id);
}

function normalizeBirthDate(raw) {
  const v = String(raw || '').trim();
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return v;
}

function actorCanManage(actor, row) {
  if (!row) return false;
  if (actor.role === 'super_admin') return true;
  if (actor.role !== 'admin') return false;
  const pendingInst = normalizeInstitutionId(row.institution_id);
  if (!pendingInst) return Boolean(actor.institution_id);
  return hasInstitutionAccess(actor, pendingInst);
}

async function provisionSupabaseAuthUser(userRow, passwordPlain) {
  if (!hasSupabaseServiceRoleKey()) return;
  const pwd = String(passwordPlain || '').trim();
  if (pwd.length < 6) return;
  const sb = getSupabaseAdmin();
  const id = String(userRow.id);
  const email = String(userRow.email || '').toLowerCase().trim();
  const { data: existing, error: getErr } = await sb.auth.admin.getUserById(id);
  if (!getErr && existing?.user?.id) {
    await sb.auth.admin.updateUserById(id, { password: pwd, email_confirm: true });
    return;
  }
  const { error: cErr } = await sb.auth.admin.createUser({
    id,
    email,
    password: pwd,
    email_confirm: true,
    user_metadata: {
      name: String(userRow.name || ''),
      app_role: String(userRow.role || '')
    }
  });
  if (cErr) throw cErr;
}

export default async function handler(req, res) {
  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch (e) {
    return res.status(401).json({ error: errorMessage(e) || 'missing_token' });
  }

  if (!(actor.role === 'super_admin' || actor.role === 'admin')) {
    return res.status(403).json({ error: 'forbidden' });
  }

  try {
    if (req.method === 'GET') {
      let q = supabaseAdmin
        .from('pending_registrations')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (actor.role === 'admin') {
        const inst = actor.institution_id ? String(actor.institution_id).trim() : '';
        if (inst) {
          q = q.or(`institution_id.eq.${inst},institution_id.is.null`);
        } else {
          q = q.is('institution_id', null);
        }
      }
      const { data, error } = await q;
      if (error) throw error;
      return res.status(200).json({ data: data || [] });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const op = String(body.op || '').trim().toLowerCase();
      const registrationId = String(body.id || body.registration_id || '').trim();
      if (!registrationId) return res.status(400).json({ error: 'id_required' });
      if (!(op === 'approve' || op === 'reject')) return res.status(400).json({ error: 'invalid_op' });

      const { data: pending, error: pErr } = await supabaseAdmin
        .from('pending_registrations')
        .select(
          'id, institution_id, first_name, last_name, tc_identity_no, email, phone_e164, class_level, branch, parent_name, parent_phone_e164, birth_date, requested_role, password_plain, status, created_at, updated_at'
        )
        .eq('id', registrationId)
        .maybeSingle();
      if (pErr) throw pErr;
      if (!pending) return res.status(404).json({ error: 'registration_not_found' });
      if (!actorCanManage(actor, pending)) return res.status(403).json({ error: 'forbidden' });
      if (String(pending.status || '') !== 'pending') return res.status(409).json({ error: 'already_processed' });

      if (op === 'reject') {
        const rejectionReason = String(body.rejection_reason || body.reason || '').trim() || null;
        const { data, error } = await supabaseAdmin
          .from('pending_registrations')
          .update({
            status: 'rejected',
            rejection_reason: rejectionReason,
            approved_by: actor.sub,
            approved_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', registrationId)
          .select('*')
          .single();
        if (error) throw error;
        return res.status(200).json({ data });
      }

      const email = String(pending.email || '').toLowerCase().trim();
      const role = normalizeRole(pending.requested_role);
      const passwordPlain = String(pending.password_plain || '').trim();
      if (!email || !role) return res.status(400).json({ error: 'invalid_pending_data' });
      if (passwordPlain.length < 6) {
        return res.status(400).json({
          error: 'missing_registration_password',
          message: 'Kayıt kaydında geçerli şifre bulunamadı. Kullanıcının kayıt formunu yeniden göndermesini isteyin.'
        });
      }
      const tcIdentityNo = String(pending.tc_identity_no || '').trim() || null;
      const classLevel = String(pending.class_level || '').trim() || null;
      const branch = String(pending.branch || '').trim() || null;
      const parentName = String(pending.parent_name || '').trim() || null;
      const parentPhone = String(pending.parent_phone_e164 || '').trim() || null;
      const birthDate = normalizeBirthDate(pending.birth_date);

      const { data: existingByEmail } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('email', email)
        .maybeSingle();
      if (existingByEmail?.id) {
        return res.status(409).json({ error: 'email_zaten_kullanimda' });
      }

      const institutionId = resolveApprovedInstitutionId(actor, pending, body.institution_id);

      if (STAFF_ROLES.has(role) && !institutionId) {
        return res.status(400).json({
          error: 'institution_required_for_staff',
          message:
            'Öğretmen, koç veya yönetici hesabı için kurum atanmalıdır. Kurum yöneticisi olarak onaylayın veya süper admin kurum seçerek onaylayın.'
        });
      }

      if (institutionId) {
        const { data: instRow, error: instErr } = await supabaseAdmin
          .from('institutions')
          .select('id')
          .eq('id', institutionId)
          .maybeSingle();
        if (instErr) throw instErr;
        if (!instRow?.id) {
          return res.status(400).json({
            error: 'invalid_institution_id',
            message: 'Seçilen kurum veritabanında bulunamadı.'
          });
        }
      }

      const userId = normalizeUuidOrGenerate(null);
      const fullName = `${String(pending.first_name || '').trim()} ${String(pending.last_name || '').trim()}`.trim();
      const now = new Date().toISOString();
      const insertUserPayload = {
        id: userId,
        email,
        name: fullName || email,
        phone: pending.phone_e164 || null,
        tc_identity_no: tcIdentityNo,
        role,
        roles: [role],
        password_hash: passwordPlain,
        institution_id: institutionId,
        is_active: true,
        package: 'trial',
        start_date: now,
        end_date: null,
        created_by: actor.sub,
        created_at: now,
        updated_at: now
      };

      const { data: createdUser, error: uErr } = await supabaseAdmin
        .from('users')
        .insert(insertUserPayload)
        .select('*')
        .single();
      if (uErr) throw uErr;

      try {
        await provisionSupabaseAuthUser(createdUser, passwordPlain);
      } catch (authErr) {
        console.warn('[registration-approvals] auth provision', errorMessage(authErr));
      }

      if (role === 'student') {
        const studentPayload = {
          name: fullName || email,
          email,
          phone: pending.phone_e164 || null,
          birth_date: birthDate,
          class_level: classLevel || '9',
          school: branch,
          branch,
          tc_identity_no: tcIdentityNo,
          parent_name: parentName,
          parent_phone: parentPhone,
          institution_id: insertUserPayload.institution_id,
          user_id: createdUser.id,
          platform_user_id: createdUser.id,
          updated_at: now
        };

        const { data: existingStudentByEmail } = await supabaseAdmin
          .from('students')
          .select('id')
          .eq('email', email)
          .maybeSingle();

        if (existingStudentByEmail?.id) {
          const { error: stUpdErr } = await supabaseAdmin
            .from('students')
            .update(studentPayload)
            .eq('id', existingStudentByEmail.id);
          if (stUpdErr) throw stUpdErr;
        } else {
          const { error: stInsErr } = await supabaseAdmin.from('students').insert({
            id: normalizeUuidOrGenerate(null),
            ...studentPayload,
            coach_id: null,
            created_at: now
          });
          if (stInsErr) throw stInsErr;
        }
      }

      if (role === 'coach' || role === 'teacher') {
        await upsertCoachProfile({
          userId: createdUser.id,
          fullName: fullName || email,
          email,
          phone: pending.phone_e164 || null,
          institutionId,
          now
        });
      }

      const { data: updatedPending, error: pUpdErr } = await supabaseAdmin
        .from('pending_registrations')
        .update({
          status: 'approved',
          approved_user_id: createdUser.id,
          approved_by: actor.sub,
          approved_at: now,
          updated_at: now
        })
        .eq('id', registrationId)
        .select('*')
        .single();
      if (pUpdErr) throw pUpdErr;

      return res.status(200).json({ data: { pending: updatedPending, user: createdUser } });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    const msg = errorMessage(e);
    console.error('[registration-approvals]', msg, e);
    return res.status(500).json({ error: msg || 'registration_approval_failed' });
  }
}
