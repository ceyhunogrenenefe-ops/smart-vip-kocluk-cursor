/**
 * Kargo etiketi — A5 sayfa, doğrudan yazdırılıp kolinin üzerine yapıştırılır.
 * Birden fazla etiket verilirse her biri ayrı A5 sayfaya basılır.
 */

export type LabelParty = {
  name: string;
  phone?: string | null;
  addressLines: string[];
};

export type ShippingLabel = {
  orderNumber: string;
  recipient: LabelParty;
  sender: LabelParty;
  studentName?: string | null;
  className?: string | null;
  items: string[];
  note?: string | null;
};

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** "Mahalle/sokak" + "ilçe / il posta kodu" satırları */
export function addressLines(a: {
  address_line1?: string | null;
  address_line2?: string | null;
  district?: string | null;
  city?: string | null;
  postal_code?: string | null;
}): string[] {
  const clean = (x?: string | null) => String(x || '').trim();
  const cityLine = [clean(a.district), clean(a.city)].filter(Boolean).join(' / ');
  return [
    clean(a.address_line1),
    clean(a.address_line2),
    [cityLine, clean(a.postal_code)].filter(Boolean).join('  ')
  ].filter(Boolean);
}

function partyHtml(title: string, p: LabelParty, big: boolean) {
  return `
    <section class="party ${big ? 'to' : 'from'}">
      <div class="tag">${esc(title)}</div>
      <div class="name">${esc(p.name || '—')}</div>
      ${p.phone ? `<div class="phone">Tel: ${esc(p.phone)}</div>` : ''}
      <div class="addr">${p.addressLines.length ? p.addressLines.map(esc).join('<br>') : '<em>Adres yok</em>'}</div>
    </section>`;
}

function labelHtml(l: ShippingLabel) {
  const meta = [l.studentName ? `Öğrenci: ${l.studentName}` : '', l.className || ''].filter(Boolean).join(' · ');
  return `
  <article class="label">
    <header>
      <div class="brand">KARGO ETİKETİ</div>
      <div class="order">Sipariş <strong>${esc(l.orderNumber)}</strong></div>
    </header>
    ${partyHtml('ALICI', l.recipient, true)}
    ${partyHtml('GÖNDEREN', l.sender, false)}
    <section class="content">
      ${meta ? `<div class="meta">${esc(meta)}</div>` : ''}
      ${
        l.items.length
          ? `<div class="items"><b>İçerik:</b> ${l.items.map(esc).join(' · ')}</div>`
          : ''
      }
      ${l.note ? `<div class="note"><b>Not:</b> ${esc(l.note)}</div>` : ''}
    </section>
  </article>`;
}

const LABEL_CSS = `
  @page { size: A5 portrait; margin: 8mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; color: #000; }
  .label { width: 100%; height: 194mm; display: flex; flex-direction: column; gap: 4mm;
    border: 0.6mm solid #000; padding: 5mm; page-break-after: always; break-after: page; }
  .label:last-child { page-break-after: auto; break-after: auto; }
  header { display: flex; justify-content: space-between; align-items: baseline;
    border-bottom: 0.4mm solid #000; padding-bottom: 2mm; }
  .brand { font-size: 11pt; font-weight: 700; letter-spacing: 1px; }
  .order { font-size: 10pt; }
  .party { border: 0.4mm solid #000; padding: 3mm 4mm; }
  .party.to { flex: 1 1 auto; border-width: 0.8mm; }
  .tag { display: inline-block; background: #000; color: #fff; font-size: 9pt; font-weight: 700;
    padding: 0.6mm 2.5mm; letter-spacing: 1px; margin-bottom: 2mm; }
  .to .name { font-size: 24pt; font-weight: 700; line-height: 1.15; }
  .to .phone { font-size: 15pt; font-weight: 700; margin-top: 2mm; }
  .to .addr { font-size: 17pt; line-height: 1.4; margin-top: 4mm; }
  .from .name { font-size: 11pt; font-weight: 700; }
  .from .phone, .from .addr { font-size: 9.5pt; line-height: 1.3; margin-top: 0.8mm; }
  .content { font-size: 8.5pt; line-height: 1.3; }
  .meta { font-weight: 700; margin-bottom: 1mm; }
  .items, .note { margin-top: 0.8mm; }
  @media screen {
    body { background: #e5e7eb; }
    .label { width: 132mm; height: 194mm; margin: 6mm auto; background: #fff; }
  }
`;

export function buildShippingLabelsHtml(labels: ShippingLabel[]) {
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8">
    <title>Kargo etiketi ${esc(labels[0]?.orderNumber)}${labels.length > 1 ? ` (+${labels.length - 1})` : ''}</title>
    <style>${LABEL_CSS}</style></head><body>${labels.map(labelHtml).join('')}</body></html>`;
}

/** Gizli iframe ile yazdırma — açılır pencere engelleyicisine takılmaz */
export function printShippingLabels(labels: ShippingLabel[]) {
  if (!labels.length) return;
  const html = buildShippingLabelsHtml(labels);

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  document.body.appendChild(frame);
  const doc = frame.contentWindow?.document;
  if (!doc || !frame.contentWindow) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  const win = frame.contentWindow;
  const cleanup = () => window.setTimeout(() => frame.remove(), 1000);
  win.onafterprint = cleanup;
  window.setTimeout(() => {
    win.focus();
    win.print();
    // Bazı tarayıcılar onafterprint tetiklemez
    window.setTimeout(cleanup, 60000);
  }, 250);
}
