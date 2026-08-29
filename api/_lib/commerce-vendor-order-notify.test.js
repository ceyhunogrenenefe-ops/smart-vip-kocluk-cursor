import { describe, expect, it } from 'vitest';
import {
  buildVendorOrderNotifyPayload,
  vendorNotifyPaymentLabel,
  vendorNotifyPhone,
} from './commerce-vendor-notify-payload.js';

describe('commerce-vendor-order-notify', () => {
  it('reads WhatsApp number from vendor contact or meta', () => {
    expect(vendorNotifyPhone({ contact_phone: '0532 111 22 33' })).toMatch(/^\+90/);
    expect(vendorNotifyPhone({ meta: { whatsapp_phone: '05551234567' } })).toMatch(/^\+90/);
    expect(vendorNotifyPhone({ contact_phone: '' })).toBeNull();
    expect(vendorNotifyPhone({ slug: 'other-shop' })).toBeNull();
  });

  it('labels card vs IBAN payment in the template note', () => {
    expect(vendorNotifyPaymentLabel('iban')).toMatch(/IBAN/i);
    expect(vendorNotifyPaymentLabel('paytr')).toMatch(/PayTR/i);
    expect(vendorNotifyPaymentLabel('garanti')).toMatch(/Garanti/i);
    expect(vendorNotifyPaymentLabel('')).toMatch(/Kredi kartı/i);
  });

  it('maps a paid commerce order onto the kitap_siparisi template fields', () => {
    const payload = buildVendorOrderNotifyPayload({
      order: {
        order_number: 'VIP-KTP-2026-000042',
        customer_name: 'Ayşe Yılmaz',
        customer_phone: '05551234567',
        total_kurus: 125000,
        notes: 'Kapı şifresi 12',
        payment_method: 'iban',
      },
      items: [
        { title_snapshot: 'VIP Fen Bilimleri Eğitim Seti', quantity: 1 },
        { title_snapshot: 'VIP Matematik Eğitim Seti', quantity: 2 },
      ],
      address: {
        address_line1: 'Bağdat Cad. 10',
        district: 'Kadıköy',
        city: 'İstanbul',
        phone: '05551234567',
      },
      student: { name: 'Safiye', class_level: '8' },
      vendor: { name: 'Yankı Kitapevi' },
    });
    expect(payload.ucret_durumu).toBe('Ödendi');
    expect(payload.veli_ad_soyad).toBe('Ayşe Yılmaz');
    expect(payload.ogrenci_ad_soyad).toBe('Safiye');
    expect(payload.kitap_seti).toContain('Fen Bilimleri');
    expect(payload.kitap_seti).toContain('× 2');
    expect(payload.il).toBe('İstanbul');
    expect(payload.siparis_notu).toContain('VIP-KTP-2026-000042');
    expect(payload.siparis_notu).toMatch(/IBAN havale/i);
    expect(payload.siparis_notu).toMatch(/ödendi/i);
  });
});
