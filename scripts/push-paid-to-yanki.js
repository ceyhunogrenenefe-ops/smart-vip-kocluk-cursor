#!/usr/bin/env node
/**
 * Örnek: node scripts/push-paid-to-yanki.js "Muhammed Talha Çevik"
 * Ortam: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 */
import { pushPaidOrdersToYanki } from '../api/_lib/commerce-push-paid-to-vendor.js';

const query = process.argv.slice(2).join(' ').trim() || 'Muhammed Talha Çevik';
const dryRun = process.argv.includes('--dry-run');

const out = await pushPaidOrdersToYanki({
  query: query.replace(/--dry-run/g, '').trim() || 'Muhammed Talha Çevik',
  dryRun,
  forcePending: true,
});
console.log(JSON.stringify(out, null, 2));
if (!out.ok) process.exitCode = 1;
