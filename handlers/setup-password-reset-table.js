import { authorizeVercelOrCronSecret } from '../api/_lib/cron-auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';

const SETUP_SQL = `
create table if not exists public.password_reset_tokens (
  id text primary key default gen_random_uuid()::text,
  user_id text not null references public.users (id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists password_reset_tokens_user_id_idx
  on public.password_reset_tokens (user_id, created_at desc);

create index if not exists password_reset_tokens_hash_idx
  on public.password_reset_tokens (token_hash)
  where used_at is null;

comment on table public.password_reset_tokens is 'Tek kullanımlık şifre sıfırlama bağlantıları (SHA-256 hash saklanır)';
`.trim();

function supabaseProjectRef() {
  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const m = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  return m?.[1] || '';
}

function buildDatabaseUrl() {
  const direct = process.env.SUPABASE_DB_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (direct) return direct;
  const password = process.env.SUPABASE_DB_PASSWORD?.trim();
  const ref = supabaseProjectRef();
  if (!password || !ref) return '';
  return `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`;
}

async function tableExists() {
  const { error } = await supabaseAdmin.from('password_reset_tokens').select('id').limit(1);
  if (!error) return true;
  const msg = errorMessage(error);
  if (/does not exist|relation.*password_reset_tokens/i.test(msg)) return false;
  throw error;
}

async function runSetupSql() {
  const dbUrl = buildDatabaseUrl();
  if (!dbUrl) {
    return {
      ok: false,
      code: 'missing_db_password',
      message:
        'SUPABASE_DB_PASSWORD veya SUPABASE_DB_URL Vercel ortamında tanımlı değil. Supabase SQL Editor ile manuel çalıştırın.'
    };
  }
  const postgres = (await import('postgres')).default;
  const sql = postgres(dbUrl, { ssl: 'require', max: 1 });
  try {
    await sql.unsafe(SETUP_SQL);
    return { ok: true, via: 'postgres' };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  const auth = authorizeVercelOrCronSecret(req);
  if (!auth.ok) return res.status(401).json({ error: 'Unauthorized' });

  try {
    if (await tableExists()) {
      return res.status(200).json({
        ok: true,
        created: false,
        message: 'password_reset_tokens tablosu zaten mevcut.'
      });
    }

    const ran = await runSetupSql();
    if (!ran.ok) {
      return res.status(503).json({
        ok: false,
        error: ran.code,
        message: ran.message,
        sql: SETUP_SQL,
        supabase_sql_editor: supabaseProjectRef()
          ? `https://supabase.com/dashboard/project/${supabaseProjectRef()}/sql/new`
          : null
      });
    }

    const existsNow = await tableExists();
    return res.status(existsNow ? 200 : 500).json({
      ok: existsNow,
      created: existsNow,
      via: ran.via,
      message: existsNow
        ? 'password_reset_tokens tablosu oluşturuldu.'
        : 'SQL çalıştı ama tablo doğrulanamadı.'
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: errorMessage(e),
      sql: SETUP_SQL,
      supabase_sql_editor: supabaseProjectRef()
        ? `https://supabase.com/dashboard/project/${supabaseProjectRef()}/sql/new`
        : null
    });
  }
}
