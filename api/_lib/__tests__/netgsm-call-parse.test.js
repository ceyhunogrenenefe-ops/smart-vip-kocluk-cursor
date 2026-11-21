import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDuration,
  isTrackedCall,
  normalizeNetgsmEvent,
  parseNetgsmBody,
  parseTrackedNumbers
} from '../netgsm-call-parse.js';

// Netgsm dokümanındaki cdr örneğinin biçimi
const cdr = {
  bas: '2021-01-27 16:05:38',
  kimlik: '1611752738.106785',
  clid: '"NECLA 561523" <05321234567>',
  arayan: '05321234567',
  aranan: '8503034014-queue-MusteriHizmetleri',
  sure: 164,
  sondurum: 3,
  santral: '8503034014',
  yon: 1,
  seskaydi: 'https://dosyaindir.netgsm.com.tr/x.mp3',
  asteriskId: 'sip8-1611752738.106785',
  trunk: '312xxxxxxx',
  scenario: 'cdr',
  timestamp: '1652080580926'
};

test('cdr gelen cevaplanan arama', () => {
  const e = normalizeNetgsmEvent(cdr);
  assert.equal(e.kind, 'cdr');
  assert.equal(e.callId, 'sip8-1611752738.106785');
  assert.equal(e.caller, '05321234567');
  assert.equal(e.direction, 'inbound');
  assert.equal(e.answered, true);
  assert.equal(e.durationSec, 164);
  assert.equal(e.startedAt, '2021-01-27T13:05:38.000Z');
  assert.equal(e.recordingUrl, 'https://dosyaindir.netgsm.com.tr/x.mp3');
});

test('cdr cevapsiz ve arayan yalniz clid icinde', () => {
  const e = normalizeNetgsmEvent({ ...cdr, yon: 2, sure: 0, arayan: '' });
  assert.equal(e.direction, 'inbound');
  assert.equal(e.answered, false);
  assert.equal(e.caller, '05321234567');
});

test('giden ve ic aramalar inbound sayilmaz', () => {
  assert.equal(normalizeNetgsmEvent({ ...cdr, yon: 0 }).direction, 'outbound');
  assert.equal(normalizeNetgsmEvent({ ...cdr, yon: 4 }).direction, 'internal');
  assert.equal(normalizeNetgsmEvent({ ...cdr, yon: 9 }).direction, null);
});

test('Inbound_call ve InboundtoPBX kart acar, DTMF acmaz', () => {
  const e = normalizeNetgsmEvent({
    pbx_num: '101',
    unique_id: '1428481992.3556',
    scenario: 'Inbound_call',
    customer_num: '903129110000',
    timestamp: '1652080580926'
  });
  assert.equal(e.kind, 'inbound');
  assert.equal(e.direction, 'inbound');
  assert.equal(e.caller, '903129110000');
  const ring = normalizeNetgsmEvent({
    scenario: 'InboundtoPBX',
    pbx_num: '8503034014',
    incoming_number: '08503034014',
    customer_num: '05551112233',
    unique_id: 'sip1-1'
  });
  assert.equal(ring.kind, 'inbound');
  assert.equal(ring.caller, '05551112233');
  assert.equal(ring.called, '08503034014');
  assert.equal(normalizeNetgsmEvent({ scenario: 'DTMF' }).kind, 'other');
});

test('cdr cevaplandi bilgisi disposition alanindan okunur', () => {
  const e = normalizeNetgsmEvent({
    ...cdr,
    yon: 2,
    channel_variables: { disposition: 'ANSWERED' }
  });
  assert.equal(e.direction, 'inbound');
  assert.equal(e.answered, true);
});

test('takip edilen hat filtresi', () => {
  const tracked = parseTrackedNumbers('0850 303 40 14, 08501112233');
  assert.deepEqual(tracked, ['8503034014', '8501112233']);
  assert.equal(isTrackedCall(normalizeNetgsmEvent(cdr), tracked), true);
  const other = normalizeNetgsmEvent({ ...cdr, aranan: '2129998877', santral: '2129998877' });
  assert.equal(isTrackedCall(other, tracked), false);
  assert.equal(isTrackedCall(other, []), true);
  const extensionOnly = normalizeNetgsmEvent({
    scenario: 'Inbound_call',
    pbx_num: '101',
    customer_num: '05551112233',
    unique_id: 'sip1-2'
  });
  assert.equal(isTrackedCall(extensionOnly, tracked), true);
});

test('govde ayristirma ve sure bicimi', () => {
  assert.equal(parseNetgsmBody(JSON.stringify(cdr)).scenario, 'cdr');
  assert.equal(parseNetgsmBody('scenario=cdr&yon=1').yon, '1');
  assert.deepEqual(parseNetgsmBody('not json at all {'), { 'not json at all {': '' });
  assert.equal(formatDuration(164), '2 dk 44 sn');
  assert.equal(formatDuration(0), '0 sn');
});
