export function subjectPlannerStyle(subject: string, quantityUnit?: string) {
  const s = `${subject} ${quantityUnit || ''}`.toLowerCase();
  if (/kitap|okuma/.test(s)) {
    return { bar: 'bg-amber-200 border-amber-500 text-amber-950', chip: 'bg-amber-100 border-amber-400' };
  }
  if (/matematik|mat\./.test(s)) {
    return { bar: 'bg-sky-200 border-sky-600 text-sky-950', chip: 'bg-sky-100 border-sky-500' };
  }
  if (/fizik/.test(s)) {
    return { bar: 'bg-violet-200 border-violet-600 text-violet-950', chip: 'bg-violet-100 border-violet-500' };
  }
  if (/kimya/.test(s)) {
    return { bar: 'bg-emerald-200 border-emerald-600 text-emerald-950', chip: 'bg-emerald-100 border-emerald-600' };
  }
  if (/biyoloji|bio/.test(s)) {
    return { bar: 'bg-orange-200 border-orange-600 text-orange-950', chip: 'bg-orange-100 border-orange-500' };
  }
  return { bar: 'bg-slate-200 border-slate-500 text-slate-900', chip: 'bg-slate-100 border-slate-400' };
}
