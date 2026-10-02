/**
 * Öğretmen aylık beyanı — dönem hesabı ve sistem kayıtlarıyla karşılaştırma.
 *
 * Beyan sistem kaydının yerine geçmez. Ders ve etüt kayıtları
 * (class_sessions / teacher_lessons) ana gerçek kaynaktır; öğretmenin beyanı
 * ayrı tutulur ve ikisi yan yana konur. Fark varsa yöneticinin bakması için
 * işaretlenir, otomatik olarak hiçbiri diğerini ezmez.
 */

export const DECLARATION_KINDS = [
  { id: 'group', label: 'Grup Dersi', unit: 'ders', comparable: true },
  { id: 'private', label: 'Özel Ders', unit: 'ders', comparable: true },
  { id: 'guidance', label: 'Rehberlik', unit: 'görüşme', comparable: false },
  { id: 'etut', label: 'Etüt', unit: 'saat', comparable: false },
  { id: 'yazili', label: 'Yazılıya Hazırlık', unit: 'saat', comparable: false },
  { id: 'telafi', label: 'Telafi Dersi', unit: 'ders', comparable: false },
  { id: 'deneme', label: 'Deneme Görevi', unit: 'adet', comparable: false },
  { id: 'arama', label: 'Arama Çalışması', unit: 'arama', comparable: false },
  { id: 'other', label: 'Diğer Çalışma', unit: 'adet', comparable: false }
];

export const DECLARATION_STATUSES = [
  { id: 'pending', label: 'Form Bekleniyor', dot: '⚪' },
  { id: 'opened', label: 'Form Açıldı', dot: '🟡' },
  { id: 'submitted', label: 'Form Geldi', dot: '🟢' },
  { id: 'reopened', label: 'Düzeltmeye Açıldı', dot: '🟠' }
];

const TR_MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
];

function pad(n) {
  return String(n).padStart(2, '0');
}

/**
 * Ayın 1'inde gönderilen form BİR ÖNCEKİ ayın çalışmasını ister.
 * 1 Kasım 2026'da açılan form → Ekim 2026.
 * @returns {string} dönemin ilk günü, 'YYYY-MM-01'
 */
export function previousPeriod(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const base = isNaN(d.getTime()) ? new Date() : d;
  const y = base.getFullYear();
  const m = base.getMonth(); // 0-11, bir önceki ay = m-1 → getMonth zaten 0 tabanlı
  const prev = new Date(y, m - 1, 1);
  return `${prev.getFullYear()}-${pad(prev.getMonth() + 1)}-01`;
}

/** Dönemin ilk ve son günü — sistem kayıtlarını tararken kullanılır. */
export function periodRange(period) {
  const [y, m] = String(period || '').split('-').map(Number);
  if (!y || !m) return null;
  const last = new Date(y, m, 0).getDate();
  return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(last)}` };
}

/** "2026-10-01" → "Ekim 2026" */
export function periodLabel(period) {
  const [y, m] = String(period || '').split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return String(period || '');
  return `${TR_MONTHS[m - 1]} ${y}`;
}

/** Beyan satırlarını türüne göre toplar. */
export function sumByKind(lines) {
  const out = {};
  for (const k of DECLARATION_KINDS) out[k.id] = 0;
  for (const l of lines || []) {
    const kind = String(l?.kind || '').trim();
    if (!(kind in out)) continue;
    const q = Number(l?.quantity);
    if (!isFinite(q)) continue;
    out[kind] = Math.round((out[kind] + q) * 100) / 100;
  }
  return out;
}

/**
 * Tek bir kalemin karşılaştırması.
 *
 * `comparable: false` olan türlerde (rehberlik, etüt, arama…) sistemde
 * güvenilir karşılık yok; fark "uyuşmazlık" sayılmaz, bilgi olarak geçilir.
 * Yoksa her öğretmen her ay kırmızı görünür ve uyarı anlamını yitirir.
 */
export function compareValue(kind, declared, system) {
  const meta = DECLARATION_KINDS.find((k) => k.id === kind) || null;
  const d = Number(declared) || 0;
  const s = Number(system) || 0;
  const diff = Math.round((d - s) * 100) / 100;
  if (!meta || !meta.comparable) {
    return { kind, declared: d, system: s, diff, comparable: false, state: 'info' };
  }
  return {
    kind,
    declared: d,
    system: s,
    diff,
    comparable: true,
    state: diff === 0 ? 'match' : 'mismatch'
  };
}

/**
 * Toplam karşılaştırma tablosu.
 * @param {Array} lines beyan satırları
 * @param {{group:number, private:number, guidance:number}} systemTotals
 */
export function compareTotals(lines, systemTotals = {}) {
  const declared = sumByKind(lines);
  const rows = DECLARATION_KINDS.map((k) =>
    Object.assign(compareValue(k.id, declared[k.id], systemTotals[k.id]), {
      label: k.label,
      unit: k.unit
    })
  ).filter((r) => r.declared > 0 || r.system > 0);

  const mismatches = rows.filter((r) => r.state === 'mismatch');
  return {
    rows,
    declared_total: Math.round(Object.values(declared).reduce((a, b) => a + b, 0) * 100) / 100,
    system_total:
      Math.round(
        (Number(systemTotals.group || 0) +
          Number(systemTotals.private || 0) +
          Number(systemTotals.guidance || 0)) * 100
      ) / 100,
    mismatch_count: mismatches.length,
    // Karşılaştırılabilir kalemlerin tamamı tutuyorsa uyumlu
    state: mismatches.length ? 'mismatch' : 'match'
  };
}

/**
 * Satır bazlı karşılaştırma: sınıf sınıf, öğrenci öğrenci.
 *
 * Beyanda olup sistemde olmayan ve sistemde olup beyanda olmayan kalemler de
 * listelenir — yalnız kesişime bakmak eksik beyanı gizlerdi.
 *
 * @param {Array} lines beyan satırları (kind + class_id/student_id + quantity)
 * @param {Array} systemRows [{ kind, class_id, student_id, label, quantity }]
 */
export function compareDetails(lines, systemRows) {
  const key = (r) =>
    `${r.kind}|${String(r.class_id || r.student_id || r.label || '').trim().toLocaleLowerCase('tr')}`;

  const map = new Map();
  const ensure = (r) => {
    const k = key(r);
    if (!map.has(k)) {
      map.set(k, {
        kind: r.kind,
        class_id: r.class_id || null,
        student_id: r.student_id || null,
        label: r.label || '',
        declared: 0,
        system: 0
      });
    }
    const cur = map.get(k);
    if (!cur.label && r.label) cur.label = r.label;
    return cur;
  };

  for (const l of lines || []) {
    if (!DECLARATION_KINDS.some((k) => k.id === l?.kind)) continue;
    ensure(l).declared += Number(l.quantity) || 0;
  }
  for (const s of systemRows || []) {
    if (!DECLARATION_KINDS.some((k) => k.id === s?.kind)) continue;
    ensure(s).system += Number(s.quantity) || 0;
  }

  return [...map.values()]
    .map((r) => {
      const c = compareValue(r.kind, Math.round(r.declared * 100) / 100, Math.round(r.system * 100) / 100);
      return { ...r, declared: c.declared, system: c.system, diff: c.diff, comparable: c.comparable, state: c.state };
    })
    .sort((a, b) => {
      // Önce dikkat isteyenler
      if (a.state !== b.state) return a.state === 'mismatch' ? -1 : b.state === 'mismatch' ? 1 : 0;
      return String(a.label).localeCompare(String(b.label), 'tr');
    });
}

/** Özet kutuları. */
export function summarizeDeclarations(rows) {
  const out = { total: 0, submitted: 0, pending: 0, opened: 0, mismatch: 0, match: 0 };
  for (const r of rows || []) {
    out.total += 1;
    const st = String(r?.status || 'pending');
    if (st === 'submitted' || st === 'reopened') out.submitted += 1;
    else if (st === 'opened') out.opened += 1;
    else out.pending += 1;
    if (st === 'submitted' || st === 'reopened') {
      if (r?.comparison?.state === 'mismatch') out.mismatch += 1;
      else out.match += 1;
    }
  }
  return out;
}
