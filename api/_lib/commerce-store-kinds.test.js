import { describe, expect, it } from 'vitest';
import {
  STORE_KIND_DENEME,
  STORE_KIND_EGITIM,
  STORE_KIND_SORU,
  inferStoreKindFromTitle,
  isVipEgitimComponentBook,
  storeKindOfBook,
} from './commerce-store-kinds.js';

describe('commerce-store-kinds', () => {
  it('maps titles to the three store boxes', () => {
    expect(inferStoreKindFromTitle({ title: '5.SINIF VİP YAYINLARI EĞİTİM SETİ 5 LI' })).toBe(STORE_KIND_EGITIM);
    expect(inferStoreKindFromTitle({ title: '7.SINIF PARAF YAYINLARI SORU BANKASI 6 LI SET' })).toBe(STORE_KIND_SORU);
    expect(inferStoreKindFromTitle({ title: 'LGS ULTİ YAYINLARI 6 LI BRANŞ DENEMELERİ' })).toBe(STORE_KIND_DENEME);
    expect(inferStoreKindFromTitle({ title: '5 Lİ LGS OKYANUS CLASSMATE SORU BANKALARI' })).toBe(STORE_KIND_SORU);
  });

  it('puts Deneme Kulübü in Denemeler even if series is VIP', () => {
    expect(storeKindOfBook({
      title: 'Online VIP Dershane – LGS Hazırlık 40+ Türkiye Geneli Deneme Kulübü Paketi',
      metadata: { series: 'vip-lgs-8-egitim' },
    })).toBe(STORE_KIND_DENEME);
  });

  it('hides VIP 8th-grade set components, keeps class VIP sets', () => {
    expect(isVipEgitimComponentBook({
      slug: 'vip-yayinlari-8-sinif-lgs-fen-bilimleri-egitim-seti',
      title: 'VIP Yayınları 8. Sınıf LGS Fen Bilimleri Eğitim Seti',
      isbn: '978-625-12345-1-7',
    })).toBe(true);
    expect(isVipEgitimComponentBook({
      title: '5.SINIF VİP YAYINLARI EĞİTİM SETİ 5 LI',
      slug: '5sinif-vip-yayinlari-eitim-seti-5-li-1788012241806',
    })).toBe(false);
  });
});
