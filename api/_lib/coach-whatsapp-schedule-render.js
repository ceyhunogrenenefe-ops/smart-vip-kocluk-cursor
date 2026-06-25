/** {{name}}, {{coach}}, {{date}}, {{task}} ve deneme {{1}}–{{4}} yer tutucuları */
export function renderCoachScheduleTemplate(template, vars) {
  const m = typeof template === 'string' ? template : '';
  const name = String(vars?.name ?? '');
  const coach = String(vars?.coach ?? '');
  const date = String(vars?.date ?? vars?.examDate ?? vars?.template_var_date ?? '');
  const task = String(vars?.task ?? '');
  const time = String(vars?.time ?? vars?.examTime ?? vars?.template_var_time ?? '');
  const link = String(vars?.link ?? vars?.examLink ?? vars?.template_var_link ?? '');

  return m
    .replace(/\{\{\s*1\s*\}\}/g, name)
    .replace(/\{\{\s*2\s*\}\}/g, date)
    .replace(/\{\{\s*3\s*\}\}/g, time)
    .replace(/\{\{\s*4\s*\}\}/g, link)
    .replace(/\{\{\s*name\s*\}\}/gi, name)
    .replace(/\{\{\s*coach\s*\}\}/gi, coach)
    .replace(/\{\{\s*date\s*\}\}/gi, date)
    .replace(/\{\{\s*time\s*\}\}/gi, time)
    .replace(/\{\{\s*link\s*\}\}/gi, link)
    .replace(/\{\{\s*task\s*\}\}/gi, task);
}
