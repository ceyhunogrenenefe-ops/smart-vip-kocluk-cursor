/**
 * Zoom canlı katılımcı listesi (Dashboard metrics).
 * Server-to-Server OAuth. Yoklama yazmaz, mesaj göndermez.
 * ZOOM_ACCOUNT_ID / ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET yoksa boş döner.
 */

const TOKEN_URL = 'https://zoom.us/oauth/token';

let tokenCache = { access: '', exp: 0 };

export function parseZoomMeetingId(link) {
  const s = String(link || '');
  const m = s.match(/zoom\.us\/(?:j|s|wc\/join)\/(\d+)/i);
  return m ? m[1] : '';
}

export function zoomCredentials() {
  const accountId = String(process.env.ZOOM_ACCOUNT_ID || '').trim();
  const clientId = String(process.env.ZOOM_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.ZOOM_CLIENT_SECRET || '').trim();
  if (!accountId || !clientId || !clientSecret) return null;
  return { accountId, clientId, clientSecret };
}

async function zoomAccessToken() {
  const creds = zoomCredentials();
  if (!creds) return '';
  if (tokenCache.access && tokenCache.exp > Date.now() + 60_000) return tokenCache.access;
  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');
  const url = `${TOKEN_URL}?grant_type=account_credentials&account_id=${encodeURIComponent(creds.accountId)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}` }
  });
  if (!res.ok) return '';
  const json = await res.json().catch(() => ({}));
  const access = String(json.access_token || '');
  const secs = Number(json.expires_in) || 3600;
  if (access) tokenCache = { access, exp: Date.now() + secs * 1000 };
  return access;
}

/**
 * @returns {Promise<{ fullName: string, hasVideo: boolean|null, video_quality: string, camera: string }[]>}
 */
export async function zoomLiveParticipants(meetingId) {
  const id = String(meetingId || '').replace(/\D/g, '');
  if (!id) return { ok: false, reason: 'no_meeting_id', participants: [] };
  if (!zoomCredentials()) return { ok: false, reason: 'zoom_not_configured', participants: [] };
  try {
    const token = await zoomAccessToken();
    if (!token) return { ok: false, reason: 'zoom_auth_failed', participants: [] };

    const url =
      `https://api.zoom.us/v2/metrics/meetings/${encodeURIComponent(id)}/participants?type=live&page_size=300`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000)
    });
    if (res.status === 404) return { ok: true, reason: 'zoom_not_running', participants: [] };
    if (res.status === 400 || res.status === 403) {
      return { ok: false, reason: 'zoom_dashboard_unavailable', participants: [] };
    }
    if (!res.ok) return { ok: false, reason: 'zoom_error', participants: [] };
    const json = await res.json().catch(() => ({}));
    const list = Array.isArray(json.participants) ? json.participants : [];
    const participants = list
      .filter((p) => String(p?.status || 'in_meeting') !== 'left' && !p?.leave_time)
      .map((p) => ({
        fullName: String(p.user_name || p.name || '').trim(),
        hasVideo: null,
        video_quality: String(p.video_quality || ''),
        camera: p.camera == null ? '' : String(p.camera)
      }))
      .filter((p) => p.fullName);
    return { ok: true, reason: participants.length ? '' : 'zoom_not_running', participants };
  } catch {
    return { ok: false, reason: 'zoom_error', participants: [] };
  }
}
