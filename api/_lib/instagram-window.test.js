import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { instagramWindowClosedError } from './crm-inbox.js';

describe('Instagram 24 saat penceresi hatası', () => {
  it('Meta kodları tanınır', () => {
    assert.equal(instagramWindowClosedError({ error: { code: 10 } }, 400), true);
    assert.equal(instagramWindowClosedError({ error: { code: 551 } }, 400), true);
    assert.equal(instagramWindowClosedError({ error: { error_subcode: 2018278 } }, 400), true);
  });

  it('mesaj metninden de anlaşılır', () => {
    assert.equal(
      instagramWindowClosedError(
        { error: { message: 'This message is sent outside of allowed window.' } },
        400
      ),
      true
    );
    assert.equal(
      instagramWindowClosedError({ error: { message: 'Outside the 24 hour messaging window' } }, 400),
      true
    );
  });

  it('alakasız hatalar pencere hatası sayılmaz', () => {
    assert.equal(instagramWindowClosedError({ error: { code: 190, message: 'Invalid token' } }, 401), false);
    assert.equal(instagramWindowClosedError({ error: { message: 'Unsupported post request' } }, 400), false);
    assert.equal(instagramWindowClosedError({}, 500), false);
  });
});
