import { requireAuthenticatedActor, hasInstitutionAccess } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { resolveStudentRowForUser } from '../api/_lib/resolve-student-id.js';
import { coachRowToPlatformUserId, getStudentPhones } from '../api/_lib/meetings-resolve.js';
import { createMeetCalendarEvent } from '../api/_lib/google-calendar-meet.js';
import { deliverWhatsAppWithLog } from '../api/_lib/meeting-notify.js';

const jsonError = (res, status, error, extra) => res.status(status).json({ error, ...extra });

/** @param {unknown} raw @param {string} label */
function normalizeOptionalMeetingUrl(raw, label) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  if (!lower.startsWith('http://') && !lower.startsWith('https://')) {
    throw new Error(`${label} bağlantısı http:// veya https:// ile başlamalıdır.`);
  }
  try {
    new URL(s);
  } catch {
    throw new Error(`${label} bağlantısı geçersiz.`);
  }
  return s;
}

const isAuthFailureMessage = (msg) =>
  ['Missing token', 'Invalid token', 'Invalid signature', 'Token expired'].includes(String(msg || ''));

const isSupabaseServerEnvError = (msg) =>
  /Missing Supabase (URL|key) env/i.test(String(msg || ''));

/** JWT’de coach_id / student_id boş olsa bile users.id + e-posta ile coaches / students satırını bul */
async function resolveCoachIdByUserSub(userSub) {
  if (!userSub) return null;
  const { data: urow } = await supabaseAdmin.from('users').select('email').eq('id', userSub).maybeSingle();
  const em = urow?.email ? String(urow.email).toLowerCase().trim() : '';
  if (!em) return null;
  let { data: crow } = await supabaseAdmin.from('coaches').select('id').eq('email', em).maybeSingle();
  if (!crow?.id) {
    ({ data: crow } = await supabaseAdmin.from('coaches').select('id').ilike('email', em).maybeSingle());
  }
  return crow?.id ?? null;
}

async function handleList(req, res) {
  if (req.method !== 'GET') return jsonError(res, 405, 'Method not allowed');
  try {
    let actor;
    try {
      actor = requireAuthenticatedActor(req);
    } catch (authErr) {
      return jsonError(res, 401, errorMessage(authErr) || 'Missing token');
    }

    const from = typeof req.query?.from === 'string' ? req.query.from : undefined;
    const to = typeof req.query?.to === 'string' ? req.query.to : undefined;
    const statusFilter = typeof req.query?.status === 'string' ? req.query.status : undefined;

    /** Öğretmen rolü: JWT’de coach_id yoksa e-posta ile coaches satırı (kurum geneli listeyi engelle) */
    let teacherCoachId = actor.role === 'teacher' ? actor.coach_id || null : null;
    if (actor.role === 'teacher' && !teacherCoachId && actor.sub) {
      teacherCoachId = await resolveCoachIdByUserSub(actor.sub);
    }

    /** Öğrenci / koç: token’da ID yoksa bile DB’den çöz (eski JWT veya eksik auth-login) */
    let listStudentId = actor.student_id || null;
    let listCoachId = actor.coach_id || null;
    if (actor.role === 'student' && actor.sub && !listStudentId) {
      const { data: u } = await supabaseAdmin
        .from('users')
        .select('email, institution_id')
        .eq('id', actor.sub)
        .maybeSingle();
      const row = await resolveStudentRowForUser({
        userId: actor.sub,
        email: u?.email || undefined,
        institutionId: u?.institution_id ?? actor.institution_id ?? undefined
      });
      listStudentId = row?.id ?? null;
    }
    if (actor.role === 'coach' && actor.sub && !listCoachId) {
      listCoachId = await resolveCoachIdByUserSub(actor.sub);
    }

    const baseSelect = () => {
      // Yalın select: students(*)/coaches(*) embed'i şema/FK uyumsuzluğunda PostgREST 500 üretebiliyor; UI fallback var.
      let q = supabaseAdmin.from('meetings').select('*').order('start_time', { ascending: true });
      if (from) q = q.gte('start_time', from);
      if (to) q = q.lte('start_time', to);
      if (statusFilter && ['planned', 'completed', 'missed'].includes(statusFilter)) {
        q = q.eq('status', statusFilter);
      }
      if (actor.role === 'student') {
        if (!listStudentId) return { error: 'student_profile_missing' };
        q = q.eq('student_id', listStudentId);
      } else if (actor.role === 'coach') {
        if (!listCoachId) return { error: 'coach_profile_missing' };
        q = q.eq('coach_id', listCoachId);
      } else if (actor.role === 'teacher') {
        if (!teacherCoachId) return { error: 'teacher_coach_link_missing', empty: true };
        q = q.eq('coach_id', teacherCoachId);
      } else if (actor.role === 'admin') {
        if (!actor.institution_id) return { error: 'institution_missing' };
        q = q.eq('institution_id', actor.institution_id);
      } else if (actor.role === 'super_admin') {
        if (actor.institution_id) {
          q = q.eq('institution_id', actor.institution_id);
        }
        /* institution_id yok: kurulum geneli (yalnızca süper admin); filtre yok */
      } else {
        return { error: 'meetings_list_role_not_allowed' };
      }
      return { q };
    };

    const built = baseSelect();
    if (built.error === 'teacher_coach_link_missing' && built.empty) {
      return res.status(200).json({ data: [], hint: 'teacher_coach_link_missing' });
    }
    if (built.error) return jsonError(res, 403, built.error);

    const { data, error } = await built.q;
    if (error) {
      const msg = errorMessage(error);
      const code = String(error.code || '');
      if (/does not exist|schema cache/i.test(msg) || code === '42P01' || code === 'PGRST205') {
        console.warn('[meetings list] meetings tablosu yok veya şema önbelleği:', msg);
        return res.status(200).json({ data: [], hint: 'meetings_sql_missing' });
      }
      if (/permission denied|42501|JWT expired|invalid JWT/i.test(msg) || code === '42501') {
        console.error('[meetings list] yetki / JWT:', msg);
        return res.status(503).json({
          error:
            'meetings sorgusu reddedildi. Vercel’de sunucu için SUPABASE_SERVICE_ROLE_KEY kullanın (anon key değil). SQL şemasını da kontrol edin.',
          code: 'meetings_db_permission'
        });
      }
      console.error('[meetings list] supabase:', msg, code);
      return res.status(500).json({
        error: msg,
        code: 'meetings_query_failed',
        hint: 'Supabase meetings tablosu ve RLS / migration kontrol edin.'
      });
    }

    return res.status(200).json({ data: data || [] });
  } catch (e) {
    console.error('[meetings list]', errorMessage(e));
    const msg = errorMessage(e);
    if (isAuthFailureMessage(msg)) return jsonError(res, 401, msg);
    if (isSupabaseServerEnvError(msg)) {
      return res.status(503).json({
        error: 'Sunucu Supabase ortam değişkenleri eksik (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).',
        code: 'supabase_env_missing'
      });
    }
    return jsonError(res, 500, msg);
  }
}

async function handleCreate(req, res) {
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');
  try {
    let actor;
    try {
      actor = requireAuthenticatedActor(req);
    } catch (authErr) {
      return jsonError(res, 401, errorMessage(authErr) || 'Missing token');
    }

    if (!['coach', 'admin', 'super_admin'].includes(actor.role)) {
      return jsonError(res, 403, 'Bu işlem için yetkiniz yok.');
    }

    const body = req.body || {};
    const coachId = String(body.coach_id || (actor.role === 'coach' ? actor.coach_id : '') || '');
    const studentId = String(body.student_id || '');
    const startIso = body.start_datetime || body.start_time;
    const durationMinutes = Number(body.duration_minutes || body.durationMinutes || 60);

    if (!coachId || !studentId || !startIso) {
      return jsonError(res, 400, 'coach_id, student_id ve start_datetime gereklidir.');
    }
    if (actor.role === 'coach' && actor.coach_id !== coachId) {
      return jsonError(res, 403, 'Yalnızca kendi profilinize toplantı oluşturabilirsiniz.');
    }

    let coachUserId =
      actor.role === 'coach' ? actor.sub || null : await coachRowToPlatformUserId(coachId);
    if (!coachUserId) {
      return jsonError(
        res,
        400,
        'Koç hesabınız platform kullanıcısıyla eşleşmiyor. Koç kaydındaki e‑posta, giriş yaptığınız hesabın e‑postasıyla aynı olmalı (koç veya öğretmen rolü).'
      );
    }

    const { data: student, error: studentErr } = await supabaseAdmin.from('students').select('*').eq('id', studentId).maybeSingle();
    if (studentErr) throw studentErr;
    if (!student) return jsonError(res, 404, 'Öğrenci bulunamadı.');
    if (student.coach_id !== coachId) {
      return jsonError(res, 403, 'Bu öğrenci seçilen koça bağlı değil.');
    }
    if (actor.role === 'admin' && !hasInstitutionAccess(actor, student.institution_id)) {
      return jsonError(res, 403, 'Kurum dışı öğrenci.');
    }

    const start = new Date(startIso);
    if (Number.isNaN(+start)) return jsonError(res, 400, 'Geçersiz tarih.');
    const end = new Date(start.getTime() + Math.max(15, durationMinutes) * 60_000);

    const { data: coachRow } = await supabaseAdmin.from('coaches').select('name, email').eq('id', coachId).maybeSingle();

    let linkZoom = null;
    let linkBbb = null;
    try {
      linkZoom = normalizeOptionalMeetingUrl(body.link_zoom, 'Zoom');
      linkBbb = normalizeOptionalMeetingUrl(body.link_bbb, 'BBB');
    } catch (e) {
      const em = e instanceof Error ? e.message : String(e);
      return jsonError(res, 400, em);
    }

    const { data: integration } = await supabaseAdmin
      .from('integrations_google')
      .select('user_id')
      .eq('user_id', coachUserId)
      .maybeSingle();

    const hasManualLinks = Boolean(linkZoom || linkBbb);
    if (!integration && !hasManualLinks) {
      const who =
        actor.role === 'admin' || actor.role === 'super_admin'
          ? 'Seçilen koçun platform kullanıcısında'
          : 'Hesabınızda';
      return jsonError(res, 400, `${who} Google Takvim kaydı yok. Ya “Google ile bağlan” (${who === 'Hesabınızda' ? 'koç hesabı' : 'o koç giriş yaptığında'}) kullanın ya da aşağıya en az bir Zoom veya BBB bağlantısı (https://…) girin; Takvim olmadan da planlanır.`, {
        code: 'meetings_need_calendar_or_links'
      });
    }

    const summary = body.title || `Koçluk görüşmesi — ${student.name}`;
    const description =
      body.description ||
      `Online koçluk görüşmesi.\nÖğrenci: ${student.name}\nKoç: ${coachRow?.name || ''}`.trim();

    const attendeeEmails = [];
    if (coachRow?.email) attendeeEmails.push(String(coachRow.email));
    if (student.email) attendeeEmails.push(String(student.email));

    let meetLinkResult = null;
    let googleEventId = null;

    if (integration) {
      try {
        const meet = await createMeetCalendarEvent({
          userId: coachUserId,
          summary,
          description,
          startIso: start.toISOString(),
          endIso: end.toISOString(),
          attendeeEmails
        });
        meetLinkResult = meet.meetLink || null;
        googleEventId = meet.eventId || null;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'calendar_create_failed';
        if (hasManualLinks) {
          meetLinkResult = linkZoom || linkBbb;
          googleEventId = null;
          console.warn('[meetings create] Google Takvim hatası, Zoom/BBB kullanılıyor:', msg);
        } else {
          return jsonError(res, 502, msg);
        }
      }
      if (!meetLinkResult) {
        if (hasManualLinks) {
          meetLinkResult = linkZoom || linkBbb;
        } else {
          return jsonError(res, 502, 'Google Meet bağlantısı oluşturulamadı. Zoom veya BBB adresi ekleyip tekrar deneyin.');
        }
      }
    } else {
      meetLinkResult = linkZoom || linkBbb;
    }

    const insertPayload = {
      institution_id: student.institution_id || actor.institution_id || null,
      coach_id: coachId,
      student_id: studentId,
      coach_user_id: coachUserId,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      meet_link: meetLinkResult,
      google_calendar_event_id: googleEventId,
      status: 'planned',
      notes: body.notes ?? null,
      attended: typeof body.attended === 'boolean' ? body.attended : null,
      ai_summary: body.ai_summary ?? null,
      link_zoom: linkZoom,
      link_bbb: linkBbb,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: meeting, error: insErr } = await supabaseAdmin.from('meetings').insert(insertPayload).select('*').single();
    if (insErr) throw insErr;

    const phones = await getStudentPhones(student);
    let notifyBodyCreated = `Görüşmeniz planlandı: ${meetLinkResult}`;
    if (linkZoom && linkZoom !== meetLinkResult) notifyBodyCreated += `\nZoom: ${linkZoom}`;
    if (linkBbb && linkBbb !== meetLinkResult) notifyBodyCreated += `\nBBB: ${linkBbb}`;
    let whatsappNote = '';

    const twilioReady =
      process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM;
    if (twilioReady && phones.length > 0) {
      try {
        const r = await deliverWhatsAppWithLog({
          meetingId: meeting.id,
          kind: 'whatsapp_created',
          recipientE164: phones[0],
          body: notifyBodyCreated
        });
        whatsappNote = r.skipped ? 'whatsapp_skip' : r.ok ? 'whatsapp_sent' : `whatsapp_failed:${r.error}`;
        if (r.ok && !r.skipped) {
          await supabaseAdmin.from('meetings').update({ whatsapp_created_sent: true }).eq('id', meeting.id);
        }
      } catch {
        whatsappNote = 'whatsapp_log_error';
      }
    }

    return res.status(200).json({
      data: meeting,
      whatsapp: whatsappNote || (phones.length ? 'missing_twilio_env' : 'no_student_phone'),
      calendar: googleEventId ? { ok: true } : { skipped: true }
    });
  } catch (e) {
    const msg = errorMessage(e);
    if (isAuthFailureMessage(msg)) return jsonError(res, 401, msg);
    if (isSupabaseServerEnvError(msg)) {
      return res.status(503).json({
        error: 'Sunucu Supabase ortam değişkenleri eksik (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).',
        code: 'supabase_env_missing'
      });
    }
    return jsonError(res, 500, msg);
  }
}

/**
 * Tekrarlayan görüşmeler: aynı bağlantı / tek Google Meet — ardışık 7 veya 15 gün.
 * `meeting_series` + toplu `meetings` (WhatsApp yalnızca ilk oturum).
 */
async function handleCreateSeries(req, res) {
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');
  try {
    let actor;
    try {
      actor = requireAuthenticatedActor(req);
    } catch (authErr) {
      return jsonError(res, 401, errorMessage(authErr) || 'Missing token');
    }

    if (!['coach', 'admin', 'super_admin'].includes(actor.role)) {
      return jsonError(res, 403, 'Bu işlem için yetkiniz yok.');
    }

    const body = req.body || {};
    const intervalDays = Number(body.interval_days || body.intervalDays);
    const recurrenceUntil = String(body.recurrence_until || body.recurrence_until_date || '')
      .trim()
      .slice(0, 10);
    if (intervalDays !== 7 && intervalDays !== 15) {
      return jsonError(res, 400, 'interval_days 7 (haftalık) veya 15 (15 günde bir) olmalıdır.');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(recurrenceUntil)) {
      return jsonError(res, 400, 'recurrence_until YYYY-MM-DD formatında olmalıdır.');
    }

    const coachId = String(body.coach_id || (actor.role === 'coach' ? actor.coach_id : '') || '');
    const studentId = String(body.student_id || '');
    const startIso = body.start_datetime || body.start_time;
    const durationMinutes = Number(body.duration_minutes || body.durationMinutes || 60);

    if (!coachId || !studentId || !startIso) {
      return jsonError(res, 400, 'coach_id, student_id ve start_datetime gereklidir.');
    }
    if (actor.role === 'coach' && actor.coach_id !== coachId) {
      return jsonError(res, 403, 'Yalnızca kendi profilinize toplantı oluşturabilirsiniz.');
    }

    let coachUserId =
      actor.role === 'coach' ? actor.sub || null : await coachRowToPlatformUserId(coachId);
    if (!coachUserId) {
      return jsonError(
        res,
        400,
        'Koç hesabınız platform kullanıcısıyla eşleşmiyor. Koç kaydındaki e‑posta, giriş yaptığınız hesabın e‑postasıyla aynı olmalı (koç veya öğretmen rolü).'
      );
    }

    const { data: student, error: studentErr } = await supabaseAdmin
      .from('students')
      .select('*')
      .eq('id', studentId)
      .maybeSingle();
    if (studentErr) throw studentErr;
    if (!student) return jsonError(res, 404, 'Öğrenci bulunamadı.');
    if (student.coach_id !== coachId) {
      return jsonError(res, 403, 'Bu öğrenci seçilen koça bağlı değil.');
    }
    if (actor.role === 'admin' && !hasInstitutionAccess(actor, student.institution_id)) {
      return jsonError(res, 403, 'Kurum dışı öğrenci.');
    }

    const start = new Date(startIso);
    if (Number.isNaN(+start)) return jsonError(res, 400, 'Geçersiz tarih.');
    const firstYmd = start.toISOString().slice(0, 10);
    if (recurrenceUntil < firstYmd) {
      return jsonError(res, 400, 'Tekrar bitiş tarihi ilk görüşmeden önce olamaz.');
    }

    let linkZoom = null;
    let linkBbb = null;
    try {
      linkZoom = normalizeOptionalMeetingUrl(body.link_zoom, 'Zoom');
      linkBbb = normalizeOptionalMeetingUrl(body.link_bbb, 'BBB');
    } catch (e) {
      const em = e instanceof Error ? e.message : String(e);
      return jsonError(res, 400, em);
    }

    const { data: coachRow } = await supabaseAdmin.from('coaches').select('name, email').eq('id', coachId).maybeSingle();
    const { data: integration } = await supabaseAdmin
      .from('integrations_google')
      .select('user_id')
      .eq('user_id', coachUserId)
      .maybeSingle();

    const hasManualLinks = Boolean(linkZoom || linkBbb);
    if (!integration && !hasManualLinks) {
      const who =
        actor.role === 'admin' || actor.role === 'super_admin'
          ? 'Seçilen koçun platform kullanıcısında'
          : 'Hesabınızda';
      return jsonError(
        res,
        400,
        `${who} Google Takvim kaydı yok. Ya “Google ile bağlan” kullanın ya da Zoom/BBB adresi (https://…) girin.`,
        { code: 'meetings_need_calendar_or_links' }
      );
    }

    const summary = body.title || `Koçluk görüşmesi — ${student.name}`;
    const description =
      body.description ||
      `Tekrarlayan online koçluk görüşmesi.\nÖğrenci: ${student.name}\nKoç: ${coachRow?.name || ''}`.trim();

    const attendeeEmails = [];
    if (coachRow?.email) attendeeEmails.push(String(coachRow.email));
    if (student.email) attendeeEmails.push(String(student.email));

    const firstEnd = new Date(start.getTime() + Math.max(15, durationMinutes) * 60_000);
    let meetLinkResult = null;
    let googleEventId = null;

    if (integration) {
      try {
        const meet = await createMeetCalendarEvent({
          userId: coachUserId,
          summary,
          description,
          startIso: start.toISOString(),
          endIso: firstEnd.toISOString(),
          attendeeEmails
        });
        meetLinkResult = meet.meetLink || null;
        googleEventId = meet.eventId || null;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'calendar_create_failed';
        if (hasManualLinks) {
          meetLinkResult = linkZoom || linkBbb;
          googleEventId = null;
          console.warn('[meetings create-series] Google Takvim hatası, Zoom/BBB kullanılıyor:', msg);
        } else {
          return jsonError(res, 502, msg);
        }
      }
      if (!meetLinkResult) {
        meetLinkResult = linkZoom || linkBbb;
        if (!meetLinkResult) {
          return jsonError(res, 502, 'Google Meet oluşturulamadı; Zoom veya BBB girin.');
        }
      }
    } else {
      meetLinkResult = linkZoom || linkBbb;
    }

    const untilTs = new Date(`${recurrenceUntil}T23:59:59.999+03:00`).getTime();
    const occurrences = [];
    let cur = new Date(start);
    const maxN = 100;
    while (cur.getTime() <= untilTs && occurrences.length < maxN) {
      occurrences.push(new Date(cur));
      cur = new Date(cur.getTime() + intervalDays * 86400000);
    }
    if (occurrences.length === 0) {
      return jsonError(res, 400, 'Bu bitiş tarihinde tekrarlı oturum yok.');
    }
    if (occurrences.length >= maxN) {
      return jsonError(res, 400, 'En fazla 99 tekrar eklenebilir; bitiş tarihını kısaltın.');
    }

    const institutionId = student.institution_id || actor.institution_id || null;
    const now = new Date().toISOString();

    const { data: seriesRow, error: serIns } = await supabaseAdmin
      .from('meeting_series')
      .insert({
        institution_id: institutionId,
        coach_id: coachId,
        student_id: studentId,
        coach_user_id: coachUserId,
        title: summary,
        interval_days: intervalDays,
        duration_minutes: Math.max(15, durationMinutes),
        recurrence_until_date: recurrenceUntil,
        meet_link: meetLinkResult,
        link_zoom: linkZoom,
        link_bbb: linkBbb,
        created_at: now
      })
      .select('id')
      .single();

    if (serIns) {
      const sm = errorMessage(serIns);
      if (/does not exist|schema cache|42P01/i.test(sm)) {
        return jsonError(res, 503, 'meeting_series tablosu yok. SQL: student-coaching-system/sql/2026-05-13-recurring-series.sql', {
          code: 'meeting_series_sql_missing'
        });
      }
      throw serIns;
    }

    const seriesId = seriesRow.id;
    const payloads = occurrences.map((s) => {
      const e = new Date(s.getTime() + Math.max(15, durationMinutes) * 60_000);
      return {
        institution_id: institutionId,
        coach_id: coachId,
        student_id: studentId,
        coach_user_id: coachUserId,
        start_time: s.toISOString(),
        end_time: e.toISOString(),
        meet_link: meetLinkResult,
        google_calendar_event_id: googleEventId,
        status: 'planned',
        notes: body.notes ?? null,
        attended: null,
        ai_summary: null,
        link_zoom: linkZoom,
        link_bbb: linkBbb,
        series_id: seriesId,
        created_at: now,
        updated_at: now
      };
    });

    const { data: meetingsIns, error: minErr } = await supabaseAdmin
      .from('meetings')
      .insert(payloads)
      .select('id, start_time');

    if (minErr) {
      await supabaseAdmin.from('meeting_series').delete().eq('id', seriesId);
      throw minErr;
    }

    const firstId = meetingsIns?.[0]?.id;
    let whatsappNote = '';
    if (firstId) {
      const phones = await getStudentPhones(student);
      const notifyBodyCreated = `Görüşmeniz planlandı (tekrarlayan seri): ${meetLinkResult}`;
      const twilioReady =
        process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM;
      if (twilioReady && phones.length > 0) {
        try {
          const r = await deliverWhatsAppWithLog({
            meetingId: firstId,
            kind: 'whatsapp_created',
            recipientE164: phones[0],
            body: notifyBodyCreated
          });
          whatsappNote = r.skipped ? 'whatsapp_skip' : r.ok ? 'whatsapp_sent' : `whatsapp_failed:${r.error}`;
          if (r.ok && !r.skipped) {
            await supabaseAdmin.from('meetings').update({ whatsapp_created_sent: true }).eq('id', firstId);
          }
        } catch {
          whatsappNote = 'whatsapp_log_error';
        }
      }
    }

    return res.status(200).json({
      data: {
        series_id: seriesId,
        count: occurrences.length,
        meetings: meetingsIns || []
      },
      whatsapp: whatsappNote
    });
  } catch (e) {
    const msg = errorMessage(e);
    if (isAuthFailureMessage(msg)) return jsonError(res, 401, msg);
    if (isSupabaseServerEnvError(msg)) {
      return res.status(503).json({
        error: 'Sunucu Supabase ortam değişkenleri eksik (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).',
        code: 'supabase_env_missing'
      });
    }
    return jsonError(res, 500, msg);
  }
}

async function handleDeleteSeries(req, res) {
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');
  try {
    let actor;
    try {
      actor = requireAuthenticatedActor(req);
    } catch (authErr) {
      return jsonError(res, 401, errorMessage(authErr) || 'Missing token');
    }

    if (!['coach', 'admin', 'super_admin'].includes(actor.role)) {
      return jsonError(res, 403, 'Bu işlem için yetkiniz yok.');
    }

    const body = req.body || {};
    const seriesId = String(body.series_id || '').trim();
    if (!seriesId) return jsonError(res, 400, 'series_id gerekli');

    const { data: s, error: se } = await supabaseAdmin
      .from('meeting_series')
      .select('id, coach_id, institution_id')
      .eq('id', seriesId)
      .maybeSingle();
    if (se) {
      const sm = errorMessage(se);
      if (/does not exist|42P01/i.test(sm)) {
        return jsonError(res, 503, 'meeting_series tablosu yok; SQL migration çalıştırın.', { code: 'meeting_series_sql_missing' });
      }
      throw se;
    }
    if (!s) return jsonError(res, 404, 'Seri bulunamadı.');

    if (actor.role === 'coach' && actor.coach_id !== s.coach_id) {
      return jsonError(res, 403, 'Bu seriyi silemezsiniz.');
    }
    if (actor.role === 'admin' && !hasInstitutionAccess(actor, s.institution_id)) {
      return jsonError(res, 403, 'Bu seriyi silemezsiniz.');
    }

    const { error: de } = await supabaseAdmin.from('meeting_series').delete().eq('id', seriesId);
    if (de) throw de;

    return res.status(200).json({ ok: true, deleted_series_id: seriesId });
  } catch (e) {
    const msg = errorMessage(e);
    if (isAuthFailureMessage(msg)) return jsonError(res, 401, msg);
    if (isSupabaseServerEnvError(msg)) {
      return res.status(503).json({
        error: 'Sunucu Supabase ortam değişkenleri eksik (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).',
        code: 'supabase_env_missing'
      });
    }
    return jsonError(res, 500, msg);
  }
}

async function handleUpdateStatus(req, res) {
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');
  try {
    let actor;
    try {
      actor = requireAuthenticatedActor(req);
    } catch (authErr) {
      return jsonError(res, 401, errorMessage(authErr) || 'Missing token');
    }

    if (!['coach', 'admin', 'super_admin'].includes(actor.role)) {
      return jsonError(res, 403, 'Bu işlem için yetkiniz yok.');
    }

    const body = req.body || {};
    const meetingId = String(body.meeting_id || body.id || '');
    const status = body.status ? String(body.status) : '';

    if (!meetingId) return jsonError(res, 400, 'meeting_id gerekli');
    if (status && !['planned', 'completed', 'missed'].includes(status)) {
      return jsonError(res, 400, 'Geçersiz durum.');
    }

    const { data: row, error: fetchErr } = await supabaseAdmin.from('meetings').select('*').eq('id', meetingId).maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!row) return jsonError(res, 404, 'Toplantı bulunamadı.');

    if (actor.role === 'coach' && actor.coach_id !== row.coach_id) {
      return jsonError(res, 403, 'Bu toplantıyı güncelleyemezsiniz.');
    }
    if (actor.role === 'admin' && !hasInstitutionAccess(actor, row.institution_id)) {
      return jsonError(res, 403, 'Bu toplantıyı güncelleyemezsiniz.');
    }

    const patch = {
      updated_at: new Date().toISOString()
    };
    if (status) patch.status = status;
    if (typeof body.notes === 'string' || body.notes === null) patch.notes = body.notes;
    if (typeof body.attended === 'boolean') patch.attended = body.attended;
    if (typeof body.ai_summary === 'string' || body.ai_summary === null) patch.ai_summary = body.ai_summary;
    if (body.link_zoom !== undefined) {
      if (body.link_zoom === null || body.link_zoom === '') patch.link_zoom = null;
      else {
        try {
          patch.link_zoom = normalizeOptionalMeetingUrl(body.link_zoom, 'Zoom');
        } catch (e) {
          const em = e instanceof Error ? e.message : String(e);
          return jsonError(res, 400, em);
        }
      }
    }
    if (body.link_bbb !== undefined) {
      if (body.link_bbb === null || body.link_bbb === '') patch.link_bbb = null;
      else {
        try {
          patch.link_bbb = normalizeOptionalMeetingUrl(body.link_bbb, 'BBB');
        } catch (e) {
          const em = e instanceof Error ? e.message : String(e);
          return jsonError(res, 400, em);
        }
      }
    }

    const { data: updated, error: upErr } = await supabaseAdmin
      .from('meetings')
      .update(patch)
      .eq('id', meetingId)
      .select('*')
      .single();
    if (upErr) throw upErr;

    return res.status(200).json({ data: updated });
  } catch (e) {
    const msg = errorMessage(e);
    if (isAuthFailureMessage(msg)) return jsonError(res, 401, msg);
    if (isSupabaseServerEnvError(msg)) {
      return res.status(503).json({
        error: 'Sunucu Supabase ortam değişkenleri eksik (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).',
        code: 'supabase_env_missing'
      });
    }
    return jsonError(res, 500, msg);
  }
}

/** Hobby plan: tek serverless dosyasında toplantı uçları (12 fonksiyon sınırı). */
export default async function handler(req, res) {
  const raw = typeof req.query?.op === 'string' ? req.query.op : '';
  const op = raw || (req.method === 'GET' ? 'list' : '');

  if (op === 'list') return handleList(req, res);
  if (op === 'create') return handleCreate(req, res);
  if (op === 'create-series') return handleCreateSeries(req, res);
  if (op === 'delete-series') return handleDeleteSeries(req, res);
  if (op === 'update-status') return handleUpdateStatus(req, res);

  return jsonError(
    res,
    400,
    'Geçersiz veya eksik ?op parametresi (list|create|create-series|delete-series|update-status).'
  );
}

