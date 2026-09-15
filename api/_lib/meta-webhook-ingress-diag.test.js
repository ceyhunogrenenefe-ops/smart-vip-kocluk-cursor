import assert from 'node:assert/strict';
import {
  classifyMetaWebhookIngress,
  analyzeInstagramDmDelivery,
  DROP,
  ACCEPT
} from './meta-webhook-ingress-diag.js';

assert.equal(
  classifyMetaWebhookIngress({
    object: 'instagram',
    entry: [{ id: '0', messaging: [{}] }]
  }).verdict,
  DROP.SYNTHETIC_META_TEST
);

assert.equal(
  classifyMetaWebhookIngress({
    object: 'instagram',
    entry: [
      {
        id: '17841458991434419',
        messaging: [
          {
            sender: { id: '111' },
            recipient: { id: '17841458991434419' },
            message: { mid: 'm1', text: 'Merhaba' }
          }
        ]
      }
    ]
  }).verdict,
  ACCEPT.MESSAGING
);

assert.equal(
  classifyMetaWebhookIngress({
    object: 'instagram',
    entry: [
      {
        id: '17841458991434419',
        standby: [
          {
            sender: { id: '111' },
            recipient: { id: '17841458991434419' },
            message: { mid: 'm1', text: 'Standby' }
          }
        ]
      }
    ]
  }).verdict,
  ACCEPT.STANDBY
);

assert.equal(
  classifyMetaWebhookIngress({
    object: 'instagram',
    entry: [
      {
        id: '17841458991434419',
        changes: [{ field: 'comments', value: { id: 'c1', from: { id: '9' }, text: 'hi' } }]
      }
    ]
  }).verdict,
  ACCEPT.COMMENT
);

const gap = analyzeInstagramDmDelivery([
  {
    received_at: new Date().toISOString(),
    platform: 'instagram',
    object_type: 'instagram',
    event_type: 'comments',
    sender_id: '9',
    instagram_account_id: '17841458991434419'
  },
  {
    received_at: new Date().toISOString(),
    platform: 'instagram',
    object_type: 'instagram',
    event_type: 'messages',
    sender_id: null,
    instagram_account_id: '0',
    processing_error: 'DROP_SYNTHETIC_META_TEST'
  }
]);
assert.equal(gap.verdict, 'META_DID_NOT_DELIVER');
assert.equal(gap.meta_did_not_deliver, true);

console.log('meta-webhook-ingress-diag tests ok');
