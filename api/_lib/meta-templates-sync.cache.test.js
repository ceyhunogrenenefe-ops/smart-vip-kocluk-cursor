import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

function jsonResponse(status, body, headers = {}) {
  return {
    ok: status < 400,
    status,
    json: async () => body,
    headers: { get: (k) => headers[String(k).toLowerCase()] ?? null }
  };
}

describe('şablon okuma önbelleği ve istek sınırı sigortası', () => {
  it('aynı listeyi 2 dk içinde tekrar Meta’ya sormaz', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { data: [{ name: 'a', status: 'APPROVED', language: 'tr' }] }));
    vi.stubGlobal('fetch', fetchMock);
    const m = await import('./meta-templates-sync.js');
    await m.fetchTemplatesForWaba('111', 'tok');
    await m.fetchTemplatesForWaba('111', 'tok');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    m.invalidateCrmTemplateCache();
    await m.fetchTemplatesForWaba('111', 'tok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('#80008 sonrası okumalar ağa çıkmadan hata döner', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(400, { error: { code: 80008, message: 'too many calls' } }, {
        'x-business-use-case-usage': '{"111":[{"estimated_time_to_regain_access":7}]}'
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    const m = await import('./meta-templates-sync.js');
    const first = await m.fetchTemplatesForWaba('111', 'tok');
    const second = await m.fetchTemplatesForWaba('222', 'tok');
    expect(first.ok).toBe(false);
    expect(second.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
