import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./meta-whatsapp.js', () => ({ loadMetaWhatsAppSecretsFromDb: async () => {} }));

afterEach(() => vi.unstubAllGlobals());

describe('uploadTemplateHeaderMedia', () => {
  it('yükleme oturum kimliğini adreste bozmadan kullanır', async () => {
    process.env.META_WHATSAPP_TOKEN = 'tok';
    process.env.META_APP_ID = '123';
    const urls = [];
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      urls.push(String(url));
      const body = urls.length === 1 ? { id: 'upload:MTphYmM=?sig=XYZ' } : { h: 'HANDLE' };
      return { ok: true, status: 200, json: async () => body };
    }));
    const { uploadTemplateHeaderMedia } = await import('./meta-template-media.js');
    const r = await uploadTemplateHeaderMedia({ buffer: Buffer.from('x'), mimeType: 'image/png', headerType: 'IMAGE' });
    expect(r).toEqual({ ok: true, handle: 'HANDLE' });
    expect(urls[1]).toMatch(/\/upload:MTphYmM=\?sig=XYZ$/);
  });
});
