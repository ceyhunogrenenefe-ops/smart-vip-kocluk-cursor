const DEFAULT_TITLE = 'Deneme sınavı sınıfına yönlendiriliyorsunuz';
const DEFAULT_SUBTITLE = 'Lütfen bekleyiniz…';

type WaitingCopy = {
  title?: string;
  subtitle?: string;
  error?: string;
};

function waitingHtml({ title, subtitle, error }: WaitingCopy): string {
  const heading = error ? 'Bağlantı kurulamadı' : title || DEFAULT_TITLE;
  const body = error
    ? error
    : subtitle !== undefined
      ? subtitle
      : title
        ? ''
        : DEFAULT_SUBTITLE;
  const accent = error ? '#dc2626' : '#059669';
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>${heading}</title>
  <style>
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    html { -webkit-text-size-adjust: 100%; }
    body {
      margin: 0;
      min-height: 100vh;
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      background: linear-gradient(160deg, #ecfdf5 0%, #f8fafc 45%, #eef2ff 100%);
      color: #0f172a;
    }
    .card {
      width: min(420px, 100%);
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 28px 20px;
      text-align: center;
      box-shadow: 0 10px 40px rgba(15, 23, 42, 0.08);
    }
    @media (min-width: 480px) {
      .card { padding: 32px 28px; }
    }
    @media (min-width: 768px) {
      .card { padding: 36px 32px; border-radius: 20px; }
    }
    .spinner {
      width: 44px;
      height: 44px;
      margin: 0 auto 20px;
      border: 3px solid #d1fae5;
      border-top-color: ${accent};
      border-radius: 50%;
      animation: spin 0.85s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    h1 {
      margin: 0 0 10px;
      font-size: clamp(1rem, 4.5vw, 1.125rem);
      line-height: 1.45;
      font-weight: 700;
      color: #0f172a;
    }
    p {
      margin: 0;
      font-size: clamp(0.9rem, 3.8vw, 0.95rem);
      line-height: 1.55;
      color: #475569;
    }
    .error-icon {
      width: 44px;
      height: 44px;
      margin: 0 auto 16px;
      border-radius: 999px;
      background: #fef2f2;
      color: #dc2626;
      font-size: 1.5rem;
      line-height: 44px;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <div class="card">
    ${error ? '<div class="error-icon">!</div>' : '<div class="spinner" aria-hidden="true"></div>'}
    <h1>${heading}</h1>
    ${body ? `<p>${body}</p>` : ''}
  </div>
</body>
</html>`;
}

/** BBB katılım URL'si hazırlanırken boş sekme yerine bekleme ekranı açar. */
export function openBbbWaitingPopup(copy?: WaitingCopy): Window | null {
  const popup = window.open('about:blank', '_blank');
  if (!popup) return null;
  paintBbbWaitingPopup(popup, copy);
  return popup;
}

export function paintBbbWaitingPopup(popup: Window, copy?: WaitingCopy): void {
  try {
    popup.document.open();
    popup.document.write(waitingHtml(copy || {}));
    popup.document.close();
  } catch {
    /* popup erişilemezse yok say */
  }
}

export function assignBbbWaitingPopup(popup: Window | null | undefined, url: string): void {
  if (popup && !popup.closed) {
    popup.location.href = url;
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function showBbbWaitingPopupError(
  popup: Window | null | undefined,
  message: string,
  copy?: Pick<WaitingCopy, 'title'>
): void {
  if (popup && !popup.closed) {
    paintBbbWaitingPopup(popup, { ...copy, error: message });
    return;
  }
}
