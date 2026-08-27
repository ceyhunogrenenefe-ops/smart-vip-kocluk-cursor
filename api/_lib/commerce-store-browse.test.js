import { describe, expect, it } from 'vitest';
import {
  bookMatchesCategory,
  categoryBelongsToClass,
  classKeyMatchesLevels,
  classKeysEqual,
  defaultStoreBrowse,
  normalizeStoreBrowse,
  publicStoreBrowseNav,
} from './commerce-store-browse.js';

describe('commerce-store-browse', () => {
  it('defaults include 8. sınıf + LGS with three LGS8 categories', () => {
    const nav = defaultStoreBrowse();
    expect(nav.classes.some((c) => c.key === '8' && c.label === '8. Sınıf')).toBe(true);
    expect(nav.classes.some((c) => c.key === 'LGS')).toBe(true);
    expect(nav.categories).toHaveLength(3);
    expect(nav.categories.every((c) => c.class_keys.includes('8') && c.class_keys.includes('LGS'))).toBe(true);
    expect(nav.categories.map((c) => c.series)).toEqual([
      'vip-lgs-8-egitim',
      'paraf-lgs-8-egitim',
      'lgs-8-denemeler',
    ]);
  });

  it('empty input falls back to defaults', () => {
    const nav = normalizeStoreBrowse(null);
    expect(nav.classes.length).toBeGreaterThan(3);
    expect(nav.categories).toHaveLength(3);
  });

  it('custom classes drop unknown category class_keys', () => {
    const nav = normalizeStoreBrowse({
      classes: [{ key: '8', label: '8. Sınıf', sort: 1 }],
      categories: [{
        key: 'vip-lgs-8-egitim',
        label: 'VIP',
        series: 'vip-lgs-8-egitim',
        class_keys: ['8', 'ghost'],
      }],
    });
    expect(nav.classes).toHaveLength(1);
    expect(nav.categories[0].class_keys).toEqual(['8']);
  });

  it('preserves LGS / numeric class keys', () => {
    const nav = normalizeStoreBrowse({
      classes: [
        { key: 'LGS', label: 'LGS', sort: 1 },
        { key: '8', label: '8. Sınıf', sort: 2 },
      ],
      categories: [{ key: 'vip-lgs-8-egitim', label: 'VIP', class_keys: ['8', 'LGS'], series: 'vip-lgs-8-egitim' }],
    });
    expect(nav.classes.map((c) => c.key).sort()).toEqual(['8', 'LGS']);
    expect(nav.categories[0].class_keys.sort()).toEqual(['8', 'LGS']);
  });

  it('matches class keys and book series', () => {
    expect(classKeysEqual('8', '8. Sınıf')).toBe(true);
    expect(classKeysEqual('LGS', 'lgs')).toBe(true);
    expect(classKeyMatchesLevels('8', ['8', 'LGS'])).toBe(true);
    expect(categoryBelongsToClass({ class_keys: ['8', 'LGS'] }, 'LGS')).toBe(true);
    expect(bookMatchesCategory(
      { metadata: { series: 'vip-lgs-8-egitim' } },
      { series: 'vip-lgs-8-egitim' }
    )).toBe(true);
    expect(bookMatchesCategory(
      { metadata: { series: 'other' } },
      { series: 'vip-lgs-8-egitim' }
    )).toBe(false);
  });

  it('public nav hides inactive items and cover images', () => {
    const pub = publicStoreBrowseNav({
      classes: [
        { key: '8', label: '8. Sınıf', active: true, sort: 1 },
        { key: '5', label: '5. Sınıf', active: false, sort: 2 },
      ],
      categories: [
        { key: 'vip', label: 'VIP', class_keys: ['8'], series: 'vip-lgs-8-egitim', active: true },
      ],
    });
    expect(pub.classes.map((c) => c.key)).toEqual(['8']);
    expect(pub.categories[0].cover_image_url).toBeUndefined();
    expect(pub.classes[0].label).toBe('8. Sınıf');
  });
});
