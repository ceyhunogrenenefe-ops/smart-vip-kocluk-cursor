import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { signAuthToken } from '../api/_lib/auth.js';
import { resolveStudentRowForUser } from '../api/_lib/resolve-student-id.js';
import { withDbTimeout } from '../api/_lib/db-timeout.js';
import { errorMessage } from '../api/_lib/error-msg.js';

/**
 * AuthContext.tsx içindeki DEMO_USERS ile aynı kimlik bilgileri — UI demo girişi sonrası JWT üretmek için.
 */
const DEMO_ACCOUNTS = [
  { email: 'admin@smartkocluk.com', password: 'Admin123!', role: 'super_admin', name: 'Süper Admin' },
  { email: 'admin@smartvip.com', password: 'admin123', role: 'admin', name: 'Admin' },
  { email: 'ogretmen@smartvip.com', password: 'ogretmen123', role: 'coach', name: 'Öğretmen Koç' },
  { email: 'ogrenci@smartvip.com', password: 'ogrenci123', role: 'student', name: 'Öğrenci' }
];

const USER_LOGIN_COLUMNS =
  'id, name, email, phone, role, password_hash, institution_id, package, start_date, end_date, is_active, created_at';

async function lookupUserByEmail(normalizedEmail) {
  const { data, error } = await withDbTimeout(
    supabaseAdmin.from('users').select(USER_LOGIN_COLUMNS).eq('email', normalizedEmail).maybeSingle(),
    12000,
    'users_lookup'
  );
  if (error) throw error;
  return data;
}

async function resolveCoachIdByEmail(normalizedEmail, altEmail) {
  try {
    let { data: co } = await withDbTimeout(
      supabaseAdmin.from('coaches').select('id').eq('email', normalizedEmail).maybeSingle(),
      5000,
      'coach_lookup'
    );
    if (!co?.id && altEmail && altEmail !== normalizedEmail) {
      ({ data: co } = await withDbTimeout(
        supabaseAdmin.from('coaches').select('id').eq('email', altEmail).maybeSingle(),
        4000,
        'coach_lookup_alt'
      ));
    }
    return co?.id ?? null;
  } catch (e) {
    console.warn('[auth-login] coach lookup skipped:', e instanceof Error ? e.message : e);
    return null;
  }
}

async function resolveStudentIdForLogin(userId, email) {
  try {
    const resolved = await withDbTimeout(
      resolveStudentRowForUser({ userId, email, institutionId: null }),
      8000,
      'student_lookup'
    );
    return resolved?.id ?? null;
  } catch (e) {
    console.warn('[auth-login] student lookup skipped:', e instanceof Error ? e.message : e);
    return null;
  }
}

/** Demo JWT `sub` değeri FK ile users tablosunda olmalı. Yavaşsa girişi bloklamaz. */
function upsertDemoUserRowFireAndForget(demo, stableDemoId) {
  const now = new Date().toISOString();
  const row = {
    id: stableDemoId,
    email: String(demo.email).toLowerCase().trim(),
    name: demo.name,
    phone: '0500 000 00 00',
    role: demo.role,
    password_hash: String(demo.password),
    institution_id: null,
    is_active: true,
    package: 'enterprise',
    start_date: now,
    end_date: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString(),
    created_by: null,
    created_at: now,
    updated_at: now
  };
  void supabaseAdmin
    .from('users')
    .upsert(row, { onConflict: 'id' })
    .then(({ error }) => {
      if (error) console.warn('[auth-login] upsertDemoUserRow:', errorMessage(error));
    });
}

function buildTokenResponse(userView, jwtRole, jwtInstitutionId, coachId, studentId) {
  const token = signAuthToken({
    sub: userView.id,
    role: jwtRole,
    institution_id: jwtInstitutionId,
    coach_id: coachId || null,
    student_id: studentId || null
  });
  return { token, user: userView };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });

    const normalizedEmail = String(email).toLowerCase().trim();
    const passwordStr = String(password);

    const demo = DEMO_ACCOUNTS.find((d) => d.email === normalizedEmail && d.password === passwordStr);
    if (demo) {
      const stableDemoId = `demo-${demo.role}`;
      let coachId = null;
      let studentId = null;

      if (demo.role === 'coach') {
        coachId = await resolveCoachIdByEmail(normalizedEmail, null);
      } else if (demo.role === 'student') {
        studentId = await resolveStudentIdForLogin(null, normalizedEmail);
      }

      let existingByEmail = null;
      try {
        existingByEmail = await lookupUserByEmail(normalizedEmail);
      } catch (e) {
        console.warn('[auth-login] demo users lookup skipped:', e instanceof Error ? e.message : e);
      }

      let userView;
      let jwtRole = demo.role;
      let jwtInstitutionId = null;

      if (existingByEmail?.id) {
        userView = {
          id: existingByEmail.id,
          name: existingByEmail.name || demo.name,
          email: normalizedEmail,
          phone: existingByEmail.phone || undefined,
          role: existingByEmail.role || demo.role,
          studentId: studentId || undefined,
          coachId: coachId || undefined,
          institutionId: existingByEmail.institution_id ?? undefined,
          package: existingByEmail.package || undefined,
          startDate: existingByEmail.start_date || undefined,
          endDate: existingByEmail.end_date || undefined,
          isActive: existingByEmail.is_active !== false,
          createdAt: existingByEmail.created_at
        };
        jwtRole = existingByEmail.role || demo.role;
        jwtInstitutionId = existingByEmail.institution_id || null;
      } else {
        userView = {
          id: stableDemoId,
          name: demo.name,
          email: demo.email,
          role: demo.role,
          studentId: studentId || undefined,
          coachId: coachId || undefined,
          institutionId: undefined,
          isActive: true
        };
        upsertDemoUserRowFireAndForget(demo, stableDemoId);
      }

      return res.status(200).json(buildTokenResponse(userView, jwtRole, jwtInstitutionId, coachId, studentId));
    }

    let user;
    try {
      user = await lookupUserByEmail(normalizedEmail);
    } catch (e) {
      console.error('[auth-login] users lookup', e instanceof Error ? e.message : e);
      return res.status(503).json({ error: 'auth_unavailable' });
    }

    if (!user) return res.status(401).json({ error: 'invalid_credentials' });
    if (user.password_hash !== passwordStr) return res.status(401).json({ error: 'invalid_credentials' });
    if (user.role === 'pending_approval') return res.status(403).json({ error: 'pending_approval' });
    if (user.is_active === false) return res.status(403).json({ error: 'inactive_user' });

    let studentId;
    let coachId;
    let institutionId = user.institution_id || null;

    if (user.role === 'student') {
      studentId = (await resolveStudentIdForLogin(user.id, user.email)) || undefined;
    } else if (user.role === 'coach' || user.role === 'teacher') {
      coachId = (await resolveCoachIdByEmail(normalizedEmail, user.email)) || undefined;
      if (coachId && !institutionId) {
        try {
          const { data: coInst } = await withDbTimeout(
            supabaseAdmin.from('coaches').select('institution_id').eq('id', coachId).maybeSingle(),
            4000,
            'coach_institution'
          );
          if (coInst?.institution_id) institutionId = coInst.institution_id;
        } catch {
          /* ignore */
        }
      }
    }

    const userView = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone || undefined,
      role: user.role,
      studentId,
      coachId,
      institutionId: institutionId || undefined,
      package: user.package || undefined,
      startDate: user.start_date || undefined,
      endDate: user.end_date || undefined,
      isActive: user.is_active,
      createdAt: user.created_at
    };

    return res
      .status(200)
      .json(buildTokenResponse(userView, user.role, institutionId, coachId || null, studentId || null));
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'auth_failed' });
  }
}
