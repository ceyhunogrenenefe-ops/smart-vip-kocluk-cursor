export function subjectPlannerStyle(subject: string, quantityUnit?: string) {
  const u = String(quantityUnit || '').toLowerCase();
  const s = `${subject} ${u}`.toLowerCase();
  if (u === 'sayfa' || /kitap|okuma/.test(s)) {
    return { bar: 'bg-amber-200 border-amber-500 text-amber-950', chip: 'bg-amber-100 border-amber-400' };
  }
  if (u === 'dakika' || /dakika|süre|sure/.test(s)) {
    return { bar: 'bg-cyan-200 border-cyan-600 text-cyan-950', chip: 'bg-cyan-100 border-cyan-500' };
  }
  if (/paragraf\s*çözme/i.test(s)) {
    return { bar: 'bg-fuchsia-200 border-fuchsia-600 text-fuchsia-950', chip: 'bg-fuchsia-100 border-fuchsia-500' };
  }
  if (/problem\s*çözme/i.test(s)) {
    return { bar: 'bg-rose-200 border-rose-600 text-rose-950', chip: 'bg-rose-100 border-rose-500' };
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
