import { describe, expect, it } from 'vitest';
import { coachPrefsAccess, emptyCoachPrefsBody } from './coach-notification-prefs-http.js';

describe('coachPrefsAccess', () => {
  it('allows JWT super_admin even if DB only has coach', () => {
    const { isCoach, isAdmin, allowed } = coachPrefsAccess(new Set(['coach', 'super_admin']));
    expect(isCoach).toBe(true);
    expect(isAdmin).toBe(true);
    expect(allowed).toBe(true);
  });

  it('allows coach without admin', () => {
    expect(coachPrefsAccess(new Set(['coach'])).allowed).toBe(true);
    expect(coachPrefsAccess(new Set(['coach'])).isAdmin).toBe(false);
  });

  it('forbids student', () => {
    expect(coachPrefsAccess(new Set(['student'])).allowed).toBe(false);
  });
});

describe('emptyCoachPrefsBody', () => {
  it('returns 200-shaped payload without coach_id', () => {
    const body = emptyCoachPrefsBody({ gatewayUserId: 'user-1', gateway: { connected: false } });
    expect(body.coach_id).toBe(null);
    expect(body.prefs.daily_report_enabled).toBe(false);
    expect(body.recent_logs).toEqual([]);
    expect(body.gateway_user_id).toBe('user-1');
    expect(String(body.hint || '')).toMatch(/Koç profili/);
  });
});
