import { errorMessage } from './error-msg.js';

export async function withSupabaseTimeout(run, ms = 12_000, label = 'supabase') {
  let timer;
  try {
    return await Promise.race([
      run(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}_timeout`)), ms);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function supabaseTimeoutMessage(e) {
  const msg = errorMessage(e);
  if (msg.includes('timeout')) {
    return 'Supabase yanıt vermedi (zaman aşımı). Dashboard’da projenin duraklatılmadığını kontrol edin.';
  }
  return msg;
}
