import assert from 'node:assert/strict';
import { extractBaileysText, phoneFromRemoteJid } from './registration-inbound-forward.js';

assert.equal(extractBaileysText({ conversation: ' Merhaba ' }), 'Merhaba');
assert.equal(extractBaileysText({ extendedTextMessage: { text: 'selam' } }), 'selam');
assert.equal(extractBaileysText({ imageMessage: {} }), '[image]');
assert.equal(phoneFromRemoteJid('905551112233@s.whatsapp.net'), '905551112233');
assert.equal(phoneFromRemoteJid('120363@g.us'), null);
assert.equal(phoneFromRemoteJid('status@broadcast'), null);
assert.equal(phoneFromRemoteJid('123456789012345@lid'), null);

console.log('registration-inbound-forward ok');
