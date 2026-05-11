/** Haftalık takvim kartlarında ders adına göre sol şerit + yüzey */
export function liveSubjectAccent(subject: string): {
  /** border-l genişliği + renk */
  leftBar: string;
  bg: string;
  title: string;
  glow: string;
} {
  const s = String(subject || '').toLowerCase();
  if (/fizik/.test(s))
    return {
      leftBar: 'border-l-[5px] border-l-violet-500',
      bg: 'bg-gradient-to-br from-violet-50 to-white',
      title: 'text-violet-950',
      glow: 'shadow-violet-200/80'
    };
  if (/kimya/.test(s))
    return {
      leftBar: 'border-l-[5px] border-l-emerald-500',
      bg: 'bg-gradient-to-br from-emerald-50 to-white',
      title: 'text-emerald-950',
      glow: 'shadow-emerald-200/80'
    };
  if (/matematik|mat\.|geo/.test(s))
    return {
      leftBar: 'border-l-[5px] border-l-sky-500',
      bg: 'bg-gradient-to-br from-sky-50 to-white',
      title: 'text-sky-950',
      glow: 'shadow-sky-200/80'
    };
  if (/türk|edeb|tarih|coğraf|felse|din|bio|biyoloji/.test(s))
    return {
      leftBar: 'border-l-[5px] border-l-amber-500',
      bg: 'bg-gradient-to-br from-amber-50 to-white',
      title: 'text-amber-950',
      glow: 'shadow-amber-200/80'
    };
  return {
    leftBar: 'border-l-[5px] border-l-indigo-500',
    bg: 'bg-gradient-to-br from-indigo-50/90 to-white',
    title: 'text-slate-900',
    glow: 'shadow-slate-200/80'
  };
}
