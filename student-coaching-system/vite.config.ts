import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

/**
 * Vercel / API tarafında çoğu kurulumda SUPABASE_URL + SUPABASE_ANON_KEY vardır;
 * Vite varsayılan olarak yalnızca VITE_* önekini tarayıcı paketine gömer.
 * Burada build anında aynı sırayla birleştirip import.meta.env.VITE_* olarak enjekte ediyoruz.
 */
function resolveSupabaseForClient(mode: string, root: string) {
  // Boş string önek kullanma: Vite içinde beklenmedik eşleşmelere yol açabilir.
  const viteEnv = loadEnv(mode, root, "VITE_")
  const supabaseEnv = loadEnv(mode, root, "SUPABASE_")
  const nextPublic = loadEnv(mode, root, "NEXT_PUBLIC_")
  const pick = (key: string) =>
    String(
      viteEnv[key] ??
        supabaseEnv[key] ??
        nextPublic[key] ??
        process.env[key] ??
        ""
    ).trim()

  const url =
    pick("VITE_SUPABASE_URL") ||
    pick("SUPABASE_URL") ||
    pick("NEXT_PUBLIC_SUPABASE_URL")

  const anonKey =
    pick("VITE_SUPABASE_ANON_KEY") ||
    pick("SUPABASE_ANON_KEY") ||
    pick("NEXT_PUBLIC_SUPABASE_ANON_KEY")

  return { url, anonKey }
}

export default defineConfig(({ mode }) => {
  const root = __dirname
  const { url, anonKey } = resolveSupabaseForClient(mode, root)
  // resolveConfig içindeki loadEnv yalnızca VITE_* + process.env okur. Vercel’de çoğu zaman
  // yalnızca SUPABASE_URL / SUPABASE_ANON_KEY (serverless) tanımlıdır; burada build öncesi
  // VITE_* olarak da yazıyoruz ki tarayıcı paketine gömülsün.
  if (url) process.env.VITE_SUPABASE_URL = url
  if (anonKey) process.env.VITE_SUPABASE_ANON_KEY = anonKey

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  }
})