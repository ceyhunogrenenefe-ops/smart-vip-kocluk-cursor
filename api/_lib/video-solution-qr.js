import QRCode from 'qrcode';

const DEFAULT_BASE = 'https://cozum.onlinevipdershane.com';

export function videoSolutionPublicBaseUrl() {
  const raw = String(process.env.PUBLIC_VIDEO_SOLUTION_BASE_URL || DEFAULT_BASE).trim();
  return raw.replace(/\/+$/, '');
}

export function videoSolutionSetPublicUrl(slug) {
  const s = String(slug || '').trim();
  if (!s) return '';
  return `${videoSolutionPublicBaseUrl()}/c/${encodeURIComponent(s)}`;
}

export function videoSolutionQuestionPublicUrl(slug, questionNumber) {
  const base = videoSolutionSetPublicUrl(slug);
  const n = Number(questionNumber);
  if (!base || !Number.isFinite(n) || n < 1) return base;
  return `${base}/s/${Math.trunc(n)}`;
}

export async function videoSolutionQrDataUrl(url) {
  const u = String(url || '').trim();
  if (!u) throw new Error('url_required');
  return QRCode.toDataURL(u, { margin: 1, width: 280, errorCorrectionLevel: 'M' });
}
