import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import {
  listConnectedGatewaySessionIds,
  teacherReminderGatewaySessionId
} from '../api/_lib/whatsapp-gateway-send.js';
import {
  loadTeacherReminderSettings,
  resolveTeacherReminderSession,
  teacherReminderWindowConfig
} from '../api/_lib/teacher-lesson-reminder-job.js';

const TABLE = 'teacher_lesson_reminder_settings';

function isAdmin(actor) {
  const r = String(actor?.role || '').toLowerCase();
  return r === 'admin' || r === 'super_admin';
}

/**
 * Öğretmen ders hatırlatması ayarları — hangi WhatsApp hattından, kaç dakika önce.
 * Gönderim hattı = QR'ı okutan kullanıcının gateway oturumu.
 */
export default async function handler(req, res) {
  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch {
    return res.status(401).json({ error: 'Missing token' });
  }
  if (!isAdmin(actor)) return res.status(403).json({ error: 'forbidden' });

  try {
    if (req.method === 'GET') {
      const settings = await loadTeacherReminderSettings();
      const connected = await listConnectedGatewaySessionIds().catch(() => []);
      let sessions = [];
      if (connected.length) {
        const { data } = await supabaseAdmin.from('users').select('id,name,role,phone').in('id', connected);
        sessions = (data || []).map((u) => ({ ...u, connected: true }));
        // Kullanıcı kaydı olmayan oturumlar da görünsün
        for (const id of connected) {
          if (!sessions.some((s) => String(s.id) === String(id))) {
            sessions.push({ id, name: `Oturum ${id.slice(0, 8)}…`, role: null, phone: null, connected: true });
          }
        }
      }
      const resolved = await resolveTeacherReminderSession(settings).catch(() => null);
      return res.status(200).json({
        ok: true,
        settings,
        window: teacherReminderWindowConfig(settings),
        env_session_id: teacherReminderGatewaySessionId() || null,
        connected_sessions: sessions,
        // Elle seçim yoksa fiilen hangi hattan gideceği
        resolved_session: resolved
      });
    }

    if (req.method === 'POST' || req.method === 'PATCH') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const patch = { id: true, updated_by: actor.sub || null, updated_at: new Date().toISOString() };
      if (body.is_active !== undefined) patch.is_active = Boolean(body.is_active);
      if (body.channel !== undefined) {
        const ch = String(body.channel);
        if (ch !== 'gateway' && ch !== 'meta') return res.status(400).json({ error: 'channel_invalid' });
        patch.channel = ch;
      }
      if (body.gateway_user_id !== undefined) {
        patch.gateway_user_id = String(body.gateway_user_id || '').trim() || null;
      }
      if (body.sender_phone !== undefined) patch.sender_phone = String(body.sender_phone || '').trim() || null;
      if (body.minutes_before !== undefined) {
        const n = Number(body.minutes_before);
        if (!Number.isFinite(n) || n < 1 || n > 120) return res.status(400).json({ error: 'minutes_before_invalid' });
        patch.minutes_before = Math.round(n);
      }
      if (body.skip_etut_deneme !== undefined) {
        patch.skip_etut_deneme = Boolean(body.skip_etut_deneme);
      }
      if (body.window_minutes !== undefined) {
        const n = Number(body.window_minutes);
        if (!Number.isFinite(n) || n < 1 || n > 30) return res.status(400).json({ error: 'window_minutes_invalid' });
        patch.window_minutes = Math.round(n);
      }

      const { error } = await supabaseAdmin.from(TABLE).upsert(patch, { onConflict: 'id' });
      if (error) return res.status(500).json({ error: error.message });
      const settings = await loadTeacherReminderSettings();
      return res.status(200).json({ ok: true, settings, window: teacherReminderWindowConfig(settings) });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: errorMessage(e) });
  }
}
