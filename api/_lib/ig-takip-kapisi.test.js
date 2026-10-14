import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ayarlariDogrula,
  butonYuku,
  butonYukunuCoz,
  dogrulamaSonrasiPlan,
  tekrarEngeli,
  yorumIcinPlan,
  yorumYanitiVerilebilirMi
} from './ig-takip-kapisi.js';

const PDF = 'Harika! 🎉 PDF: https://ornek.com/gizli-pdf';
const KAPALI = { id: 'a1', follow_gate_enabled: false, dm_text: PDF };
const ACIK = { id: 'a1', follow_gate_enabled: true, dm_text: PDF };

test('takip kapisi KAPALIYSA mevcut davranis korunur', () => {
  const p = yorumIcinPlan(KAPALI);
  assert.equal(p.aksiyon, 'send_pdf');
  assert.equal(p.text, PDF);
});

test('takip kapisi acikken once DAVET gonderilir', () => {
  const p = yorumIcinPlan(ACIK);
  assert.equal(p.aksiyon, 'send_invite');
  assert.equal(p.durum, 'invite_sent');
  assert.ok(p.buttonText);
});

test('DAVET MESAJI PDF BAGLANTISINI ICERMEZ', () => {
  const p = yorumIcinPlan(ACIK);
  assert.ok(!p.text.includes('gizli-pdf'), 'davet mesajinda PDF bagi sizdi');
  assert.ok(!String(p.buttonText).includes('gizli-pdf'), 'buton metninde PDF bagi sizdi');
  assert.ok(!String(p.payload).includes('gizli-pdf'), 'buton yukunde PDF bagi sizdi');
});

test('ozel davet metni ve buton metni kullanilir', () => {
  const p = yorumIcinPlan({ ...ACIK, follow_invite_text: 'Özel davet', follow_button_text: 'Bastım' });
  assert.equal(p.text, 'Özel davet');
  assert.equal(p.buttonText, 'Bastım');
});

test('API takip ediyor derse PDF gonderilir', () => {
  const p = dogrulamaSonrasiPlan({ takipEdiyor: true }, ACIK);
  assert.equal(p.aksiyon, 'send_pdf');
  assert.equal(p.durum, 'verified');
  assert.equal(p.text, PDF);
});

test('API takip etmiyor derse HATIRLATMA gonderilir, PDF GITMEZ', () => {
  const p = dogrulamaSonrasiPlan({ takipEdiyor: false }, ACIK);
  assert.equal(p.aksiyon, 'send_retry');
  assert.equal(p.durum, 'unverified');
  assert.ok(!p.text.includes('gizli-pdf'), 'dogrulanmamis kullaniciya PDF sizdi');
});

test('DOGRULAMA YAPILAMIYORSA PDF GONDERILMEZ', () => {
  const p = dogrulamaSonrasiPlan({ desteklenmiyor: true, hata: 'izin yok' }, ACIK);
  assert.equal(p.aksiyon, 'none');
  assert.equal(p.durum, 'unsupported');
  assert.equal(p.text, '', 'desteklenmeyen durumda hicbir metin gonderilmemeli');
  assert.match(p.yoneticiNotu, /izin yok/);
});

test('butona basmak tek basina DOGRULANMIS sayilmaz', () => {
  // Kullanici beyani 'user_claimed'; 'verified' yalnizca API'den gelir
  const p = dogrulamaSonrasiPlan({ takipEdiyor: null }, ACIK);
  assert.notEqual(p.durum, 'verified', 'beyan dogrulama yerine gecmemeli');
  assert.equal(p.aksiyon, 'send_retry');
});

test('buton yuku cozulur ve yabanci yuk reddedilir', () => {
  const y = butonYuku('a1', 'claim');
  assert.deepEqual(butonYukunuCoz(y), { automationId: 'a1', adim: 'claim' });
  assert.deepEqual(butonYukunuCoz(butonYuku('a1', 'retry')), { automationId: 'a1', adim: 'retry' });
  assert.equal(butonYukunuCoz('baska_sistem:xx'), null);
  assert.equal(butonYukunuCoz(''), null);
  assert.equal(butonYukunuCoz('ig_follow_gate::claim'), null, 'otomasyon kimligi bos olamaz');
});

test('PDF gonderilmeden yorum yaniti verilmez', () => {
  assert.equal(yorumYanitiVerilebilirMi({ follow_state: 'invite_sent' }), false);
  assert.equal(yorumYanitiVerilebilirMi({ follow_state: 'user_claimed' }), false);
  assert.equal(yorumYanitiVerilebilirMi({ follow_state: 'unverified' }), false);
  assert.equal(yorumYanitiVerilebilirMi({ follow_state: 'unsupported' }), false);
  assert.equal(yorumYanitiVerilebilirMi({ follow_state: 'pdf_sent' }), true);
});

test('takip kapisi kapaliyken DM gidince yorum yaniti verilebilir', () => {
  // Eski akis: follow_state yok, dm_status sent
  assert.equal(yorumYanitiVerilebilirMi({ dm_status: 'sent' }), true);
});

test('ayni kullaniciya ikinci davet gonderilmez', () => {
  assert.equal(tekrarEngeli({ follow_state: 'invite_sent' }, 'invite').engelle, true);
  assert.equal(tekrarEngeli({ follow_state: 'user_claimed' }, 'invite').engelle, true);
  assert.equal(tekrarEngeli(null, 'invite').engelle, false);
});

test('PDF gittiyse hicbir adim tekrar edilmez', () => {
  for (const adim of ['invite', 'claim', 'retry']) {
    assert.equal(tekrarEngeli({ follow_state: 'pdf_sent' }, adim).engelle, true, adim);
  }
});

test('dogrulanmamis kullanici tekrar kontrol edebilir', () => {
  assert.equal(tekrarEngeli({ follow_state: 'unverified' }, 'retry').engelle, false);
  assert.equal(tekrarEngeli({ follow_state: 'unverified' }, 'claim').engelle, false);
});

test('takip kapisi acikken PDF metni bos birakilamaz', () => {
  const r = ayarlariDogrula({ ...ACIK, dm_text: '' });
  assert.equal(r.gecerli, false);
  assert.equal(ayarlariDogrula(ACIK).gecerli, true);
  assert.equal(ayarlariDogrula(KAPALI).gecerli, true, 'kapaliyken denetim yapilmaz');
});
