import { describe, expect, it } from 'vitest';
import {
  buildVendorOrderNotifyPayload,
  sellerFacingNote,
  vendorNotifyPhone,
} from './commerce-vendor-notify-payload.js';

describe('commerce-vendor-order-notify', () => {
  it('reads WhatsApp number from vendor contact or meta', () => {
    expect(vendorNotifyPhone({ contact_phone: '0532 111 22 33' })).toMatch(/^\+90/);
    expect(vendorNotifyPhone({ meta: { whatsapp_phone: '05551234567' } })).toMatch(/^\+90/);
    expect(vendorNotifyPhone({ contact_phone: '' })).toBeNull();
    expect(vendorNotifyPhone({ slug: 'other-shop' })).toBeNull();
  });

  it('strips IBAN and amount from seller-facing notes', () => {
    const raw =
      'IBAN havale · Songül Öğrenenefe · TR87 0003 2000 0000 0066 7920 70 · dekont yüklendi · Kapı şifresi 12';
    const cleaned = sellerFacingNote(raw);
    expect(cleaned).toContain('Kapı şifresi 12');
    expect(cleaned).not.toMatch(/IBAN/i);
    expect(cleaned).not.toMatch(/TR87/i);
    expect(cleaned).not.toMatch(/tutar/i);
  });

  it('maps a paid commerce order onto seller template fields without tutar/IBAN', () => {
    const payload = buildVendorOrderNotifyPayload({
      order: {
        order_number: 'VIP-KTP-2026-000042',
        customer_name: 'Ayşe Yılmaz',
        customer_phone: '05551234567',
        total_kurus: 125000,
        notes: 'IBAN havale · TR870003200000000066792070 · Kapı şifresi 12',
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
    expect(payload.veli_ad_soyad).toBe('Ayşe Yılmaz');
    expect(payload.ogrenci_ad_soyad).toBe('Safiye');
    expect(payload.sinif).toBe('8');
    expect(payload.kitap_seti).toContain('Fen Bilimleri');
    expect(payload.kitap_seti).toContain('× 2');
    expect(payload.adres).toBe('Bağdat Cad. 10');
    expect(payload.il).toBe('İstanbul');
    expect(payload.siparis_notu).toContain('Kapı şifresi 12');
    expect(payload.siparis_notu).not.toMatch(/IBAN/i);
    expect(payload.siparis_notu).not.toMatch(/Tutar/i);
    expect(payload.siparis_notu).not.toMatch(/1\.250|1250/i);
    expect(JSON.stringify(payload)).not.toMatch(/TR87/i);
  });

  it('does not put checkout IBAN notes into the address field', () => {
    const payload = buildVendorOrderNotifyPayload({
      order: {
        notes: 'IBAN havale · TR870003200000000066792070 · dekont yüklendi',
        order_number: 'VIP-KTP-2026-000043',
      },
      address: {},
    });
    expect(payload.adres).toBe('-');
    expect(payload.siparis_notu).toBe('Sipariş VIP-KTP-2026-000043');
  });
});
