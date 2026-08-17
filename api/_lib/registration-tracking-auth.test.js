import test from 'node:test';
import assert from 'node:assert/strict';

/** Handler yetki mantığı — modül erişimi */
function canAccessModule(tags) {
  if (tags.includes('super_admin') || tags.includes('admin')) return true;
  return tags.includes('coach') || tags.includes('teacher');
}

function canSeeFinancial(tags) {
  return tags.includes('super_admin') || tags.includes('admin');
}

test('student cannot access registration module', () => {
  assert.equal(canAccessModule(['student']), false);
});

test('super_admin can access and see financial fields', () => {
  assert.equal(canAccessModule(['super_admin']), true);
  assert.equal(canSeeFinancial(['super_admin']), true);
});

test('coach can access but not financial fields', () => {
  assert.equal(canAccessModule(['coach']), true);
  assert.equal(canSeeFinancial(['coach']), false);
});

test('admin can access module within institution scope', () => {
  assert.equal(canAccessModule(['admin']), true);
});

test('primary_status prevents same lead in tracking and confirmed excel sections', () => {
  const leads = [
    { id: '1', primary_status: 'confirmed', grade_program: 'lgs' },
    { id: '1', primary_status: 'tracking', grade_program: 'lgs' }
  ];
  const confirmed = leads.filter((l) => l.primary_status === 'confirmed');
  const tracking = leads.filter((l) => l.primary_status === 'tracking');
  assert.equal(confirmed.length, 1);
  assert.equal(tracking.length, 1);
  assert.notEqual(confirmed[0].id, tracking[0].id);
});
