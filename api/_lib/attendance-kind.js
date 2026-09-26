/**
 * Yoklama satırının türü: normal ders mi, etüt mü, deneme mi?
 *
 * Koç istatistiklerinde etüt katılımı ders devamını bozmasın diye ayrılır:
 * etüde katılım doğal olarak daha düşüktür, tek oranda birleşince koçun ders
 * devamı olduğundan kötü görünüyordu.
 */
export function classifyAttendanceKind(subject) {
  const s = String(subject || '')
    .toLocaleLowerCase('tr')
    .replace(/ü/g, 'u')
    .replace(/İ/g, 'i')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ö/g, 'o')
    .trim();
  if (!s) return 'lesson';
  // "Deneme analizi" bir ders anlatımıdır, deneme oturumu değil
  if (s.includes('analiz')) return 'lesson';
  // "etüt", "etüdü", "etut" — ekli yazımlar da yakalanır
  if (s.includes('etut') || s.includes('etud')) return 'etut';
  if (s.includes('deneme')) return 'deneme';
  return 'lesson';
}
