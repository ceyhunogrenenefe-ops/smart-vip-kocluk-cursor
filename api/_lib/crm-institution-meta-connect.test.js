import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL ||= 'http://localhost:1';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'x';

const lib = await import('./crm-institution-meta-connect.js');
const PLATFORM = '73323d75-eea1-4552-8bba-d50555423589';

test('ana kuruma (platform) WhatsApp yazılmaz', async () => {
  for (const inst of [null, '', PLATFORM]) {
    const r = await lib.completeInstitutionWhatsApp({ institutionId: inst, code: 'abc' });
    assert.equal(r.ok, false);
    assert.match(String(r.error), /ana hesap/);
    assert.equal(r.steps.length, 0, 'Meta çağrısı yapılmadan durmalı');
  }
});

test('ana kuruma (platform) Instagram yazılmaz', async () => {
  await assert.rejects(() => lib.listInstitutionInstagramCandidates('tok', PLATFORM), /ana hesap/);
  await assert.rejects(
    () => lib.saveInstitutionInstagram({ institutionId: null, candidate: {} }),
    /ana hesap/
  );
});

test('hedef kurum: yönetici seçtiği kurumu, diğerleri kendi kurumunu kullanır', async () => {
  const admin = new Set(['admin']);
  const agent = new Set(['crm_agent']);
  assert.equal(await lib.resolveTargetInstitution({ institution_id: 'A' }, admin, 'B'), 'B');
  assert.equal(await lib.resolveTargetInstitution({ institution_id: 'A' }, agent, 'B'), 'A');
  assert.equal(await lib.resolveTargetInstitution({ institution_id: 'A' }, admin, ''), 'A');
});
