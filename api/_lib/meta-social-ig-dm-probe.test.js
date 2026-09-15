import assert from 'node:assert/strict';
import { probeInstagramDmCapability } from './meta-social-inbound.js';

assert.equal(typeof probeInstagramDmCapability, 'function');
const empty = await probeInstagramDmCapability({ pageToken: '' });
assert.equal(empty.likely_cause, 'missing_page_token');
console.log('meta-social-ig-dm-probe tests ok');
