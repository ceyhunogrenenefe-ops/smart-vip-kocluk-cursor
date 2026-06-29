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
  let match = m.match(/Could not find the '([^']+)' column/i);
  if (match) return match[1];
  match = m.match(/column\s+[\w.]+\.(\w+)\s+does not exist/i);
  if (match) return match[1];
  match = m.match(/column\s+"?(\w+)"?\s+does not exist/i);
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

/** SELECT: isteğe bağlı kolonlar şemada yoksa yalnızca temel kolonlarla yeniden dener. */
export async function selectWithOptionalColumns(table, baseSelect, optionalColumns, applyQuery) {
  const optional = Array.isArray(optionalColumns) ? optionalColumns : OPTIONAL_INSERT_COLUMNS;
  const base = String(baseSelect || '*').trim();
  const baseCols = new Set(base.split(',').map((c) => c.trim()).filter(Boolean));
  const extra = optional.filter((c) => !baseCols.has(c));
  const select = extra.length ? `${base},${extra.join(',')}` : base;

  let q = supabaseAdmin.from(table).select(select);
  if (typeof applyQuery === 'function') q = applyQuery(q) || q;
  let result = await q;
  if (!result.error) return result;

  const missingCol = columnFromSchemaError(result.error);
  const canRetry =
    Boolean(missingCol) ||
    missingOptionalColumn(result.error) ||
    /does not exist/i.test(errorText(result.error));
  if (!canRetry) return result;

  q = supabaseAdmin.from(table).select(base);
  if (typeof applyQuery === 'function') q = applyQuery(q) || q;
  return await q;
}

/** UPDATE: isteğe bağlı kolonlar şemada yoksa kademeli düşürülür. */
export async function updateOneOptionalModerator(table, patch, eqColumn, eqValue) {
  let current = patch && typeof patch === 'object' ? { ...patch } : {};
  for (let attempt = 0; attempt < OPTIONAL_INSERT_COLUMNS.length + 2; attempt++) {
    const result = await supabaseAdmin.from(table).update(current).eq(eqColumn, eqValue);
    if (!result.error) return result;

    const missingCol = columnFromSchemaError(result.error);
    if (missingCol && missingCol in current) {
      const next = { ...current };
      delete next[missingCol];
      current = next;
      continue;
    }

    if (!missingOptionalColumn(result.error) || !rowHasAnyOptionalField(current)) {
      return result;
    }
    const next = stripOptionalInsertFields(current);
    if (JSON.stringify(next) === JSON.stringify(current)) return result;
    current = next;
  }
  return await supabaseAdmin.from(table).update(stripOptionalInsertFields(patch)).eq(eqColumn, eqValue);
}
