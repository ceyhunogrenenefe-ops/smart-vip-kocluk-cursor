/**
 * Instagram gönderi / reel yorum webhook (object=instagram, field=comments|live_comments).
 * Kommo bu olayları inbox’a lead olarak düşürür; DM (Messaging API) ile ayrı kanaldır.
 */

/**
 * @param {object} change Meta entry.changes[] öğesi
 * @returns {{
 *   commentId: string|null,
 *   text: string|null,
 *   fromId: string|null,
 *   fromUsername: string|null,
 *   mediaId: string|null,
 *   mediaProductType: string|null,
 *   parentId: string|null,
 *   isLive: boolean,
 *   hasInboundContent: boolean
 * } | null}
 */
export function normalizeInstagramCommentChange(change) {
  const field = String(change?.field || '').trim().toLowerCase();
  if (field !== 'comments' && field !== 'live_comments') return null;
  const value = change?.value && typeof change.value === 'object' ? change.value : null;
  if (!value) return null;

  const commentId = value.id != null ? String(value.id) : null;
  const text = value.text != null ? String(value.text).trim() : '';
  const from = value.from && typeof value.from === 'object' ? value.from : {};
  const fromId = from.id != null ? String(from.id) : null;
  const fromUsername = from.username != null ? String(from.username).trim() : null;
  const media = value.media && typeof value.media === 'object' ? value.media : {};
  const mediaId = media.id != null ? String(media.id) : value.media_id != null ? String(value.media_id) : null;
  const mediaProductType =
    media.media_product_type != null
      ? String(media.media_product_type)
      : value.media_product_type != null
        ? String(value.media_product_type)
        : null;
  const parentId = value.parent_id != null ? String(value.parent_id) : null;

  const contactId = fromId || (fromUsername ? `ig:@${fromUsername}` : null);
  const label = field === 'live_comments' ? 'Canlı yayın yorumu' : 'Gönderi yorumu';
  const bits = [`[${label}]`];
  if (text) bits.push(text);
  else bits.push('(metinsiz yorum)');
  if (mediaProductType) bits.push(`(${mediaProductType})`);

  return {
    commentId,
    text: bits.join(' '),
    rawText: text || null,
    fromId: contactId,
    fromUsername,
    mediaId,
    mediaProductType,
    parentId,
    isLive: field === 'live_comments',
    hasInboundContent: Boolean(contactId && (text || commentId)),
    messageType: 'comment'
  };
}

/** entry.changes içinden yorum olaylarını topla */
export function collectInstagramCommentChanges(entry) {
  const changes = Array.isArray(entry?.changes) ? entry.changes : [];
  return changes.filter((c) => {
    const f = String(c?.field || '').toLowerCase();
    return f === 'comments' || f === 'live_comments';
  });
}
