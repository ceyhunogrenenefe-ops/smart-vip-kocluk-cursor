const base = 'https://www.dersonlinevipkocluk.com';
for (const path of [
  '/api/weekly-planner-entries',
  '/api/coach-weekly-goals',
  '/api/users/bulk-import',
  '/api/book-readings'
]) {
  const res = await fetch(`${base}${path}`, { method: 'GET' });
  const text = await res.text();
  console.log(path, res.status, text.slice(0, 120));
}
