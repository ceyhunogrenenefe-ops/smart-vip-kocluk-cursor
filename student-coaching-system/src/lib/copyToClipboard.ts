/** Mobil WebView / eski tarayıcı — panoya güvenilir kopyalama */
export async function copyTextToClipboard(text: string): Promise<void> {
  const value = String(text || '');
  if (!value) throw new Error('Kopyalanacak metin yok');

  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
  } catch {
    /* textarea fallback */
  }

  const ta = document.createElement('textarea');
  ta.value = value;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  ta.style.top = '0';
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0, value.length);
  const ok = document.execCommand('copy');
  document.body.removeChild(ta);
  if (!ok) throw new Error('Panoya kopyalanamadı');
}
