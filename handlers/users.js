import { requireAuth, hasInstitutionAccess } from '../api/_lib/auth.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { normalizeUuidOrGenerate } from '../api/_lib/uuid.js';

const USER_ROLES = ['super_admin', 'admin', 'coach', 'teacher', 'student'];

async function coachAssignedStudentEmails(coachId) {
  if (!coachId) return [];
  const { data, error } = await supabaseAdmin.from('students').select('email').eq('coach_id', coachId);
  if (error) throw error;
  return (data || [])
    .map((r) => String(r.email || '').toLowerCase().trim())
    .filter(Boolean);
}

const actorCanSeeUserRowSync = (actor, row) => {
  if (!row) return false;
  if (actor.role === 'super_admin') return true;
  if (actor.role === 'admin')
    return hasInstitutionAccess(actor, row.institution_id) && row.role !== 'super_admin';
  if (actor.role === 'teacher')
    return row.role === 'student' && hasInstitutionAccess(actor, row.institution_id);
  return false;
};

async function actorCanSeeUserRow(actor, row) {
  const base = actorCanSeeUserRowSync(actor, row);
  if (base) return true;
  if (actor.role === 'coach' && row?.role === 'student' && actor.coach_id && row.institution_id) {
    const okInst = actor.institution_id && row.institution_id === actor.institution_id;
    if (!okInst) return false;
    const emails = await coachAssignedStudentEmails(actor.coach_id);
    return emails.includes(String(row.email || '').toLowerCase().trim());
  }
  return false;
}

const actorMayAssignRole = (actor, newRole) => {
  if (!USER_ROLES.includes(newRole)) return false;
  if (newRole === 'super_admin') return false;
  if (actor.role === 'super_admin') return ['admin', 'coach', 'teacher', 'student'].includes(newRole);
  if (actor.role === 'admin') return ['coach', 'teacher', 'student'].includes(newRole);
  if (actor.role === 'teacher') return newRole === 'student';
  if (actor.role === 'coach') return newRole === 'student';
  return false;
};

const createdByForInsert = (actor) => {
  if (!actor?.sub || actor.sub === 'anonymous') return null;
  return actor.sub;
};

/** Boş string FK hatasına yol açmasın */
function normalizeInstitutionId(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  return s.length ? s : null;
}

/** created_by yalnızca gerçekten users tablosunda varsa (aksi FK 23503) */
async function resolveCreatedByFk(actor) {
  const raw = createdByForInsert(actor);
  if (!raw) return null;
  const { data, error } = await supabaseAdmin.from('users').select('id').eq('id', raw).maybeSingle();
  if (error || !data?.id) return null;
  return data.id;
}

export default async function handler(req, res) {
  try {
    const actor = requireAuth(req);

    if (req.method === 'GET') {
      if (!(actor.role === 'super_admin' || actor.role === 'admin' || actor.role === 'teacher' || actor.role === 'coach')) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const email = req.query.email ? String(req.query.email).toLowerCase().trim() : null;

      // Koç: çok öğrencide .in('email', yüzlerce adres) PostgREST URL sınırına takılıp 500 üretir —
      // kurum içi öğrenci kullanıcılarını çekip atanmış e-postaya göre JS'de süzülür.
      if (actor.role === 'coach') {
        if (!actor.coach_id || !actor.institution_id) return res.status(200).json({ data: [] });
        const assignedEmails = await coachAssignedStudentEmails(actor.coach_id);
        const emailSet = new Set(assignedEmails);
        if (email && !emailSet.has(email)) return res.status(200).json({ data: [] });

        let q = supabaseAdmin
          .from('users')
          .select('*')
          .eq('institution_id', actor.institution_id)
          .eq('role', 'student')
          .order('created_at', { ascending: false });
        if (email) q = q.eq('email', email);
        const { data: coachUsers, error: coachErr } = await q;
        if (coachErr) throw coachErr;
        const rows = coachUsers || [];
        const filtered = email
          ? rows
          : rows.filter((u) => emailSet.has(String(u.email || '').toLowerCase().trim()));
        return res.status(200).json({ data: filtered });
      }

      let query = supabaseAdmin.from('users').select('*').order('created_at', { ascending: false });
      if (actor.role === 'admin') {
        if (!actor.institution_id) return res.status(200).json({ data: [] });
        query = query.eq('institution_id', actor.institution_id);
      }
      if (actor.role === 'teacher') {
        if (!actor.institution_id) return res.status(200).json({ data: [] });
        query = query.eq('institution_id', actor.institution_id).eq('role', 'student');
      }
      if (email) query = query.eq('email', email);
      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json({ data: data || [] });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      if (
        !(actor.role === 'super_admin' ||
          actor.role === 'admin' ||
          actor.role === 'teacher' ||
          actor.role === 'coach')
      ) {
        return res.status(403).json({ error: 'forbidden' });
      }

      const newRole = String(body.role || '');
      if (!actorMayAssignRole(actor, newRole)) {
        return res.status(403).json({ error: 'role_forbidden' });
      }

      let institutionId = normalizeInstitutionId(
        actor.role === 'teacher' || actor.role === 'coach'
          ? actor.institution_id
          : body.institution_id || actor.institution_id || null
      );

      if (
        actor.role !== 'teacher' &&
        actor.role !== 'coach' &&
        actor.role !== 'super_admin' &&
        !hasInstitutionAccess(actor, institutionId)
      ) {
        return res.status(403).json({ error: 'institution_forbidden' });
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
            error:
              'Seçilen kurum veritabanında yok. Kurumlar sayfasından geçerli bir kurum seçin veya süper admin olarak kurumu önce oluşturun; kurumsuz kullanıcı için kurum alanını boş bırakın.',
            code: 'invalid_institution_id'
          });
        }
      }
      if (actor.role === 'teacher' && !actor.institution_id) {
        return res.status(403).json({ error: 'institution_missing' });
      }
      if (actor.role === 'coach') {
        if (!actor.institution_id || !actor.coach_id) {
          return res.status(403).json({ error: 'coach_profile_missing' });
        }
        if (newRole !== 'student') return res.status(403).json({ error: 'role_forbidden' });
        const pwd = String(body.password_hash || body.password || '').trim();
        if (pwd.length < 6) {
          return res.status(400).json({ error: 'password_required_min_6' });
        }
        const pendingEmail = String(body.email || '')
          .toLowerCase()
          .trim();
        if (!pendingEmail) return res.status(400).json({ error: 'email required' });
        const { data: assignedRow } = await supabaseAdmin
          .from('students')
          .select('id')
          .eq('coach_id', actor.coach_id)
          .eq('email', pendingEmail)
          .maybeSingle();
        if (!assignedRow) {
          return res.status(400).json({ error: 'student_must_exist_for_coach' });
        }
      }

      const {
        bootstrap_max_students,
        bootstrap_max_coaches,
        bootstrap_package_label,
        ...rest
      } = body;

      const passwordPlain = String(rest.password_hash ?? rest.password ?? '').trim();
      if (passwordPlain.length < 6) {
        return res.status(400).json({ error: 'password_required_min_6' });
      }

      const createdByFk = await resolveCreatedByFk(actor);

      const payload = {
        id: normalizeUuidOrGenerate(rest.id),
        email: String(rest.email || '')
          .toLowerCase()
          .trim(),
        name: rest.name,
        phone: rest.phone ?? null,
        role: newRole,
        password_hash: passwordPlain,
        institution_id: institutionId,
        is_active: rest.is_active !== false,
        package: rest.package || 'trial',
        start_date: rest.start_date || new Date().toISOString(),
        end_date: rest.end_date || null,
        created_by: createdByFk,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabaseAdmin.from('users').insert(payload).select().single();
      if (error) throw error;

      if (data.role === 'admin' && actor.role === 'super_admin') {
        const ms = Number(bootstrap_max_students);
        const mc = Number(bootstrap_max_coaches);
        await supabaseAdmin.from('admin_limits').upsert(
          {
            admin_id: data.id,
            max_students: ms > 0 ? ms : 50,
            max_coaches: mc > 0 ? mc : 10,
            package_label: bootstrap_package_label || 'professional',
            updated_at: new Date().toISOString()
          },
          { onConflict: 'admin_id' }
        );
      }

      return res.status(200).json({ data });
    }

    if (req.method === 'PATCH') {
      if (!(actor.role === 'super_admin' || actor.role === 'admin' || actor.role === 'teacher' || actor.role === 'coach')) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const id = String(req.query.id || '');
      if (!id) return res.status(400).json({ error: 'id required' });

      const { data: existing } = await supabaseAdmin.from('users').select('*').eq('id', id).maybeSingle();
      if (!existing || !(await actorCanSeeUserRow(actor, existing))) {
        return res.status(403).json({ error: 'forbidden' });
      }

      const raw = req.body || {};
      if (existing.role === 'super_admin' && actor.role !== 'super_admin') {
        return res.status(403).json({ error: 'forbidden' });
      }

      if (
        raw.role !== undefined &&
        String(raw.role) !== String(existing.role) &&
        !actorMayAssignRole(actor, String(raw.role))
      ) {
        return res.status(403).json({ error: 'role_forbidden' });
      }

      const teacherAllowed = ['name', 'phone', 'email', 'password_hash', 'is_active', 'package', 'start_date', 'end_date'];
      const coachStudentAllowed = ['name', 'phone', 'email', 'password_hash', 'is_active', 'package', 'start_date', 'end_date'];
      const adminPlus = [...teacherAllowed, 'role', 'institution_id'];
      const keys =
        actor.role === 'teacher'
          ? teacherAllowed
          : actor.role === 'coach'
            ? coachStudentAllowed
            : adminPlus;
      const body = {};
      for (const k of keys) {
        if (Object.prototype.hasOwnProperty.call(raw, k)) body[k] = raw[k];
      }

      if (actor.role === 'admin' && body.institution_id !== undefined) {
        if (!hasInstitutionAccess(actor, body.institution_id)) {
          return res.status(403).json({ error: 'institution_forbidden' });
        }
      }

      const { data, error } = await supabaseAdmin
        .from('users')
        .update({ ...body, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json({ data });
    }

    if (req.method === 'DELETE') {
      if (actor.role === 'teacher') return res.status(403).json({ error: 'forbidden' });
      if (!(actor.role === 'super_admin' || actor.role === 'admin')) {
        return res.status(403).json({ error: 'forbidden' });
      }

      const id = String(req.query.id || '');
      if (!id) return res.status(400).json({ error: 'id required' });

      const { data: existing } = await supabaseAdmin.from('users').select('*').eq('id', id).maybeSingle();
      if (!existing || !(await actorCanSeeUserRow(actor, existing))) {
        return res.status(403).json({ error: 'forbidden' });
      }

      const { error } = await supabaseAdmin.from('users').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    const msg = errorMessage(e);
    const pgCode =
      e && typeof e === 'object' && 'code' in e && typeof /** @type {{ code?: string }} */ (e).code === 'string'
        ? /** @type {{ code?: string }} */ (e).code
        : '';

    if (
      msg === 'Missing token' ||
      msg === 'Invalid token' ||
      msg === 'Invalid signature' ||
      msg === 'Token expired'
    ) {
      return res.status(401).json({ error: msg });
    }

    if (pgCode === '23505') {
      return res.status(400).json({
        error: 'Bu e-posta adresi zaten kayıtlı.',
        code: 'duplicate_email'
      });
    }
    if (pgCode === '23503') {
      return res.status(400).json({
        error:
          'Kayıt reddedildi: kurum veya ilişkili kullanıcı referansı geçersiz. Kurum seçiminizi kontrol edin veya destek ile iletişime geçin.',
        code: 'foreign_key_violation',
        details: msg
      });
    }
    if (pgCode === '23514') {
      return res.status(400).json({
        error:
          'Rol veya alan kısıtı: veritabanında `teacher` rolü veya başka bir CHECK henüz güncellenmemiş olabilir. Supabase SQL ile users.role izinlerini güncelleyin.',
        code: 'check_violation',
        details: msg
      });
    }

    console.error('[users]', msg, e);
    return res.status(500).json({ error: msg });
  }
}

