import { describe, expect, it } from 'vitest';
import {
  COMPANY_WA_DIGITS,
  COMPANY_WA_DISPLAY,
  PRODUCTION_WEBHOOK_URL,
  isOurWebhookCallback,
  summarizeInboundBind
} from './meta-inbound-ensure.js';

describe('isOurWebhookCallback', () => {
  it('accepts production webhook and alias', () => {
    expect(isOurWebhookCallback(PRODUCTION_WEBHOOK_URL)).toBe(true);
    expect(isOurWebhookCallback('https://www.dersonlinevipkocluk.com/api/webhooks/meta')).toBe(true);
  });

  it('rejects foreign or empty URLs', () => {
    expect(isOurWebhookCallback('')).toBe(false);
    expect(isOurWebhookCallback('https://graph.facebook.com/webhook')).toBe(false);
    expect(isOurWebhookCallback('https://preview.vercel.app/api/meta/webhook')).toBe(false);
  });
});

describe('summarizeInboundBind', () => {
  it('is bound when subscribed and effective callback is ours', () => {
    const s = summarizeInboundBind({
      phoneWebhook: {
        phone_number: PRODUCTION_WEBHOOK_URL,
        application: 'https://other.example/hook'
      },
      subscribed: [{ app_name: 'SmartKocluk' }],
      displayPhone: '+90 850 303 40 14',
      tokenValid: true
    });
    expect(s.bound_to_production).toBe(true);
    expect(s.company_line).toBe(COMPANY_WA_DISPLAY);
    expect(s.company_digits).toBe(COMPANY_WA_DIGITS);
    expect(s.callbacks.effective_is_ours).toBe(true);
  });

  it('is not bound when Meta still points at another host', () => {
    const s = summarizeInboundBind({
      phoneWebhook: { application: 'https://old-ngrok.example/webhook' },
      subscribed: [{ app_name: 'SmartKocluk' }],
      tokenValid: true
    });
    expect(s.bound_to_production).toBe(false);
    expect(s.callbacks.effective_is_ours).toBe(false);
    expect(s.hint).toMatch(/başka URL/i);
  });

  it('flags missing subscribed apps', () => {
    const s = summarizeInboundBind({
      phoneWebhook: { application: PRODUCTION_WEBHOOK_URL },
      subscribed: [],
      tokenValid: true
    });
    expect(s.bound_to_production).toBe(false);
    expect(s.hint).toMatch(/subscribed_apps/i);
  });
});
