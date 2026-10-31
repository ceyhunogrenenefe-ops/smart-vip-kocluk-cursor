/** Panel api/_lib/gateway-self-recipient.js ile aynı mantık (gateway paketi bağımsız). */

export function normalizeGatewaySelfPhoneDigits(phoneOrJid) {
  let d = String(phoneOrJid || '')
    .replace(/^whatsapp:/i, '')
    .split('@')[0]
    .split(':')[0]
    .replace(/\D/g, '');
  if (!d) return '';

  if (d.length === 11 && d.startsWith('1') && /^5\d{9}$/.test(d.slice(1))) {
    d = d.slice(1);
  }
  if (d.length === 12 && /^015\d{9}$/.test(d)) {
    d = `90${d.slice(2)}`;
  }
  if (d.startsWith('0') && d.length === 11 && d[1] === '5') {
    d = `90${d.slice(1)}`;
  }
  if (d.length === 10 && d.startsWith('5')) {
    d = `90${d}`;
  }

  if (d.startsWith('90') && d.length === 12 && /^905\d{9}$/.test(d)) {
    return d;
  }

  if (d.startsWith('90') && d.length === 14 && /^905\d{9}\d{2}$/.test(d)) {
    return d.slice(0, 12);
  }

  return d;
}

export function isSelfRecipient(recipientPhone, linkedPhoneOrJid) {
  const to = normalizeGatewaySelfPhoneDigits(recipientPhone);
  const from = normalizeGatewaySelfPhoneDigits(linkedPhoneOrJid);
  if (!to || !from) return false;
  return to === from;
}

export const SELF_RECIPIENT_GATEWAY_HINT =
  'Bağlı WhatsApp numaranıza gateway ile mesaj gönderilemez (alıcıda «Mesaj bekleniyor» oluşur). Kurumsal 0850 hattını veya farklı bir cep numarasını kullanın.';
