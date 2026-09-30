import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  HEADER_TYPES,
  TEMPLATE_LIMITS,
  buildButtonsComponent,
  buildFooterComponent,
  buildHeaderComponent,
  buildMetaTemplateCreatePayload,
  extractNamedTemplateParams,
  extractPositionalTemplateCount,
  normalizeMetaTemplateName
} from './meta-template-payload.js';

const comp = (payload, type) => payload.components.find((c) => c.type === type);

describe('mevcut davranış korunuyor', () => {
  it('header/footer/buton verilmezse yalnız BODY üretilir', () => {
    const p = buildMetaTemplateCreatePayload({ name: 'Test', bodyText: 'Merhaba' });
    assert.equal(p.components.length, 1);
    assert.equal(p.components[0].type, 'BODY');
  });

  it('adlandırılmış değişken davranışı aynı', () => {
    const p = buildMetaTemplateCreatePayload({
      name: 'x',
      bodyText: 'Merhaba {{veli_ad_soyad}}',
      examples: { veli_ad_soyad: 'Ayşe' }
    });
    assert.equal(p.parameter_format, 'NAMED');
    assert.equal(comp(p, 'BODY').example.body_text_named_params[0].param_name, 'veli_ad_soyad');
  });

  it('sıralı değişken davranışı aynı', () => {
    const p = buildMetaTemplateCreatePayload({ name: 'x', bodyText: '{{1}} ve {{2}}' });
    assert.equal(p.parameter_format, 'POSITIONAL');
    assert.equal(comp(p, 'BODY').example.body_text[0].length, 2);
  });

  it('ad normalleştirme ve boş gövde kontrolü aynı', () => {
    assert.equal(normalizeMetaTemplateName('Şablon Adı 1'), 'sablon_adi_1');
    assert.throws(() => buildMetaTemplateCreatePayload({ name: 'x', bodyText: '  ' }));
    assert.throws(() => buildMetaTemplateCreatePayload({ name: '', bodyText: 'a' }));
  });
});

describe('HEADER', () => {
  it('metin başlığı', () => {
    const h = buildHeaderComponent({ headerType: 'TEXT', headerText: 'Ders programı' });
    assert.equal(h.format, 'TEXT');
    assert.equal(h.text, 'Ders programı');
    assert.equal(h.example, undefined);
  });

  it('metin başlığında değişken varsa örnek eklenir', () => {
    const h = buildHeaderComponent({ headerType: 'TEXT', headerText: '{{1}} için', headerExample: 'Ceylin' });
    assert.deepEqual(h.example.header_text, ['Ceylin']);
  });

  it('60 karakteri aşan başlık kırpılır', () => {
    const h = buildHeaderComponent({ headerType: 'TEXT', headerText: 'a'.repeat(200) });
    assert.equal(h.text.length, TEMPLATE_LIMITS.headerTextMax);
  });

  it('medya başlığı handle ister', () => {
    assert.equal(buildHeaderComponent({ headerType: 'IMAGE' }), null);
    const h = buildHeaderComponent({ headerType: 'IMAGE', headerHandle: 'H1' });
    assert.deepEqual(h.example.header_handle, ['H1']);
    assert.equal(h.format, 'IMAGE');
  });

  it('VIDEO ve DOCUMENT de desteklenir', () => {
    assert.equal(buildHeaderComponent({ headerType: 'VIDEO', headerHandle: 'H' }).format, 'VIDEO');
    assert.equal(buildHeaderComponent({ headerType: 'DOCUMENT', headerHandle: 'H' }).format, 'DOCUMENT');
  });

  it('NONE ve geçersiz tür null', () => {
    assert.equal(buildHeaderComponent({ headerType: 'NONE' }), null);
    assert.equal(buildHeaderComponent({ headerType: 'AUDIO', headerHandle: 'H' }), null);
    assert.equal(buildHeaderComponent({}), null);
    assert.equal(HEADER_TYPES.length, 5);
  });
});

describe('FOOTER', () => {
  it('metin varsa üretilir, yoksa null', () => {
    assert.equal(buildFooterComponent('Online VIP').text, 'Online VIP');
    assert.equal(buildFooterComponent('   '), null);
    assert.equal(buildFooterComponent(null), null);
  });
  it('60 karakter sınırı', () => {
    assert.equal(buildFooterComponent('b'.repeat(120)).text.length, TEMPLATE_LIMITS.footerMax);
  });
});

describe('BUTTONS', () => {
  it('hızlı yanıt en fazla 3', () => {
    const b = buildButtonsComponent([
      { type: 'QUICK_REPLY', text: '1' },
      { type: 'QUICK_REPLY', text: '2' },
      { type: 'QUICK_REPLY', text: '3' },
      { type: 'QUICK_REPLY', text: '4' }
    ]);
    assert.equal(b.buttons.length, 3);
  });

  it('telefon 1, URL 2 ile sınırlı', () => {
    const b = buildButtonsComponent([
      { type: 'PHONE_NUMBER', text: 'Ara', phone_number: '+90555' },
      { type: 'PHONE_NUMBER', text: 'Ara2', phone_number: '+90556' },
      { type: 'URL', text: 'A', url: 'https://a.com' },
      { type: 'URL', text: 'B', url: 'https://b.com' },
      { type: 'URL', text: 'C', url: 'https://c.com' }
    ]);
    assert.equal(b.buttons.filter((x) => x.type === 'PHONE_NUMBER').length, 1);
    assert.equal(b.buttons.filter((x) => x.type === 'URL').length, 2);
  });

  it('geçersiz URL ve boş metin atlanır', () => {
    assert.equal(buildButtonsComponent([{ type: 'URL', text: 'A', url: 'ftp://x' }]), null);
    assert.equal(buildButtonsComponent([{ type: 'QUICK_REPLY', text: '  ' }]), null);
    assert.equal(buildButtonsComponent([]), null);
  });

  it('dinamik URL örnek alır', () => {
    const b = buildButtonsComponent([{ type: 'URL', text: 'Aç', url: 'https://a.com/{{1}}' }]);
    assert.ok(Array.isArray(b.buttons[0].example));
  });

  it('buton metni 25 karakterle sınırlı', () => {
    const b = buildButtonsComponent([{ type: 'QUICK_REPLY', text: 'x'.repeat(60) }]);
    assert.equal(b.buttons[0].text.length, TEMPLATE_LIMITS.buttonTextMax);
  });
});

describe('tam şablon', () => {
  it('bileşen sırası HEADER → BODY → FOOTER → BUTTONS', () => {
    const p = buildMetaTemplateCreatePayload({
      name: 'Tam',
      bodyText: 'Merhaba {{1}}',
      headerType: 'IMAGE',
      headerHandle: 'H',
      footerText: 'alt',
      buttons: [{ type: 'QUICK_REPLY', text: 'Evet' }]
    });
    assert.deepEqual(p.components.map((c) => c.type), ['HEADER', 'BODY', 'FOOTER', 'BUTTONS']);
  });

  it('eksik medya handle varsa header hiç eklenmez', () => {
    const p = buildMetaTemplateCreatePayload({
      name: 'x',
      bodyText: 'a',
      headerType: 'IMAGE'
    });
    assert.equal(comp(p, 'HEADER'), undefined);
  });
});

describe('yardımcılar', () => {
  it('değişken sayımı', () => {
    assert.equal(extractPositionalTemplateCount('{{1}} {{3}}'), 3);
    assert.deepEqual(extractNamedTemplateParams('{{ad}} {{soyad}} {{ad}}'), ['ad', 'soyad']);
  });
});
