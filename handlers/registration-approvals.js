import { requireAuthenticatedActor, hasInstitutionAccess } from '../api/_lib/auth.js';
import { supabaseAdmin, getSupabaseAdmin, hasSupabaseServiceRoleKey } from '../api/_lib/supabase-admin.js';
import { normalizeUuidOrGenerate } from '../api/_lib/uuid.js';
import { errorMessage } from '../api/_lib/error-msg.js';

function normalizeRole(raw) {
  const v = String(raw || '').trim().toLowerCase();
  return ['admin', 'coach', 'teacher', 'student'].includes(v) ? v : '';
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
  return hasInstitutionAccess(actor, row.institution_id);
}

async function provisionSupabaseAuthUser(userRow, passwordPlain) {
  if (!hasSupabaseServiceRoleKey()) return;
  const sb = getSupabaseAdmin();
  const { data: existing } = await sb.auth.admin.getUserById(String(userRow.id));
  if (existing?.user?.id) return;
  await sb.auth.admin.createUser({
    id: String(userRow.id),
    email: String(userRow.email || '').toLowerCase().trim(),
    password: String(passwordPlain || ''),
    email_confirm: true,
    user_metadata: {
      name: String(userRow.name || ''),
      app_role: String(userRow.role || '')
    }
  });
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
        q = q.eq('institution_id', actor.institution_id || '');
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
        .select('*')
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
      if (!email || !role) return res.status(400).json({ error: 'invalid_pending_data' });
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
        password_hash: String(pending.password_plain || ''),
        institution_id: pending.institution_id || (actor.role === 'admin' ? actor.institution_id || null : null),
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
        await provisionSupabaseAuthUser(createdUser, String(pending.password_plain || ''));
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
