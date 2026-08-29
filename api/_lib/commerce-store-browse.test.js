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
  it('defaults give every class Eğitim Setleri / Soru Bankaları / Denemeler', () => {
    const nav = defaultStoreBrowse();
    expect(nav.classes.some((c) => c.key === '8' && c.label === '8. Sınıf')).toBe(true);
    expect(nav.classes.some((c) => c.key === 'LGS')).toBe(true);
    expect(nav.categories.map((c) => c.key)).toEqual([
      'egitim-setleri',
      'soru-bankalari',
      'denemeler',
    ]);
    expect(nav.categories.every((c) => c.class_keys.includes('8') && c.class_keys.includes('5'))).toBe(true);
  });

  it('empty input falls back to defaults', () => {
    const nav = normalizeStoreBrowse(null);
    expect(nav.classes.length).toBeGreaterThan(3);
    expect(nav.categories.map((c) => c.series)).toEqual([
      'egitim-setleri',
      'soru-bankalari',
      'denemeler',
    ]);
  });

  it('upgrades old publisher categories and inserts 8. Sınıf', () => {
    const nav = normalizeStoreBrowse({
      classes: [{ key: 'LGS', label: 'LGS', sort: 9 }],
      categories: [{
        key: 'vip-lgs-8-egitim',
        label: 'VIP',
        series: 'vip-lgs-8-egitim',
        class_keys: ['LGS'],
      }],
    });
    expect(nav.classes.map((c) => c.key).sort()).toEqual(['8', 'LGS']);
    expect(nav.categories.map((c) => c.key)).toEqual([
      'egitim-setleri',
      'soru-bankalari',
      'denemeler',
    ]);
  });

  it('preserves LGS / numeric class keys', () => {
    const nav = normalizeStoreBrowse({
      classes: [
        { key: 'LGS', label: 'LGS', sort: 1 },
        { key: '8', label: '8. Sınıf', sort: 2 },
      ],
      categories: [],
    });
    expect(nav.classes.map((c) => c.key).sort()).toEqual(['8', 'LGS']);
  });

  it('treats 8 and LGS as the same store family', () => {
    expect(classKeyMatchesLevels('8', ['LGS'])).toBe(true);
    expect(classKeyMatchesLevels('LGS', ['8'])).toBe(true);
    expect(classKeyMatchesLevels('TYT', ['LGS'])).toBe(false);
    expect(categoryBelongsToClass({ class_keys: ['LGS'] }, '8')).toBe(true);
    expect(categoryBelongsToClass({ class_keys: ['8'] }, 'LGS')).toBe(true);
    expect(categoryBelongsToClass({ class_keys: ['TYT'] }, 'LGS')).toBe(false);
  });

  it('maps books into the three kinds', () => {
    expect(canonicalBookSeries({
      title: 'LGS MOZAİK YAYINLARI 4LÜ HİT BRANŞ DENEMELERİ',
      class_levels: ['LGS'],
      metadata: {},
    })).toBe('denemeler');
    expect(canonicalBookSeries({
      title: '5.SINIF VİP YAYINLARI EĞİTİM SETİ 5 LI',
      class_levels: ['5'],
      metadata: { series: 'vip-lgs-8-egitim' },
    })).toBe('egitim-setleri');
    expect(canonicalBookSeries({
      title: 'ÜçDörtBeş Yayınları Sıfırdan Başla Start Matematik',
      class_levels: ['TYT'],
      metadata: {},
    })).toBe('');
    expect(withInferredSeriesMetadata({
      title: 'LGS ULTİ 6 LI BRANŞ DENEMELERİ',
      class_levels: ['LGS'],
      metadata: {},
    }).series).toBe('denemeler');
  });

  it('matches class keys and store kinds', () => {
    expect(classKeysEqual('8', '8. Sınıf')).toBe(true);
    expect(classKeysEqual('LGS', 'lgs')).toBe(true);
    expect(classKeyMatchesLevels('8', ['8', 'LGS'])).toBe(true);
    expect(bookMatchesCategory(
      { title: '5.SINIF VİP EĞİTİM SETİ 5 LI', class_levels: ['5'], metadata: { series: 'egitim-setleri' } },
      { series: 'egitim-setleri', class_keys: ['5'] }
    )).toBe(true);
    expect(bookMatchesCategory(
      { title: '5.SINIF VİP EĞİTİM SETİ 5 LI', class_levels: ['5'], metadata: { series: 'egitim-setleri' } },
      { series: 'denemeler', class_keys: ['5'] }
    )).toBe(false);
  });

  it('does not put VIP 8 component books into Eğitim Setleri', () => {
    expect(bookMatchesCategory(
      {
        slug: 'vip-yayinlari-8-sinif-lgs-fen-bilimleri-egitim-seti',
        title: 'VIP Yayınları 8. Sınıf LGS Fen Bilimleri Eğitim Seti',
        class_levels: ['8', 'LGS'],
        metadata: { series: 'vip-lgs-8-egitim' },
      },
      { series: 'egitim-setleri', class_keys: ['8'] }
    )).toBe(false);
  });

  it('public nav hides inactive items', () => {
    const pub = publicStoreBrowseNav({
      classes: [
        { key: '8', label: '8. Sınıf', active: true, sort: 1 },
        { key: '5', label: '5. Sınıf', active: false, sort: 2 },
      ],
      categories: [],
    });
    expect(pub.classes.map((c) => c.key)).toEqual(['8']);
    expect(pub.categories.map((c) => c.key)).toEqual([
      'egitim-setleri',
      'soru-bankalari',
      'denemeler',
    ]);
  });

  it('puts Deneme Kulübü into Denemeler even if metadata.series is VIP', () => {
    const book = {
      isbn: '978-625-99881-4-2',
      slug: 'online-vip-dershane-lgs-hazirlik-40-turkiye-geneli-deneme-kulubu-paketi',
      title: 'Online VIP Dershane – LGS Hazırlık 40+ Türkiye Geneli Deneme Kulübü Paketi',
      class_levels: ['8', 'LGS'],
      metadata: { series: 'vip-lgs-8-egitim' },
    };
    expect(canonicalBookSeries(book)).toBe('denemeler');
    expect(bookMatchesCategory(book, { series: 'denemeler', class_keys: ['8'] })).toBe(true);
    expect(bookMatchesCategory(book, { series: 'egitim-setleri', class_keys: ['8'] })).toBe(false);
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
