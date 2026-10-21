import { supabaseAdmin } from './supabase-admin.js';
import { errorMessage } from './error-msg.js';
import { isMissingTableError } from './supabase-schema.js';
import { MAX_PDF_BYTES } from './yazili-hazirlik-slots.js';

export const YAZILI_HAZIRLIK_TABLE = 'yazili_hazirlik_pdf';
export const YAZILI_HAZIRLIK_BUCKET = 'yazili-hazirlik';

const SCHEMA_SQL = `
create table if not exists public.yazili_hazirlik_pdf (
  id uuid primary key default gen_random_uuid(),
  institution_id text,
  class_id text not null,
  teacher_user_id text not null,
  subject text not null,
  donem smallint not null,
  yazili smallint not null,
  calisma smallint not null,
  file_name text not null,
  storage_path text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint yazili_hazirlik_pdf_raf_chk check (
    donem in (1, 2) and yazili in (1, 2) and calisma in (1, 2, 3)
  ),
  constraint yazili_hazirlik_pdf_raf_uniq unique (class_id, teacher_user_id, subject, donem, yazili, calisma)
);
create index if not exists yazili_hazirlik_pdf_class_idx
  on public.yazili_hazirlik_pdf (class_id, donem, yazili, calisma);
`.trim();

let schemaReady = false;
let schemaFlight = null;
let bucketReady = false;

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
  const { error } = await supabaseAdmin.from(YAZILI_HAZIRLIK_TABLE).select('id').limit(1);
  if (!error) return true;
  if (isMissingTableError(error, YAZILI_HAZIRLIK_TABLE)) return false;
  throw error;
}

async function runSchemaSql() {
  const dbUrl = buildDatabaseUrl();
  if (!dbUrl) return false;
  const postgres = (await import('postgres')).default;
  const sql = postgres(dbUrl, { ssl: 'require', max: 1 });
  try {
    await sql.unsafe(SCHEMA_SQL);
    return true;
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}

export async function ensureYaziliHazirlikSchema() {
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
          hint: 'Yazılıya hazırlık tablosu yok. student-coaching-system/sql/2026-10-21-yazili-hazirlik.sql dosyasını Supabase SQL Editor’da çalıştırın.',
          sql: SCHEMA_SQL
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

const BUCKET_AYARLARI = [
  { public: false, fileSizeLimit: MAX_PDF_BYTES, allowedMimeTypes: ['application/pdf'] },
  { public: false, fileSizeLimit: 50 * 1024 * 1024, allowedMimeTypes: ['application/pdf'] },
  { public: false, allowedMimeTypes: ['application/pdf'] },
  { public: false }
];

function kovaZatenVar(error) {
  return /already|exists/i.test(String(error?.message || ''));
}

async function kovayiAyarla(ayar) {
  const updated = await supabaseAdmin.storage.updateBucket(YAZILI_HAZIRLIK_BUCKET, ayar);
  if (!updated.error) return 'ok';
  const mesaj = String(updated.error.message || '');
  if (!/not found|does not exist/i.test(mesaj)) return 'reject';
  const created = await supabaseAdmin.storage.createBucket(YAZILI_HAZIRLIK_BUCKET, ayar);
  if (!created.error || kovaZatenVar(created.error)) return 'ok';
  return 'reject';
}

export async function ensureYaziliHazirlikBucket() {
  if (bucketReady) return;
  for (const ayar of BUCKET_AYARLARI) {
    try {
      if ((await kovayiAyarla(ayar)) === 'ok') {
        bucketReady = true;
        return;
      }
    } catch {
      /* proje sınırı bu boyutu reddederse bir alt ayarı dene */
    }
  }
  bucketReady = true;
}

export async function yaziliHazirlikYuklemeLinki(path) {
  await ensureYaziliHazirlikBucket();
  let result = await supabaseAdmin.storage.from(YAZILI_HAZIRLIK_BUCKET).createSignedUploadUrl(path, { upsert: true });
  if (result.error) {
    result = await supabaseAdmin.storage.from(YAZILI_HAZIRLIK_BUCKET).createSignedUploadUrl(path);
  }
  if (result.error) throw result.error;
  return {
    path: result.data?.path || path,
    token: result.data?.token || null,
    signedUrl: result.data?.signedUrl || null
  };
}

export async function yaziliHazirlikIndirmeLinki(path) {
  const { data, error } = await supabaseAdmin.storage
    .from(YAZILI_HAZIRLIK_BUCKET)
    .createSignedUrl(path, 60 * 10);
  if (error) throw error;
  return data?.signedUrl || null;
}

export async function yaziliHazirlikDosyaSil(path) {
  if (!path) return;
  await supabaseAdmin.storage.from(YAZILI_HAZIRLIK_BUCKET).remove([path]);
}
