import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { enrichStudentActor } from '../api/_lib/enrich-student-actor.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import {
  getCoachNotificationPrefs,
  upsertCoachNotificationPrefs
} from '../api/_lib/coach-notification-prefs.js';
import { getCoachGatewayHealth } from '../api/_lib/message-service.js';
import { normalizedUserRolesFromDb } from '../api/_lib/user-roles-fetch.js';

async function resolveCoachIdForActor(actor, roles) {
  if (actor.coach_id) return String(actor.coach_id);
  const roleSet = new Set(roles.map((r) => String(r || '').toLowerCase()));
  if (!roleSet.has('coach')) return null;
  const { data } = await supabaseAdmin.from('coaches').select('id').eq('email', actor.email).maybeSingle();
  if (data?.id) return String(data.id);
  const { data: byId } = await supabaseAdmin.from('coaches').select('id').eq('id', actor.sub).maybeSingle();
  return byId?.id ? String(byId.id) : null;
}

export default async function handler(req, res) {
  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch {
    return res.status(401).json({ error: 'Missing token' });
  }
  actor = await enrichStudentActor(actor);
  const roles = await normalizedUserRolesFromDb(actor.sub);
  const roleSet = new Set(roles.map((r) => String(r || '').toLowerCase()));
  const isCoach = roleSet.has('coach');
  const isAdmin = roleSet.has('admin') || roleSet.has('super_admin');

  if (!isCoach && !isAdmin) {
    return res.status(403).json({ error: 'forbidden' });
  }

  let coachId = await resolveCoachIdForActor(actor, roles);
  const queryCoach = String(req.query?.coach_id || '').trim();
  if (isAdmin && queryCoach) coachId = queryCoach;
  const gatewayUserId = String(actor.sub || '').trim();

  if (req.method === 'GET') {
    try {
      if (!coachId && isAdmin) {
        const gateway = await getCoachGatewayHealth(null, gatewayUserId);
        return res.status(200).json({
          coach_id: null,
          gateway_user_id: gatewayUserId,
          prefs: {
            daily_report_enabled: false,
            daily_report_scope: 'none',
            updated_at: null
          },
          gateway,
          recent_logs: [],
          hint:
            'Yönetici hesabı — günlük rapor tercihi koç kaydı gerektirir. Kişisel gateway QR bu kullanıcı id ile bağlanır.'
        });
      }
      if (!coachId) {
        return res.status(400).json({
          error: 'coach_id_not_found',
          hint: 'Koç profili bulunamadı. Yönetici iseniz gateway yine de QR ile bağlanabilir.'
        });
      }
      const prefs = await getCoachNotificationPrefs(coachId);
      const gateway = await getCoachGatewayHealth(coachId, gatewayUserId);
      let recentLogs = [];
      const { data: coachStudents } = await supabaseAdmin
        .from('students')
        .select('id')
        .eq('coach_id', coachId)
        .limit(5000);
      const studentIds = (coachStudents || []).map((s) => s.id);
      if (studentIds.length) {
        const { data: logs } = await supabaseAdmin
          .from('message_logs')
          .select('id,student_id,kind,phone,status,sent_at,error,meta_template_name')
          .in('student_id', studentIds)
          .order('sent_at', { ascending: false })
          .limit(40);
        recentLogs = logs || [];
      }
      return res.status(200).json({
        coach_id: coachId,
        prefs,
        gateway,
        recent_logs: recentLogs
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return res.status(500).json({ error: msg });
    }
  }

  if (req.method === 'PATCH') {
    if (!isCoach && !isAdmin) {
      return res.status(403).json({ error: 'forbidden' });
    }
    if (!coachId) {
      return res.status(400).json({
        error: 'coach_id_not_found',
        hint: 'Günlük rapor tercihi yalnızca koç hesapları için kaydedilir.'
      });
    }
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const updated = await upsertCoachNotificationPrefs(coachId, {
        daily_report_enabled: body.daily_report_enabled,
        daily_report_scope: body.daily_report_scope
      });
      return res.status(200).json({ ok: true, prefs: updated });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return res.status(500).json({ error: msg });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
