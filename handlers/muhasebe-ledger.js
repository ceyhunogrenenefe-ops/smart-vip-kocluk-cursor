import { requireAuthenticatedActor, hasInstitutionAccess } from '../api/_lib/auth.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import {
  actorIsAdminLike,
  actorRoleSet,
  roleSetHasAdmin,
  roleSetHasSuperAdmin
} from '../api/_lib/actor-roles.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { sessionLessonUnits40 } from '../api/_lib/class-lesson-payment-units.js';

const jsonError = (res, status, error, extra) => res.status(status).json({ error, ...extra });

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const EXPENSE_CATEGORIES = new Set([
  'kira',
  'faturalar',
  'maas',
  'reklam',
  'malzeme',
  'yazilim',
  'ulasim',
  'vergi',
  'diger'
]);

const OTHER_INCOME_TYPES = new Set(['dis_gelir', 'diger']);
const STUDENT_INCOME_TYPES = new Set([
  'yazili',
  'kitap',
  'kurs',
  'ozel_ders',
  'donem_kayit',
  'yaz_kayit'
]);

function schemaMissing(err) {
  return /institution_expense_items|student_payment_records|does not exist|schema cache|PGRST205|relation .* does not exist/i.test(
    errorMessage(err)
  );
}

function monthBounds(ym) {
  const raw = String(ym || '').trim();
  if (!/^\d{4}-\d{2}$/.test(raw)) return null;
  const [y, m] = raw.split('-').map((x) => parseInt(x, 10));
  const last = new Date(y, m, 0).getDate();
  return {
    from: `${raw}-01`,
    to: `${raw}-${String(last).padStart(2, '0')}`
  };
}

function scopeInstitution(actor, roleSet, queryInst) {
  if (roleSetHasSuperAdmin(roleSet)) {
    return queryInst ? String(queryInst).trim() : null;
  }
  return actor.institution_id || null;
}

function parseRange(req) {
  const month = typeof req.query?.month === 'string' ? req.query.month.trim() : '';
  if (month) {
    const b = monthBounds(month);
    if (b) return b;
  }
  let from = typeof req.query?.from === 'string' ? req.query.from.trim().slice(0, 10) : '';
  let to = typeof req.query?.to === 'string' ? req.query.to.trim().slice(0, 10) : '';
  if (!YMD.test(from) || !YMD.test(to)) {
    const n = new Date();
    const ym = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
    return monthBounds(ym);
  }
  return { from, to };
}

async function loadTeacherExpense(from, to) {
  const { data: sessions, error } = await supabaseAdmin
    .from('class_sessions')
    .select('id, teacher_id, start_time, end_time, lesson_date, status')
    .eq('status', 'completed')
    .gte('lesson_date', from)
    .lte('lesson_date', to)
    .limit(5000);
  if (error) throw error;

  const { data: rates } = await supabaseAdmin.from('teacher_group_lesson_rates').select('teacher_id, unit_price_tl');
  const rateMap = new Map((rates || []).map((r) => [String(r.teacher_id), Number(r.unit_price_tl) || 500]));

  let lessonSum = 0;
  for (const s of sessions || []) {
    const units = sessionLessonUnits40(s);
    const price = rateMap.get(String(s.teacher_id)) || 500;
    lessonSum += units * price;
  }

  let extraSum = 0;
  const seenExtra = new Set();
  const { data: extrasByDate } = await supabaseAdmin
    .from('teacher_payment_extra_items')
    .select('id, amount_tl, item_date')
    .gte('item_date', from)
    .lte('item_date', to)
    .limit(2000);
  for (const e of extrasByDate || []) {
    const id = String(e.id);
    if (seenExtra.has(id)) continue;
    seenExtra.add(id);
    extraSum += Number(e.amount_tl) || 0;
  }
  const { data: extrasByPeriod } = await supabaseAdmin
    .from('teacher_payment_extra_items')
    .select('id, amount_tl, item_date, period_from, period_to')
    .eq('period_from', from)
    .eq('period_to', to)
    .limit(2000);
  for (const e of extrasByPeriod || []) {
    const id = String(e.id);
    if (seenExtra.has(id)) continue;
    seenExtra.add(id);
    extraSum += Number(e.amount_tl) || 0;
  }

  return {
    lesson_sum: Math.round(lessonSum * 100) / 100,
    extra_sum: Math.round(extraSum * 100) / 100,
    total: Math.round((lessonSum + extraSum) * 100) / 100
  };
}

async function loadStudentIncome(inst, from, to) {
  let q = supabaseAdmin
    .from('student_payment_records')
    .select('payment_type, amount_total, amount_paid, status, due_date, paid_at')
    .neq('status', 'cancelled')
    .gte('due_date', from)
    .lte('due_date', to)
    .limit(5000);
  if (inst) q = q.eq('institution_id', inst);
  const { data, error } = await q;
  if (error) {
    if (schemaMissing(error)) return { student_sum: 0, other_sum: 0, total_sum: 0, paid_sum: 0, remaining_sum: 0, by_type: {} };
    throw error;
  }

  const byType = {};
  let studentSum = 0;
  let otherSum = 0;
  let paidSum = 0;
  let remainingSum = 0;
  let totalSum = 0;

  for (const r of data || []) {
    const type = String(r.payment_type || 'diger');
    const total = Number(r.amount_total) || 0;
    const paid = Number(r.amount_paid) || 0;
    const rem = Math.max(0, total - paid);
    totalSum += total;
    paidSum += paid;
    remainingSum += rem;
    byType[type] = (byType[type] || 0) + paid;
    if (OTHER_INCOME_TYPES.has(type)) otherSum += paid;
    else if (STUDENT_INCOME_TYPES.has(type) || type === 'kurs') studentSum += paid;
    else otherSum += paid;
  }

  return {
    student_sum: Math.round(studentSum * 100) / 100,
    other_sum: Math.round(otherSum * 100) / 100,
    paid_sum: Math.round(paidSum * 100) / 100,
    remaining_sum: Math.round(remainingSum * 100) / 100,
    total_sum: Math.round(totalSum * 100) / 100,
    by_type: byType
  };
}

async function loadOtherExpenses(inst, from, to) {
  let q = supabaseAdmin
    .from('institution_expense_items')
    .select('*')
    .gte('item_date', from)
    .lte('item_date', to)
    .order('item_date', { ascending: false })
    .limit(2000);
  if (inst) q = q.or(`institution_id.eq.${inst},institution_id.is.null`);
  const { data, error } = await q;
  if (error) {
    if (schemaMissing(error)) return { items: [], total: 0, hint: 'muhasebe_ledger_sql_missing' };
    throw error;
  }
  const items = data || [];
  const total = items.reduce((a, r) => a + (Number(r.amount_tl) || 0), 0);
  return { items, total: Math.round(total * 100) / 100 };
}

async function handleGetSummary(req, res, actor, roleSet) {
  const inst = scopeInstitution(actor, roleSet, req.query?.institution_id);
  if (!inst && !roleSetHasSuperAdmin(roleSet)) {
    return res.status(200).json({ error: 'institution_required' });
  }
  const range = parseRange(req);
  const [income, teacher, otherExp] = await Promise.all([
    loadStudentIncome(inst, range.from, range.to),
    loadTeacherExpense(range.from, range.to),
    loadOtherExpenses(inst, range.from, range.to)
  ]);

  const gelirToplam = income.paid_sum;
  const giderOgretmen = teacher.total;
  const giderDiger = otherExp.total;
  const giderToplam = Math.round((giderOgretmen + giderDiger) * 100) / 100;
  const kar = Math.round((gelirToplam - giderToplam) * 100) / 100;

  return res.status(200).json({
    from: range.from,
    to: range.to,
    gelir: {
      ogrenci: income.student_sum,
      diger: income.other_sum,
      toplam: gelirToplam,
      tahakkuk_toplam: income.total_sum,
      kalan_alacak: income.remaining_sum,
      by_type: income.by_type
    },
    gider: {
      ogretmen_ders: teacher.lesson_sum,
      ogretmen_ekstra: teacher.extra_sum,
      ogretmen: giderOgretmen,
      diger: giderDiger,
      toplam: giderToplam
    },
    kar,
    expenses: otherExp.items,
    hint: otherExp.hint || null
  });
}

async function handleListExpenses(req, res, actor, roleSet) {
  const inst = scopeInstitution(actor, roleSet, req.query?.institution_id);
  const range = parseRange(req);
  const otherExp = await loadOtherExpenses(inst, range.from, range.to);
  return res.status(200).json({
    from: range.from,
    to: range.to,
    data: otherExp.items,
    total: otherExp.total,
    hint: otherExp.hint || null
  });
}

async function handleCreateExpense(req, res, actor, roleSet) {
  const body = req.body || {};
  const title = String(body.title || '').trim();
  if (!title) return jsonError(res, 400, 'title_required');
  const amount = Number(body.amount_tl ?? body.amount ?? 0);
  if (!Number.isFinite(amount) || amount < 0) return jsonError(res, 400, 'invalid_amount');
  const category = String(body.category || 'diger').trim();
  if (!EXPENSE_CATEGORIES.has(category)) return jsonError(res, 400, 'invalid_category');
  const itemDate = String(body.item_date || '').slice(0, 10);
  if (!YMD.test(itemDate)) return jsonError(res, 400, 'item_date_required');

  let institutionId = body.institution_id || actor.institution_id || null;
  if (roleSetHasAdmin(roleSet) && !roleSetHasSuperAdmin(roleSet)) {
    institutionId = actor.institution_id;
  }

  const row = {
    institution_id: institutionId,
    item_date: itemDate,
    category,
    title,
    amount_tl: amount,
    note: body.note ? String(body.note).trim() : null,
    created_by: actor.sub || null,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabaseAdmin.from('institution_expense_items').insert(row).select('*').single();
  if (error) {
    if (schemaMissing(error)) return jsonError(res, 503, 'muhasebe_ledger_sql_missing');
    throw error;
  }
  return res.status(201).json({ data });
}

async function handleDeleteExpense(req, res, actor, roleSet) {
  const id = String(req.query?.id || req.body?.id || '').trim();
  if (!id) return jsonError(res, 400, 'id_required');

  const { data: existing, error: fe } = await supabaseAdmin
    .from('institution_expense_items')
    .select('id, institution_id')
    .eq('id', id)
    .maybeSingle();
  if (fe) {
    if (schemaMissing(fe)) return jsonError(res, 503, 'muhasebe_ledger_sql_missing');
    throw fe;
  }
  if (!existing) return jsonError(res, 404, 'not_found');
  if (roleSetHasAdmin(roleSet) && !roleSetHasSuperAdmin(roleSet)) {
    if (existing.institution_id && !hasInstitutionAccess(actor, existing.institution_id)) {
      return jsonError(res, 403, 'forbidden');
    }
  }

  const { error } = await supabaseAdmin.from('institution_expense_items').delete().eq('id', id);
  if (error) throw error;
  return res.status(200).json({ ok: true });
}

async function handleClassReport(req, res, actor, roleSet) {
  const inst = scopeInstitution(actor, roleSet, req.query?.institution_id);
  const classLevel = typeof req.query?.class_level === 'string' ? req.query.class_level.trim() : '';
  if (!classLevel) return jsonError(res, 400, 'class_level_required');

  const allTime = String(req.query?.all || '') === '1' || String(req.query?.all_time || '') === '1';
  const hasExplicitRange =
    (typeof req.query?.from === 'string' && YMD.test(req.query.from.trim().slice(0, 10))) ||
    (typeof req.query?.to === 'string' && YMD.test(req.query.to.trim().slice(0, 10))) ||
    (typeof req.query?.month === 'string' && /^\d{4}-\d{2}$/.test(req.query.month.trim()));
  const range = allTime || !hasExplicitRange ? null : parseRange(req);

  // 1) Sınıftaki öğrenciler
  let stuQ = supabaseAdmin
    .from('students')
    .select('id, name, class_level, coach_id, phone, parent_phone, parent_name, institution_id')
    .eq('class_level', classLevel)
    .limit(3000);
  if (inst) stuQ = stuQ.eq('institution_id', inst);
  const { data: students, error: se } = await stuQ;
  if (se) throw se;

  const studentIds = [...new Set((students || []).map((s) => String(s.id)).filter(Boolean))];

  // 2) Öğrenci ödemelerindeki TÜM kayıtlar (öğrenci ödemeleri paneliyle aynı kaynak)
  //    a) Bu sınıftaki öğrencilerin tüm ödemeleri
  //    b) class_level = seçilen sınıf olan ödemeler (dışarıdan / etiketli)
  const paymentById = new Map();

  const pushPays = (rows) => {
    for (const p of rows || []) {
      if (!p?.id) continue;
      paymentById.set(String(p.id), p);
    }
  };

  const inChunks = async (ids) => {
    const chunkSize = 150;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      let pq = supabaseAdmin
        .from('student_payment_records')
        .select('*')
        .neq('status', 'cancelled')
        .in('student_id', chunk)
        .limit(5000);
      if (inst) pq = pq.or(`institution_id.eq.${inst},institution_id.is.null`);
      const { data: pays, error: pe } = await pq;
      if (pe) {
        if (schemaMissing(pe)) return;
        throw pe;
      }
      pushPays(pays);
    }
  };

  if (studentIds.length) await inChunks(studentIds);

  // class_level ile etiketlenen tüm ödemeler (öğrenci listesinde olmasa bile)
  let byClassQ = supabaseAdmin
    .from('student_payment_records')
    .select('*')
    .neq('status', 'cancelled')
    .eq('class_level', classLevel)
    .limit(5000);
  if (inst) byClassQ = byClassQ.or(`institution_id.eq.${inst},institution_id.is.null`);
  const { data: byClassPays, error: bce } = await byClassQ;
  if (bce) {
    if (!schemaMissing(bce)) throw bce;
  } else {
    pushPays(byClassPays);
  }

  let payments = [...paymentById.values()];

  // Opsiyonel tarih filtresi — due_date null olanları düşürme
  if (range?.from && range?.to) {
    const from = range.from;
    const to = range.to;
    payments = payments.filter((p) => {
      const due = p.due_date ? String(p.due_date).slice(0, 10) : '';
      const paidAt = p.paid_at ? String(p.paid_at).slice(0, 10) : '';
      if (due && YMD.test(due)) return due >= from && due <= to;
      if (paidAt && YMD.test(paidAt)) return paidAt >= from && paidAt <= to;
      // tarihsiz kayıtlar "tüm veri" beklentisiyle dahil
      return true;
    });
  }

  // Ödemelerde görünen ama sınıf listesinde olmayan öğrencileri de çek
  const missingStudentIds = [
    ...new Set(
      payments
        .map((p) => (p.student_id ? String(p.student_id) : ''))
        .filter((id) => id && !studentIds.includes(id))
    )
  ];
  const extraStudents = [];
  if (missingStudentIds.length) {
    const chunkSize = 150;
    for (let i = 0; i < missingStudentIds.length; i += chunkSize) {
      const chunk = missingStudentIds.slice(i, i + chunkSize);
      const { data: more } = await supabaseAdmin
        .from('students')
        .select('id, name, class_level, coach_id, phone, parent_phone, parent_name, institution_id')
        .in('id', chunk);
      for (const s of more || []) extraStudents.push(s);
    }
  }

  const byStudent = new Map();
  for (const s of [...(students || []), ...extraStudents]) {
    byStudent.set(String(s.id), {
      student_id: s.id,
      student_name: s.name,
      class_level: s.class_level || classLevel,
      contact_phone: s.parent_phone || s.phone || null,
      is_external: false,
      payments: [],
      totals: { total: 0, paid: 0, remaining: 0, by_type: {} }
    });
  }

  const externalByName = new Map();

  for (const p of payments) {
    const sid = p.student_id ? String(p.student_id) : null;
    const total = Number(p.amount_total) || 0;
    const paid = Number(p.amount_paid) || 0;
    const rem = Math.max(0, total - paid);
    const type = String(p.payment_type || 'diger');
    const row = {
      id: p.id,
      payment_type: type,
      title: p.title,
      amount_total: total,
      amount_paid: paid,
      remaining: rem,
      status: p.status,
      due_date: p.due_date,
      paid_at: p.paid_at || null,
      payment_account_id: p.payment_account_id,
      notes: p.notes || null
    };

    const addToBucket = (bucket) => {
      bucket.payments.push(row);
      bucket.totals.total += total;
      bucket.totals.paid += paid;
      bucket.totals.remaining += rem;
      bucket.totals.by_type[type] = (bucket.totals.by_type[type] || 0) + total;
    };

    if (sid && byStudent.has(sid)) {
      addToBucket(byStudent.get(sid));
    } else if (sid) {
      // Öğrenci satırı yoksa bile ödeme görünsün
      const bucket = {
        student_id: sid,
        student_name: p.external_student_name || sid,
        class_level: p.class_level || classLevel,
        contact_phone: p.contact_phone || null,
        is_external: false,
        payments: [],
        totals: { total: 0, paid: 0, remaining: 0, by_type: {} }
      };
      byStudent.set(sid, bucket);
      addToBucket(bucket);
    } else {
      const name = String(p.external_student_name || 'Dış kayıt').trim() || 'Dış kayıt';
      const key = name.toLocaleLowerCase('tr-TR');
      if (!externalByName.has(key)) {
        externalByName.set(key, {
          student_id: null,
          student_name: name,
          class_level: classLevel,
          contact_phone: p.contact_phone || null,
          is_external: true,
          payments: [],
          totals: { total: 0, paid: 0, remaining: 0, by_type: {} }
        });
      }
      addToBucket(externalByName.get(key));
    }
  }

  // Ödeme detaylarını tarihe göre sırala
  for (const bucket of byStudent.values()) {
    bucket.payments.sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')));
    bucket.totals.total = Math.round(bucket.totals.total * 100) / 100;
    bucket.totals.paid = Math.round(bucket.totals.paid * 100) / 100;
    bucket.totals.remaining = Math.round(bucket.totals.remaining * 100) / 100;
  }
  for (const bucket of externalByName.values()) {
    bucket.payments.sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')));
    bucket.totals.total = Math.round(bucket.totals.total * 100) / 100;
    bucket.totals.paid = Math.round(bucket.totals.paid * 100) / 100;
    bucket.totals.remaining = Math.round(bucket.totals.remaining * 100) / 100;
  }

  const rows = [...byStudent.values(), ...externalByName.values()].sort((a, b) =>
    String(a.student_name || '').localeCompare(String(b.student_name || ''), 'tr')
  );

  const summary = rows.reduce(
    (acc, r) => {
      acc.total += r.totals.total;
      acc.paid += r.totals.paid;
      acc.remaining += r.totals.remaining;
      return acc;
    },
    { total: 0, paid: 0, remaining: 0 }
  );

  return res.status(200).json({
    class_level: classLevel,
    from: range?.from || null,
    to: range?.to || null,
    all_time: !range,
    payment_count: payments.length,
    students: rows,
    summary: {
      total: Math.round(summary.total * 100) / 100,
      paid: Math.round(summary.paid * 100) / 100,
      remaining: Math.round(summary.remaining * 100) / 100,
      student_count: rows.length
    }
  });
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
      if (op === 'expenses') return handleListExpenses(req, res, actor, roleSet);
      if (op === 'class-report') return handleClassReport(req, res, actor, roleSet);
      return handleGetSummary(req, res, actor, roleSet);
    }

    if (req.method === 'POST') {
      return handleCreateExpense(req, res, actor, roleSet);
    }

    if (req.method === 'DELETE') {
      return handleDeleteExpense(req, res, actor, roleSet);
    }

    return jsonError(res, 405, 'method_not_allowed');
  } catch (e) {
    const msg = errorMessage(e);
    if (/Missing token|Invalid token|Token expired/i.test(msg)) return jsonError(res, 401, msg);
    if (schemaMissing(e)) {
      return res.status(200).json({
        hint: 'muhasebe_ledger_sql_missing',
        error: 'Supabase SQL Editor’da sql/2026-08-06-muhasebe-ledger.sql çalıştırın.'
      });
    }
    console.error('[muhasebe-ledger]', msg);
    return jsonError(res, 500, msg);
  }
}
