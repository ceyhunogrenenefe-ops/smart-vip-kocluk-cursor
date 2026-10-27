import { describe, expect, it } from 'vitest';
import { cloneComponents, replaceLegacyNumber } from './meta-template-copy.js';

describe('replaceLegacyNumber', () => {
  it('eski 0850 numarasının yazım çeşitlerini değiştirir', () => {
    expect(replaceLegacyNumber('Bize 0850 303 40 14 hattından ulaşın')).toBe('Bize 0506 187 74 94 hattından ulaşın');
    expect(replaceLegacyNumber('+90 850 303 40 14')).toBe('0506 187 74 94');
    expect(replaceLegacyNumber('https://wa.me/908503034014?text=a')).toBe('https://wa.me/905061877494?text=a');
    expect(replaceLegacyNumber('tel:08503034014')).toBe('tel:05061877494');
    expect(replaceLegacyNumber('Merhaba {{1}}')).toBe('Merhaba {{1}}');
  });
});

describe('cloneComponents', () => {
  it('metin, buton ve medya başlığını oluşturma isteğine çevirir', async () => {
    const r = await cloneComponents(
      [
        { type: 'HEADER', format: 'IMAGE', example: { header_handle: ['https://scontent.example/x.jpg'] } },
        { type: 'BODY', text: 'Merhaba {{1}}, 0850 303 40 14', example: { body_text: [['Ali']] } },
        { type: 'FOOTER', text: 'Online VIP' },
        {
          type: 'BUTTONS',
          buttons: [
            { type: 'PHONE_NUMBER', text: 'Ara', phone_number: '+908503034014' },
            { type: 'URL', text: 'Site', url: 'https://onlinevipdershane.com/{{1}}', example: ['https://onlinevipdershane.com/a'] },
            { type: 'QUICK_REPLY', text: 'Evet' }
          ]
        }
      ],
      { reupload: async () => ({ ok: true, handle: 'NEW_HANDLE' }) }
    );
    expect(r.ok).toBe(true);
    expect(r.changed_number).toBe(true);
    expect(r.components[0]).toEqual({ type: 'HEADER', format: 'IMAGE', example: { header_handle: ['NEW_HANDLE'] } });
    expect(r.components[1].text).toBe('Merhaba {{1}}, 0506 187 74 94');
    expect(r.components[3].buttons[0].phone_number).toBe('+905061877494');
    expect(r.components[3].buttons[2]).toEqual({ type: 'QUICK_REPLY', text: 'Evet' });
  });

  it('Flow butonlu şablonu atlar', async () => {
    const r = await cloneComponents([{ type: 'BUTTONS', buttons: [{ type: 'FLOW', text: 'Aç', flow_id: '1' }] }]);
    expect(r.ok).toBe(false);
  });
});
