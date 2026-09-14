/**
 * Facebook Page feed yorumları (object=page, field=feed, item=comment).
 * Instagram comments alanından ayrı — Page subscribed_fields içine `feed` gerekir.
 */

/**
 * @param {object} change Meta entry.changes[] öğesi
 * @returns {{
 *   commentId: string|null,
 *   text: string|null,
 *   fromId: string|null,
 *   fromName: string|null,
 *   postId: string|null,
 *   parentId: string|null,
 *   hasInboundContent: boolean,
 *   messageType: string
 * } | null}
 */
export function normalizeFacebookFeedCommentChange(change) {
  const field = String(change?.field || '').trim().toLowerCase();
  if (field !== 'feed') return null;
  const value = change?.value && typeof change.value === 'object' ? change.value : null;
  if (!value) return null;
  if (String(value.item || '').toLowerCase() !== 'comment') return null;
  if (String(value.verb || 'add').toLowerCase() === 'remove') return null;

  const commentId = value.comment_id != null ? String(value.comment_id) : null;
  const text = value.message != null ? String(value.message).trim() : '';
  const from = value.from && typeof value.from === 'object' ? value.from : {};
  const fromId = from.id != null ? String(from.id) : null;
  const fromName = from.name != null ? String(from.name).trim() : null;
  const postId = value.post_id != null ? String(value.post_id) : value.post?.id != null ? String(value.post.id) : null;
  const parentId = value.parent_id != null ? String(value.parent_id) : null;

  if (!fromId) return null;

  const bits = ['[Facebook gönderi yorumu]'];
  if (text) bits.push(text);
  else bits.push('(metinsiz yorum)');

  return {
    commentId,
    text: bits.join(' '),
    rawText: text || null,
    fromId,
    fromName,
    postId,
    parentId,
    hasInboundContent: Boolean(fromId && (text || commentId)),
    messageType: 'comment'
  };
}

export function collectFacebookFeedCommentChanges(entry) {
  const changes = Array.isArray(entry?.changes) ? entry.changes : [];
  return changes.filter((c) => {
    if (String(c?.field || '').toLowerCase() !== 'feed') return false;
    const v = c?.value;
    return v && String(v.item || '').toLowerCase() === 'comment';
  });
}
