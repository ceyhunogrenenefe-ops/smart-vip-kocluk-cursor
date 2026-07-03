const base = 'https://www.dersonlinevipkocluk.com';

const usersRes = await fetch(`${base}/api/users`);
const usersJson = await usersRes.json();
const instId = usersJson.data?.[0]?.institution_id;
console.log('institution_id', instId);

const testStudent = {
  email: 'test-bulk-import-probe-delete-me@gmail.com',
  name: 'Test Import Probe',
  password: '152535',
  role: 'student',
  roles: ['student'],
  institution_id: instId,
  class_level: '6'
};

const postRes = await fetch(`${base}/api/users`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(testStudent)
});
console.log('POST /api/users', postRes.status, (await postRes.text()).slice(0, 400));
