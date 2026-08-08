import assert from 'assert';
import {
  buildHashedPassword,
  buildSecure3dHash,
  tryToKurus,
  verifyCallbackHash,
  isGarantiPaymentApproved,
  sha1Upper,
  sha512Upper
} from './garanti-pos.js';

// Resmi örnek: password + 9-digit terminal
const hp = buildHashedPassword('123qweASD/', '30691297');
assert.strictEqual(hp.length, 40);
assert.strictEqual(hp, sha1Upper('123qweASD/030691297'));

const amount = tryToKurus(10.5);
assert.strictEqual(amount, 1050);

const hash = buildSecure3dHash({
  provisionPassword: '123qweASD/',
  terminalId: '30691297',
  orderId: 'ORDER1',
  amountKurus: 100,
  currencyCode: '949',
  successUrl: 'https://example.com/ok',
  errorUrl: 'https://example.com/fail',
  txType: 'sales',
  installmentCount: 0,
  storeKey: '12345678'
});
assert.strictEqual(hash.length, 128);
assert.strictEqual(
  hash,
  sha512Upper(
    '30691297' +
      'ORDER1' +
      '100' +
      '949' +
      'https://example.com/ok' +
      'https://example.com/fail' +
      'sales' +
      '0' +
      '12345678' +
      hp
  )
);

const storeKey = 'TESTSTOREKEY';
const params = {
  clientid: '30691297',
  oid: 'ORDER1',
  authcode: '123456',
  procreturncode: '00',
  response: 'Approved',
  mdstatus: '1',
  hashparams: 'clientid:oid:authcode:procreturncode:response:mdstatus',
  hash: ''
};
const val =
  params.clientid +
  params.oid +
  params.authcode +
  params.procreturncode +
  params.response +
  params.mdstatus +
  storeKey;
params.hash = sha512Upper(val);
assert.strictEqual(verifyCallbackHash(params, storeKey), true);
assert.strictEqual(isGarantiPaymentApproved(params), true);
assert.strictEqual(isGarantiPaymentApproved({ mdstatus: '7', response: 'Error', procreturncode: '99' }), false);

console.log('garanti-pos.test.js OK');
