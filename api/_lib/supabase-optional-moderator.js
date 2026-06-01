import { supabaseAdmin } from './supabase-admin.js';

function missingModeratorColumn(err) {
  const m = `${err?.message || ''} ${err?.details || ''} ${err?.hint || ''}`;
  return /meeting_link_moderator|PGRST204|schema cache/i.test(m);
}

export function stripModeratorField(row) {
  if (!row || typeof row !== 'object') return row;
  const { meeting_link_moderator: _mod, ...rest } = row;
  return rest;
}

export async function insertOneOptionalModerator(table, row) {
  const { data, error } = await supabaseAdmin.from(table).insert(row).select('*').maybeSingle();
  if (!error || !missingModeratorColumn(error) || !row?.meeting_link_moderator) {
    return { data, error };
  }
  return supabaseAdmin.from(table).insert(stripModeratorField(row)).select('*').maybeSingle();
}

export async function insertManyOptionalModerator(table, rows) {
  const list = Array.isArray(rows) ? rows : [];
  const { data, error } = await supabaseAdmin.from(table).insert(list).select('*');
  if (!error || !missingModeratorColumn(error) || !list.some((r) => r?.meeting_link_moderator)) {
    return { data, error };
  }
  return supabaseAdmin.from(table).insert(list.map(stripModeratorField)).select('*');
}
