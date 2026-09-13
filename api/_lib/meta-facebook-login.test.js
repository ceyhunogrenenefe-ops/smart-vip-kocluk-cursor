import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_META_APP_ID,
  DEFAULT_META_CONFIGURATION_ID,
  buildFacebookLoginUrl,
  parseFacebookRedirectHash,
  widgetRedirectUri,
  oauthRedirectUri
} from './meta-facebook-login.js';

describe('facebook login widget', () => {
  it('builds Login for Business code URL by default (token unsupported)', () => {
    const url = buildFacebookLoginUrl();
    assert.match(url, /facebook\.com\/v21\.0\/dialog\/oauth/);
    assert.match(url, new RegExp(`config_id=${DEFAULT_META_CONFIGURATION_ID}`));
    assert.match(url, new RegExp(`client_id=${DEFAULT_META_APP_ID}`));
    assert.match(url, /api%2Fmeta%2Ffacebook-oauth/);
    assert.match(url, /response_type=code/);
    assert.match(url, /override_default_response_type=true/);
  });

  it('builds code URL against oauth callback', () => {
    const url = buildFacebookLoginUrl({ responseType: 'code' });
    assert.match(url, /response_type=code/);
    assert.match(url, /api%2Fmeta%2Ffacebook-oauth/);
  });

  it('parses implicit hash token and errors', () => {
    const ok = parseFacebookRedirectHash('#access_token=EAA123&expires_in=3600');
    assert.equal(ok.access_token, 'EAA123');
    const err = parseFacebookRedirectHash('#error=access_denied&error_description=User%20denied');
    assert.equal(err.access_token, '');
    assert.equal(err.error, 'access_denied');
  });

  it('uses production widget and oauth redirects', () => {
    assert.equal(widgetRedirectUri(), 'https://www.dersonlinevipkocluk.com/crm/widgetler');
    assert.equal(oauthRedirectUri(), 'https://www.dersonlinevipkocluk.com/api/meta/facebook-oauth');
  });
});
