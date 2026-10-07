/**
 * Misafir öğrenciler — /api/class-session-guests?op=...
 *
 * Canlı derse kayıtlı öğrenci listesi dışından katılanlar. Otomatik tespit
 * yalnız "muhtemel misafir" üretir; kesin karar öğretmen/yöneticinin
 * onayıyla verilir.
 *
 * Yetki: yönetici (admin / super_admin / coach) her şeyi görür; öğretmen
 * yalnız kendi dersini — op=bbb-sync-attendance ile aynı kural.
 */
import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { actorIsAdminLike, actorRoleSet } from '../api/_lib/actor-roles.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import {
  GUEST_SOURCES,
  GUEST_STATUSES,
  cleanGuestDisplayName,
  guestNormalizedName,
  isGuestSource,
  isGuestStatus
} from '../api/_lib/class-session-guest-core.js';
import {
  GUESTS_SQL_HINT,
  GuestSchemaMissing,
  convertGuestToStudent,
  detectGuestsForSession,
  listGuestReport,
  listGuestsForSession,
  setGuestStatus,
  upsertGuest
} from '../api/_lib/class-session-guest-store.js';

const jsonError = (res, status, error, extra) => res.status(status).json({ error, ...extra });

function parseBody(req) {
  const b = req.body;
  if (b && typeof b === 'object') return b;
  if (typeof b === 'string') {
    try {
      return JSON.parse(b || '{}');
    } catch {
      return {};
    }
  }
  return {};
}

function isManager(actor, roleSet) {
  return actorIsAdminLike(actor, roleSet) || roleSet.has('coach');
}

async function loadSession(sessionId) {
  const sid = String(sessionId || '').trim();
  if (!sid) return null;
  const { data } = await supabaseAdmin
    .from('class_sessions')
    .select(
      'id,class_id,teacher_id,institution_id,subject,lesson_date,start_time,end_time,status,bbb_seen_names'
    )
    .eq('id', sid)
    .maybeSingle();
  return data || null;
}

/** Öğretmen bu derse bakabilir mi? Dersin öğretmeni ya da sınıfın öğretmeni. */
async function canSeeSession(session, actor, roleSet) {
  if (!session) return false;
  if (isManager(actor, roleSet)) return true;
  if (String(session.teacher_id || '') === String(actor.sub)) return true;
  const { data } = await supabaseAdmin
    .from('class_teachers')
    .select('teacher_id')
    .eq('class_id', session.class_id);
  return (data || []).some((t) => String(t.teacher_id) === String(actor.sub));
}

export default async function handler(req, res) {
  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch {
    return jsonError(res, 401, 'unauthorized');
  }

  const roleSet = await actorRoleSet(actor);
  const body = req.method === 'GET' ? {} : parseBody(req);
  const op = String(req.query?.op || body.op || 'list').trim();

  try {
    /** Öğretmen ekranı: bir dersin misafirleri (+ otomatik tespit tazelenir) */
    if (op === 'list') {
      const session = await loadSession(req.query?.session_id || body.session_id);
      if (!session) return jsonError(res, 404, 'session_not_found');
      if (!(await canSeeSession(session, actor, roleSet))) {
        return jsonError(res, 403, 'forbidden');
      }
      // Katılımcı listesi tazelendikçe yeni adlar "muhtemel misafir" olur.
      // Onaylanmış/reddedilmiş satırlara dokunmaz.
      let detect = null;
      try {
        detect = await detectGuestsForSession(session);
      } catch (e) {
        detect = { ok: false, reason: errorMessage(e) };
      }
      const guests = await listGuestsForSession(session.id, session);
      return res.status(200).json({
        data: guests,
        detect,
        statuses: GUEST_STATUSES,
        sources: GUEST_SOURCES
      });
    }

    /** Yönetici tablosu */
    if (op === 'report') {
      if (!isManager(actor, roleSet)) return jsonError(res, 403, 'forbidden');
      const q = { ...(req.query || {}), ...body };
      const institutionId = actorIsAdminLike(actor, roleSet) && roleSet.has('super_admin')
        ? String(q.institution_id || '').trim() || null
        : actor.institution_id
          ? String(actor.institution_id)
          : null;
      const pack = await listGuestReport({
        institutionId,
        from: String(q.from || '').trim().slice(0, 10) || null,
        to: String(q.to || '').trim().slice(0, 10) || null,
        status: String(q.status || 'all').trim(),
        limit: q.limit
      });
      return res.status(200).json({
        data: pack.rows,
        statuses: GUEST_STATUSES,
        sources: GUEST_SOURCES,
        hint: pack.table_missing ? GUESTS_SQL_HINT : null
      });
    }

    if (req.method !== 'POST') return jsonError(res, 405, 'method_not_allowed');

    /** Misafir olarak işaretle / onayla — ad ya da mevcut kayıt üzerinden */
    if (op === 'mark') {
      const guestId = String(body.guest_id || '').trim();
      const source = isGuestSource(body.source)
        ? String(body.source)
        : isManager(actor, roleSet)
          ? 'admin'
          : 'teacher';

      if (guestId) {
        const { data: row } = await supabaseAdmin
          .from('class_session_guests')
          .select('session_id')
          .eq('id', guestId)
          .maybeSingle();
        if (!row) return jsonError(res, 404, 'guest_not_found');
        const session = await loadSession(row.session_id);
        if (!(await canSeeSession(session, actor, roleSet))) {
          return jsonError(res, 403, 'forbidden');
        }
        const saved = await setGuestStatus({
          guestId,
          status: 'confirmed',
          source,
          actorId: actor.sub,
          note: body.note
        });
        return res.status(200).json({ ok: true, data: saved });
      }

      const session = await loadSession(body.session_id);
      if (!session) return jsonError(res, 404, 'session_not_found');
      if (!(await canSeeSession(session, actor, roleSet))) {
        return jsonError(res, 403, 'forbidden');
      }
      const displayName = cleanGuestDisplayName(body.display_name || body.name);
      const normalized = guestNormalizedName(displayName);
      if (!displayName || !normalized) return jsonError(res, 400, 'display_name_required');

      const saved = await upsertGuest({
        session,
        displayName,
        normalizedName: normalized,
        status: 'confirmed',
        source,
        actorId: actor.sub,
        note: body.note ?? null
      });
      return res.status(200).json({ ok: true, data: saved });
    }

    /** Misafir işaretini kaldır — kayıt silinmez, "misafir değil" olur */
    if (op === 'unmark') {
      const guestId = String(body.guest_id || '').trim();
      if (!guestId) return jsonError(res, 400, 'guest_id_required');
      const { data: row } = await supabaseAdmin
        .from('class_session_guests')
        .select('session_id')
        .eq('id', guestId)
        .maybeSingle();
      if (!row) return jsonError(res, 404, 'guest_not_found');
      const session = await loadSession(row.session_id);
      if (!(await canSeeSession(session, actor, roleSet))) {
        return jsonError(res, 403, 'forbidden');
      }
      const saved = await setGuestStatus({
        guestId,
        status: 'dismissed',
        actorId: actor.sub,
        note: body.note
      });
      return res.status(200).json({ ok: true, data: saved });
    }

    /** Durumu elle değiştir (yönetici) */
    if (op === 'set_status') {
      if (!isManager(actor, roleSet)) return jsonError(res, 403, 'forbidden');
      const guestId = String(body.guest_id || '').trim();
      const status = String(body.status || '').trim();
      if (!guestId) return jsonError(res, 400, 'guest_id_required');
      if (!isGuestStatus(status)) return jsonError(res, 400, 'invalid_status');
      const saved = await setGuestStatus({
        guestId,
        status,
        source: isGuestSource(body.source) ? String(body.source) : undefined,
        actorId: actor.sub,
        note: body.note
      });
      return res.status(200).json({ ok: true, data: saved });
    }

    /** Yönetici elle misafir ekler */
    if (op === 'add') {
      if (!isManager(actor, roleSet)) return jsonError(res, 403, 'forbidden');
      const session = await loadSession(body.session_id);
      if (!session) return jsonError(res, 404, 'session_not_found');
      const displayName = cleanGuestDisplayName(body.display_name || body.name);
      const normalized = guestNormalizedName(displayName);
      if (!displayName || !normalized) return jsonError(res, 400, 'display_name_required');
      const saved = await upsertGuest({
        session,
        displayName,
        normalizedName: normalized,
        status: 'confirmed',
        source: isGuestSource(body.source) ? String(body.source) : 'admin',
        actorId: actor.sub,
        note: body.note ?? null
      });
      return res.status(200).json({ ok: true, data: saved });
    }

    /** Öğrenciye dönüştür — geçmiş katılımlar da bağlanır */
    if (op === 'convert') {
      if (!isManager(actor, roleSet)) return jsonError(res, 403, 'forbidden');
      const result = await convertGuestToStudent({
        guestId: body.guest_id,
        studentId: body.student_id,
        actorId: actor.sub
      });
      return res.status(200).json({ ok: true, ...result });
    }

    return jsonError(res, 400, 'unknown_op');
  } catch (e) {
    if (e instanceof GuestSchemaMissing) {
      return jsonError(res, 400, 'schema_missing', { hint: e.hint });
    }
    const msg = errorMessage(e);
    if (/Missing token|Invalid token|Token expired|Invalid signature/i.test(msg)) {
      return jsonError(res, 401, msg);
    }
    if (/guest_not_found|student_not_found|guest_id_and_student_id_required/.test(msg)) {
      return jsonError(res, 400, msg);
    }
    console.error('[class-session-guests]', msg);
    return jsonError(res, 500, msg);
  }
}
