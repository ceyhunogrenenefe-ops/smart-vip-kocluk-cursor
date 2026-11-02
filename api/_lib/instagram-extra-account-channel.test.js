import { describe, expect, it } from 'vitest';
import { resolveSocialChannelFromWebhook } from './instagram-messaging-normalize.js';

describe('ek Instagram hesabı kanal tespiti', () => {
  it('page nesnesiyle gelen ama ek IG hesabına giden mesaj instagram sayılır', () => {
    const ch = resolveSocialChannelFromWebhook({
      objectType: 'page',
      event: { recipient: { id: '1789' }, sender: { id: 'u1' } },
      igBusinessId: '1111',
      pageId: '2222',
      extraIgUserIds: new Set(['1789'])
    });
    expect(ch).toBe('instagram');
  });

  it('ek hesap listesi verilmezse eski davranış korunur', () => {
    const a = resolveSocialChannelFromWebhook({
      objectType: 'page',
      event: { recipient: { id: '2222' }, sender: { id: 'u1' } },
      igBusinessId: '1111',
      pageId: '2222'
    });
    const b = resolveSocialChannelFromWebhook({
      objectType: 'page',
      event: { recipient: { id: '2222' }, sender: { id: 'u1' } },
      igBusinessId: '1111',
      pageId: '2222',
      extraIgUserIds: new Set(['1789'])
    });
    expect(b).toBe(a);
  });

  it('instagram nesnesi her zaman instagram', () => {
    expect(resolveSocialChannelFromWebhook({ objectType: 'instagram', event: {} })).toBe('instagram');
  });
});
