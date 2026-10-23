import test from 'node:test';
import assert from 'node:assert/strict';
import { isSelfRecipient } from '../message-service.js';

test('gönderen hattın kendi numarası algılanır', () => {
  assert.equal(isSelfRecipient('+905013715302', '905013715302'), true);
  // gateway bazen cihaz ekini rakam olarak bırakıyor (905013715302:12 → 90501371530212)
  assert.equal(isSelfRecipient('+905013715302', '90501371530212'), true);
  assert.equal(isSelfRecipient('+905013715302', '905013715302:12@s.whatsapp.net'), true);
});

test('farklı numara ya da bilinmeyen hat engellenmez', () => {
  assert.equal(isSelfRecipient('+905307104317', '905013715302'), false);
  assert.equal(isSelfRecipient('+905013715302', null), false);
  assert.equal(isSelfRecipient('', '905013715302'), false);
  assert.equal(isSelfRecipient('+905013715302', '9050137153021234'), false);
});
