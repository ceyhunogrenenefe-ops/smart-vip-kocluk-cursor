import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  collectInstagramCommentChanges,
  normalizeInstagramCommentChange
} from './instagram-comments-normalize.js';

describe('instagram comments normalize (Kommo gap)', () => {
  it('accepts feed comment webhook change', () => {
    const n = normalizeInstagramCommentChange({
      field: 'comments',
      value: {
        id: 'c1',
        text: 'Bilgi alabilir miyim?',
        from: { id: 'ig_user_9', username: 'veli_test' },
        media: { id: 'media_55', media_product_type: 'FEED' }
      }
    });
    assert.equal(n.hasInboundContent, true);
    assert.equal(n.fromId, 'ig_user_9');
    assert.equal(n.fromUsername, 'veli_test');
    assert.equal(n.mediaId, 'media_55');
    assert.match(n.text, /Gönderi yorumu/);
    assert.match(n.text, /Bilgi alabilir miyim/);
    assert.equal(n.messageType, 'comment');
  });

  it('collects comments + live_comments from entry', () => {
    const list = collectInstagramCommentChanges({
      changes: [
        { field: 'messages', value: {} },
        { field: 'comments', value: { id: '1', text: 'a', from: { id: 'x' } } },
        { field: 'live_comments', value: { id: '2', text: 'b', from: { id: 'y' } } }
      ]
    });
    assert.equal(list.length, 2);
  });
});
