import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { signAuthToken } from '../api/_lib/auth.js';
import { resolveStudentRowForUser } from '../api/_lib/resolve-student-id.js';
import { errorMessage } from '../api/_lib/error-msg.js';

/**
 * AuthContext.tsx içindeki DEMO_USERS ile aynı kimlik bilgileri — UI demo girişi sonrası JWT üretmek için.
 * (`teacher_lessons.teacher_id` → users.id FK için demo kimliği ya DB’deki gerçek satırla eşlenir ya da upsert edilir.)
 */
const DEMO_ACCOUNTS = [
  { email: 'admin@smartkocluk.com', password: 'Admin123!', role: 'super_admin', name: 'Süper Admin' },
  { email: 'admin@smartvip.com', password: 'admin123', role: 'admin', name: 'Admin' },
  { email: 'ogretmen@smartvip.com', password: 'ogretmen123', role: 'coach', name: 'Öğretmen Koç' },
  { email: 'ogrenci@smartvip.com', password: 'ogrenci123', role: 'student', name: 'Öğrenci' }
];

/** Demo JWT `sub` değeri FK ile users tablosunda olmalı (örn. teacher_lessons.teacher_id). */
async function upsertDemoUserRow(demo, stableDemoId) {
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
  const { error } = await supabaseAdmin.from('users').upsert(row, { onConflict: 'id' });
  if (error) {
    console.warn('[auth-login] upsertDemoUserRow:', errorMessage(error));
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });

    const normalizedEmail = String(email).toLowerCase().trim();

    const demo = DEMO_ACCOUNTS.find(
      d => d.email === normalizedEmail && d.password === String(password)
    );
    if (demo) {
      let coachId = null;
      let studentId = null;
      try {
        if (demo.role === 'coach') {
          let { data: co } = await supabaseAdmin
            .from('coaches')
            .select('id')
            .eq('email', normalizedEmail)
            .maybeSingle();
          if (!co?.id) {
            ({ data: co } = await supabaseAdmin
              .from('coaches')
              .select('id')
              .ilike('email', normalizedEmail)
              .maybeSingle());
          }
          coachId = co?.id ?? null;
        } else if (demo.role === 'student') {
          const resolved = await resolveStudentRowForUser({
            userId: null,
            email: normalizedEmail,
            institutionId: null
          });
          studentId = resolved?.id ?? null;
        }
      } catch {
        /* demo JWT yine de üretilsin */
      }

      const stableDemoId = `demo-${demo.role}`;

      const { data: existingByEmail } = await supabaseAdmin
        .from('users')
        .select(
          'id, name, email, phone, role, institution_id, package, start_date, end_date, is_active, created_at'
        )
        .eq('email', normalizedEmail)
        .maybeSingle();

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
        await upsertDemoUserRow(demo, stableDemoId);
      }

      const token = signAuthToken({
        sub: userView.id,
        role: jwtRole,
        institution_id: jwtInstitutionId,
        coach_id: coachId,
        student_id: studentId
      });

      return res.status(200).json({ token, user: userView });
    }

    let { data: user, error: userErr } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (!userErr && !user && normalizedEmail) {
      const r2 = await supabaseAdmin.from('users').select('*').ilike('email', normalizedEmail).maybeSingle();
      if (!r2.error) {
        user = r2.data;
      } else {
        userErr = r2.error;
      }
    }

    if (userErr) {
      console.error('[auth-login] users lookup', userErr.message || userErr);
      return res.status(503).json({ error: 'auth_unavailable' });
    }
    if (!user) return res.status(401).json({ error: 'invalid_credentials' });
    if (user.password_hash !== password) return res.status(401).json({ error: 'invalid_credentials' });
    if (user.is_active === false) return res.status(403).json({ error: 'inactive_user' });

    let studentId;
    let coachId;
    if (user.role === 'student') {
      const resolved = await resolveStudentRowForUser({
        userId: user.id,
        email: user.email,
        institutionId: user.institution_id
      });
      studentId = resolved?.id;
    } else if (user.role === 'coach' || user.role === 'teacher') {
      let { data: co } = await supabaseAdmin
        .from('coaches')
        .select('id')
        .eq('email', normalizedEmail)
        .maybeSingle();
      if (!co?.id) {
        ({ data: co } = await supabaseAdmin
          .from('coaches')
          .select('id')
          .ilike('email', normalizedEmail)
          .maybeSingle());
      }
      if (!co?.id) {
        const alt = user.email ? String(user.email).toLowerCase().trim() : '';
        if (alt && alt !== normalizedEmail) {
          ({ data: co } = await supabaseAdmin.from('coaches').select('id').eq('email', alt).maybeSingle());
        }
      }
      coachId = co?.id;
    }

    const userView = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone || undefined,
      role: user.role,
      studentId,
      coachId,
      institutionId: user.institution_id || undefined,
      package: user.package || undefined,
      startDate: user.start_date || undefined,
      endDate: user.end_date || undefined,
      isActive: user.is_active,
      createdAt: user.created_at
    };

    const token = signAuthToken({
      sub: user.id,
      role: user.role,
      institution_id: user.institution_id || null,
      coach_id: coachId || null,
      student_id: studentId || null
    });

    return res.status(200).json({ token, user: userView });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'auth_failed' });
  }
}


