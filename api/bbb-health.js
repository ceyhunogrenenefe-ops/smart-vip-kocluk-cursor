import { isBbbConfigured, resolveBbbMeetingDurationMinutes } from './_lib/bbb.js';

/**
 * BBB ortam değişkenleri tanımlı mı? (giriş gerekmez — Vercel teşhisi)
 * GET /api/bbb-health
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
  return res.status(200).json({
    configured,
    has_endpoint: hasEndpoint,
    has_secret: hasSecret,
    meeting_duration_minutes: resolveBbbMeetingDurationMinutes(0),
    hint: configured
      ? 'BBB API env OK — otomatik oda açılabilir.'
      : 'Vercel → Settings → Environment Variables → Production: BBB_API_ENDPOINT + BBB_API_SECRET ekleyin ve Redeploy.'
  });
}
