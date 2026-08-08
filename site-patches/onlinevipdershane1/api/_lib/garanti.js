const crypto = require('crypto');

const GARANTI_ENV_KEYS = [
  'GARANTI_MERCHANT_ID',
  'GARANTI_TERMINAL_ID',
  'GARANTI_STORE_KEY',
  'GARANTI_PROVISION_PASSWORD',
];

function readEnv(name) {
  return String(process.env[name] || '')
    .trim()
    .replace(/^["']|["']$/g, '');
}

function garantiEnvCheck() {
  const missing = GARANTI_ENV_KEYS.filter((key) => !readEnv(key));
  return {
    configured: missing.length === 0,
    missing,
    mode: readEnv('GARANTI_MODE').toLowerCase() === 'test' ? 'TEST' : 'PROD',
    siteUrl: readEnv('SITE_URL') || null,
  };
}

function garantiConfig() {
  const merchantId = readEnv('GARANTI_MERCHANT_ID');
  const terminalId = readEnv('GARANTI_TERMINAL_ID');
  const storeKey = readEnv('GARANTI_STORE_KEY');
  const provisionPassword = readEnv('GARANTI_PROVISION_PASSWORD');
  const provisionUser = readEnv('GARANTI_PROVISION_USER') || 'PROVAUT';
  if (!merchantId || !terminalId || !storeKey || !provisionPassword) return null;
  const mode = readEnv('GARANTI_MODE').toLowerCase() === 'test' ? 'TEST' : 'PROD';
  return {
    merchantId,
    terminalId,
    storeKey,
    provisionPassword,
    provisionUser,
    terminalUserId: readEnv('GARANTI_TERMINAL_USER_ID') || provisionUser,
    companyName: readEnv('GARANTI_COMPANY_NAME') || 'Online VIP Dershane',
    mode,
    apiVersion: readEnv('GARANTI_API_VERSION') || '512',
    currencyCode: '949',
    gatewayUrl:
      mode === 'TEST'
        ? readEnv('GARANTI_GATEWAY_URL_TEST') ||
          'https://sanalposprovtest.garantibbva.com.tr/servlet/gt3dengine'
        : readEnv('GARANTI_GATEWAY_URL') ||
          'https://sanalposprov.garanti.com.tr/servlet/gt3dengine',
  };
}

function digestHex(algo, text) {
  return crypto.createHash(algo).update(String(text), 'latin1').digest('hex').toUpperCase();
}

function sha1Upper(text) {
  return digestHex('sha1', text);
}

function sha512Upper(text) {
  return digestHex('sha512', text);
}

function buildHashedPassword(provisionPassword, terminalId) {
  const padded = String(terminalId).padStart(9, '0');
  return sha1Upper(`${provisionPassword}${padded}`);
}

function buildSecure3dHash({
  provisionPassword,
  terminalId,
  orderId,
  amountKurus,
  currencyCode = '949',
  successUrl,
  errorUrl,
  txType = 'sales',
  installmentCount = 0,
  storeKey,
}) {
  const hashedPassword = buildHashedPassword(provisionPassword, terminalId);
  const installment =
    installmentCount == null || installmentCount === '' || Number(installmentCount) <= 1
      ? '0'
      : String(Math.round(Number(installmentCount)));
  const data =
    String(terminalId) +
    String(orderId) +
    String(amountKurus) +
    String(currencyCode) +
    String(successUrl) +
    String(errorUrl) +
    String(txType) +
    installment +
    String(storeKey) +
    hashedPassword;
  return sha512Upper(data);
}

function buildCommonPaymentFormFields({
  cfg,
  orderId,
  amountKurus,
  successUrl,
  errorUrl,
  customerEmail,
  customerIp,
  installmentCount = 0,
  cardholderName = '',
}) {
  const installment =
    installmentCount && Number(installmentCount) > 1
      ? String(Math.round(Number(installmentCount)))
      : '';
  const installmentForHash = installment ? Number(installment) : 0;
  const secure3dhash = buildSecure3dHash({
    provisionPassword: cfg.provisionPassword,
    terminalId: cfg.terminalId,
    orderId,
    amountKurus,
    currencyCode: cfg.currencyCode,
    successUrl,
    errorUrl,
    txType: 'sales',
    installmentCount: installmentForHash,
    storeKey: cfg.storeKey,
  });

  return {
    mode: cfg.mode,
    apiversion: cfg.apiVersion,
    terminalprovuserid: cfg.provisionUser,
    terminaluserid: cfg.terminalUserId,
    terminalmerchantid: cfg.merchantId,
    terminalid: cfg.terminalId,
    orderid: orderId,
    customeremailaddress: String(customerEmail || 'odeme@onlinevipdershane.com').slice(0, 64),
    customeripaddress: String(customerIp || '127.0.0.1').slice(0, 45),
    txntype: 'sales',
    txnamount: String(amountKurus),
    txncurrencycode: cfg.currencyCode,
    txninstallmentcount: installment,
    successurl: successUrl,
    errorurl: errorUrl,
    secure3dsecuritylevel: '3D_PAY',
    secure3dhash,
    lang: 'tr',
    companyname: String(cfg.companyName).slice(0, 40),
    ...(cardholderName ? { cardholdername: String(cardholderName).slice(0, 64) } : {}),
  };
}

function verifyCallbackHash(params, storeKey) {
  const hashparams = String(params.hashparams || params.hashParams || '').trim();
  const received = String(params.hash || '').trim().toUpperCase();
  if (!hashparams || !received || !storeKey) return false;
  const keys = hashparams
    .split(':')
    .map((k) => k.trim())
    .filter(Boolean);
  let val = '';
  for (const key of keys) {
    const v = params[key] ?? params[key.toLowerCase()] ?? params[key.toUpperCase()];
    val += v == null ? '' : String(v);
  }
  val += storeKey;
  return sha512Upper(val) === received;
}

const OK_MD = new Set(['1', '2', '3', '4']);

function isGarantiPaymentApproved(params) {
  const md = String(params.mdstatus ?? params.mdStatus ?? '').trim();
  const response = String(params.response || '')
    .trim()
    .toLowerCase();
  const code = String(params.procreturncode || params.procReturnCode || '').trim();
  if (md && !OK_MD.has(md)) return false;
  if (code && code !== '00') return false;
  if (response && response !== 'approved') return false;
  if (!md && !code && !response) return false;
  return true;
}

function makeGarantiOrderId() {
  const t = Date.now().toString(36).toUpperCase();
  const r = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `OVD${t}${r}`.slice(0, 36);
}

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();
  const real = String(req.headers['x-real-ip'] || '').trim();
  return (forwarded || real || '127.0.0.1').slice(0, 45);
}

function normalizeCallbackParams(raw) {
  const out = {};
  for (const [k, v] of Object.entries(raw || {})) {
    out[String(k).toLowerCase()] = Array.isArray(v) ? v[0] : v;
  }
  return out;
}

module.exports = {
  garantiEnvCheck,
  garantiConfig,
  buildCommonPaymentFormFields,
  verifyCallbackHash,
  isGarantiPaymentApproved,
  makeGarantiOrderId,
  clientIp,
  normalizeCallbackParams,
};
