import { describe, expect, it } from 'vitest';
import {
  attachUnmatchedStoreCategories,
  bookMatchesCategory,
  canonicalBookSeries,
  categoryBelongsToClass,
  classKeyMatchesLevels,
  classKeysEqual,
  defaultStoreBrowse,
  normalizeStoreBrowse,
  publicStoreBrowseNav,
  withInferredSeriesMetadata,
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

  it('treats 8 and LGS as the same store family', () => {
    expect(classKeyMatchesLevels('8', ['LGS'])).toBe(true);
    expect(classKeyMatchesLevels('LGS', ['8'])).toBe(true);
    expect(classKeyMatchesLevels('TYT', ['LGS'])).toBe(false);
    expect(categoryBelongsToClass({ class_keys: ['LGS'] }, '8')).toBe(true);
    expect(categoryBelongsToClass({ class_keys: ['8'] }, 'LGS')).toBe(true);
    expect(categoryBelongsToClass({ class_keys: ['TYT'] }, 'LGS')).toBe(false);
  });

  it('infers LGS deneme / soru bankası packs into Denemeler series', () => {
    expect(canonicalBookSeries({
      title: 'LGS MOZAİK YAYINLARI 4LÜ HİT BRANŞ DENEMELERİ',
      class_levels: ['LGS'],
      metadata: {},
    })).toBe('lgs-8-denemeler');
    expect(canonicalBookSeries({
      title: 'VIP Yayınları 8. Sınıf LGS Fen Bilimleri Eğitim Seti',
      class_levels: ['8', 'LGS'],
      metadata: { series: 'vip-lgs-8-egitim' },
    })).toBe('vip-lgs-8-egitim');
    expect(canonicalBookSeries({
      title: 'ÜçDörtBeş Yayınları Sıfırdan Başla Start Matematik',
      class_levels: ['TYT'],
      metadata: {},
    })).toBe('');
    expect(withInferredSeriesMetadata({
      title: 'LGS ULTİ 6 LI BRANŞ DENEMELERİ',
      class_levels: ['LGS'],
      metadata: {},
    }).series).toBe('lgs-8-denemeler');
    expect(withInferredSeriesMetadata({
      title: 'VIP Fen',
      metadata: { series: 'vip-lgs-8-egitim' },
    }).series).toBe('vip-lgs-8-egitim');
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

  it('puts Deneme Kulübü into Denemeler even if metadata.series is VIP', () => {
    const book = {
      isbn: '978-625-99881-4-2',
      slug: 'online-vip-dershane-lgs-hazirlik-40-turkiye-geneli-deneme-kulubu-paketi',
      title: 'Online VIP Dershane – LGS Hazırlık 40+ Türkiye Geneli Deneme Kulübü Paketi',
      metadata: { series: 'vip-lgs-8-egitim' },
    };
    expect(canonicalBookSeries(book)).toBe('lgs-8-denemeler');
    expect(bookMatchesCategory(book, { series: 'lgs-8-denemeler' })).toBe(true);
    expect(bookMatchesCategory(book, { series: 'vip-lgs-8-egitim' })).toBe(false);
  });

  it('puts unmatched books into Diğer for every matching class', () => {
    const book = {
      id: 'tyt-mat',
      title: 'ÜçDörtBeş Yayınları Sıfırdan Başla Start Matematik',
      class_levels: ['11', '12', 'TYT'],
      buyable: true,
      commerce_vendor_offers: [],
    };
    const cats = attachUnmatchedStoreCategories(
      [
        { key: '11', label: '11. Sınıf', sort: 1, active: true },
        { key: '12', label: '12. Sınıf', sort: 2, active: true },
        { key: 'TYT', label: 'TYT', sort: 3, active: true },
        { key: 'LGS', label: 'LGS', sort: 4, active: true },
      ],
      [],
      [book]
    );
    expect(cats.map((c) => c.key)).toEqual(['11-diger', '12-diger', 'TYT-diger']);
    expect(cats.every((c) => c.books[0].id === 'tyt-mat')).toBe(true);
  });
});
