const base = 'https://www.dersonlinevipkocluk.com';
const emails = [
  'omeraslan@gmail.com',
  'azra123@gmail.com',
  'atesci123@gmail.com'
];

const usersRes = await fetch(`${base}/api/users`);
const users = (await usersRes.json()).data || [];
for (const email of emails) {
  const u = users.find((x) => x.email === email);
  console.log(email, u ? `${u.role} / ${JSON.stringify(u.roles || [])}` : 'BULUNAMADI');
}
