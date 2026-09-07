import { describe, expect, it } from 'vitest';
import { VIP5_BOOKS, VIP5_SET, VIP5_SET_CONTENTS } from './commerce-vip5-catalog.js';

describe('commerce-vip5-catalog', () => {
  it('defines a 5-book VIP 5th grade set', () => {
    expect(VIP5_SET_CONTENTS).toHaveLength(5);
    expect(VIP5_BOOKS).toHaveLength(5);
    expect(VIP5_SET.title).toMatch(/5\.SINIF.*EĞİTİM SETİ.*5/i);
    expect(VIP5_SET.class_levels).toEqual(['5']);
    expect(VIP5_SET.metadata?.store_kind).toBe('egitim-setleri');
    expect(VIP5_SET.cover_image_url).toMatch(/^\/commerce\//);
  });
});
