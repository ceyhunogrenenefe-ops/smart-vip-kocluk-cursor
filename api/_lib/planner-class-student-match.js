/** Planlayıcı: öğrenci ↔ canlı sınıf eşlemesi (class_students + seviye/şube). */

export function normClassLevel(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number' && Number.isFinite(v)) {
    const n = Math.trunc(v);
    if (n >= 3 && n <= 12) return String(n);
    return '';
  }
  const s = String(v).trim();
  if (!s) return '';
  const u = s.toUpperCase();
  if (u === 'LGS') return 'LGS';
  if (u === 'YOS' || u === 'YÖS') return 'YOS';
  if (s === 'TYT-Maarif') return 'TYT-Maarif';
  if (s.startsWith('YKS-')) return s;
  const n = parseInt(s, 10);
  if (!Number.isNaN(n) && n >= 3 && n <= 12) return String(n);
  return s;
}

export function normBranchKey(v, classLevel) {
  let s = String(v || '').trim();
  if (!s) return '';
  const cl = String(classLevel || '')
    .trim()
    .toUpperCase();
  let u = s.toUpperCase().replace(/\s+/g, ' ').trim();
  if (cl) {
    if (u.startsWith(`${cl} `)) u = u.slice(cl.length).trim();
    else if (u.startsWith(`${cl}-`)) u = u.slice(cl.length + 1).trim();
    else if (u.startsWith(`${cl}_`)) u = u.slice(cl.length + 1).trim();
    else if (u === cl) u = '';
  }
  return u;
}

export function classLevelsMatch(a, b) {
  const na = normClassLevel(a);
  const nb = normClassLevel(b);
  return Boolean(na && nb && na === nb);
}

export function branchesMatch(studentSchool, classBranch, classLevel) {
  const gb = normBranchKey(classBranch, classLevel);
  if (!gb) return true;
  const ss = normBranchKey(studentSchool, classLevel);
  if (!ss) return false;
  return ss === gb;
}

/** class_students + aynı sınıf seviyesi/şube ile eşleşen sınıflar */
export function inferClassIdsForStudent(student, classes) {
  const sid = String(student?.id || '').trim();
  if (!sid) return [];
  const out = new Set((student?.class_ids || []).map((x) => String(x)).filter(Boolean));
  const gl = normClassLevel(student?.class_level);
  if (!gl) return [...out];

  for (const cls of classes || []) {
    const cid = String(cls?.id || '').trim();
    if (!cid) continue;
    if (!classLevelsMatch(gl, cls.class_level)) continue;
    if (!branchesMatch(student?.school, cls.branch, cls.class_level)) continue;
    out.add(cid);
  }
  return [...out];
}
