const { paytrConfig, paytrEnvCheck } = require('./_lib/paytr');
const { garantiConfig, garantiEnvCheck } = require('./_lib/garanti');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const paytrCheck = paytrEnvCheck();
  const garantiCheck = garantiEnvCheck();
  const paytrOk = Boolean(paytrConfig());
  const garantiOk = Boolean(garantiConfig());

  const providers = [];
  if (paytrOk) providers.push('paytr');
  if (garantiOk) providers.push('garanti');
  if (!providers.length && process.env.STRIPE_SECRET_KEY) providers.push('stripe');

  const defaultProvider = providers[0] || 'none';

  return res.status(200).json({
    provider: defaultProvider,
    providers,
    default: defaultProvider,
    paytr: {
      configured: paytrOk,
      missingEnv: paytrCheck.missing,
      testMode: paytrCheck.testMode,
    },
    garanti: {
      configured: garantiOk,
      missingEnv: garantiCheck.missing,
      mode: garantiCheck.mode,
    },
    hint:
      providers.length === 0
        ? 'Vercel → onlinevipdershane1 → Settings → Environment Variables: PayTR ve/veya Garanti değerlerini ekleyip redeploy edin.'
        : null,
  });
};
