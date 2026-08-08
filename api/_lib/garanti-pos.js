/**
 * Garanti BBVA Virtual POS (NestPay) — SHA512 hash + form alanları.
 * Ortak ödeme sayfası: kart bilgisi sitede tutulmaz; Garanti sayfasında girilir.
 */
import crypto from 'crypto';

const TRY = '949';

export function garantiMode() {
  const m = String(process.env.GARANTI_MODE || 'prod').trim().toLowerCase();
  return m === 'test' ? 'TEST' : 'PROD';
}

export function garantiGatewayUrl() {
  if (garantiMode() === 'TEST') {
    return (
      process.env.GARANTI_GATEWAY_URL_TEST?.trim() ||
      'https://sanalposprovtest.garantibbva.com.tr/servlet/gt3dengine'
    );
  }
  return (
    process.env.GARANTI_GATEWAY_URL?.trim() ||
    'https://sanalposprov.garanti.com.tr/servlet/gt3dengine'
  );
}

export function getGarantiConfig() {
  const merchantId = String(process.env.GARANTI_MERCHANT_ID || '').trim();
  const terminalId = String(process.env.GARANTI_TERMINAL_ID || '').trim();
  const storeKey = String(process.env.GARANTI_STORE_KEY || '').trim();
  const provisionUser = String(process.env.GARANTI_PROVISION_USER || 'PROVAUT').trim();
  const provisionPassword = String(process.env.GARANTI_PROVISION_PASSWORD || '').trim();
  const terminalUserId = String(process.env.GARANTI_TERMINAL_USER_ID || provisionUser).trim();
  const companyName = String(process.env.GARANTI_COMPANY_NAME || 'Online VIP Dershane').trim();
  const missing = [];
  if (!merchantId) missing.push('GARANTI_MERCHANT_ID');
  if (!terminalId) missing.push('GARANTI_TERMINAL_ID');
  if (!storeKey) missing.push('GARANTI_STORE_KEY');
  if (!provisionPassword) missing.push('GARANTI_PROVISION_PASSWORD');
  return {
    merchantId,
    terminalId,
    storeKey,
    provisionUser,
    provisionPassword,
    terminalUserId,
    companyName,
    mode: garantiMode(),
    apiVersion: String(process.env.GARANTI_API_VERSION || '512').trim() || '512',
    currencyCode: TRY,
    gatewayUrl: garantiGatewayUrl(),
    missing,
    configured: missing.length === 0
  };
}

/** ISO-8859-9 uyumlu digest (ASCII içerik için utf8 ile aynı). */
export function digestHex(algo, text) {
  return crypto.createHash(algo).update(String(text), 'latin1').digest('hex').toUpperCase();
}

export function sha1Upper(text) {
  return digestHex('sha1', text);
}

export function sha512Upper(text) {
  return digestHex('sha512', text);
}

/** SecurityData: SHA1(provisionPassword + paddedTerminalId) */
export function buildHashedPassword(provisionPassword, terminalId) {
  const padded = String(terminalId).padStart(9, '0');
  return sha1Upper(`${provisionPassword}${padded}`);
}

/**
 * 3D / ortak ödeme form hash (SHA512).
 * terminalId + orderId + amount + currency + successUrl + errorUrl + type + installment + storeKey + hashedPassword
 */
export function buildSecure3dHash({
  provisionPassword,
  terminalId,
  orderId,
  amountKurus,
  currencyCode = TRY,
  successUrl,
  errorUrl,
  txType = 'sales',
  installmentCount = 0,
  storeKey
}) {
  const hashedPassword = buildHashedPassword(provisionPassword, terminalId);
  const installment =
    installmentCount == null || installmentCount === '' || Number(installmentCount) <= 1
      ? '0'
      : String(Math.round(Number(installmentCount)));
  const amount = String(amountKurus);
  const data =
    String(terminalId) +
    String(orderId) +
    amount +
    String(currencyCode) +
    String(successUrl) +
    String(errorUrl) +
    String(txType) +
    installment +
    String(storeKey) +
    hashedPassword;
  return sha512Upper(data);
}

/** TL → kuruş (1.00 TL = 100) */
export function tryToKurus(amountTry) {
  const n = Number(amountTry);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

export function kurusToTry(kurus) {
  const n = Number(kurus);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n) / 100;
}

export function clientIpFromReq(req) {
  const xf = String(req.headers?.['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();
  if (xf) return xf.slice(0, 45);
  const real = String(req.headers?.['x-real-ip'] || '').trim();
  if (real) return real.slice(0, 45);
  return String(req.socket?.remoteAddress || '127.0.0.1').slice(0, 45);
}

export function publicAppBaseUrl(req) {
  const env =
    process.env.APP_PUBLIC_URL?.trim() ||
    process.env.PUBLIC_APP_URL?.trim() ||
    process.env.VITE_APP_URL?.trim();
  if (env) return env.replace(/\/+$/, '');
  const host = String(req.headers?.['x-forwarded-host'] || req.headers?.host || '')
    .split(',')[0]
    .trim();
  const proto = String(req.headers?.['x-forwarded-proto'] || 'https')
    .split(',')[0]
    .trim();
  if (host) return `${proto}://${host}`.replace(/\/+$/, '');
  return 'https://www.onlinevipdershane.com';
}

/**
 * Ortak ödeme (kart Garanti sayfasında) form alanları.
 * secure3dsecuritylevel: 3D_PAY
 */
export function buildCommonPaymentFormFields({
  cfg,
  orderId,
  amountKurus,
  successUrl,
  errorUrl,
  customerEmail,
  customerIp,
  installmentCount = 0,
  cardholderName = ''
}) {
  const installment =
    installmentCount && Number(installmentCount) > 1 ? String(Math.round(Number(installmentCount))) : '';
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
    storeKey: cfg.storeKey
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
    companyname: cfg.companyName.slice(0, 40),
    ...(cardholderName ? { cardholdername: String(cardholderName).slice(0, 64) } : {})
  };
}

/** Callback hashparams doğrulama (SHA512). */
export function verifyCallbackHash(params, storeKey) {
  const hashparams = String(params.hashparams || params.hashParams || '').trim();
  const received = String(params.hash || '').trim().toUpperCase();
  if (!hashparams || !received || !storeKey) return false;
  const keys = hashparams.split(':').map((k) => k.trim()).filter(Boolean);
  let val = '';
  for (const key of keys) {
    const v = params[key] ?? params[key.toLowerCase()] ?? params[key.toUpperCase()];
    val += v == null ? '' : String(v);
  }
  val += storeKey;
  return sha512Upper(val) === received;
}

const OK_MD = new Set(['1', '2', '3', '4']);

export function isGarantiPaymentApproved(params) {
  const md = String(params.mdstatus ?? params.mdStatus ?? '').trim();
  const response = String(params.response || '').trim().toLowerCase();
  const code = String(params.procreturncode || params.procReturnCode || '').trim();
  if (md && !OK_MD.has(md)) return false;
  if (code && code !== '00') return false;
  if (response && response !== 'approved') return false;
  if (!md && !code && !response) return false;
  return true;
}

export function parseFormBody(req) {
  const b = req.body;
  if (b && typeof b === 'object' && !Buffer.isBuffer(b)) return { ...b };
  if (typeof b === 'string' && b.includes('=')) {
    const out = {};
    for (const part of b.split('&')) {
      const i = part.indexOf('=');
      if (i < 0) continue;
      const k = decodeURIComponent(part.slice(0, i).replace(/\+/g, ' '));
      const v = decodeURIComponent(part.slice(i + 1).replace(/\+/g, ' '));
      out[k] = v;
    }
    return out;
  }
  return {};
}

export function normalizeCallbackParams(raw) {
  const out = {};
  for (const [k, v] of Object.entries(raw || {})) {
    out[String(k).toLowerCase()] = Array.isArray(v) ? v[0] : v;
  }
  return out;
}
