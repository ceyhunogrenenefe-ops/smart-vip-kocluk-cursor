/** Supabase sorgularını Vercel function timeout’una sürüklememek için üst sınır. */
export async function withDbTimeout(promise, ms = 8000, label = 'db') {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}_timeout`)), ms);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
