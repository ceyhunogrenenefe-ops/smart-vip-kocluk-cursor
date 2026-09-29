import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isDuplicateLeadError } from './registration-channel-ingest.js';

describe('çift lead kısıtı hatası', () => {
  it('Postgres tekillik kodu tanınır', () => {
    assert.equal(isDuplicateLeadError({ code: '23505' }), true);
  });

  it('mesajdan da anlaşılır', () => {
    assert.equal(
      isDuplicateLeadError({ message: 'duplicate key value violates unique constraint' }),
      true
    );
    assert.equal(
      isDuplicateLeadError({ message: 'registration_leads_instagram_unq' }),
      true
    );
    assert.equal(isDuplicateLeadError({ message: 'registration_leads_phone_unq' }), true);
  });

  it('alakasız hatalar tekillik sayılmaz', () => {
    assert.equal(isDuplicateLeadError({ code: '23502', message: 'not-null violation' }), false);
    assert.equal(isDuplicateLeadError({ message: 'column does not exist' }), false);
    assert.equal(isDuplicateLeadError({}), false);
    assert.equal(isDuplicateLeadError(null), false);
  });
});
