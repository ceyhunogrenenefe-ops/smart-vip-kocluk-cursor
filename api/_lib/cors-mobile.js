/** Capacitor / mobil WebView kökenleri — cross-origin /api istekleri için CORS */
const DEFAULT_ALLOWED = [
  'https://localhost',
  'http://localhost',
  'capacitor://localhost',
  'https://www.dersonlinevipkocluk.com',
  'https://dersonlinevipkocluk.com',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://smart-kocluk-ceyhu.vercel.app',
  'https://kitap-siparis-formu.vercel.app',
  'https://kocluk-kayit-formu.vercel.app'
];

function allowedOrigins() {
  const extra = String(process.env.MOBILE_ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED, ...extra]);
}

function pickOrigin(req) {
  const origin = String(req.headers?.origin || '').trim();
  if (!origin) return null;
  if (allowedOrigins().has(origin)) return origin;
  return null;
}

export function applyCors(req, res) {
  const origin = pickOrigin(req);
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

/** OPTIONS preflight — true dönerse yanıt gönderildi, handler çalışmasın */
export function handleCorsPreflight(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}
