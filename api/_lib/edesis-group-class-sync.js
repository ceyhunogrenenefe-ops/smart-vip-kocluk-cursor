/**
 * Grup dersi sınıfları (9–12 / YKS) → Edesis şube eşitlemesi.
 *
 * Platformdaki her aktif grup sınıfı bir Edesis şubesine (classroom) eşlenir.
 * Sınıftaki aktif öğrenciler:
 *   - Edesis'te yoksa: aynı ad / e-posta ile aranır; bulunamazsa hedef şubeye oluşturulur.
 *   - Edesis'te varsa ama farklı şubede / dönemdeyse: hedef döneme + şubeye taşınır.
 *   - Zaten doğru yerdeyse: dokunulmaz.
 *
 * buildGroupClassSyncPlan() hiçbir şey değiştirmez (önizleme).
 * applyGroupClassSyncPlan() planı uygular.
 */
import { supabaseAdmin } from './supabase-admin.js';
import {
  fetchEdesisClassroomsList,
  fetchEdesisStudentsList,
  fetchEdesisTermsList,
  getEdesisConfig,
  studentMatchKeysFromEdesisRow
} from './edesis-client.js';
import {
  EDESIS_AUTO_ENROLL_INSTITUTION_ID,
  EDESIS_TERM_REGULAR_NAME,
  EDESIS_TERM_REGULAR_ID_FALLBACK,
  createEdesisStudentWithFallback,
  findInTermRows,
  moveStudentToTerm,
  persistLink,
  pickCreatedEdesisId,
  studentToPending
} from './edesis-auto-enroll.js';

const INACTIVE = new Set(['withdrawn', 'cancelled', 'canceled', 'passive', 'inactive', 'archived', 'frozen']);
const SKIP_CLASS = /kay[ıi]t\s*sil|özel\s*ders|ozel\s*ders|yaz\s*kamp|yös|yos\b|\bsat\b/i;
const SKIP_ROOM = /bursluluk|kay[ıi]t sil|sömestr|somestr|yaz kamp|kitap okuma|atolye|atölye|deneme klub|premium|özel ?ders|^özel$/i;

function fold(s) {
  return String(s || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Platform sınıfının Edesis sınıf seviyesi: 9, 10, 11, 12 (YKS/TYT/AYT/mezun → 12). */
export function gradeOfPlatformClass(cls) {
  const lvl = String(cls?.class_level || '').toLocaleUpperCase('tr');
  if (/YKS|TYT|AYT|MEZUN/.test(lvl)) return '12';
  const n = parseInt(lvl, 10);
  if (n >= 9 && n <= 12) return String(n);
  const m = String(cls?.name || '').match(/\b(9|10|11|12)\b/);
  return m ? m[1] : '';
}

/** Şube harfi: branch alanı ya da addaki "10 A", "9-A", "11B" kalıbı. */
export function letterOfPlatformClass(cls) {
  const b = String(cls?.branch || '').trim().toLocaleUpperCase('tr');
  const name = String(cls?.name || '').toLocaleUpperCase('tr');
  const m = name.match(/\b(?:9|10|11|12)\s*[-.]?\s*([A-H])\b/);
  if (m) return m[1];
  if (/^[A-H]$/.test(b) && !/YKS|TYT|AYT/.test(String(cls?.class_level || '').toLocaleUpperCase('tr'))) return b;
  return '';
}

function roomLetter(room) {
  const n = String(room?.name || '').trim().toLocaleUpperCase('tr');
  if (/^[A-H]$/.test(n)) return n;
  const m = n.match(/\b(?:9|10|11|12)\s*[-.]?\s*([A-H])\b/) || n.match(/^([A-H])\b/) || n.match(/\b([A-H])\s*(?:SINIFI?|ŞUBE|SUBE)?$/);
  return m ? m[1] : '';
}

function roomGrade(room) {
  const g = String(room?.gradeName || '').trim().toUpperCase();
  const m = g.match(/^(9|10|11|12)/);
  return m ? m[1] : '';
}

function roomIsSummer(room) {
  return /Y$/i.test(String(room?.gradeName || '').trim()) || /yaz/i.test(`${room?.name || ''} ${room?.fullName || ''}`);
}

function roomLabel(room) {
  if (!room) return null;
  return { id: room.id, name: room.fullName || room.name, gradeName: room.gradeName || null };
}

/**
 * Platform sınıfına en uygun Edesis şubesi.
 * Öncelik: aynı ada benzeyen şube → aynı seviye + harf → seviyenin tek şubesi.
 */
export function matchEdesisRoomForClass(cls, rooms) {
  const grade = gradeOfPlatformClass(cls);
  const letter = letterOfPlatformClass(cls);
  const usable = (rooms || []).filter(
    (r) => r?.id != null && !SKIP_ROOM.test(`${r.name || ''} ${r.fullName || ''}`) && !roomIsSummer(r)
  );
  const clsKey = fold(cls?.name).replace(/\b2026\b|\b2027\b|\bdonem\b|\bsinifi?\b/g, ' ').replace(/\s+/g, ' ').trim();
  // 1) Ad benzerliği (ör. "YILDIZLAR YKS GRUBU")
  if (clsKey) {
    const words = clsKey.split(' ').filter((w) => w.length >= 4);
    if (words.length) {
      const named = usable.filter((r) => {
        const k = fold(`${r.name || ''} ${r.fullName || ''}`);
        return words.every((w) => k.includes(w));
      });
      if (named.length === 1) return { room: named[0], how: 'name' };
    }
  }
  const inGrade = usable.filter((r) => roomGrade(r) === grade);
  if (letter) {
    const byLetter = inGrade.filter((r) => roomLetter(r) === letter);
    if (byLetter.length >= 1) {
      return { room: byLetter.sort((a, b) => Number(b.id) - Number(a.id))[0], how: 'grade_letter' };
    }
    return { room: null, how: 'no_room_for_letter', grade, letter };
  }
  if (inGrade.length === 1) return { room: inGrade[0], how: 'single_in_grade' };
  return { room: null, how: inGrade.length ? 'ambiguous' : 'no_room_for_grade', grade, letter };
}

function rowId(row) {
  const keys = studentMatchKeysFromEdesisRow(row);
  return String(keys.edesisStudentId || row?.id || '').trim();
}

function rowRoomId(row) {
  const id = row?.classroomId ?? row?.ClassroomId ?? row?.subeId ?? row?.subeID ?? row?.classroom?.id;
  return id == null || id === '' ? '' : String(id);
}

function pickRegularTerm(terms) {
  const list = Array.isArray(terms) ? terms : [];
  const want = EDESIS_TERM_REGULAR_NAME.toLocaleUpperCase('tr');
  const hit =
    list.find((t) => String(t?.name || '').trim().toLocaleUpperCase('tr') === want) ||
    list.find((t) => {
      const n = String(t?.name || '').toLocaleUpperCase('tr');
      return n.includes('2026') && n.includes('2027') && !n.includes('YAZ');
    });
  return hit?.id ? { id: hit.id, name: String(hit.name) } : { id: EDESIS_TERM_REGULAR_ID_FALLBACK, name: EDESIS_TERM_REGULAR_NAME };
}

async function loadPlatformClasses(institutionId) {
  const { data: classes, error } = await supabaseAdmin
    .from('classes')
    .select('id, name, class_level, branch')
    .eq('institution_id', institutionId);
  if (error) throw error;
  const targets = (classes || []).filter((c) => gradeOfPlatformClass(c) && !SKIP_CLASS.test(`${c.name} ${c.class_level}`));
  if (!targets.length) return { targets: [], members: [] };
  const { data: members, error: me } = await supabaseAdmin
    .from('class_students')
    .select('class_id, student_id')
    .in('class_id', targets.map((c) => c.id));
  if (me) throw me;
  const ids = [...new Set((members || []).map((m) => m.student_id).filter(Boolean))];
  let students = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error: se } = await supabaseAdmin
      .from('students')
      .select('id, name, email, phone, class_level, branch, school, parent_name, parent_phone, birth_date, tc_identity_no, edesis_ogrenci_id, enrollment_status, deleted_at')
      .in('id', ids.slice(i, i + 200));
    if (se) throw se;
    students = students.concat(data || []);
  }
  const byId = new Map(
    students
      .filter((s) => !s.deleted_at && !INACTIVE.has(String(s.enrollment_status || '').toLowerCase()))
      .map((s) => [String(s.id), s])
  );
  return { targets, members: (members || []).filter((m) => byId.has(String(m.student_id))), studentsById: byId };
}

/**
 * Bir öğrenci birden çok hedef sınıftaysa (ör. "9-A" + "9. sınıf matematik"),
 * şube harfi olan sınıf asıl sınıf sayılır.
 */
function primaryClassPerStudent(targets, members) {
  const clsById = new Map(targets.map((c) => [String(c.id), c]));
  const out = new Map();
  for (const m of members) {
    const cls = clsById.get(String(m.class_id));
    if (!cls) continue;
    const sid = String(m.student_id);
    const prev = out.get(sid);
    if (!prev) {
      out.set(sid, { primary: cls, others: [] });
      continue;
    }
    const better = letterOfPlatformClass(cls) && !letterOfPlatformClass(prev.primary);
    if (better) out.set(sid, { primary: cls, others: [...prev.others, prev.primary] });
    else prev.others.push(cls);
  }
  return out;
}

export async function buildGroupClassSyncPlan({ institutionId = EDESIS_AUTO_ENROLL_INSTITUTION_ID } = {}) {
  const cfg = getEdesisConfig();
  if (!cfg.apiKey) throw new Error('EDESIS_API_KEY_missing');

  const [{ targets, members, studentsById }, roomsRes, termsRes] = await Promise.all([
    loadPlatformClasses(institutionId),
    fetchEdesisClassroomsList(),
    fetchEdesisTermsList()
  ]);
  const rooms = roomsRes.rows || [];
  const terms = termsRes.rows || [];
  const term = pickRegularTerm(terms);

  // Hedef dönemdeki öğrenciler + diğer dönemler (eşleşme için)
  const termStudents = (await fetchEdesisStudentsList({}, { TermId: term.id })).rows || [];
  const otherTerms = terms.filter((t) => t?.id != null && String(t.id) !== String(term.id)).slice(0, 6);
  const otherLists = await Promise.all(
    otherTerms.map((t) =>
      fetchEdesisStudentsList({}, { TermId: t.id })
        .then((r) => ({ term: t, rows: r.rows || [] }))
        .catch(() => ({ term: t, rows: [] }))
    )
  );
  const termById = new Map(termStudents.map((r) => [rowId(r), r]));
  const otherById = new Map();
  for (const { term: t, rows } of otherLists) {
    for (const r of rows) {
      const id = rowId(r);
      if (id && !otherById.has(id)) otherById.set(id, { row: r, term: { id: t.id, name: t.name } });
    }
  }
  const allOtherRows = otherLists.flatMap((x) => x.rows);

  const classMap = targets.map((cls) => {
    const m = matchEdesisRoomForClass(cls, rooms);
    return {
      classId: cls.id,
      className: cls.name,
      grade: gradeOfPlatformClass(cls),
      letter: letterOfPlatformClass(cls),
      room: roomLabel(m.room),
      how: m.how,
      studentCount: members.filter((x) => String(x.class_id) === String(cls.id)).length
    };
  });
  const roomByClass = new Map(classMap.map((c) => [String(c.classId), c.room]));

  const perStudent = primaryClassPerStudent(targets, members);
  const items = [];
  for (const [sid, { primary, others }] of perStudent) {
    const st = studentsById.get(sid);
    const room = roomByClass.get(String(primary.id));
    const base = {
      studentId: sid,
      name: st.name,
      className: primary.name,
      alsoIn: others.map((o) => o.name),
      targetRoom: room
    };
    if (!room?.id) {
      items.push({ ...base, action: 'skip', reason: 'edesis_sube_bulunamadi' });
      continue;
    }
    let edesisId = String(st.edesis_ogrenci_id || '').trim();
    let matchMethod = edesisId ? 'linked' : null;
    if (!edesisId) {
      const pending = studentToPending(st);
      const hit = findInTermRows(termStudents, pending) || findInTermRows(allOtherRows, pending);
      if (hit?.edesisStudentId) {
        edesisId = hit.edesisStudentId;
        matchMethod = hit.matchMethod;
      }
    }
    if (!edesisId) {
      items.push({ ...base, action: 'create' });
      continue;
    }
    const inTerm = termById.get(edesisId);
    if (inTerm) {
      const cur = rowRoomId(inTerm);
      if (cur && cur === String(room.id)) {
        items.push({ ...base, edesisStudentId: edesisId, matchMethod, action: matchMethod === 'linked' ? 'ok' : 'link' });
      } else {
        const curRoom = rooms.find((r) => String(r.id) === cur);
        items.push({
          ...base,
          edesisStudentId: edesisId,
          matchMethod,
          action: 'move',
          fromRoom: roomLabel(curRoom) || (cur ? { id: cur, name: `#${cur}` } : null),
          fromTerm: { id: term.id, name: term.name }
        });
      }
      continue;
    }
    const other = otherById.get(edesisId);
    const curRoomId = other ? rowRoomId(other.row) : '';
    items.push({
      ...base,
      edesisStudentId: edesisId,
      matchMethod,
      action: 'move',
      fromRoom: roomLabel(rooms.find((r) => String(r.id) === curRoomId)),
      fromTerm: other?.term || null
    });
  }

  const order = { create: 0, move: 1, link: 2, skip: 3, ok: 4 };
  items.sort((a, b) => order[a.action] - order[b.action] || String(a.className).localeCompare(String(b.className), 'tr') || String(a.name).localeCompare(String(b.name), 'tr'));
  const summary = items.reduce((acc, it) => ({ ...acc, [it.action]: (acc[it.action] || 0) + 1 }), {});
  return { ok: true, term, classes: classMap, items, summary, totalStudents: items.length };
}

/**
 * Planı uygular. Sunucu süre sınırı (120 sn) için her çağrıda en fazla `limit`
 * öğrenci işlenir; plan her çağrıda yeniden hesaplandığı için tekrar çağırmak güvenlidir.
 */
export async function applyGroupClassSyncPlan(opts = {}) {
  const limit = Math.max(1, Math.min(40, Number(opts.limit) || 15));
  const plan = await buildGroupClassSyncPlan(opts);
  const term = plan.term;
  const results = [];
  const todo = plan.items.filter((it) => it.action !== 'ok' && it.action !== 'skip');
  for (const it of todo.slice(0, limit)) {
    try {
      if (it.action === 'link') {
        await persistLink(it.studentId, it.edesisStudentId);
        results.push({ ...it, done: true });
        continue;
      }
      if (it.action === 'move') {
        if (it.matchMethod !== 'linked') await persistLink(it.studentId, it.edesisStudentId);
        const moved = await moveStudentToTerm(it.edesisStudentId, term, it.targetRoom);
        results.push({ ...it, done: moved.ok, error: moved.ok ? undefined : moved.error });
        continue;
      }
      if (it.action === 'create') {
        const { data: st } = await supabaseAdmin
          .from('students')
          .select('id, name, email, phone, class_level, branch, school, parent_name, parent_phone, birth_date, tc_identity_no')
          .eq('id', it.studentId)
          .maybeSingle();
        const created = await createEdesisStudentWithFallback(studentToPending(st || {}), it.targetRoom.id, getEdesisConfig(), term.id);
        const newId = pickCreatedEdesisId(created);
        if (newId) await persistLink(it.studentId, newId);
        results.push({ ...it, done: Boolean(newId), edesisStudentId: newId || undefined, error: newId ? undefined : 'create_no_id' });
      }
    } catch (e) {
      results.push({ ...it, done: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  const done = results.filter((r) => r.done).length;
  return {
    ok: true,
    term,
    applied: results.length,
    done,
    failed: results.length - done,
    remaining: Math.max(0, todo.length - results.length),
    results,
    before: plan.summary
  };
}
