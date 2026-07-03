const base = 'https://www.dersonlinevipkocluk.com';
const email = 'test-bulk-import-probe-delete-me@gmail.com';

const usersRes = await fetch(`${base}/api/users`);
const users = (await usersRes.json()).data || [];
const probe = users.find((u) => u.email === email);
if (!probe) {
  console.log('Test kullanıcı bulunamadı, atlanıyor.');
  process.exit(0);
}

const delRes = await fetch(`${base}/api/users?id=${encodeURIComponent(probe.id)}`, { method: 'DELETE' });
console.log('DELETE', delRes.status, await delRes.text());
