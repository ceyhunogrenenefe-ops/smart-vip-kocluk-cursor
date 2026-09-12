/**
 * Edesis yerel deneme atama — katalog senkron + sınıf/öğrenci junction.
 * Öğrenci Sınava Gir listesi bu atamalara göre backend’de filtrelenir.
 * Şema yoksa SUPABASE_DB_URL / DATABASE_URL / SUPABASE_DB_PASSWORD ile otomatik kurulur.
 */
import { supabaseAdmin } from './supabase-admin.js';
import { fetchEdesisExamsCatalog, pickEdesisCatalogExamId } from './edesis-client.js';
import { errorMessage } from './error-msg.js';

const EDESIS_ASSIGN_SCHEMA_SQL = `
create table if not exists public.edesis_exams (
  id uuid primary key default gen_random_uuid(),
  institution_id text references public.institutions (id) on delete cascade,
  edesis_exam_id text not null,
  title text not null default '',
  exam_date date,
  exam_type text,
  grade_name text,
  is_online boolean not null default true,
  status text,
  duration_seconds integer,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.edesis_exams add column if not exists institution_id text;
alter table public.edesis_exams add column if not exists edesis_exam_id text;
alter table public.edesis_exams add column if not exists title text not null default '';
alter table public.edesis_exams add column if not exists exam_date date;
alter table public.edesis_exams add column if not exists exam_type text;
alter table public.edesis_exams add column if not exists grade_name text;
alter table public.edesis_exams add column if not exists is_online boolean not null default true;
alter table public.edesis_exams add column if not exists status text;
alter table public.edesis_exams add column if not exists duration_seconds integer;
alter table public.edesis_exams add column if not exists raw jsonb not null default '{}'::jsonb;
alter table public.edesis_exams add column if not exists synced_at timestamptz not null default now();
alter table public.edesis_exams add column if not exists created_at timestamptz not null default now();
alter table public.edesis_exams add column if not exists updated_at timestamptz not null default now();
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'edesis_exams_institution_id_edesis_exam_id_key'
      and conrelid = 'public.edesis_exams'::regclass
  ) then
    begin
      alter table public.edesis_exams
        add constraint edesis_exams_institution_id_edesis_exam_id_key
        unique (institution_id, edesis_exam_id);
    exception when others then null;
    end;
  end if;
end $$;
create index if not exists edesis_exams_institution_idx
  on public.edesis_exams (institution_id, exam_date desc nulls last);
create index if not exists edesis_exams_edesis_id_idx
  on public.edesis_exams (edesis_exam_id);

create table if not exists public.edesis_exam_assignments (
  id uuid primary key default gen_random_uuid(),
  institution_id text references public.institutions (id) on delete cascade,
  edesis_exam_id text not null,
  target_type text not null check (target_type in ('class', 'student')),
  class_id text references public.classes (id) on delete cascade,
  student_id text references public.students (id) on delete cascade,
  assigned_by text references public.users (id) on delete set null,
  starts_at timestamptz,
  ends_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);
alter table public.edesis_exam_assignments add column if not exists institution_id text;
alter table public.edesis_exam_assignments add column if not exists edesis_exam_id text;
alter table public.edesis_exam_assignments add column if not exists target_type text;
alter table public.edesis_exam_assignments add column if not exists class_id text;
alter table public.edesis_exam_assignments add column if not exists student_id text;
alter table public.edesis_exam_assignments add column if not exists assigned_by text;
alter table public.edesis_exam_assignments add column if not exists starts_at timestamptz;
alter table public.edesis_exam_assignments add column if not exists ends_at timestamptz;
alter table public.edesis_exam_assignments add column if not exists notes text;
alter table public.edesis_exam_assignments add column if not exists created_at timestamptz not null default now();
do $$ begin
  update public.edesis_exam_assignments
  set target_type = case
    when class_id is not null and student_id is null then 'class'
    when student_id is not null and class_id is null then 'student'
    else target_type
  end
  where target_type is null;
  delete from public.edesis_exam_assignments
  where target_type is null or target_type not in ('class', 'student');
  begin
    alter table public.edesis_exam_assignments alter column target_type set not null;
  exception when others then null;
  end;
  begin
    alter table public.edesis_exam_assignments
      drop constraint if exists edesis_exam_assignments_target_type_check;
    alter table public.edesis_exam_assignments
      add constraint edesis_exam_assignments_target_type_check
      check (target_type in ('class', 'student'));
  exception when others then null;
  end;
  begin
    alter table public.edesis_exam_assignments
      drop constraint if exists edesis_exam_assignments_target_chk;
    alter table public.edesis_exam_assignments
      add constraint edesis_exam_assignments_target_chk check (
        (target_type = 'class' and class_id is not null and student_id is null)
        or (target_type = 'student' and student_id is not null and class_id is null)
      );
  exception when others then null;
  end;
end $$;
create unique index if not exists edesis_exam_assignments_class_unq
  on public.edesis_exam_assignments (institution_id, edesis_exam_id, class_id)
  where target_type = 'class' and class_id is not null;
create unique index if not exists edesis_exam_assignments_student_unq
  on public.edesis_exam_assignments (institution_id, edesis_exam_id, student_id)
  where target_type = 'student' and student_id is not null;
create index if not exists edesis_exam_assignments_exam_idx
  on public.edesis_exam_assignments (institution_id, edesis_exam_id);
create index if not exists edesis_exam_assignments_student_idx
  on public.edesis_exam_assignments (student_id)
  where student_id is not null;
create index if not exists edesis_exam_assignments_class_idx
  on public.edesis_exam_assignments (class_id)
  where class_id is not null;
notify pgrst, 'reload schema';
`.trim();

/** Tek seferlik kurulum — her sınav için tablo yok; junction tablosu tüm denemeleri tutar. */
const AUTO_SCHEMA_HINT =
  'Tablolar otomatik kurulamadı. Vercel ortamına bir kez SUPABASE_DB_URL / DATABASE_URL / POSTGRES_URL (veya SUPABASE_DB_PASSWORD) ekleyip Redeploy edin; senkron/atama veya /api/setup-edesis-exam-assignments-table ilk kullanımda şemayı kurar.';

let schemaReadyCache = null; // Promise | true
let schemaEnsureInFlight = null;

function supabaseProjectRef() {
  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const m = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  return m?.[1] || '';
}

function buildDatabaseUrl() {
  const direct =
    process.env.SUPABASE_DB_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.POSTGRES_PRISMA_URL?.trim() ||
    process.env.POSTGRES_URL_NON_POOLING?.trim() ||
    process.env.SUPABASE_DATABASE_URL?.trim();
  if (direct) return direct;
  const password =
    process.env.SUPABASE_DB_PASSWORD?.trim() ||
    process.env.POSTGRES_PASSWORD?.trim() ||
    process.env.SUPABASE_DATABASE_PASSWORD?.trim();
  const ref = supabaseProjectRef();
  if (!password || !ref) return '';
  // Direct (session) connection — DDL için pooler (6543) yerine 5432
  return `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`;
}

function isSchemaMissingError(error) {
  const msg = errorMessage(error);
  return /edesis_exams|edesis_exam_assignments|schema cache|PGRST|does not exist|relation/i.test(msg);
}

async function probeEdesisAssignSchema() {
  const exams = await supabaseAdmin.from('edesis_exams').select('id').limit(1);
  if (exams.error && isSchemaMissingError(exams.error)) return false;
  if (exams.error) throw exams.error;
  const assigns = await supabaseAdmin.from('edesis_exam_assignments').select('id, target_type').limit(1);
  if (assigns.error && isSchemaMissingError(assigns.error)) return false;
  if (assigns.error) throw assigns.error;
  return true;
}

async function runEdesisAssignSchemaSql() {
  const dbUrl = buildDatabaseUrl();
  if (!dbUrl) {
    return {
      ok: false,
      code: 'missing_db_url',
      message: AUTO_SCHEMA_HINT
    };
  }
  const postgres = (await import('postgres')).default;
  const sql = postgres(dbUrl, { ssl: 'require', max: 1 });
  try {
    await sql.unsafe(EDESIS_ASSIGN_SCHEMA_SQL);
    return { ok: true, via: 'postgres' };
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}

/**
 * Tablolar yoksa bir kez otomatik oluşturur.
 * Her sınav için değil; process içinde cache’lenir.
 */
export async function ensureEdesisExamAssignmentSchema({ force = false } = {}) {
  if (!force && schemaReadyCache === true) {
    return { ok: true, created: false, cached: true };
  }
  if (!force && schemaEnsureInFlight) return schemaEnsureInFlight;

  schemaEnsureInFlight = (async () => {
    try {
      if (!force) {
        const ready = await probeEdesisAssignSchema();
        if (ready) {
          schemaReadyCache = true;
          return { ok: true, created: false };
        }
      }

      const ran = await runEdesisAssignSchemaSql();
      if (!ran.ok) {
        throw Object.assign(new Error(ran.message || 'schema_auto_setup_failed'), {
          code: 'SCHEMA_MISSING',
          hint: ran.message,
          setupCode: ran.code
        });
      }

      // PostgREST şema cache yenilenene kadar kısa retry
      let ready = false;
      for (let i = 0; i < 6; i += 1) {
        await new Promise((r) => setTimeout(r, 250 * (i + 1)));
        ready = await probeEdesisAssignSchema().catch(() => false);
        if (ready) break;
      }
      if (!ready) {
        throw Object.assign(new Error('schema_created_but_not_visible'), {
          code: 'SCHEMA_MISSING',
          hint: 'Tablolar oluşturuldu; birkaç saniye sonra tekrar deneyin (PostgREST cache).'
        });
      }
      schemaReadyCache = true;
      return { ok: true, created: true, via: ran.via };
    } finally {
      schemaEnsureInFlight = null;
    }
  })();

  return schemaEnsureInFlight;
}

function pickExamTitle(row) {
  return String(
    row?.name ||
      row?.Name ||
      row?.examName ||
      row?.ExamName ||
      row?.sinavAdi ||
      row?.SinavAdi ||
      row?.title ||
      row?.Title ||
      ''
  ).trim();
}

function pickExamDate(row) {
  const raw =
    row?.examDate ||
    row?.ExamDate ||
    row?.date ||
    row?.Date ||
    row?.sinavTarihi ||
    row?.SinavTarihi ||
    null;
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    const s = String(raw).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  }
  return d.toISOString().slice(0, 10);
}

function pickExamType(row) {
  return String(
    row?.examType ||
      row?.ExamType ||
      row?.sinavTuru ||
      row?.SinavTuru ||
      row?.type ||
      row?.Type ||
      ''
  ).trim() || null;
}

function mapCatalogRowToExamUpsert(row, institutionId) {
  const edesisExamId = pickEdesisCatalogExamId(row);
  if (!edesisExamId) return null;
  const now = new Date().toISOString();
  return {
    institution_id: institutionId || null,
    edesis_exam_id: String(edesisExamId),
    title: pickExamTitle(row) || `Deneme ${edesisExamId}`,
    exam_date: pickExamDate(row),
    exam_type: pickExamType(row),
    grade_name: String(row?.gradeName || row?.GradeName || row?.sinifAdi || '').trim() || null,
    is_online: row?.isOnline !== false && row?.IsOnline !== false,
    status: String(row?.status || row?.Status || row?.state || '').trim() || null,
    duration_seconds: Number(row?.durationSeconds || row?.sinavSuresi || row?.sure || 0) || null,
    raw: row,
    synced_at: now,
    updated_at: now
  };
}

/** Edesis GET /exams → edesis_exams upsert */
export async function syncEdesisExamCatalogToDb({ institutionId, cfg } = {}) {
  await ensureEdesisExamAssignmentSchema();
  const inst = String(institutionId || '').trim() || null;
  const catalog = await fetchEdesisExamsCatalog(cfg || {}, {});
  const rows = Array.isArray(catalog.rows) ? catalog.rows : [];
  const upserts = rows
    .map((r) => mapCatalogRowToExamUpsert(r, inst))
    .filter(Boolean);

  let upserted = 0;
  const chunk = 80;
  for (let i = 0; i < upserts.length; i += chunk) {
    const slice = upserts.slice(i, i + chunk);
    let { error } = await supabaseAdmin.from('edesis_exams').upsert(slice, {
      onConflict: 'institution_id,edesis_exam_id',
      ignoreDuplicates: false
    });
    if (error && isSchemaMissingError(error)) {
      await ensureEdesisExamAssignmentSchema({ force: true });
      ({ error } = await supabaseAdmin.from('edesis_exams').upsert(slice, {
        onConflict: 'institution_id,edesis_exam_id',
        ignoreDuplicates: false
      }));
    }
    if (error) {
      if (isSchemaMissingError(error)) {
        throw Object.assign(new Error('edesis_exams_table_missing'), {
          code: 'SCHEMA_MISSING',
          hint: AUTO_SCHEMA_HINT
        });
      }
      throw error;
    }
    upserted += slice.length;
  }

  return {
    ok: true,
    fetched: rows.length,
    upserted,
    cached: Boolean(catalog.cached),
    totalCount: catalog.totalCount ?? rows.length
  };
}

export async function listSyncedEdesisExams({ institutionId, limit = 200 } = {}) {
  let schemaHint = null;
  try {
    await ensureEdesisExamAssignmentSchema();
  } catch (e) {
    schemaHint = e?.hint || e?.message || AUTO_SCHEMA_HINT;
  }
  let q = supabaseAdmin
    .from('edesis_exams')
    .select(
      'id, institution_id, edesis_exam_id, title, exam_date, exam_type, grade_name, is_online, status, duration_seconds, synced_at'
    )
    .order('exam_date', { ascending: false, nullsFirst: false })
    .order('synced_at', { ascending: false })
    .limit(Math.min(500, Math.max(1, Number(limit) || 200)));
  if (institutionId) q = q.eq('institution_id', institutionId);
  let { data, error } = await q;
  if (error && isSchemaMissingError(error)) {
    try {
      await ensureEdesisExamAssignmentSchema({ force: true });
      ({ data, error } = await q);
    } catch (e) {
      schemaHint = e?.hint || e?.message || schemaHint || AUTO_SCHEMA_HINT;
    }
  }
  if (error) {
    if (isSchemaMissingError(error)) {
      return { items: [], schemaMissing: true, schemaHint: schemaHint || AUTO_SCHEMA_HINT };
    }
    throw error;
  }
  return { items: data || [], schemaMissing: false, schemaHint: null };
}

export async function listEdesisExamAssignments({
  institutionId,
  edesisExamId,
  limit = 300
} = {}) {
  let schemaHint = null;
  try {
    await ensureEdesisExamAssignmentSchema();
  } catch (e) {
    schemaHint = e?.hint || e?.message || AUTO_SCHEMA_HINT;
  }
  let q = supabaseAdmin
    .from('edesis_exam_assignments')
    .select(
      'id, institution_id, edesis_exam_id, target_type, class_id, student_id, assigned_by, starts_at, ends_at, notes, created_at'
    )
    .order('created_at', { ascending: false })
    .limit(Math.min(1000, Math.max(1, Number(limit) || 300)));
  if (institutionId) q = q.eq('institution_id', institutionId);
  if (edesisExamId) q = q.eq('edesis_exam_id', String(edesisExamId));
  let { data, error } = await q;
  if (error && isSchemaMissingError(error)) {
    try {
      await ensureEdesisExamAssignmentSchema({ force: true });
      ({ data, error } = await q);
    } catch (e) {
      schemaHint = e?.hint || e?.message || schemaHint || AUTO_SCHEMA_HINT;
    }
  }
  if (error) {
    if (isSchemaMissingError(error)) {
      return { items: [], schemaMissing: true, schemaHint: schemaHint || AUTO_SCHEMA_HINT };
    }
    throw error;
  }
  const items = await enrichEdesisExamAssignmentRows(data || []);
  return { items, schemaMissing: false, schemaHint: null };
}

async function enrichEdesisExamAssignmentRows(rows) {
  if (!rows.length) return [];
  const classIds = [...new Set(rows.map((r) => r.class_id).filter(Boolean))];
  const studentIds = [...new Set(rows.map((r) => r.student_id).filter(Boolean))];
  const classNameById = new Map();
  const studentNameById = new Map();
  if (classIds.length) {
    const { data } = await supabaseAdmin.from('classes').select('id, name').in('id', classIds);
    for (const c of data || []) classNameById.set(c.id, c.name);
  }
  if (studentIds.length) {
    const { data } = await supabaseAdmin.from('students').select('id, name').in('id', studentIds);
    for (const s of data || []) studentNameById.set(s.id, s.name);
  }
  return rows.map((r) => ({
    ...r,
    class_name: r.class_id ? classNameById.get(r.class_id) || null : null,
    student_name: r.student_id ? studentNameById.get(r.student_id) || null : null
  }));
}

/**
 * Atama oluştur.
 * targetType=class → classIds[]
 * targetType=student → studentIds[] (students.id)
 */
export async function createEdesisExamAssignments({
  institutionId,
  edesisExamId,
  targetType,
  classIds = [],
  studentIds = [],
  assignedBy = null,
  startsAt = null,
  endsAt = null,
  notes = null
} = {}) {
  await ensureEdesisExamAssignmentSchema();
  const examId = String(edesisExamId || '').trim();
  const type = String(targetType || '').trim();
  if (!examId) throw new Error('edesis_exam_id_required');
  if (type !== 'class' && type !== 'student') throw new Error('target_type_invalid');

  const inst = String(institutionId || '').trim() || null;
  const rows = [];

  if (type === 'class') {
    const ids = [...new Set((classIds || []).map((x) => String(x || '').trim()).filter(Boolean))];
    if (!ids.length) throw new Error('class_ids_required');
    for (const classId of ids) {
      rows.push({
        institution_id: inst,
        edesis_exam_id: examId,
        target_type: 'class',
        class_id: classId,
        student_id: null,
        assigned_by: assignedBy || null,
        starts_at: startsAt || null,
        ends_at: endsAt || null,
        notes: notes || null
      });
    }
  } else {
    const ids = [...new Set((studentIds || []).map((x) => String(x || '').trim()).filter(Boolean))];
    if (!ids.length) throw new Error('student_ids_required');
    for (const studentId of ids) {
      rows.push({
        institution_id: inst,
        edesis_exam_id: examId,
        target_type: 'student',
        class_id: null,
        student_id: studentId,
        assigned_by: assignedBy || null,
        starts_at: startsAt || null,
        ends_at: endsAt || null,
        notes: notes || null
      });
    }
  }

  const runUpsert = () =>
    supabaseAdmin
      .from('edesis_exam_assignments')
      .upsert(rows, {
        onConflict:
          type === 'class'
            ? 'institution_id,edesis_exam_id,class_id'
            : 'institution_id,edesis_exam_id,student_id',
        ignoreDuplicates: false
      })
      .select('id, edesis_exam_id, target_type, class_id, student_id');

  let { data, error } = await runUpsert();
  if (error && isSchemaMissingError(error)) {
    await ensureEdesisExamAssignmentSchema({ force: true });
    ({ data, error } = await runUpsert());
  }

  if (error) {
    // Unique partial indexes may not map to onConflict — insert + ignore duplicates
    if (/no unique|ON CONFLICT|42P10/i.test(errorMessage(error))) {
      const inserted = [];
      for (const row of rows) {
        const { data: one, error: e2 } = await supabaseAdmin
          .from('edesis_exam_assignments')
          .insert(row)
          .select('id, edesis_exam_id, target_type, class_id, student_id')
          .maybeSingle();
        if (e2) {
          if (/duplicate|unique/i.test(errorMessage(e2))) continue;
          if (isSchemaMissingError(e2)) {
            throw Object.assign(new Error('edesis_exam_assignments_table_missing'), {
              code: 'SCHEMA_MISSING',
              hint: AUTO_SCHEMA_HINT
            });
          }
          throw e2;
        }
        if (one) inserted.push(one);
      }
      return { ok: true, assigned: inserted.length, items: inserted };
    }
    if (isSchemaMissingError(error)) {
      throw Object.assign(new Error('edesis_exam_assignments_table_missing'), {
        code: 'SCHEMA_MISSING',
        hint: AUTO_SCHEMA_HINT
      });
    }
    throw error;
  }

  return { ok: true, assigned: (data || []).length, items: data || [] };
}

export async function deleteEdesisExamAssignment(assignmentId) {
  const id = String(assignmentId || '').trim();
  if (!id) throw new Error('assignment_id_required');
  const { error } = await supabaseAdmin.from('edesis_exam_assignments').delete().eq('id', id);
  if (error) throw error;
  return { ok: true };
}

/**
 * Öğrencinin (students.id) erişebileceği Edesis sınav ID seti.
 * Doğrudan öğrenci ataması VEYA class_students üzerinden sınıf ataması.
 */
export async function resolveLocallyAssignedEdesisExamIdsForStudent({
  studentId,
  institutionId = null
} = {}) {
  const sid = String(studentId || '').trim();
  if (!sid) {
    return { examIds: new Set(), classIds: [], schemaMissing: false, assignmentCount: 0 };
  }

  let classIds = [];
  const { data: memberships, error: memErr } = await supabaseAdmin
    .from('class_students')
    .select('class_id')
    .eq('student_id', sid)
    .limit(200);
  if (!memErr && memberships?.length) {
    classIds = memberships.map((m) => String(m.class_id)).filter(Boolean);
  }

  let q = supabaseAdmin
    .from('edesis_exam_assignments')
    .select('id, edesis_exam_id, target_type, class_id, student_id, starts_at, ends_at')
    .limit(2000);
  if (institutionId) q = q.eq('institution_id', institutionId);

  // (student_id = sid) OR (class_id in (...))
  if (classIds.length) {
    q = q.or(`student_id.eq.${sid},class_id.in.(${classIds.join(',')})`);
  } else {
    q = q.eq('student_id', sid);
  }

  const { data, error } = await q;
  if (error) {
    if (/edesis_exam_assignments|schema cache|PGRST/i.test(errorMessage(error))) {
      return { examIds: new Set(), classIds, schemaMissing: true, assignmentCount: 0 };
    }
    throw error;
  }

  const now = Date.now();
  const examIds = new Set();
  for (const row of data || []) {
    if (row.starts_at && new Date(row.starts_at).getTime() > now) continue;
    if (row.ends_at && new Date(row.ends_at).getTime() < now) continue;
    const eid = String(row.edesis_exam_id || '').trim();
    if (eid) examIds.add(eid);
  }

  return {
    examIds,
    classIds,
    schemaMissing: false,
    assignmentCount: (data || []).length
  };
}

/** available-exams items → yalnızca yerel atananlar */
export function filterExamItemsByLocalAssignment(items, allowedExamIds) {
  if (!(allowedExamIds instanceof Set)) return [];
  return (items || []).filter((it) => {
    const id = String(it?.examId || it?.id || '').trim();
    return id && allowedExamIds.has(id);
  });
}

/**
 * Sınava giriş / booklet / structure için yetki.
 * schemaMissing → gate kapalı (eski davranış); aksi halde atama zorunlu.
 */
export async function assertStudentMayAccessEdesisExam({
  studentId,
  edesisExamId,
  institutionId = null
} = {}) {
  const examId = String(edesisExamId || '').trim();
  if (!examId) return { ok: false, reason: 'exam_id_required' };
  const resolved = await resolveLocallyAssignedEdesisExamIdsForStudent({
    studentId,
    institutionId
  });
  if (resolved.schemaMissing) {
    return { ok: true, gated: false, reason: 'schema_missing_passthrough' };
  }
  if (!resolved.examIds.has(examId)) {
    return { ok: false, gated: true, reason: 'not_assigned' };
  }
  return { ok: true, gated: true, reason: 'assigned' };
}
