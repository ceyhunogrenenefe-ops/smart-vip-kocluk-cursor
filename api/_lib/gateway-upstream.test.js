import { afterEach, describe, expect, it } from 'vitest';
import {
  GATEWAY_UPSTREAM_PIN,
  PHOENIX_GATEWAY,
  resolveGatewayUpstream,
} from './gateway-upstream.js';

const saved = {
  WHATSAPP_GATEWAY_UPSTREAM: process.env.WHATSAPP_GATEWAY_UPSTREAM,
  WHATSAPP_GATEWAY_URL: process.env.WHATSAPP_GATEWAY_URL,
  WHATSAPP_GATEWAY_ALLOW_NON_PHOENIX: process.env.WHATSAPP_GATEWAY_ALLOW_NON_PHOENIX,
};

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('resolveGatewayUpstream pin', () => {
  it('pins dead Korea/Windows IP to Phoenix', () => {
    process.env.WHATSAPP_GATEWAY_UPSTREAM = 'http://27.102.132.134:4010';
    expect(resolveGatewayUpstream()).toBe(PHOENIX_GATEWAY);
    process.env.WHATSAPP_GATEWAY_UPSTREAM = '27.102.132.134:4010';
    expect(resolveGatewayUpstream()).toBe(PHOENIX_GATEWAY);
    process.env.WHATSAPP_GATEWAY_UPSTREAM = '"http://27.102.134.199:4010"';
    expect(resolveGatewayUpstream()).toBe(PHOENIX_GATEWAY);
  });

  it('keeps Phoenix and localhost', () => {
    process.env.WHATSAPP_GATEWAY_UPSTREAM = 'http://89.252.179.128:4010';
    expect(resolveGatewayUpstream()).toBe(PHOENIX_GATEWAY);
    process.env.WHATSAPP_GATEWAY_UPSTREAM = 'http://app.phoenixdms.com';
    expect(resolveGatewayUpstream()).toBe('http://app.phoenixdms.com:4010');
    process.env.WHATSAPP_GATEWAY_UPSTREAM = 'http://127.0.0.1:4010';
    expect(resolveGatewayUpstream()).toBe('http://127.0.0.1:4010');
  });

  it('defaults empty env to Phoenix', () => {
    delete process.env.WHATSAPP_GATEWAY_UPSTREAM;
    delete process.env.WHATSAPP_GATEWAY_URL;
    expect(resolveGatewayUpstream()).toBe(PHOENIX_GATEWAY);
    expect(GATEWAY_UPSTREAM_PIN).toContain('89.252.179.128');
  });

  it('does not follow a random public IP unless explicitly allowed', () => {
    process.env.WHATSAPP_GATEWAY_UPSTREAM = 'http://8.8.8.8:4010';
    delete process.env.WHATSAPP_GATEWAY_ALLOW_NON_PHOENIX;
    expect(resolveGatewayUpstream()).toBe(PHOENIX_GATEWAY);
  });
});
