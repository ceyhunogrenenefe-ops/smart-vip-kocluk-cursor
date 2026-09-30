import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBodyParameters,
  buildSendButtonComponents,
  buildSendHeaderComponent,
  buildTemplateSendComponents
} from './meta-template-send-components.js';

describe('mevcut gövde davranışı korunuyor', () => {
  it('sıralı parametreler eskisi gibi', () => {
    assert.deepEqual(buildBodyParameters(['Ayşe', 'Ceylin']), [
      { type: 'text', text: 'Ayşe' },
      { type: 'text', text: 'Ceylin' }
    ]);
  });

  it('adlandırılmış parametreler eskisi gibi', () => {
    assert.deepEqual(buildBodyParameters(['Ayşe'], ['{{veli_adi}}']), [
      { type: 'text', parameter_name: 'veli_adi', text: 'Ayşe' }
    ]);
  });

  it('ad sayısı uyuşmazsa sıralıya döner', () => {
    const r = buildBodyParameters(['a', 'b'], ['x']);
    assert.equal(r[0].parameter_name, undefined);
  });

  it('parametre yoksa null — components hiç eklenmez', () => {
    assert.equal(buildBodyParameters([]), null);
    assert.equal(buildTemplateSendComponents({}), null);
  });

  it('yalnız gövde verilince çıktı eski elle kurulan diziyle aynı', () => {
    assert.deepEqual(buildTemplateSendComponents({ bodyParameterTexts: ['Ayşe'] }), [
      { type: 'body', parameters: [{ type: 'text', text: 'Ayşe' }] }
    ]);
  });
});

describe('başlık', () => {
  it('metin başlığı parametre alır', () => {
    assert.deepEqual(buildSendHeaderComponent({ headerType: 'TEXT', headerText: 'Ders' }), {
      type: 'header',
      parameters: [{ type: 'text', text: 'Ders' }]
    });
  });

  it('boş metin başlığı bileşen üretmez', () => {
    assert.equal(buildSendHeaderComponent({ headerType: 'TEXT', headerText: '  ' }), null);
  });

  it('görsel başlığı link ile gider', () => {
    const h = buildSendHeaderComponent({ headerType: 'IMAGE', mediaUrl: 'https://x/y.png' });
    assert.deepEqual(h.parameters[0], { type: 'image', image: { link: 'https://x/y.png' } });
  });

  it('medya kimliği linke tercih edilir', () => {
    const h = buildSendHeaderComponent({ headerType: 'VIDEO', mediaId: '123', mediaUrl: 'https://x/y.mp4' });
    assert.deepEqual(h.parameters[0], { type: 'video', video: { id: '123' } });
  });

  it('belge başlığında dosya adı taşınır', () => {
    const h = buildSendHeaderComponent({
      headerType: 'DOCUMENT',
      mediaUrl: 'https://x/y.pdf',
      documentFilename: 'program.pdf'
    });
    assert.equal(h.parameters[0].document.filename, 'program.pdf');
  });

  it('geçersiz adres ve tür null döner', () => {
    assert.equal(buildSendHeaderComponent({ headerType: 'IMAGE', mediaUrl: 'ftp://x' }), null);
    assert.equal(buildSendHeaderComponent({ headerType: 'IMAGE' }), null);
    assert.equal(buildSendHeaderComponent({ headerType: 'NONE' }), null);
    assert.equal(buildSendHeaderComponent(), null);
  });
});

describe('butonlar', () => {
  it('hızlı yanıt payload gönderir', () => {
    assert.deepEqual(buildSendButtonComponents([{ type: 'QUICK_REPLY', text: 'Evet', index: 0 }]), [
      { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: 'Evet' }] }
    ]);
  });

  it('URL butonu metin gönderir ve index sırayla artar', () => {
    const r = buildSendButtonComponents([
      { type: 'URL', text: 'a' },
      { type: 'URL', text: 'b' }
    ]);
    assert.deepEqual(r.map((x) => x.index), ['0', '1']);
  });

  it('telefon butonu ve boş metin atlanır', () => {
    assert.equal(buildSendButtonComponents([{ type: 'PHONE_NUMBER', text: 'Ara' }]), null);
    assert.equal(buildSendButtonComponents([{ type: 'URL', text: '  ' }]), null);
    assert.equal(buildSendButtonComponents([]), null);
  });
});

describe('sıra', () => {
  it('header → body → buttons', () => {
    const c = buildTemplateSendComponents({
      bodyParameterTexts: ['Ayşe'],
      headerType: 'IMAGE',
      headerMediaUrl: 'https://x/y.png',
      buttonParameters: [{ type: 'QUICK_REPLY', text: 'Evet' }]
    });
    assert.deepEqual(c.map((x) => x.type), ['header', 'body', 'button']);
  });
});
