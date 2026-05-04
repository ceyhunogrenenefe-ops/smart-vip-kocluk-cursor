// Supabase Vercel env eksikse kullanıcıya net uyarı
import { isSupabaseReady } from '../lib/supabase';

export default function SupabaseConfigBanner() {
  if (isSupabaseReady) return null;

  return (
    <div className="w-full border-b-2 border-amber-500 bg-amber-50 px-4 py-3 text-center text-sm text-amber-950">
      <p className="font-semibold">Supabase bağlantı bilgileri tanımlı değil</p>
      <p className="mt-1 text-amber-900/90">
        Vercel → Environment Variables:{' '}
        <code className="rounded bg-amber-100 px-1">VITE_SUPABASE_URL</code> +{' '}
        <code className="rounded bg-amber-100 px-1">VITE_SUPABASE_ANON_KEY</code> veya aynı değerlerle{' '}
        <code className="rounded bg-amber-100 px-1">SUPABASE_URL</code> +{' '}
        <code className="rounded bg-amber-100 px-1">SUPABASE_ANON_KEY</code> (build otomatik eşler). Supabase
        → API: Project URL ve anon public key. Production işaretli olsun; ardından Redeploy.
      </p>
    </div>
  );
}
