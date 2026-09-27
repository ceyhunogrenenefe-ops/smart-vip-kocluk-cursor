import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  matchKeyword,
  normalizeForMatch,
  pickAutomation,
  renderAutomationText,
  tokenize
} from './crm-comment-automation-core.js';

describe('anahtar kelime eşleştirme', () => {
  const kw = ['LGS'];

  it('büyük/küçük harf farkı önemsiz', () => {
    assert.equal(matchKeyword('LGS', kw), 'LGS');
    assert.equal(matchKeyword('lgs', kw), 'LGS');
    assert.equal(matchKeyword('Lgs', kw), 'LGS');
    assert.equal(matchKeyword('lGs', kw), 'LGS');
  });

  it('cümle içinde ve noktalamayla birlikte tutar', () => {
    assert.equal(matchKeyword('merhaba lgs bilgi alabilir miyim', kw), 'LGS');
    assert.equal(matchKeyword('LGS!', kw), 'LGS');
    assert.equal(matchKeyword('#lgs', kw), 'LGS');
    assert.equal(matchKeyword("lgs'ye hazırlanıyorum", kw), 'LGS');
    assert.equal(matchKeyword('LGS.', kw), 'LGS');
  });

  it('kelimenin içinde geçmesi tek başına yetmez', () => {
    assert.equal(matchKeyword('algsan', kw), null);
    assert.equal(matchKeyword('xlgsx', kw), null);
  });

  it('istenirse içinde geçmesi yeterli olur', () => {
    assert.equal(matchKeyword('xlgsx', kw, { wholeWord: false }), 'LGS');
  });

  it('Türkçe I/İ kuralı doğru uygulanır', () => {
    assert.equal(matchKeyword('ISTANBUL', ['istanbul']), 'istanbul');
    assert.equal(matchKeyword('İSTANBUL', ['istanbul']), 'istanbul');
    assert.equal(matchKeyword('ıgdır', ['IĞDIR']), 'IĞDIR');
  });

  it('çok kelimeli anahtar metin içinde aranır', () => {
    assert.equal(matchKeyword('lgs kampı ne zaman', ['LGS KAMPI']), 'LGS KAMPI');
    assert.equal(matchKeyword('kamp lgs', ['LGS KAMPI']), null);
  });

  it('boş girdi ve boş liste güvenli', () => {
    assert.equal(matchKeyword('', kw), null);
    assert.equal(matchKeyword('lgs', []), null);
    assert.equal(matchKeyword(null, null), null);
  });

  it('birden çok anahtardan ilk eşleşen döner', () => {
    assert.equal(matchKeyword('tyt hakkında', ['LGS', 'TYT']), 'TYT');
  });
});

describe('normalize ve tokenize', () => {
  it('şapka ve Türkçe harfler sadeleşir', () => {
    assert.equal(normalizeForMatch('ŞĞÜÖÇİ'), 'sguoci');
    assert.equal(normalizeForMatch('  çok   boşluk '), 'cok bosluk');
  });
  it('noktalama ayırıcıdır', () => {
    assert.deepEqual(tokenize("lgs'ye, tyt!"), ['lgs', 'ye', 'tyt']);
  });
});

describe('otomasyon seçimi', () => {
  const gonderiye = {
    id: 'a',
    media_id: 'POST1',
    keywords: ['LGS'],
    is_active: true,
    created_at: '2026-01-02'
  };
  const tumGonderiler = {
    id: 'b',
    media_id: null,
    keywords: ['LGS'],
    is_active: true,
    created_at: '2026-01-01'
  };

  it('gönderiye özel kural genel kuralı yener', () => {
    const r = pickAutomation([tumGonderiler, gonderiye], { mediaId: 'POST1', text: 'lgs' });
    assert.equal(r.automation.id, 'a');
    assert.equal(r.keyword, 'LGS');
  });

  it('başka gönderide genel kural çalışır', () => {
    const r = pickAutomation([tumGonderiler, gonderiye], { mediaId: 'POST2', text: 'LGS' });
    assert.equal(r.automation.id, 'b');
  });

  it('kapalı otomasyon çalışmaz', () => {
    const r = pickAutomation([{ ...gonderiye, is_active: false }], { mediaId: 'POST1', text: 'lgs' });
    assert.equal(r, null);
  });

  it('kelime tutmazsa null', () => {
    assert.equal(pickAutomation([gonderiye], { mediaId: 'POST1', text: 'fiyat nedir' }), null);
  });

  it('gönderi eşleşmezse özel kural tetiklenmez', () => {
    assert.equal(pickAutomation([gonderiye], { mediaId: 'BASKA', text: 'lgs' }), null);
  });
});

describe('metin yer tutucuları', () => {
  it('kullanıcı adı ve anahtar kelime yerleşir', () => {
    const out = renderAutomationText('Merhaba {{username}}, {{keyword}} pdf: link', {
      username: 'ali',
      keyword: 'LGS'
    });
    assert.equal(out, 'Merhaba @ali, LGS pdf: link');
  });
  it('kullanıcı adı yoksa boş bırakır', () => {
    assert.equal(renderAutomationText('Selam {{username}}', {}), 'Selam');
  });
});
