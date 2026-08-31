/**
 * Koç WhatsApp bildirim tercihleri — rol ve boş yanıt (DB yokken 400 yerine).
 */

export function coachPrefsAccess(roleSet) {
  const set = roleSet && typeof roleSet.has === 'function' ? roleSet : new Set();
  const isCoach = set.has('coach');
  const isAdmin = set.has('admin') || set.has('super_admin');
  return { isCoach, isAdmin, allowed: isCoach || isAdmin };
}

export const EMPTY_COACH_PREFS = {
  daily_report_enabled: false,
  daily_report_scope: 'none',
  updated_at: null
};

export function emptyCoachPrefsBody({ gatewayUserId, gateway = null, hint } = {}) {
  return {
    coach_id: null,
    gateway_user_id: String(gatewayUserId || '').trim() || null,
    prefs: { ...EMPTY_COACH_PREFS },
    gateway: gateway ?? null,
    recent_logs: [],
    hint:
      hint ||
      'Koç profili yok — günlük rapor kaydı atlanır. Gateway QR bu kullanıcı id ile bağlanır.'
  };
}
