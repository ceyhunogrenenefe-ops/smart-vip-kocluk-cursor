/**
 * Regresyon: Instagram DM’i `entry.changes[{ field:'messages' }]` biçiminde geldiğinde
 * webhook onu sentetik Meta testi sanıp düşürüyordu → reklam ve DM mesajları kayboluyordu.
 */
import assert from 'node:assert/strict';
import {
  collectChangeMessagingEvents,
  collectEntryMessagingEvents,
  normalizeInstagramMessagingEvent
} from './instagram-messaging-normalize.js';
import { classifyMetaWebhookIngress, ACCEPT, DROP } from './meta-webhook-ingress-diag.js';
import { summarizeMetaWebhookPayload } from './meta-webhook-logs.js';
import { classifyGraphConversationsError } from './instagram-conversations-sync.js';

const dmEntry = {
  id: '17841458991434419',
  changes: [
    {
      field: 'messages',
      value: {
        sender: { id: '950684743984514' },
        recipient: { id: '17841458991434419' },
        timestamp: 1789500000000,
        message: { mid: 'mid_real_1', text: 'Merhaba bilgi alabilir miyim' }
      }
    }
  ]
};

// changes biçimi messaging olayına çevrilir
assert.equal(collectEntryMessagingEvents(dmEntry).length, 1);
const dmNorm = normalizeInstagramMessagingEvent(collectEntryMessagingEvents(dmEntry)[0]);
assert.equal(dmNorm.senderId, '950684743984514');
assert.equal(dmNorm.text, 'Merhaba bilgi alabilir miyim');
assert.equal(dmNorm.hasInboundContent, true);

// ve artık sentetik test sayılmaz
const dmDiag = classifyMetaWebhookIngress({ object: 'instagram', entry: [dmEntry] });
assert.equal(dmDiag.verdict, ACCEPT.MESSAGING);
assert.equal(dmDiag.is_synthetic_meta_test, false);
assert.equal(dmDiag.sender_id, '950684743984514');

// webhook günlüğü de gönderen/mid görebilmeli
const summary = summarizeMetaWebhookPayload({ object: 'instagram', entry: [dmEntry] });
assert.equal(summary.sender_id, '950684743984514');
assert.equal(summary.message_id, 'mid_real_1');

// reklam (Click-to-Message) referralı aynı biçimde gelirse reklam olarak işaretlenir
const adEntry = {
  id: '17841458991434419',
  changes: [
    {
      field: 'messages',
      value: {
        sender: { id: 'igsid_ad_1' },
        recipient: { id: '17841458991434419' },
        referral: { source: 'ADS', ad_id: '120210', ads_context_data: { ad_title: 'VIP LGS' } }
      }
    }
  ]
};
const adNorm = normalizeInstagramMessagingEvent(collectEntryMessagingEvents(adEntry)[0]);
assert.equal(adNorm.isAd, true);
assert.match(adNorm.text, /Instagram reklamından sohbet/);
assert.equal(classifyMetaWebhookIngress({ object: 'instagram', entry: [adEntry] }).verdict, ACCEPT.MESSAGING);

// çok entry: okundu bildirimi gerçek DM’i gölgelemez
const multi = classifyMetaWebhookIngress({
  object: 'instagram',
  entry: [{ id: '17841458991434419', messaging: [{ sender: { id: 'x' }, read: { mid: 'r1' } }] }, dmEntry]
});
assert.equal(multi.verdict, ACCEPT.MESSAGING);
assert.equal(multi.sender_id, '950684743984514');

// Meta App Dashboard "Send test" hâlâ düşer
assert.equal(
  classifyMetaWebhookIngress({
    object: 'instagram',
    entry: [{ id: '0', changes: [{ field: 'messages', value: {} }] }]
  }).verdict,
  DROP.SYNTHETIC_META_TEST
);

// WhatsApp Cloud payload’u bu yoldan geçmez (value.messages[] WA işleyicisinde kalır)
const waEntry = {
  id: '1',
  changes: [
    {
      field: 'messages',
      value: {
        messaging_product: 'whatsapp',
        metadata: { phone_number_id: '123' },
        messages: [{ from: '905', id: 'wamid.1', type: 'text', text: { body: 'hi' } }]
      }
    }
  ]
};
assert.equal(collectChangeMessagingEvents(waEntry).length, 0);
assert.equal(
  classifyMetaWebhookIngress({ object: 'whatsapp_business_account', entry: [waEntry] }).verdict,
  ACCEPT.WHATSAPP
);

// Graph Conversations code=3 → eyleme dönüşür engel
const blocked = classifyGraphConversationsError(
  '(#3) Application does not have the capability to make this API call. | code=3'
);
assert.equal(blocked.blocker, 'META_ADVANCED_ACCESS_REQUIRED');
assert.ok(Array.isArray(blocked.steps) && blocked.steps.length > 0);
assert.equal(classifyGraphConversationsError('http_500').blocker, null);

console.log('instagram-dm-changes-shape tests ok');
