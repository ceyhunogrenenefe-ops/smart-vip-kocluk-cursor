import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  collectFacebookFeedCommentChanges,
  normalizeFacebookFeedCommentChange
} from './facebook-comments-normalize.js';

describe('facebook feed comments normalize', () => {
  it('accepts page feed comment add', () => {
    const n = normalizeFacebookFeedCommentChange({
      field: 'feed',
      value: {
        item: 'comment',
        verb: 'add',
        comment_id: 'c_fb_1',
        post_id: 'p_1',
        message: 'Fiyat nedir?',
        from: { id: 'psid_9', name: 'Ayşe' }
      }
    });
    assert.equal(n.hasInboundContent, true);
    assert.equal(n.fromId, 'psid_9');
    assert.equal(n.commentId, 'c_fb_1');
    assert.match(n.text, /Facebook gönderi yorumu/);
    assert.match(n.text, /Fiyat nedir/);
  });

  it('ignores non-comment feed items', () => {
    const n = normalizeFacebookFeedCommentChange({
      field: 'feed',
      value: { item: 'status', verb: 'add', from: { id: 'x' } }
    });
    assert.equal(n, null);
  });

  it('collects only comment changes', () => {
    const list = collectFacebookFeedCommentChanges({
      changes: [
        { field: 'messages', value: {} },
        { field: 'feed', value: { item: 'comment', comment_id: '1', from: { id: 'a' }, message: 'hi' } },
        { field: 'feed', value: { item: 'like', from: { id: 'b' } } }
      ]
    });
    assert.equal(list.length, 1);
  });
});
