/**
 * Testler için bellek içi Supabase istemcisi — yalnız Reklam Videoları modülünün
 * kullandığı sorgu alt kümesi (eq/in/is/gt/gte/lt/lte/order/limit/single/maybeSingle,
 * insert/update/upsert/delete, count head) ve tekil kısıtlar.
 */
import crypto from 'crypto';

const DEFAULTS = {
  ad_video_tasks: () => ({ status: 'planned', deleted_at: null }),
  ad_video_submissions: () => ({ review_status: 'pending', is_revision: false, kind: 'raw', open_for_comments: false }),
  ad_video_settings: () => ({
    editor_user_ids: [],
    drive_upload_enabled: false,
    daily_summary_enabled: true,
    daily_summary_time: '18:00',
    daily_summary_days: [1, 2, 3, 4, 5]
  }),
  ad_video_upload_sessions: () => ({ completed_at: null })
};

const UNIQUE = {
  ad_video_notification_log: [['event_key', 'recipient_id']],
  ad_video_submissions: [['task_id', 'kind', 'version']],
  ad_video_settings: [['institution_id']]
};

const PK = { ad_video_settings: 'institution_id' };

function cmp(a, b) {
  if (a === b) return 0;
  return String(a) < String(b) ? -1 : 1;
}

export function createFakeSupabase(seed = {}) {
  const db = {};
  for (const [t, rows] of Object.entries(seed)) db[t] = rows.map((r) => ({ ...r }));
  const table = (t) => (db[t] ||= []);

  class Q {
    constructor(t) {
      this.t = t;
      this.op = 'select';
      this.filters = [];
      this.orders = [];
      this.lim = null;
      this.mode = null;
      this.returning = false;
      this.countMode = null;
      this.head = false;
    }
    select(_cols, opts = {}) {
      if (this.op === 'select') {
        this.countMode = opts.count || null;
        this.head = Boolean(opts.head);
      } else this.returning = true;
      return this;
    }
    insert(rows) {
      this.op = 'insert';
      this.payload = Array.isArray(rows) ? rows : [rows];
      return this;
    }
    update(patch) {
      this.op = 'update';
      this.payload = patch;
      return this;
    }
    upsert(rows, opts = {}) {
      this.op = 'upsert';
      this.payload = Array.isArray(rows) ? rows : [rows];
      this.opts = opts;
      return this;
    }
    delete() {
      this.op = 'delete';
      return this;
    }
    _f(fn) {
      this.filters.push(fn);
      return this;
    }
    eq(c, v) {
      return this._f((r) => r[c] !== null && r[c] !== undefined && String(r[c]) === String(v));
    }
    neq(c, v) {
      return this._f((r) => String(r[c]) !== String(v));
    }
    in(c, arr) {
      const s = new Set(arr.map(String));
      return this._f((r) => r[c] !== null && r[c] !== undefined && s.has(String(r[c])));
    }
    is(c, v) {
      return this._f((r) => (v === null ? r[c] === null || r[c] === undefined : r[c] === v));
    }
    gt(c, v) {
      return this._f((r) => r[c] != null && cmp(r[c], v) > 0);
    }
    gte(c, v) {
      return this._f((r) => r[c] != null && cmp(r[c], v) >= 0);
    }
    lt(c, v) {
      return this._f((r) => r[c] != null && cmp(r[c], v) < 0);
    }
    lte(c, v) {
      return this._f((r) => r[c] != null && cmp(r[c], v) <= 0);
    }
    order(c, { ascending = true } = {}) {
      this.orders.push([c, ascending]);
      return this;
    }
    limit(n) {
      this.lim = n;
      return this;
    }
    maybeSingle() {
      this.mode = 'maybe';
      return this;
    }
    single() {
      this.mode = 'single';
      return this;
    }
    _match() {
      return table(this.t).filter((r) => this.filters.every((f) => f(r)));
    }
    _uniqueViolation(row, ignore) {
      for (const cols of UNIQUE[this.t] || []) {
        const hit = table(this.t).find((r) => r !== ignore && cols.every((c) => String(r[c]) === String(row[c])));
        if (hit) return hit;
      }
      return null;
    }
    _prepare(row) {
      const base = (DEFAULTS[this.t] || (() => ({})))();
      const out = { ...base, ...row };
      if (!PK[this.t] && !out.id) out.id = crypto.randomUUID();
      if (!out.created_at) out.created_at = new Date().toISOString();
      return structuredClone(out);
    }
    _exec() {
      let rows = [];
      if (this.op === 'select') {
        rows = this._match();
      } else if (this.op === 'insert') {
        const prepared = this.payload.map((r) => this._prepare(r));
        for (const r of prepared) {
          if (this._uniqueViolation(r)) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
        }
        table(this.t).push(...prepared);
        rows = prepared;
      } else if (this.op === 'update') {
        rows = this._match();
        for (const r of rows) Object.assign(r, structuredClone(this.payload));
      } else if (this.op === 'upsert') {
        const cols = String(this.opts.onConflict || 'id').split(',');
        for (const p of this.payload) {
          const hit = table(this.t).find((r) => cols.every((c) => String(r[c]) === String(p[c])));
          if (hit) {
            if (!this.opts.ignoreDuplicates) Object.assign(hit, structuredClone(p));
            rows.push(hit);
          } else {
            const n = this._prepare(p);
            table(this.t).push(n);
            rows.push(n);
          }
        }
      } else if (this.op === 'delete') {
        rows = this._match();
        db[this.t] = table(this.t).filter((r) => !rows.includes(r));
      }

      for (const [c, asc] of [...this.orders].reverse()) {
        rows = [...rows].sort((a, b) => (asc ? 1 : -1) * cmp(a[c] ?? '', b[c] ?? ''));
      }
      if (this.lim != null) rows = rows.slice(0, this.lim);
      const out = rows.map((r) => structuredClone(r));

      if (this.op === 'select' && this.head) return { data: null, count: out.length, error: null };
      if (this.op !== 'select' && !this.returning && !this.mode) return { data: null, error: null };
      if (this.mode === 'single') {
        if (out.length !== 1) return { data: null, error: { code: 'PGRST116', message: 'expected one row' } };
        return { data: out[0], error: null };
      }
      if (this.mode === 'maybe') return { data: out[0] || null, error: null };
      return { data: out, error: null, count: this.countMode ? out.length : null };
    }
    then(resolve, reject) {
      try {
        resolve(this._exec());
      } catch (e) {
        reject(e);
      }
    }
  }

  return {
    db,
    from: (t) => new Q(t)
  };
}
