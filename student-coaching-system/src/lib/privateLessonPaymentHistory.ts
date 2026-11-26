/**
 * Özel derste aynı ay içinde birden fazla ödeme.
 *
 * Bir öğrencinin bir ay için tek ücret kaydı var; ay içindeki ayrı ödemeler
 * tahsilat toplamına eklenir ve her biri kaydın notunda bir satır olarak tutulur:
 *   • 1. ödeme: 9.500 ₺ (26.11.2026)
 *   • 2. ödeme: 9.500 ₺ (26.11.2026)
 * Notun ödeme satırı olmayan kısmı olduğu gibi korunur.
 */

const BULLET = '• ';

function tl(n: number) {
  return `${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(n)} ₺`;
}

function today() {
  return new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Nottaki ödeme satırları */
export function paymentLines(notes: string | null | undefined): string[] {
  return String(notes || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith(BULLET))
    .map((l) => l.slice(BULLET.length));
}

function otherLines(notes: string | null | undefined): string[] {
  return String(notes || '')
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith(BULLET));
}

/**
 * Yeni ödemeyi geçmişe ekler. Daha önce tek tutar girilmişse (geçmiş yoksa)
 * o tutar "1. ödeme" olarak yazılır, yeni ödeme 2. olur.
 */
export function addPaymentToNotes(
  notes: string | null | undefined,
  previousCollected: number,
  amount: number,
  dateLabel: string = today()
): string {
  const lines = paymentLines(notes);
  if (!lines.length && previousCollected > 0) lines.push(`1. ödeme: ${tl(previousCollected)} (önceki kayıt)`);
  lines.push(`${lines.length + 1}. ödeme: ${tl(amount)} (${dateLabel})`);
  return [...otherLines(notes), ...lines.map((l) => BULLET + l)].join('\n').slice(0, 2000);
}

/** Tahsilat tek tutar olarak değiştirildiğinde ödeme satırları temizlenir. */
export function clearPaymentsInNotes(notes: string | null | undefined): string | null {
  const rest = otherLines(notes).join('\n');
  return rest || null;
}
