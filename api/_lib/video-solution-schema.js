/**
 * Video Soru Çözüm Merkezi — tablo adları ve şema (Aşama 2).
 */
import { supabaseAdmin } from './supabase-admin.js';
import { errorMessage } from './error-msg.js';
import { isMissingTableError } from './supabase-schema.js';

export const VIDEO_SOLUTION_SETS_TABLE = 'video_solution_sets';
export const VIDEO_SOLUTION_QUESTIONS_TABLE = 'video_solution_questions';

/** Public slug: küçük harf, rakam, tire; yayın sonrası değiştirilmez (uygulama kuralı). */
export const VIDEO_SOLUTION_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** student-coaching-system/sql/2026-10-26-video-solution-center.sql ile aynı */
export const VIDEO_SOLUTION_SCHEMA_SQL = `
create table if not exists public.video_solution_sets (
  id uuid primary key default gen_random_uuid(),
  institution_id text,
  slug text not null,
  school_year text not null,
  grade_level smallint not null,
  subject text not null,
  term smallint,
  exam_number smallint,
  work_type text not null default 'genel',
  title text not null,
  description text,
  status text not null default 'draft',
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint video_solution_sets_slug_uniq unique (slug),
  constraint video_solution_sets_grade_chk check (grade_level between 3 and 12),
  constraint video_solution_sets_term_chk check (term is null or term in (1, 2)),
  constraint video_solution_sets_exam_chk check (exam_number is null or exam_number in (1, 2)),
  constraint video_solution_sets_work_type_chk check (
    work_type in ('yazili', 'deneme', 'konu_tarama', 'foy', 'odev', 'genel')
  ),
  constraint video_solution_sets_status_chk check (status in ('draft', 'published', 'archived')),
  constraint video_solution_sets_slug_format_chk check (
    slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) between 3 and 120
  )
);
create index if not exists video_solution_sets_institution_status_idx
  on public.video_solution_sets (institution_id, status);
create index if not exists video_solution_sets_lookup_idx
  on public.video_solution_sets (grade_level, subject, term, exam_number);
create table if not exists public.video_solution_questions (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.video_solution_sets (id) on delete cascade,
  question_number integer not null,
  title text,
  topic text,
  video_provider text not null default 'youtube',
  video_ref text,
  youtube_video_id text,
  youtube_url text,
  teacher_user_id text,
  image_storage_path text,
  status text not null default 'draft',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint video_solution_questions_set_num_uniq unique (set_id, question_number),
  constraint video_solution_questions_number_chk check (question_number >= 1),
  constraint video_solution_questions_status_chk check (status in ('draft', 'published')),
  constraint video_solution_questions_provider_chk check (
    video_provider in ('youtube', 'vimeo', 'google_drive', 'external')
  ),
  constraint video_solution_questions_ref_chk check (
    char_length(trim(coalesce(video_ref, youtube_video_id, ''))) >= 3
    or char_length(trim(coalesce(youtube_url, ''))) >= 8
  )
);
create index if not exists video_solution_questions_set_sort_idx
  on public.video_solution_questions (set_id, sort_order, question_number);
create index if not exists video_solution_questions_teacher_idx
  on public.video_solution_questions (teacher_user_id)
  where teacher_user_id is not null;
alter table public.video_solution_sets enable row level security;
alter table public.video_solution_questions enable row level security;
`.trim();

let schemaReady = false;
let schemaFlight = null;

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
  return `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`;
}

async function probeTable() {
  const { error } = await supabaseAdmin.from(VIDEO_SOLUTION_SETS_TABLE).select('id').limit(1);
  if (!error) return true;
  if (isMissingTableError(error, VIDEO_SOLUTION_SETS_TABLE)) return false;
  throw error;
}

async function runSchemaSql() {
  const dbUrl = buildDatabaseUrl();
  if (!dbUrl) return false;
  const postgres = (await import('postgres')).default;
  const sql = postgres(dbUrl, { ssl: 'require', max: 1 });
  try {
    await sql.unsafe(VIDEO_SOLUTION_SCHEMA_SQL);
    return true;
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}

export async function ensureVideoSolutionSchema() {
  if (schemaReady) return { ok: true };
  if (schemaFlight) return schemaFlight;
  schemaFlight = (async () => {
    try {
      if (await probeTable()) {
        schemaReady = true;
        return { ok: true };
      }
      const ran = await runSchemaSql();
      if (!ran) {
        return {
          ok: false,
          hint:
            'Video çözüm tabloları yok. student-coaching-system/sql/2026-10-26-video-solution-center.sql dosyasını Supabase SQL Editor’da çalıştırın.',
          sql: VIDEO_SOLUTION_SCHEMA_SQL
        };
      }
      for (let i = 0; i < 6; i += 1) {
        await new Promise((r) => setTimeout(r, 250 * (i + 1)));
        if (await probeTable().catch(() => false)) {
          schemaReady = true;
          return { ok: true, created: true };
        }
      }
      return { ok: false, hint: 'Tablo oluşturuldu ama henüz okunamadı. Birkaç saniye sonra yenileyin.' };
    } catch (e) {
      return { ok: false, hint: errorMessage(e) };
    } finally {
      schemaFlight = null;
    }
  })();
  return schemaFlight;
}
