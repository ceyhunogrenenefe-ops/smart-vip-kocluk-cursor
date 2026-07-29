/**
 * Site öğretmen başvurusu → users + teacher_profiles (pending_approval)
 */
import { randomUUID } from 'crypto';
import { supabaseAdmin } from './supabase-admin.js';
import { normalizePhoneToE164 } from './phone-whatsapp.js';
import { normalizeUuidOrGenerate } from './uuid.js';
import {
  applyPatchToWorking,
  completionPercent,
  ensureTeacherProfileForUser,
  writeAuditLog
} from './teacher-profile.js';
import { notifyTeacherProfileEvent } from './teacher-profile-notify.js';

function cleanStr(raw) {
  return String(raw || '').trim();
}

function toLowerEmail(raw) {
  return cleanStr(raw).toLowerCase();
}

function isHttpUrl(raw) {
  const u = cleanStr(raw);
  if (!u) return false;
  try {
    const parsed = new URL(u);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function parseGradeLevels(raw) {
  if (Array.isArray(raw)) {
    return raw.map((x) => cleanStr(x)).filter(Boolean);
  }
  const s = cleanStr(raw);
  if (!s) return [];
  return s
    .split(/[,;|]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function experienceLabelToYears(label) {
  const v = cleanStr(label).toLowerCase();
  if (!v) return null;
  if (v.includes('10') && (v.includes('üzeri') || v.includes('uzeri'))) return 10;
  if (v.includes('5-10') || v.includes('5 – 10')) return 7;
  if (v.includes('3-5') || v.includes('3 – 5')) return 4;
  if (v.includes('1-3') || v.includes('1 – 3')) return 2;
  if (v.includes('1 yıldan') || v.includes('1 yildan') || v.includes('az')) return 0;
  const n = parseInt(v.replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

export function normalizeTeacherApplicationBody(body) {
  const b = body && typeof body === 'object' ? body : {};
  const firstName = cleanStr(b.first_name || b.firstName || b.ad);
  const lastName = cleanStr(b.last_name || b.lastName || b.soyad);
  let first = firstName;
  let last = lastName;
  if (!first && !last && b.ad_soyad) {
    const parts = cleanStr(b.ad_soyad).split(/\s+/).filter(Boolean);
    if (parts.length === 1) first = parts[0];
    else if (parts.length > 1) {
      last = parts[parts.length - 1];
      first = parts.slice(0, -1).join(' ');
    }
  }

  const experienceLabel = cleanStr(b.experience_label || b.deneyim || b.experience);
  const gradRaw = b.graduation_year ?? b.mezuniyet_yili ?? b.mezuniyetYili;
  let graduationYear = gradRaw === '' || gradRaw == null ? null : Number(gradRaw);
  if (Number.isNaN(graduationYear)) graduationYear = null;

  const intro = cleanStr(b.intro_video_url || b.tanitim_video || b.tanitimVideo || b.video_url);
  const lesson = cleanStr(b.lesson_video_url || b.ders_video || b.dersVideo);

  return {
    first_name: first,
    last_name: last,
    email: toLowerEmail(b.email || b.mail || b.eposta),
    phone_e164: normalizePhoneToE164(b.phone || b.telefon),
    branch: cleanStr(b.branch || b.brans),
    experience_label: experienceLabel,
    experience_years:
      b.experience_years != null && b.experience_years !== ''
        ? Number(b.experience_years)
        : experienceLabelToYears(experienceLabel),
    address_text: cleanStr(b.address || b.adres || b.address_text),
    university: cleanStr(b.university || b.universite),
    graduation_year: graduationYear,
    short_bio: cleanStr(b.short_bio || b.kisa_tanitim || b.tanitim_kisa),
    full_bio: cleanStr(b.full_bio || b.tanitim || b.ozgecmis),
    photo_url: cleanStr(b.photo_url || b.foto_url || b.foto),
    intro_video_url: intro,
    lesson_video_url: lesson,
    instagram_url: cleanStr(b.instagram || b.instagram_url),
    youtube_url: cleanStr(b.youtube || b.youtube_url),
    grade_levels: parseGradeLevels(b.grade_levels || b.sinif_seviyeleri || b.seviyeler),
    kvkk_accepted: Boolean(b.kvkk_accepted || b.kvkk),
    _gotcha: cleanStr(b._gotcha || b.website)
  };
}

export function validateTeacherApplication(data) {
  if (data._gotcha) return null;
  if (!data.first_name || !data.last_name) return 'Ad ve soyad zorunludur.';
  if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return 'Geçerli e-posta girin.';
  if (!data.phone_e164) return 'Geçerli telefon numarası girin.';
  if (!data.branch) return 'Branş seçin.';
  if (!data.university) return 'Mezun olduğunuz üniversite zorunludur.';
  if (!data.graduation_year || data.graduation_year < 1950 || data.graduation_year > 2035) {
    return 'Geçerli mezuniyet yılı girin.';
  }
  if (!data.address_text) return 'Adres (en az il) zorunludur.';
  if (!data.short_bio || data.short_bio.length < 20) return 'Kısa tanıtım en az 20 karakter olmalıdır.';
  if (!data.full_bio || data.full_bio.length < 40) return 'Özgeçmiş en az 40 karakter olmalıdır.';
  if (!isHttpUrl(data.photo_url)) return 'Profil fotoğrafı için geçerli bir link girin (Google Drive vb.).';
  if (!isHttpUrl(data.intro_video_url)) return 'Tanıtım videosu için YouTube veya Drive linki girin.';
  if (!isHttpUrl(data.lesson_video_url)) return 'Ders videosu için YouTube veya Drive linki girin.';
  if (!data.grade_levels?.length) return 'En az bir ders seviyesi seçin.';
  if (!data.kvkk_accepted) return 'KVKK metnini onaylamanız gerekir.';
  if (data.instagram_url && !isHttpUrl(data.instagram_url)) return 'Geçerli Instagram linki girin.';
  if (data.youtube_url && !isHttpUrl(data.youtube_url)) return 'Geçerli YouTube linki girin.';
  return null;
}

function buildFullBioWithExtras(data) {
  const lines = [data.full_bio];
  const extras = [];
  if (data.lesson_video_url) extras.push(`Ders demosu videosu: ${data.lesson_video_url}`);
  if (data.instagram_url) extras.push(`Instagram: ${data.instagram_url}`);
  if (data.youtube_url) extras.push(`YouTube: ${data.youtube_url}`);
  if (data.experience_label) extras.push(`Deneyim: ${data.experience_label}`);
  if (extras.length) {
    lines.push('', '--- Başvuru ekleri ---', ...extras);
  }
  return lines.join('\n').trim();
}

function profilePatchFromApplication(data) {
  const displayName = [data.first_name, data.last_name].filter(Boolean).join(' ').trim();
  const title = `${data.branch} Öğretmeni`;
  const expYears =
    data.experience_years != null && !Number.isNaN(data.experience_years)
      ? data.experience_years
      : null;

  return {
    first_name: data.first_name,
    last_name: data.last_name,
    display_name: displayName,
    title,
    branch: data.branch,
    short_bio: data.short_bio,
    full_bio: buildFullBioWithExtras(data),
    city: data.address_text,
    university: data.university,
    graduation_year: data.graduation_year,
    experience_years: expYears,
    institutions_worked: data.experience_label || null,
    grade_levels: data.grade_levels,
    photo_url: data.photo_url,
    video_url: data.intro_video_url,
    online_lessons: true,
    accepting_students: true,
    private_lesson_enabled: true
  };
}

export async function importTeacherApplicationToProfile(applicationRow, { ip } = {}) {
  const data = applicationRow;
  const institutionId = cleanStr(process.env.TEACHER_APPLICATION_INSTITUTION_ID) || null;
  const now = new Date().toISOString();
  const email = data.email;

  const { data: existingUser } = await supabaseAdmin
    .from('users')
    .select('id, email, is_active, role')
    .eq('email', email)
    .maybeSingle();
  if (existingUser?.id) {
    const err = new Error('email_zaten_kayitli');
    err.status = 409;
    err.message_tr = 'Bu e-posta adresi sistemde kayıtlı. Giriş yapıp profilinizi tamamlayabilirsiniz.';
    throw err;
  }

  const userId = normalizeUuidOrGenerate(null);
  const placeholderPassword = `ext_${randomUUID().replace(/-/g, '')}`;
  const fullName = [data.first_name, data.last_name].filter(Boolean).join(' ').trim();

  const { data: user, error: userErr } = await supabaseAdmin
    .from('users')
    .insert({
      id: userId,
      email,
      name: fullName || email,
      phone: data.phone_e164,
      role: 'teacher',
      roles: ['teacher'],
      password_hash: placeholderPassword,
      institution_id: institutionId,
      is_active: false,
      package: 'trial',
      start_date: now,
      end_date: null,
      created_at: now,
      updated_at: now
    })
    .select('*')
    .single();
  if (userErr) {
    const err = new Error(userErr.message || 'user_create_failed');
    err.status = 500;
    throw err;
  }

  let profile;
  try {
    profile = await ensureTeacherProfileForUser(user, { actorId: user.id });
    if (!profile?.id) {
      throw new Error('profile_create_failed');
    }

    const patchBody = profilePatchFromApplication(data);
    const working = applyPatchToWorking(profile, patchBody);
    const pct = completionPercent(working);
    const submittedAt = now;

    const { data: updated, error: pErr } = await supabaseAdmin
      .from('teacher_profiles')
      .update({
        ...patchBody,
        status: 'pending_approval',
        pending_data: working,
        submitted_at: submittedAt,
        last_submitted_at: submittedAt,
        editing_enabled: false,
        completion_pct: pct,
        source_system: 'ovd_website_application',
        updated_at: now
      })
      .eq('id', profile.id)
      .select('*')
      .single();
    if (pErr) throw pErr;
    profile = updated;

    await writeAuditLog({
      profileId: profile.id,
      actorUserId: user.id,
      action: 'external_application_submit',
      previousValue: { status: 'incomplete' },
      newValue: { status: 'pending_approval', application_id: data.id },
      ip: ip || null
    });

    await notifyTeacherProfileEvent({
      event: 'submitted',
      targetUserId: user.id,
      senderUserId: user.id,
      institutionId: institutionId,
      notifyAdmins: true,
      extraBody: 'Kaynak: Web sitesi öğretmen başvuru formu.'
    });
  } catch (e) {
    await supabaseAdmin.from('users').delete().eq('id', userId);
    throw e;
  }

  return { user, profile };
}
