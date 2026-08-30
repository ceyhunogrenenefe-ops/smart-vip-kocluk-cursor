import { describe, expect, it } from 'vitest';
import {
  buildMetaTemplateCreatePayload,
  extractNamedTemplateParams,
  normalizeMetaTemplateName,
} from './meta-template-payload.js';

const SELLER_BODY = `📚 SATICI SİPARİŞİ
Veli:
{{veli_ad_soyad}}
Öğrenci:
{{ogrenci_ad_soyad}}
Sınıf:
{{sinif}}
Kitaplar:
{{kitap_seti}}
Telefon:
{{telefon}}
Adres:
{{adres}}
İlçe:
{{ilce}}
İl:
{{il}}
Not:
{{siparis_notu}}
────────────────────────
Online VIP Dershane — kitap siparişi.
Kargo sonrası firma ve takip no paylaşın.`;

describe('meta-template-create', () => {
  it('extracts unique named params in body order', () => {
    expect(extractNamedTemplateParams('Veli: {{veli_ad_soyad}}\nNot: {{siparis_notu}} {{veli_ad_soyad}}')).toEqual([
      'veli_ad_soyad',
      'siparis_notu',
    ]);
  });

  it('normalizes Meta template names', () => {
    expect(normalizeMetaTemplateName('Satıcı Sipariş!')).toBe('satici_siparis');
    expect(normalizeMetaTemplateName('satici_siparis')).toBe('satici_siparis');
  });

  it('builds a NAMED UTILITY payload from the seller book-order body', () => {
    const payload = buildMetaTemplateCreatePayload({
      name: 'satici_siparis',
      bodyText: SELLER_BODY,
    });
    expect(payload.name).toBe('satici_siparis');
    expect(payload.category).toBe('UTILITY');
    expect(payload.parameter_format).toBe('NAMED');
    expect(payload.language).toBe('tr');
    const names = payload.components[0].example.body_text_named_params.map((p) => p.param_name);
    expect(names).toEqual([
      'veli_ad_soyad',
      'ogrenci_ad_soyad',
      'sinif',
      'kitap_seti',
      'telefon',
      'adres',
      'ilce',
      'il',
      'siparis_notu',
    ]);
    expect(names).not.toContain('ucret_durumu');
    expect(payload.components[0].text).not.toMatch(/IBAN|Tutar|Ücret/i);
  });
});
