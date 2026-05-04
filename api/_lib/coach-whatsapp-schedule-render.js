/** {{name}}, {{coach}} ve {{date}} yer tutucuları */
export function renderCoachScheduleTemplate(template, vars) {
  const m = typeof template === 'string' ? template : '';
  return m
    .replace(/\{\{\s*name\s*\}\}/gi, String(vars?.name ?? ''))
    .replace(/\{\{\s*coach\s*\}\}/gi, String(vars?.coach ?? ''))
    .replace(/\{\{\s*date\s*\}\}/gi, String(vars?.date ?? ''));
}
