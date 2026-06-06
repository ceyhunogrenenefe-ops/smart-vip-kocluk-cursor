const BASE = 'https://www.dersonlinevipkocluk.com';
const SINAN = '00fc081d-2223-4979-adbf-fb331fceedb4';
const INST = '73323d75-eea1-4552-8bba-d50555423589';
const C11A = 'fe83cf5b-41e1-4b5f-91de-d63333ba0f05';
const C10 = '7e6c5286-134f-459d-97cc-5f7aa3f2fe11';

async function login(email, password) {
  const r = await fetch(`${BASE}/api/auth-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(JSON.stringify(j));
  return j.token;
}

async function main() {
  const adminToken = await login('admin@smartkocluk.com', 'Admin123!');

  const userPatch = await fetch(`${BASE}/api/users?id=${SINAN}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      name: 'SİNAN ERCAN',
      email: 'snnercan@gmail.com',
      phone: '05453124506',
      role: 'teacher',
      roles: ['teacher', 'coach'],
      password_hash: '152535',
      institution_id: INST,
      is_active: true
    })
  });
  console.log('USER', userPatch.status, await userPatch.text());

  const prof = await fetch(`${BASE}/api/questions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      action: 'teacher_profile',
      user_id: SINAN,
      branches: ['Matematik'],
      grades: ['10', '11'],
      institution_id: INST
    })
  });
  console.log('PROFILE', prof.status, await prof.text());

  const classesRes = await fetch(`${BASE}/api/class-live-lessons?scope=classes`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const classes = (await classesRes.json()).data || [];
  const c11 = classes.find((c) => c.id === C11A);
  const c10 = classes.find((c) => c.id === C10);

  for (const [label, cls, meta] of [
    ['11-A', c11, { name: '11-A', class_level: '11', branch: 'A' }],
    ['10-A', c10, { name: '10-A', class_level: '10', branch: 'A' }]
  ]) {
    if (!cls) {
      console.log('MISSING', label);
      continue;
    }
    const teacherIds = [...new Set([...(cls.teacher_ids || []), SINAN])];
    const studentIds = cls.student_ids || [];
    const body = {
      class_id: cls.id,
      teacher_ids: teacherIds,
      student_ids: studentIds,
      ...meta
    };
    const r = await fetch(`${BASE}/api/class-live-lessons?op=update-class-members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify(body)
    });
    console.log('CLASS', label, r.status, await r.text());
  }

  const sinanToken = await login('snnercan@gmail.com', '152535');
  const visible = await fetch(`${BASE}/api/class-live-lessons?scope=classes`, {
    headers: { Authorization: `Bearer ${sinanToken}` }
  });
  console.log('SINAN_CLASSES', await visible.text());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
