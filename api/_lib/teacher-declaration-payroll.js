/**
 * Öğretmen beyanının hakedişe bağlanması.
 *
 * Beyan, ödenecek tutarı KENDİLİĞİNDEN belirlemez. Hakediş hâlâ sistem ders
 * kayıtları üzerinden hesaplanır; beyan yanına konur ve fark varsa işaretlenir.
 * Yönetici isterse beyandaki sayıları onaylı sayıya tek işlemle aktarabilir —
 * bu bilinçli bir karardır, sessiz bir üzerine yazma değildir.
 *
 * Yalnız OKUR; beyan kayıtlarına dokunmaz.
 */
import { supabaseAdmin } from './supabase-admin.js';
import { errorMessage } from './error-msg.js';
import { sumByKind } from './teacher-declaration-core.js';

const DECL = 'teacher_month_declarations';
const LINES = 'teacher_declaration_lines';

/**
 * Hakediş dönemi tam bir takvim ayına denk geliyorsa o ayın beyanı kullanılır.
 * Yarım dönemde beyanla karşılaştırmak yanıltıcı olurdu: beyan ayın tamamını
 * kapsıyor, hakediş aralığı kapsamıyor.
 *
 * @returns {string|null} 'YYYY-MM-01' ya da null
 */
export function periodMonthForRange(from, to) {
  const f = String(from || '').trim();
  const t = String(to || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || !/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  if (f.slice(0, 7) !== t.slice(0, 7)) return null;
  if (f.slice(8) !== '01') return null;
  const [y, m] = f.split('-').map(Number);
  const sonGun = new Date(y, m, 0).getDate();
  if (Number(t.slice(8)) !== sonGun) return null;
  return `${f.slice(0, 7)}-01`;
}

/**
 * Dönemdeki beyanları öğretmen kimliğine göre döner.
 *
 * @returns {Promise<Map<string, {
 *   id: string, status: string, submitted_at: string|null,
 *   declared: { group: number, private: number, guidance: number, other: number }
 * }>>}
 */
export async function loadDeclarationsForPayroll({ from, to, institutionId = null, teacherIds = null }) {
  const out = new Map();
  const period = periodMonthForRange(from, to);
  if (!period) return out;

  try {
    let q = supabaseAdmin
      .from(DECL)
      .select('id, teacher_id, status, submitted_at, institution_id')
      .eq('period_month', period)
      .in('status', ['submitted', 'reopened'])
      .limit(1000);
    if (institutionId) q = q.eq('institution_id', institutionId);
    if (Array.isArray(teacherIds) && teacherIds.length) q = q.in('teacher_id', teacherIds);
    const { data: decls, error } = await q;
    if (error || !decls?.length) return out;

    const { data: lines } = await supabaseAdmin
      .from(LINES)
      .select('declaration_id, kind, quantity')
      .in('declaration_id', decls.map((d) => d.id));

    const byDecl = new Map();
    for (const l of lines || []) {
      if (!byDecl.has(l.declaration_id)) byDecl.set(l.declaration_id, []);
      byDecl.get(l.declaration_id).push(l);
    }

    for (const d of decls) {
      const toplam = sumByKind(byDecl.get(d.id) || []);
      out.set(String(d.teacher_id), {
        id: d.id,
        status: d.status,
        submitted_at: d.submitted_at,
        declared: {
          group: toplam.group || 0,
          private: toplam.private || 0,
          guidance: toplam.guidance || 0,
          // Etüt, telafi, yazılı gibi kalemler hakedişe doğrudan girmez;
          // yönetici gerekirse ek kalem olarak ekler
          other:
            (toplam.etut || 0) +
            (toplam.yazili || 0) +
            (toplam.telafi || 0) +
            (toplam.deneme || 0) +
            (toplam.arama || 0) +
            (toplam.other || 0)
        }
      });
    }
  } catch (e) {
    // Beyan modülü yoksa ya da okunamazsa hakediş eskisi gibi çalışsın
    console.warn('[payroll-declaration] beyan okunamadi:', errorMessage(e));
  }
  return out;
}

/** Beyan ile sistem sayısı arasında anlamlı fark var mı? */
export function declarationMismatch(declared, system) {
  if (!declared || !system) return false;
  const esit = (a, b) => Math.abs((Number(a) || 0) - (Number(b) || 0)) < 0.01;
  return !(
    esit(declared.group, system.group_units) &&
    esit(declared.private, system.private_units)
  );
}
