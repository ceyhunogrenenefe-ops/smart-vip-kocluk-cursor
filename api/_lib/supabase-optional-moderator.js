import { supabaseAdmin } from './supabase-admin.js';

/** Eski prod şemasında eksik olabilen kolonlar — insert/update hata verirse kademeli düşürülür. */
const OPTIONAL_INSERT_COLUMNS = [
  'meeting_link_moderator',
  'schedule_batch_id',
  'bbb_meeting_id',
  'bbb_attendee_pw',
  'recording_link'
];

function errorText(err) {
  return `${err?.message || ''} ${err?.details || ''} ${err?.hint || ''}`;
}

function columnFromSchemaError(err) {
  const m = errorText(err);
  const match = m.match(/Could not find the '([^']+)' column/i);
  return match ? match[1] : null;
}

function missingOptionalColumn(err) {
  const m = errorText(err);
  if (/PGRST204|schema cache/i.test(m)) return true;
  return OPTIONAL_INSERT_COLUMNS.some((col) => m.includes(col));
}

export function stripModeratorField(row) {
  return stripOptionalInsertFields(row, ['meeting_link_moderator']);
}

function stripOptionalInsertFields(row, columns = OPTIONAL_INSERT_COLUMNS) {
  if (!row || typeof row !== 'object') return row;
  const out = { ...row };
  for (const col of columns) delete out[col];
  return out;
}

function rowHasAnyOptionalField(row, columns = OPTIONAL_INSERT_COLUMNS) {
  if (!row || typeof row !== 'object') return false;
  return columns.some((col) => row[col] != null && row[col] !== '');
}

async function insertWithOptionalFallback(table, rows, single) {
  const list = Array.isArray(rows) ? rows : [rows];
  let current = list;
  for (let attempt = 0; attempt < OPTIONAL_INSERT_COLUMNS.length + 1; attempt++) {
    const result = single
      ? await supabaseAdmin.from(table).insert(current[0]).select('*').maybeSingle()
      : await supabaseAdmin.from(table).insert(current).select('*');
    if (!result.error) return result;

    const missingCol = columnFromSchemaError(result.error);
    if (missingCol && current.some((r) => r && missingCol in r)) {
      current = current.map((r) => {
        if (!r || !(missingCol in r)) return r;
        const o = { ...r };
        delete o[missingCol];
        return o;
      });
      continue;
    }

    if (!missingOptionalColumn(result.error) || !current.some((r) => rowHasAnyOptionalField(r))) {
      return result;
    }
    const next = current.map((r) => stripOptionalInsertFields(r));
    const unchanged = next.every((r, i) => JSON.stringify(r) === JSON.stringify(current[i]));
    if (unchanged) return result;
    current = next;
  }
  return single
    ? await supabaseAdmin.from(table).insert(stripOptionalInsertFields(list[0])).select('*').maybeSingle()
    : await supabaseAdmin.from(table).insert(list.map(stripOptionalInsertFields)).select('*');
}

export async function insertOneOptionalModerator(table, row) {
  return insertWithOptionalFallback(table, row, true);
}

export async function insertManyOptionalModerator(table, rows) {
  return insertWithOptionalFallback(table, rows, false);
}
