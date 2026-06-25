/** WhatsApp / pano için davet metni — URL tek başına son satırda (kesilme önlenir). */
export function formatTrLessonDate(isoDate) {
  const d = String(isoDate || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return '';
  const [y, m, day] = d.split('-');
  return `${day}.${m}.${y}`;
}

export function formatGuestInviteShareText({ title, lessonDate, lessonTime, url, className }) {
  const subject = String(title || '').trim();
  const datePart = formatTrLessonDate(lessonDate);
  const timePart = String(lessonTime || '').trim().slice(0, 5);
  const when = [datePart, timePart].filter(Boolean).join(' · ');
  const head = subject
    ? className
      ? `${subject} (${className})`
      : subject
    : 'Canlı ders';
  const link = String(url || '').trim();
  if (when) return `${head}\n${when}\n${link}`;
  return `${head}\n${link}`;
}
