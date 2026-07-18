import {
  isBbbConfigured,
  probeBbbApiReachable,
  resolveBbbMeetingDurationMinutes,
  describeBbbApiEndpoint
} from './_lib/bbb.js';

/**
 * BBB ortam değişkenleri tanımlı mı? (giriş gerekmez — Vercel teşhisi)
 * GET /api/bbb-health
 * GET /api/bbb-health?probe=1 — BBB API'ye getMeetings ile canlı ping
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const configured = isBbbConfigured();
  const hasEndpoint = Boolean(
    process.env.BBB_API_ENDPOINT || process.env.BBB_URL || process.env.BIGBLUEBUTTON_URL
  );
  const hasSecret = Boolean(
    process.env.BBB_API_SECRET || process.env.BBB_SECRET || process.env.BIGBLUEBUTTON_SECRET
  );
  const wantProbe = ['1', 'true', 'yes'].includes(String(req.query?.probe || '').toLowerCase());
  let api_probe = null;
  if (wantProbe && configured) {
    api_probe = await probeBbbApiReachable();
  }

  const endpoint = describeBbbApiEndpoint();
  const checksumFail =
    api_probe?.error === 'checksumError' || api_probe?.bbb?.messageKey === 'checksumError';
  const healthy = configured && (!wantProbe || api_probe?.ok === true);
  return res.status(healthy ? 200 : wantProbe && configured ? 503 : 200).json({
    configured,
    has_endpoint: hasEndpoint,
    has_secret: hasSecret,
    endpoint_host: endpoint.host,
    endpoint_path: endpoint.path,
    meeting_duration_minutes: resolveBbbMeetingDurationMinutes(0),
    api_probe,
    healthy,
    hint: !configured
      ? 'Vercel → Settings → Environment Variables → Production: BBB_API_ENDPOINT + BBB_API_SECRET ekleyin ve Redeploy.'
      : checksumFail
        ? 'checksumError: BBB_API_SECRET, BBB panelindeki Salt ile aynı olmalı. Endpoint: https://ders.dersonlinevipkocluk.com/bigbluebutton/api'
        : wantProbe && api_probe && !api_probe.ok
          ? 'BBB env tanımlı ama sunucu yanıt vermiyor — BBB_API_ENDPOINT veya firewall kontrol edin.'
          : 'BBB API env OK — otomatik oda açılabilir. Kayıt testi için ?probe=1 ekleyin.'
  });
}
