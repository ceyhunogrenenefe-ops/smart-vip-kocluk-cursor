import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import './index.css'
import App from './App.tsx'

import { initNativeApp } from './lib/nativeApp'

void initNativeApp()

/**
 * Yayın sırasında açık kalan sekmede eski dosya adları kaybolur ve ekran bembeyaz kalır.
 * Böyle bir yükleme hatasında sayfayı bir kez yeniler (döngüye girmemesi için tek deneme).
 */
const CHUNK_RELOAD_KEY = 'ovd_chunk_reload_at'
function isAssetLoadFailure(message: string) {
  return /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk .* failed|error loading dynamically imported module|Unexpected token '<'/i.test(
    message
  )
}
function reloadOnceForStaleAssets(message: string) {
  if (!isAssetLoadFailure(message)) return
  try {
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0)
    if (Date.now() - last < 60_000) return
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
  } catch {
    /* sessionStorage kapalıysa yine de bir kez dene */
  }
  window.location.reload()
}
window.addEventListener('error', (e) => reloadOnceForStaleAssets(String(e?.message || '')))
window.addEventListener('unhandledrejection', (e) =>
  reloadOnceForStaleAssets(String((e?.reason as Error)?.message || e?.reason || ''))
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
