/**
 * Garanti BBVA Sanal POS
 *
 * POST /api/garanti-pos          — admin: ödeme linki oluştur
 * GET  /api/garanti-pos          — admin: liste
 * GET  /api/garanti-pos/public?token= — kamu: sipariş özeti
 * POST /api/garanti-pos/start    — kamu: Garanti form alanları
 * POST /api/garanti-pos/callback — banka dönüşü (success + error)
 * GET  /api/garanti-pos/status   — admin: yapılandırma durumu (şifre yok)
 */
import crypto from 'crypto';
import { requireAuthenticatedActor, hasInstitutionAccess } from '../api/_lib/auth.js';
import { actorRoleSet, roleSetHasAdmin, roleSetHasSuperAdmin } from '../api/_lib/actor-roles.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import {
  getGarantiConfig,
  tryToKurus,
  kurusToTry,
  clientIpFromReq,
  publicAppBaseUrl,
  buildCommonPaymentFormFields,
  verifyCallbackHash,
  isGarantiPaymentApproved,
  parseFormBody,
  normalizeCallbackParams
} from '../api/_lib/garanti-pos.js';

const jsonError = (res, status, error, extra) => res.status(status).json({ error, ...extra });

function schemaMissing(err) {
  return /garanti_payment_orders|does not exist|schema cache|PGRST205|relation .* does not exist/i.test(
    errorMessage(err)
  );
}

function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function orderIdFromToken(prefix = 'OVD') {
  const t = Date.now().toString(36).toUpperCase();
  const r = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}${t}${r}`.slice(0, 36);
}

function extraPath(req) {
  const segs = Array.isArray(req.apiExtraSegments) ? req.apiExtraSegments.map(String) : [];
  return segs.join('/');
}

function parseJsonBody(req) {
  const b = req.body;
  if (b && typeof b === 'object' && !Buffer.isBuffer(b)) return b;
  if (typeof b === 'string') {
    try {
      return JSON.parse(b || '{}');
    } catch {
      return {};
    }
  }
  return {};
}

async function markLinkedPaymentPaid(order) {
  const recordId = order.student_payment_record_id;
  if (!recordId) return;
  const amountTry = kurusToTry(order.amount_kurus);
  const { data: existing } = await supabaseAdmin
    .from('student_payment_records')
    .select('id, amount_total, amount_paid, notes')
    .eq('id', recordId)
    .maybeSingle();
  if (!existing) return;
  const nextPaid = Math.max(Number(existing.amount_paid) || 0, amountTry);
  const total = Number(existing.amount_total) || 0;
  const status = total > 0 && nextPaid >= total ? 'paid' : nextPaid > 0 ? 'partial' : 'unpaid';
  await supabaseAdmin
    .from('student_payment_records')
    .update({
      amount_paid: nextPaid,
      status,
      paid_at: status === 'paid' ? new Date().toISOString().slice(0, 10) : null,
      notes: [existing.notes, `Garanti POS: ${order.order_id}`].filter(Boolean).join(' | ').slice(0, 500),
      updated_at: new Date().toISOString()
    })
    .eq('id', recordId);
}

async function handleAdminCreate(req, res, actor, roleSet) {
  const cfg = getGarantiConfig();
  if (!cfg.configured) {
    return jsonError(res, 503, 'garanti_not_configured', { missing: cfg.missing });
  }

  const body = parseJsonBody(req);
  const amountTry = Number(body.amount_try ?? body.amount);
  const amountKurus = tryToKurus(amountTry);
  if (amountKurus == null) return jsonError(res, 400, 'invalid_amount');

  const title = String(body.title || body.description || 'Online VIP Dershane ödeme').trim().slice(0, 200);
  const customerName = String(body.customer_name || '').trim().slice(0, 120) || null;
  const customerEmail = String(body.customer_email || '').trim().slice(0, 120) || null;
  const customerPhone = String(body.customer_phone || '').trim().slice(0, 40) || null;
  const installmentMax = Math.max(0, Math.min(12, Math.round(Number(body.installment_max) || 0)));
  let institutionId =
    body.institution_id != null && String(body.institution_id).trim()
      ? String(body.institution_id).trim()
      : actor.institution_id || null;

  if (roleSetHasAdmin(roleSet) && !roleSetHasSuperAdmin(roleSet)) {
    if (institutionId && !hasInstitutionAccess(actor, institutionId)) {
      return jsonError(res, 403, 'forbidden');
    }
    if (!institutionId) institutionId = actor.institution_id || null;
  }

  let studentPaymentRecordId =
    body.student_payment_record_id != null && String(body.student_payment_record_id).trim()
      ? String(body.student_payment_record_id).trim()
      : null;

  if (studentPaymentRecordId) {
    const { data: rec, error: re } = await supabaseAdmin
      .from('student_payment_records')
      .select('id, institution_id, title, contact_name, contact_phone, amount_total, amount_paid')
      .eq('id', studentPaymentRecordId)
      .maybeSingle();
    if (re) throw re;
    if (!rec) return jsonError(res, 404, 'payment_record_not_found');
    if (roleSetHasAdmin(roleSet) && !roleSetHasSuperAdmin(roleSet)) {
      if (!hasInstitutionAccess(actor, rec.institution_id)) return jsonError(res, 403, 'forbidden');
    }
    institutionId = institutionId || rec.institution_id;
  }

  const publicToken = randomToken(24);
  const orderId = orderIdFromToken();
  const row = {
    order_id: orderId,
    public_token: publicToken,
    institution_id: institutionId,
    student_payment_record_id: studentPaymentRecordId,
    title,
    amount_kurus: amountKurus,
    currency: 'TRY',
    installment_max: installmentMax,
    customer_name: customerName,
    customer_email: customerEmail,
    customer_phone: customerPhone,
    status: 'pending',
    created_by: actor.sub || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabaseAdmin.from('garanti_payment_orders').insert(row).select('*').single();
  if (error) {
    if (schemaMissing(error)) {
      return jsonError(res, 503, 'garanti_payment_orders_sql_missing', {
        hint: 'student-coaching-system/sql/2026-08-08-garanti-payment-orders.sql'
      });
    }
    throw error;
  }

  const base = publicAppBaseUrl(req);
  const payUrl = `${base}/odeme/${publicToken}`;
  return res.status(201).json({ data, pay_url: payUrl });
}

async function handleAdminList(req, res, actor, roleSet) {
  let q = supabaseAdmin
    .from('garanti_payment_orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  if (roleSetHasAdmin(roleSet) && !roleSetHasSuperAdmin(roleSet) && actor.institution_id) {
    q = q.eq('institution_id', actor.institution_id);
  }
  const { data, error } = await q;
  if (error) {
    if (schemaMissing(error)) {
      return jsonError(res, 503, 'garanti_payment_orders_sql_missing', {
        hint: 'student-coaching-system/sql/2026-08-08-garanti-payment-orders.sql'
      });
    }
    throw error;
  }
  return res.status(200).json({ data: data || [] });
}

async function handlePublicGet(req, res) {
  const token = String(req.query?.token || '').trim();
  if (!token) return jsonError(res, 400, 'token_required');

  const { data, error } = await supabaseAdmin
    .from('garanti_payment_orders')
    .select(
      'order_id, public_token, title, amount_kurus, currency, installment_max, customer_name, status, paid_at, created_at'
    )
    .eq('public_token', token)
    .maybeSingle();
  if (error) {
    if (schemaMissing(error)) return jsonError(res, 503, 'garanti_payment_orders_sql_missing');
    throw error;
  }
  if (!data) return jsonError(res, 404, 'not_found');

  const cfg = getGarantiConfig();
  return res.status(200).json({
    data: {
      ...data,
      amount_try: kurusToTry(data.amount_kurus),
      gateway_ready: cfg.configured
    }
  });
}

async function handleStart(req, res) {
  const cfg = getGarantiConfig();
  if (!cfg.configured) {
    return jsonError(res, 503, 'garanti_not_configured', { missing: cfg.missing });
  }

  const body = parseJsonBody(req);
  const token = String(body.token || req.query?.token || '').trim();
  if (!token) return jsonError(res, 400, 'token_required');

  const { data: order, error } = await supabaseAdmin
    .from('garanti_payment_orders')
    .select('*')
    .eq('public_token', token)
    .maybeSingle();
  if (error) {
    if (schemaMissing(error)) return jsonError(res, 503, 'garanti_payment_orders_sql_missing');
    throw error;
  }
  if (!order) return jsonError(res, 404, 'not_found');
  if (order.status === 'paid') return jsonError(res, 409, 'already_paid');
  if (order.status === 'cancelled') return jsonError(res, 409, 'cancelled');

  let installment = Math.round(Number(body.installment_count) || 0);
  if (installment <= 1) installment = 0;
  const max = Number(order.installment_max) || 0;
  if (installment > 0 && (max <= 0 || installment > max)) {
    return jsonError(res, 400, 'installment_not_allowed');
  }

  const base = publicAppBaseUrl(req);
  const successUrl = `${base}/api/garanti-pos/callback?result=ok`;
  const errorUrl = `${base}/api/garanti-pos/callback?result=fail`;
  const fields = buildCommonPaymentFormFields({
    cfg,
    orderId: order.order_id,
    amountKurus: order.amount_kurus,
    successUrl,
    errorUrl,
    customerEmail: order.customer_email || body.customer_email,
    customerIp: clientIpFromReq(req),
    installmentCount: installment,
    cardholderName: order.customer_name || body.customer_name || ''
  });

  await supabaseAdmin
    .from('garanti_payment_orders')
    .update({
      status: 'redirected',
      installment_chosen: installment || null,
      updated_at: new Date().toISOString()
    })
    .eq('id', order.id);

  return res.status(200).json({
    gateway_url: cfg.gatewayUrl,
    fields,
    order_id: order.order_id,
    amount_try: kurusToTry(order.amount_kurus)
  });
}

function htmlRedirect(url, title, message) {
  const safeUrl = String(url).replace(/"/g, '&quot;');
  const safeTitle = String(title).replace(/</g, '&lt;');
  const safeMsg = String(message).replace(/</g, '&lt;');
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"/><meta http-equiv="refresh" content="0;url=${safeUrl}"/><title>${safeTitle}</title>
<style>body{font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#0f172a;color:#e2e8f0;margin:0;padding:24px;text-align:center}
a{color:#38bdf8}</style></head><body><div><p>${safeMsg}</p><p><a href="${safeUrl}">Devam et</a></p></div>
<script>location.replace(${JSON.stringify(url)});</script></body></html>`;
}

async function handleCallback(req, res) {
  const cfg = getGarantiConfig();
  const base = publicAppBaseUrl(req);
  const raw = { ...normalizeCallbackParams(parseFormBody(req)), ...normalizeCallbackParams(req.query || {}) };
  const orderId = String(raw.orderid || raw.oid || '').trim();
  const resultHint = String(req.query?.result || '').trim();

  const failRedirect = (reason, oid) => {
    const q = new URLSearchParams({ status: 'fail', reason: String(reason || 'odeme_basarisiz').slice(0, 80) });
    if (oid) q.set('order', oid);
    res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(htmlRedirect(`${base}/odeme/sonuc?${q}`, 'Ödeme başarısız', 'Ödeme tamamlanamadı, yönlendiriliyorsunuz…'));
  };

  const okRedirect = (oid) => {
    const q = new URLSearchParams({ status: 'ok' });
    if (oid) q.set('order', oid);
    res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(htmlRedirect(`${base}/odeme/sonuc?${q}`, 'Ödeme başarılı', 'Ödeme alındı, yönlendiriliyorsunuz…'));
  };

  if (!orderId) return failRedirect('order_missing');

  const { data: order, error } = await supabaseAdmin
    .from('garanti_payment_orders')
    .select('*')
    .eq('order_id', orderId)
    .maybeSingle();
  if (error || !order) return failRedirect('order_not_found', orderId);

  if (order.status === 'paid') return okRedirect(orderId);

  const hashOk = cfg.storeKey ? verifyCallbackHash(raw, cfg.storeKey) : false;
  const approved = isGarantiPaymentApproved(raw);
  const md = String(raw.mdstatus || '').trim();
  const errMsg = String(raw.mderrormessage || raw.errmsg || raw.errmsg || '').slice(0, 400);

  // Hash yoksa (bazı hata dönüşleri) yine de kaydet; başarı için hash veya güçlü onay iste
  const treatSuccess = approved && (hashOk || raw.response?.toLowerCase?.() === 'approved');

  const callbackPayload = {
    mdstatus: md || null,
    procreturncode: raw.procreturncode || null,
    response: raw.response || null,
    hash_ok: hashOk,
    result_hint: resultHint || null,
    err: errMsg || null,
    authcode: raw.authcode || raw.authCode || null,
    hostmsg: raw.hostmsg || null,
    at: new Date().toISOString()
  };

  if (!treatSuccess) {
    await supabaseAdmin
      .from('garanti_payment_orders')
      .update({
        status: 'failed',
        callback_json: callbackPayload,
        last_error: errMsg || `mdstatus=${md || '-'}`,
        updated_at: new Date().toISOString()
      })
      .eq('id', order.id);
    return failRedirect(errMsg || 'bank_declined', orderId);
  }

  await supabaseAdmin
    .from('garanti_payment_orders')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      callback_json: callbackPayload,
      last_error: null,
      updated_at: new Date().toISOString()
    })
    .eq('id', order.id);

  try {
    await markLinkedPaymentPaid(order);
  } catch (e) {
    console.error('[garanti-pos] mark linked payment failed', errorMessage(e));
  }

  return okRedirect(orderId);
}

async function handleStatus(req, res, actor) {
  const cfg = getGarantiConfig();
  return res.status(200).json({
    configured: cfg.configured,
    missing: cfg.missing,
    mode: cfg.mode,
    merchant_id_set: Boolean(cfg.merchantId),
    terminal_id_set: Boolean(cfg.terminalId),
    company_name: cfg.companyName,
    actor: actor?.sub || null
  });
}

export default async function handler(req, res) {
  const path = extraPath(req);

  try {
    if (path === 'callback' || path.startsWith('callback/')) {
      if (req.method !== 'POST' && req.method !== 'GET') {
        return jsonError(res, 405, 'method_not_allowed');
      }
      return await handleCallback(req, res);
    }

    if (path === 'public' || path.startsWith('public/')) {
      if (req.method !== 'GET') return jsonError(res, 405, 'method_not_allowed');
      return await handlePublicGet(req, res);
    }

    if (path === 'start' || path.startsWith('start/')) {
      if (req.method !== 'POST') return jsonError(res, 405, 'method_not_allowed');
      return await handleStart(req, res);
    }

    const actor = await requireAuthenticatedActor(req, res);
    if (!actor) return;
    const roleSet = actorRoleSet(actor);
    if (!roleSetHasAdmin(roleSet) && !roleSetHasSuperAdmin(roleSet)) {
      return jsonError(res, 403, 'forbidden');
    }

    if (path === 'status') {
      if (req.method !== 'GET') return jsonError(res, 405, 'method_not_allowed');
      return await handleStatus(req, res, actor);
    }

    if (!path) {
      if (req.method === 'POST') return await handleAdminCreate(req, res, actor, roleSet);
      if (req.method === 'GET') return await handleAdminList(req, res, actor, roleSet);
      return jsonError(res, 405, 'method_not_allowed');
    }

    return jsonError(res, 404, 'unknown_subpath', { path });
  } catch (e) {
    console.error('[garanti-pos]', errorMessage(e));
    if (!res.headersSent) return jsonError(res, 500, errorMessage(e));
  }
}
