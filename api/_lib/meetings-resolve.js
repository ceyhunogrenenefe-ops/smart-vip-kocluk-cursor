import { supabaseAdmin } from './supabase-admin.js';
import { normalizePhoneToE164 } from './whatsapp-twilio.js';

export async function coachRowToPlatformUserId(coachId) {
  const { data: coach, error } = await supabaseAdmin.from('coaches').select('email').eq('id', coachId).maybeSingle();
  if (error) throw error;
  if (!coach?.email) return null;
  const normalized = String(coach.email).toLowerCase().trim();
  const { data: userRows, error: uerr } = await supabaseAdmin
    .from('users')
    .select('id, role')
    .eq('email', normalized);
  if (uerr) throw uerr;
  const rows = userRows || [];
  if (rows.length === 0) return null;
  const asCoach = rows.find((r) => r.role === 'coach');
  const asTeacher = rows.find((r) => r.role === 'teacher');
  return asCoach?.id ?? asTeacher?.id ?? rows[0]?.id ?? null;
}

export async function getStudentPhones(studentRow) {
  const candidates = [];

  const toE164 = (tr) => {
    const digits = String(tr || '').replace(/\D/g, '');
    if (!digits) return null;
    if (digits.startsWith('90') && digits.length >= 12) return `+${digits}`;
    if (digits.startsWith('0') && digits.length === 11) return `+90${digits.slice(1)}`;
    if (digits.length === 10 && digits.startsWith('5')) return `+90${digits}`;
    if (digits.startsWith('+')) return `+${digits.replace(/^\+/, '').replace(/\D/g, '')}`;
    return null;
  };

  const push = (raw) => {
    const a = toE164(raw);
    if (a && !candidates.includes(a)) candidates.push(a);
  };

  push(studentRow.phone);
  push(studentRow.parent_phone);

  try {
    if (studentRow.email) {
      const em = String(studentRow.email).toLowerCase().trim();
      const { data: u } = await supabaseAdmin.from('users').select('phone').eq('email', em).eq('role', 'student').maybeSingle();
      if (u?.phone) push(u.phone);
    }
  } catch {
    // ignore lookup failures
  }

  return candidates;
}

/** Günlük rapor hatırlatması: yalnızca öğrenci hattı (veli hariç) */
export async function getStudentPhoneForReport(studentRow) {
  const toE164 = (tr) => {
    const digits = String(tr || '').replace(/\D/g, '');
    if (!digits) return null;
    if (digits.startsWith('90') && digits.length >= 12) return `+${digits}`;
    if (digits.startsWith('0') && digits.length === 11) return `+90${digits.slice(1)}`;
    if (digits.length === 10 && digits.startsWith('5')) return `+90${digits}`;
    if (digits.startsWith('+')) return `+${digits.replace(/^\+/, '').replace(/\D/g, '')}`;
    return null;
  };
  const direct = toE164(studentRow.phone);
  if (direct) return direct;
  try {
    if (studentRow.email) {
      const em = String(studentRow.email).toLowerCase().trim();
      const { data: u } = await supabaseAdmin.from('users').select('phone').eq('email', em).eq('role', 'student').maybeSingle();
      if (u?.phone) return toE164(u.phone);
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Veli / öğrenci şablonu — aynı numarada tek mesaj (öğrenci) */
export function classifyLessonReminderRecipients(studentRow, orderedPhones) {
  const st = normalizePhoneToE164(studentRow.phone || '');
  const pr = normalizePhoneToE164(studentRow.parent_phone || '');
  return orderedPhones.map((ph) => {
    const isOnlyParent = Boolean(pr && ph === pr && !st);
    const isParentLine = Boolean(
      pr && ph === pr && st && ph !== st
    );
    return { phone: ph, role: isOnlyParent || isParentLine ? 'parent' : 'student' };
  });
}
