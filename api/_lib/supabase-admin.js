import { createClient } from '@supabase/supabase-js';

const resolveSupabaseUrl = () =>
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  '';

const resolveSupabaseKey = () =>
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  '';

let cachedClient = null;

export const getSupabaseAdmin = () => {
  if (cachedClient) return cachedClient;

  const url = resolveSupabaseUrl().trim();
  const key = resolveSupabaseKey().trim();

  if (!url) {
    throw new Error('Missing Supabase URL env (SUPABASE_URL / VITE_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL)');
  }
  if (!key) {
    throw new Error(
      'Missing Supabase key env (SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY / VITE_SUPABASE_ANON_KEY)'
    );
  }

  const hasServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
  if (!hasServiceRole) {
    console.warn(
      '[supabase-admin] SUPABASE_SERVICE_ROLE_KEY tanımlı değil; anon anahtar kullanılıyor. Vercel /api uçlarında RLS yüzünden 500/permission hataları oluşabilir. Sunucu için service_role anahtarını ekleyin.'
    );
  }

  cachedClient = createClient(url, key, {
    auth: { persistSession: false }
  });
  return cachedClient;
};

export const supabaseAdmin = new Proxy(
  {},
  {
    get(_target, prop) {
      const client = getSupabaseAdmin();
      const value = client[prop];
      return typeof value === 'function' ? value.bind(client) : value;
    }
  }
);

/** `auth.admin.createUser` yalnızca service role ile çalışır (anon ile Auth kullanıcısı oluşmaz). */
export const hasSupabaseServiceRoleKey = () =>
  Boolean(String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim());

