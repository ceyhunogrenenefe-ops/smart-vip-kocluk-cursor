/** PostgREST / Supabase client hataları genelde Error instance değildir; log + API yanıtı için güvenli metin. */
export function errorMessage(e) {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object') {
    const m = e.message ?? e.msg ?? e.error_description ?? e.details;
    if (typeof m === 'string' && m.trim()) return m.trim();
    if (typeof e.code === 'string' && e.code) return String(e.code);
    try {
      return JSON.stringify(e);
    } catch {
      return String(e);
    }
  }
  if (typeof e === 'string') return e;
  return 'unknown_error';
}
