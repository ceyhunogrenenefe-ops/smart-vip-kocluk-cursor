import { requireAuthenticatedActor, hasInstitutionAccess } from '../api/_lib/auth.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import {
  actorIsAdminLike,
  actorRoleSet,
  roleSetHasAdmin,
  roleSetHasSuperAdmin
} from '../api/_lib/actor-roles.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';

const jsonError = (res, status, error, extra) => res.status(status).json({ error, ...extra });

const PAYMENT_TYPES = new Set(['yazili', 'kitap', 'kurs', 'ozel_ders', 'dis_gelir', 'diger']);
const STATUSES = new Set(['unpaid', 'partial', 'paid', 'cancelled']);
const ACCOUNT_TYPES = new Set(['bank', 'credit_card']);
const YMD = /^\d{4}-\d{2}-\d{2}$/;

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function shiftYmdByMonths(ymd, deltaMonths) {
  const m = String(ymd || '').trim().slice(0, 10);
  if (!YMD.test(m)) return null;
  const [y, mo, d] = m.split('-').map((x) => parseInt(x, 10));
  const t = new Date(y, mo - 1 + deltaMonths, 1);
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  const day = Math.min(d, last);
  const r = new Date(t.getFullYear(), t.getMonth(), day);
  const yy = r.getFullYear();
  const mm = String(r.getMonth() + 1).padStart(2, '0');
  const dd = String(r.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function taksitVadeleriMonthly(anchorYmd, count) {
  const n = Math.max(1, Math.min(48, Math.round(count) || 1));
  const raw = String(anchorYmd || '').trim().slice(0, 10);
  const start = YMD.test(raw) ? raw : todayYmd();
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(shiftYmdByMonths(start, i) || start);
  }
  return out;
}

function splitTaksitTutarlari(ucret, count) {
  const u = Number(ucret);
  const n = Math.max(1, Math.min(48, Math.round(count) || 1));
  if (!Number.isFinite(u) || u <= 0) return [];
  const base = Math.floor(u / n);
  let rem = u - base * n;
  const out = [];
  for (let i = 0; i < n; i++) {
    let t = base;
    if (rem > 0) {
      t++;
      rem--;
    }
    out.push(t);
  }
  return out;
}

function randomUuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function schemaMissing(err) {
  return /student_payment_records|payment_accounts|does not exist|schema cache|PGRST205|relation .* does not exist/i.test(
    errorMessage(err)
  );
}

function deriveStatus(amountTotal, amountPaid, explicit) {
  if (explicit && STATUSES.has(explicit)) return explicit;
  const total = Number(amountTotal) || 0;
  const paid = Number(amountPaid) || 0;
  if (paid <= 0) return 'unpaid';
  if (total > 0 && paid >= total) return 'paid';
  if (paid > 0) return 'partial';
  return 'unpaid';
}

function remainingOf(row) {
  const total = Number(row.amount_total) || 0;
  const paid = Number(row.amount_paid) || 0;
  return Math.max(0, Math.round((total - paid) * 100) / 100);
}

async function enrichRecords(rows) {
  if (!rows?.length) return [];
  const studentIds = [...new Set(rows.map((r) => r.student_id).filter(Boolean))];
  const coachIds = [...new Set(rows.map((r) => r.coach_id).filter(Boolean))];
  const accountIds = [...new Set(rows.map((r) => r.payment_account_id).filter(Boolean))];

  const [studentsRes, coachesRes, accountsRes] = await Promise.all([
    studentIds.length
      ? supabaseAdmin.from('students').select('id, name, email, phone, parent_phone, parent_name, class_level, coach_id, institution_id').in('id', studentIds)
      : Promise.resolve({ data: [] }),
    coachIds.length
      ? supabaseAdmin.from('coaches').select('id, name, email, phone').in('id', coachIds)
      : Promise.resolve({ data: [] }),
    accountIds.length
      ? supabaseAdmin
          .from('payment_accounts')
          .select('id, label, bank_name, account_holder, iban, account_type')
          .in('id', accountIds)
      : Promise.resolve({ data: [] })
  ]);

  const studMap = new Map((studentsRes.data || []).map((s) => [String(s.id), s]));
  const coachMap = new Map((coachesRes.data || []).map((c) => [String(c.id), c]));
  const accMap = new Map((accountsRes.data || []).map((a) => [String(a.id), a]));

  return rows.map((r) => {
    const st = studMap.get(String(r.student_id));
    const ch = r.coach_id ? coachMap.get(String(r.coach_id)) : null;
    const acc = r.payment_account_id ? accMap.get(String(r.payment_account_id)) : null;
    const remaining = remainingOf(r);
    return {
      ...r,
      amount_total: Number(r.amount_total) || 0,
      amount_paid: Number(r.amount_paid) || 0,
      remaining,
      student_name: st?.name || r.external_student_name || r.student_id || 'Dış kayıt',
      student_email: st?.email || null,
      student_phone: st?.phone || null,
      parent_phone: st?.parent_phone || null,
      parent_name: st?.parent_name || null,
      class_level: r.class_level || st?.class_level || null,
      coach_name: ch?.name || null,
      is_external: !r.student_id || Boolean(r.external_student_name),
      external_student_name: r.external_student_name || null,
      account_label: acc?.label || null,
      account_bank: acc?.bank_name || null,
      account_holder: acc?.account_holder || null,
      account_iban: acc?.iban || null,
      account_type: acc?.account_type || null,
      contact_phone_resolved: r.contact_phone || st?.parent_phone || st?.phone || null
    };
  });
}

function scopeInstitution(actor, roleSet, queryInst) {
  if (roleSetHasSuperAdmin(roleSet)) {
    return queryInst ? String(queryInst).trim() : null;
  }
  return actor.institution_id || null;
}

async function handleGetAccounts(req, res, actor, roleSet) {
  const inst = scopeInstitution(actor, roleSet, req.query?.institution_id);
  const accountType = typeof req.query?.account_type === 'string' ? req.query.account_type.trim() : '';
  let q = supabaseAdmin
    .from('payment_accounts')
    .select('*')
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true });

  if (inst) {
    q = q.or(`institution_id.eq.${inst},institution_id.is.null`);
  } else if (!roleSetHasSuperAdmin(roleSet)) {
    return res.status(200).json({ data: [] });
  }
  if (accountType && ACCOUNT_TYPES.has(accountType)) {
    q = q.eq('account_type', accountType);
  }

  const { data, error } = await q;
  if (error) {
    if (schemaMissing(error)) {
      return res.status(200).json({ data: [], hint: 'student_payment_tracker_sql_missing' });
    }
    throw error;
  }
  return res.status(200).json({ data: data || [] });
}

async function accountIdsForType(inst, accountType) {
  let q = supabaseAdmin.from('payment_accounts').select('id').eq('active', true).eq('account_type', accountType);
  if (inst) q = q.or(`institution_id.eq.${inst},institution_id.is.null`);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map((a) => a.id);
}

function emptyPaymentStats() {
  return {
    total: 0,
    unpaid: 0,
    partial: 0,
    paid: 0,
    overdue: 0,
    remaining_sum: 0,
    paid_sum: 0,
    total_sum: 0
  };
}

async function handleGetRecords(req, res, actor, roleSet) {
  const inst = scopeInstitution(actor, roleSet, req.query?.institution_id);
  const status = typeof req.query?.status === 'string' ? req.query.status.trim() : '';
  const paymentType = typeof req.query?.payment_type === 'string' ? req.query.payment_type.trim() : '';
  const studentId = typeof req.query?.student_id === 'string' ? req.query.student_id.trim() : '';
  const coachId = typeof req.query?.coach_id === 'string' ? req.query.coach_id.trim() : '';
  const accountId = typeof req.query?.payment_account_id === 'string' ? req.query.payment_account_id.trim() : '';
  const dueFrom = typeof req.query?.due_from === 'string' ? req.query.due_from.trim().slice(0, 10) : '';
  const dueTo = typeof req.query?.due_to === 'string' ? req.query.due_to.trim().slice(0, 10) : '';
  const onlyOverdue = String(req.query?.only_overdue || '') === '1';
  const accountType = typeof req.query?.account_type === 'string' ? req.query.account_type.trim() : '';
  const qSearch = typeof req.query?.q === 'string' ? req.query.q.trim().toLowerCase() : '';

  let q = supabaseAdmin
    .from('student_payment_records')
    .select('*')
    .neq('status', 'cancelled')
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1000);

  if (inst) q = q.eq('institution_id', inst);
  else if (!roleSetHasSuperAdmin(roleSet)) return res.status(200).json({ data: [] });

  if (status && STATUSES.has(status)) q = q.eq('status', status);
  if (paymentType && PAYMENT_TYPES.has(paymentType)) q = q.eq('payment_type', paymentType);
  if (studentId) q = q.eq('student_id', studentId);
  if (coachId) q = q.eq('coach_id', coachId);
  if (accountId) q = q.eq('payment_account_id', accountId);
  if (dueFrom && YMD.test(dueFrom)) q = q.gte('due_date', dueFrom);
  if (dueTo && YMD.test(dueTo)) q = q.lte('due_date', dueTo);

  if (accountType && ACCOUNT_TYPES.has(accountType)) {
    const typeIds = await accountIdsForType(inst, accountType);
    if (!typeIds.length) {
      return res.status(200).json({ data: [], stats: emptyPaymentStats() });
    }
    q = q.in('payment_account_id', typeIds);
  }

  const { data, error } = await q;
  if (error) {
    if (schemaMissing(error)) {
      return res.status(200).json({ data: [], hint: 'student_payment_tracker_sql_missing' });
    }
    throw error;
  }

  let enriched = await enrichRecords(data || []);
  if (onlyOverdue) {
    const today = todayYmd();
    enriched = enriched.filter((r) => r.status !== 'paid' && r.due_date && String(r.due_date).slice(0, 10) < today);
  }
  if (qSearch) {
    enriched = enriched.filter((r) => {
      const blob = [
        r.student_name,
        r.external_student_name,
        r.coach_name,
        r.account_label,
        r.title,
        r.class_level,
        r.contact_phone_resolved,
        r.notes,
        r.payment_type
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return blob.includes(qSearch);
    });
  }

  const today = todayYmd();
  const stats = {
    total: enriched.length,
    unpaid: enriched.filter((r) => r.status === 'unpaid').length,
    partial: enriched.filter((r) => r.status === 'partial').length,
    paid: enriched.filter((r) => r.status === 'paid').length,
    overdue: enriched.filter(
      (r) => r.status !== 'paid' && r.due_date && String(r.due_date).slice(0, 10) < today
    ).length,
    remaining_sum: enriched.reduce((a, r) => a + (Number(r.remaining) || 0), 0),
    paid_sum: enriched.reduce((a, r) => a + (Number(r.amount_paid) || 0), 0),
    total_sum: enriched.reduce((a, r) => a + (Number(r.amount_total) || 0), 0)
  };

  return res.status(200).json({ data: enriched, stats });
}

async function handleCreateAccount(req, res, actor, roleSet) {
  const body = req.body || {};
  const label = String(body.label || '').trim();
  if (!label) return jsonError(res, 400, 'label_required');

  let institutionId = body.institution_id || actor.institution_id || null;
  if (roleSetHasAdmin(roleSet) && !roleSetHasSuperAdmin(roleSet)) {
    institutionId = actor.institution_id;
  }

  const accountType = String(body.account_type || 'bank').trim();
  if (!ACCOUNT_TYPES.has(accountType)) return jsonError(res, 400, 'invalid_account_type');

  const row = {
    institution_id: institutionId,
    label,
    bank_name: body.bank_name ? String(body.bank_name).trim() : null,
    account_holder: body.account_holder ? String(body.account_holder).trim() : null,
    iban: body.iban ? String(body.iban).trim() : null,
    account_type: accountType,
    notes: body.notes ? String(body.notes).trim() : null,
    active: body.active !== false,
    sort_order: Number(body.sort_order) || 0,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabaseAdmin.from('payment_accounts').insert(row).select('*').single();
  if (error) {
    if (schemaMissing(error)) return jsonError(res, 503, 'student_payment_tracker_sql_missing');
    throw error;
  }
  return res.status(201).json({ data });
}

async function handleCreateRecord(req, res, actor, roleSet) {
  const body = req.body || {};
  const studentId = String(body.student_id || '').trim();
  const externalName = String(body.external_student_name || body.student_name || '').trim();
  const isExternal = Boolean(body.is_external) || (!studentId && Boolean(externalName));

  if (!isExternal && !studentId) return jsonError(res, 400, 'student_id_required');
  if (isExternal && !externalName) return jsonError(res, 400, 'external_student_name_required');

  const paymentType = String(body.payment_type || (isExternal ? 'dis_gelir' : 'diger')).trim();
  if (!PAYMENT_TYPES.has(paymentType)) return jsonError(res, 400, 'invalid_payment_type');

  let student = null;
  if (!isExternal) {
    const { data, error: se } = await supabaseAdmin
      .from('students')
      .select('id, name, phone, parent_phone, parent_name, class_level, coach_id, institution_id')
      .eq('id', studentId)
      .maybeSingle();
    if (se) throw se;
    if (!data) return jsonError(res, 404, 'student_not_found');
    student = data;
  }

  let institutionId =
    body.institution_id || student?.institution_id || actor.institution_id || null;
  if (roleSetHasAdmin(roleSet) && !roleSetHasSuperAdmin(roleSet)) {
    if (student && !hasInstitutionAccess(actor, student.institution_id)) {
      return jsonError(res, 403, 'forbidden');
    }
    institutionId = actor.institution_id;
  }

  const amountTotal = Number(body.amount_total ?? 0);
  const amountPaid = Number(body.amount_paid ?? 0);
  if (Number.isNaN(amountTotal) || amountTotal < 0) return jsonError(res, 400, 'invalid_amount_total');
  if (Number.isNaN(amountPaid) || amountPaid < 0) return jsonError(res, 400, 'invalid_amount_paid');

  const status = deriveStatus(amountTotal, amountPaid, body.status ? String(body.status) : null);

  const installmentCount = Math.max(1, Math.min(48, Math.round(Number(body.installment_count) || 1)));
  const firstDueDate = body.due_date || body.first_due_date || null;

  const baseRow = {
    institution_id: institutionId,
    student_id: isExternal ? null : studentId,
    external_student_name: isExternal ? externalName : null,
    coach_id: body.coach_id != null ? String(body.coach_id).trim() || null : student?.coach_id || null,
    class_level:
      body.class_level != null
        ? String(body.class_level).trim() || null
        : student?.class_level != null
          ? String(student.class_level)
          : null,
    payment_type: paymentType,
    payment_account_id: body.payment_account_id ? String(body.payment_account_id).trim() : null,
    title: body.title ? String(body.title).trim() : null,
    currency: body.currency ? String(body.currency).trim() : 'TRY',
    contact_phone:
      body.contact_phone != null
        ? String(body.contact_phone).trim() || null
        : student?.parent_phone || student?.phone || null,
    contact_name:
      body.contact_name != null
        ? String(body.contact_name).trim() || null
        : student?.parent_name || (isExternal ? externalName : null),
    notes: body.notes ? String(body.notes).trim() : null,
    created_by: actor.sub || null,
    updated_at: new Date().toISOString()
  };

  if (installmentCount > 1) {
    const groupId = randomUuid();
    const amounts = splitTaksitTutarlari(amountTotal, installmentCount);
    const vadeler = taksitVadeleriMonthly(firstDueDate || todayYmd(), installmentCount);
    const rows = amounts.map((amt, i) => {
      const rowStatus = i === 0 && amountPaid > 0 ? deriveStatus(amt, amountPaid, null) : 'unpaid';
      const rowPaid = i === 0 && amountPaid > 0 ? Math.min(amountPaid, amt) : 0;
      return {
        ...baseRow,
        amount_total: amt,
        amount_paid: rowPaid,
        status: rowStatus,
        due_date: vadeler[i] || null,
        paid_at: rowStatus === 'paid' ? body.paid_at || todayYmd() : null,
        installment_group_id: groupId,
        installment_no: i + 1,
        installment_count: installmentCount
      };
    });

    const { data, error } = await supabaseAdmin.from('student_payment_records').insert(rows).select('*');
    if (error) {
      if (schemaMissing(error)) return jsonError(res, 503, 'student_payment_tracker_sql_missing');
      throw error;
    }
    const enriched = await enrichRecords(data || []);
    return res.status(201).json({ data: enriched, count: enriched.length });
  }

  const row = {
    ...baseRow,
    amount_total: amountTotal,
    amount_paid: amountPaid,
    status,
    due_date: firstDueDate,
    paid_at: status === 'paid' ? body.paid_at || todayYmd() : body.paid_at || null,
    installment_group_id: null,
    installment_no: null,
    installment_count: null
  };

  const { data, error } = await supabaseAdmin.from('student_payment_records').insert(row).select('*').single();
  if (error) {
    if (schemaMissing(error)) return jsonError(res, 503, 'student_payment_tracker_sql_missing');
    throw error;
  }
  const [enriched] = await enrichRecords([data]);
  return res.status(201).json({ data: enriched });
}

async function handlePatchRecord(req, res, actor, roleSet) {
  const body = req.body || {};
  const id = String(body.id || req.query?.id || '').trim();
  if (!id) return jsonError(res, 400, 'id_required');

  const { data: existing, error: fe } = await supabaseAdmin
    .from('student_payment_records')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (fe) throw fe;
  if (!existing) return jsonError(res, 404, 'not_found');

  if (roleSetHasAdmin(roleSet) && !roleSetHasSuperAdmin(roleSet)) {
    if (!hasInstitutionAccess(actor, existing.institution_id)) return jsonError(res, 403, 'forbidden');
  }

  const patch = { updated_at: new Date().toISOString() };
  const fields = [
    'coach_id',
    'class_level',
    'payment_account_id',
    'title',
    'currency',
    'due_date',
    'paid_at',
    'contact_phone',
    'contact_name',
    'notes',
    'external_student_name'
  ];
  for (const f of fields) {
    if (body[f] !== undefined) patch[f] = body[f] === '' || body[f] === null ? null : body[f];
  }
  if (body.external_student_name !== undefined && patch.external_student_name) {
    patch.external_student_name = String(patch.external_student_name).trim() || null;
  }
  if (body.payment_type !== undefined) {
    const t = String(body.payment_type).trim();
    if (!PAYMENT_TYPES.has(t)) return jsonError(res, 400, 'invalid_payment_type');
    patch.payment_type = t;
  }
  if (body.amount_total !== undefined) {
    const n = Number(body.amount_total);
    if (Number.isNaN(n) || n < 0) return jsonError(res, 400, 'invalid_amount_total');
    patch.amount_total = n;
  }
  if (body.amount_paid !== undefined) {
    const n = Number(body.amount_paid);
    if (Number.isNaN(n) || n < 0) return jsonError(res, 400, 'invalid_amount_paid');
    patch.amount_paid = n;
  }

  const nextTotal = patch.amount_total !== undefined ? patch.amount_total : existing.amount_total;
  const nextPaid = patch.amount_paid !== undefined ? patch.amount_paid : existing.amount_paid;
  patch.status = deriveStatus(
    nextTotal,
    nextPaid,
    body.status !== undefined ? String(body.status) : null
  );
  if (patch.status === 'paid' && !patch.paid_at && !existing.paid_at) {
    patch.paid_at = new Date().toISOString().slice(0, 10);
  }

  const { data, error } = await supabaseAdmin
    .from('student_payment_records')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  const [enriched] = await enrichRecords([data]);
  return res.status(200).json({ data: enriched });
}

async function handleDeleteRecord(req, res, actor, roleSet) {
  const id = String(req.query?.id || req.body?.id || '').trim();
  if (!id) return jsonError(res, 400, 'id_required');

  const { data: existing, error: fe } = await supabaseAdmin
    .from('student_payment_records')
    .select('id, institution_id')
    .eq('id', id)
    .maybeSingle();
  if (fe) throw fe;
  if (!existing) return jsonError(res, 404, 'not_found');

  if (roleSetHasAdmin(roleSet) && !roleSetHasSuperAdmin(roleSet)) {
    if (!hasInstitutionAccess(actor, existing.institution_id)) return jsonError(res, 403, 'forbidden');
  }

  const hard = String(req.query?.hard || '') === '1';
  if (hard) {
    const { error } = await supabaseAdmin.from('student_payment_records').delete().eq('id', id);
    if (error) throw error;
  } else {
    const { error } = await supabaseAdmin
      .from('student_payment_records')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  }
  return res.status(200).json({ ok: true });
}

async function handlePatchAccount(req, res, actor, roleSet) {
  const body = req.body || {};
  const id = String(body.id || '').trim();
  if (!id) return jsonError(res, 400, 'id_required');

  const { data: existing, error: fe } = await supabaseAdmin
    .from('payment_accounts')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (fe) throw fe;
  if (!existing) return jsonError(res, 404, 'not_found');

  if (roleSetHasAdmin(roleSet) && !roleSetHasSuperAdmin(roleSet)) {
    if (existing.institution_id && !hasInstitutionAccess(actor, existing.institution_id)) {
      return jsonError(res, 403, 'forbidden');
    }
  }

  const patch = { updated_at: new Date().toISOString() };
  for (const f of ['label', 'bank_name', 'account_holder', 'iban', 'notes']) {
    if (body[f] !== undefined) patch[f] = body[f] === '' || body[f] === null ? null : String(body[f]).trim();
  }
  if (body.account_type !== undefined) {
    const t = String(body.account_type).trim();
    if (!ACCOUNT_TYPES.has(t)) return jsonError(res, 400, 'invalid_account_type');
    patch.account_type = t;
  }
  if (body.active !== undefined) patch.active = Boolean(body.active);
  if (body.sort_order !== undefined) patch.sort_order = Number(body.sort_order) || 0;

  const { data, error } = await supabaseAdmin
    .from('payment_accounts')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return res.status(200).json({ data });
}

export default async function handler(req, res) {
  try {
    const actor = requireAuthenticatedActor(req);
    const roleSet = await actorRoleSet(actor);
    if (!actorIsAdminLike(actor, roleSet)) {
      return jsonError(res, 403, 'forbidden');
    }

    const op = typeof req.query?.op === 'string' ? req.query.op.trim() : '';

    if (req.method === 'GET') {
      if (op === 'accounts') return handleGetAccounts(req, res, actor, roleSet);
      return handleGetRecords(req, res, actor, roleSet);
    }

    if (req.method === 'POST') {
      const bodyOp = String(req.body?.op || op || '').trim();
      if (bodyOp === 'account') return handleCreateAccount(req, res, actor, roleSet);
      return handleCreateRecord(req, res, actor, roleSet);
    }

    if (req.method === 'PATCH') {
      const bodyOp = String(req.body?.op || op || '').trim();
      if (bodyOp === 'account') return handlePatchAccount(req, res, actor, roleSet);
      return handlePatchRecord(req, res, actor, roleSet);
    }

    if (req.method === 'DELETE') {
      return handleDeleteRecord(req, res, actor, roleSet);
    }

    return jsonError(res, 405, 'method_not_allowed');
  } catch (e) {
    const msg = errorMessage(e);
    if (/Missing token|Invalid token|Token expired/i.test(msg)) return jsonError(res, 401, msg);
    if (schemaMissing(e)) {
      return res.status(200).json({
        data: [],
        hint: 'student_payment_tracker_sql_missing',
        error:
          'Tablolar yok. Supabase SQL Editor’da sql/2026-08-05-student-payment-tracker.sql çalıştırın.'
      });
    }
    console.error('[student-payment-tracker]', msg);
    return jsonError(res, 500, msg);
  }
}
