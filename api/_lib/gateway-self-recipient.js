/**
 * Gateway (Baileys) oturumunun bağlı numarasına gönderim — alıcıda «Mesaj bekleniyor» üretir.
 */

/** Telefon veya WhatsApp JID → karşılaştırılabilir TR rakamları (905xxxxxxxxx). */
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

  // Baileys cihaz eki (2 hane): 90501371530212 veya JID …:12 → 905013715302
  if (d.startsWith('90') && d.length === 14 && /^905\d{9}\d{2}$/.test(d)) {
    return d.slice(0, 12);
  }

  return d;
}

/**
 * @param {string|null|undefined} recipientPhone
 * @param {string|null|undefined} linkedPhoneOrJid — oturum sock.user.id veya rakamlar
 */
export function isSelfRecipient(recipientPhone, linkedPhoneOrJid) {
  const to = normalizeGatewaySelfPhoneDigits(recipientPhone);
  const from = normalizeGatewaySelfPhoneDigits(linkedPhoneOrJid);
  if (!to || !from) return false;
  return to === from;
}

export const SELF_RECIPIENT_GATEWAY_HINT =
  'Bağlı WhatsApp numaranıza gateway ile mesaj gönderilemez (alıcıda «Mesaj bekleniyor» oluşur). Kurumsal 0850 hattını veya farklı bir cep numarasını kullanın.';
