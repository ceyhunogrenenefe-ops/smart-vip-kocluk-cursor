/**
 * Gelişmiş grup dersi yoklama raporu (filtreler + özet istatistikler).
 * Özel ders (teacher_lessons) yoklama tablosu olmadığı için lesson_type=private i boş döner.
 */

export async function getVisibleStudentIdSet(supabaseAdmin, normalizeRole, actor, institutionId) {
  const role = normalizeRole(actor.role);
  if (role === 'super_admin') return null;
  const set = new Set();
  if (role === 'admin' && institutionId) {
    const { data: studs } = await supabaseAdmin.from('students').select('id').eq('institution_id', String(institutionId));
    for (const s of studs || []) set.add(String(s.id));
    return set;
  }
  if (role === 'coach' && actor.coach_id) {
    const { data: studs } = await supabaseAdmin
      .from('students')
      .select('id')
      .eq('coach_id', String(actor.coach_id).trim());
    for (const s of studs || []) set.add(String(s.id));
    return set;
  }
  if (role === 'teacher') {
    const { data: ct } = await supabaseAdmin.from('class_teachers').select('class_id').eq('teacher_id', actor.sub);
    const cids = (ct || []).map((r) => r.class_id).filter(Boolean);
    if (!cids.length) return set;
    const { data: cs } = await supabaseAdmin.from('class_students').select('student_id').in('class_id', cids);
    for (const r of cs || []) set.add(String(r.student_id));
    return set;
  }
  return set;
}

function qstr(q, key) {
  const raw = q[key];
  return String(Array.isArray(raw) ? raw[0] : raw || '').trim();
}

function computeStats(rows) {
  const byDayAbsent = new Map();
  const byStudentAbsent = new Map();
  const byClass = new Map();
  const byTeacher = new Map();
  for (const r of rows) {
    const d = String(r.lesson_date || '');
    if (r.status === 'absent') {
      byDayAbsent.set(d, (byDayAbsent.get(d) || 0) + 1);
      const sid = String(r.student_id || '');
      byStudentAbsent.set(sid, (byStudentAbsent.get(sid) || 0) + 1);
    }
    const cid = String(r.class_id || '');
    if (!byClass.has(cid)) {
      byClass.set(cid, {
        class_id: cid,
        class_name: r.class_name,
        present: 0,
        absent: 0,
        late: 0
      });
    }
    const c = byClass.get(cid);
    if (r.status === 'present') c.present += 1;
    else if (r.status === 'late') c.late += 1;
    else c.absent += 1;

    const tid = String(r.teacher_id || '');
    if (!byTeacher.has(tid)) {
      byTeacher.set(tid, {
        teacher_id: tid,
        teacher_name: r.teacher_name,
        marked: 0,
        present: 0,
        absent: 0,
        late: 0
      });
    }
    const t = byTeacher.get(tid);
    t.marked += 1;
    if (r.status === 'present') t.present += 1;
    else if (r.status === 'late') t.late += 1;
    else t.absent += 1;
  }

  const nameByStudent = new Map(rows.map((r) => [String(r.student_id), r.student_name]));
  const topAbsent = [...byStudentAbsent.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([student_id, absent_count]) => ({
      student_id,
      student_name: nameByStudent.get(student_id) || student_id,
      absent_count
    }));

  const class_participation = [...byClass.values()].map((c) => {
    const total = c.present + c.absent + c.late;
    return {
      ...c,
      participation_pct: total ? Math.round((c.present / total) * 1000) / 10 : 0
    };
  });

  const teacher_yoklama = [...byTeacher.values()].sort((a, b) =>
    String(a.teacher_name).localeCompare(String(b.teacher_name), 'tr')
  );

  return {
    daily_absent_by_date: Object.fromEntries([...byDayAbsent.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
    top_absent_students: topAbsent,
    class_participation,
    teacher_yoklama
  };
}

export async function buildAttendanceReport({
  supabaseAdmin,
  getManagedClassIds,
  seesAllInstitutionClasses,
  normalizeRole,
  institutionId,
  actor,
  role,
  query
}) {
  let from = qstr(query, 'from').slice(0, 10);
  let to = qstr(query, 'to').slice(0, 10);
  const absentToday = qstr(query, 'absent_today') === '1';
  if (absentToday) {
    const t = new Date().toISOString().slice(0, 10);
    from = t;
    to = t;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return { error: { status: 400, body: { error: 'from_to_invalid', hint: 'YYYY-MM-DD' } } };
  }
  if (from > to) return { error: { status: 400, body: { error: 'from_after_to' } } };

  const classIdF = qstr(query, 'class_id');
  const studentIdF = qstr(query, 'student_id');
  const sessionIdF = qstr(query, 'session_id');
  const teacherIdF = qstr(query, 'teacher_id');
  const statusFilter = (qstr(query, 'status') || 'all').toLowerCase();
  const lessonType = (qstr(query, 'lesson_type') || 'all').toLowerCase();
  const wantStats = qstr(query, 'stats') === '1';
  const scopedInst = qstr(query, 'institution_id');

  const allowedClassIds = await getManagedClassIds(actor);
  let sessQ = supabaseAdmin
    .from('class_sessions')
    .select('id,class_id,lesson_date,start_time,end_time,subject,teacher_id,institution_id')
    .gte('lesson_date', from)
    .lte('lesson_date', to)
    .order('lesson_date', { ascending: true })
    .order('start_time', { ascending: true });

  if (sessionIdF) sessQ = sessQ.eq('id', sessionIdF);
  if (classIdF) sessQ = sessQ.eq('class_id', classIdF);
  if (teacherIdF) sessQ = sessQ.eq('teacher_id', teacherIdF);

  if (!seesAllInstitutionClasses(role)) {
    if (!allowedClassIds || !allowedClassIds.length) {
      return {
        data: {
          rows: [],
          rows_private: [],
          summary: { present: 0, absent: 0, late: 0, records: 0, session_count: 0 },
          stats: wantStats ? computeStats([]) : undefined,
          meta: { lesson_type_filter: lessonType, note_private: 'Özel ders yoklaması bu sürümde ayrı tabloda takip edilmiyor.' }
        }
      };
    }
    sessQ = sessQ.in('class_id', allowedClassIds);
  } else if (institutionId) {
    sessQ = sessQ.eq('institution_id', institutionId);
  } else if (normalizeRole(actor.role) === 'super_admin' && scopedInst) {
    sessQ = sessQ.eq('institution_id', scopedInst);
  }

  const { data: sessions, error: sErr } = await sessQ;
  if (sErr) return { error: { status: 500, body: { error: sErr.message } } };
  const sessionList = sessions || [];

  const visibleStudentSet = await getVisibleStudentIdSet(supabaseAdmin, normalizeRole, actor, institutionId);

  if (!sessionList.length) {
    return {
      data: {
        rows: [],
        rows_private: [],
        summary: { present: 0, absent: 0, late: 0, records: 0, session_count: 0 },
        stats: wantStats ? computeStats([]) : undefined,
        meta: { lesson_type_filter: lessonType }
      }
    };
  }

  const sessionById = new Map(sessionList.map((s) => [s.id, s]));
  const sessionIds = sessionList.map((s) => s.id);
  const chunkSize = 80;
  const attChunks = [];
  for (let i = 0; i < sessionIds.length; i += chunkSize) {
    const slice = sessionIds.slice(i, i + chunkSize);
    let aq = supabaseAdmin.from('class_session_attendance').select('*').in('session_id', slice);
    if (studentIdF) aq = aq.eq('student_id', studentIdF);
    const { data: part, error: aErr } = await aq;
    if (aErr) return { error: { status: 500, body: { error: aErr.message } } };
    attChunks.push(...(part || []));
  }

  const studentIds = [...new Set(attChunks.map((r) => String(r.student_id || '').trim()).filter(Boolean))];
  const classIds = [...new Set(sessionList.map((s) => s.class_id).filter(Boolean))];
  const teacherIds = [...new Set(sessionList.map((s) => s.teacher_id).filter(Boolean))];

  const studentNames = {};
  const studentPhones = {};
  if (studentIds.length) {
    const { data: studs } = await supabaseAdmin
      .from('students')
      .select('id,name,phone,parent_phone')
      .in('id', studentIds);
    for (const s of studs || []) {
      studentNames[s.id] = s.name || s.id;
      studentPhones[s.id] = { phone: s.phone || null, parent_phone: s.parent_phone || null };
    }
  }
  const classNames = {};
  if (classIds.length) {
    const { data: cls } = await supabaseAdmin.from('classes').select('id,name').in('id', classIds);
    for (const c of cls || []) classNames[c.id] = c.name || c.id;
  }
  const teacherNames = {};
  if (teacherIds.length) {
    const { data: users } = await supabaseAdmin.from('users').select('id,name,email').in('id', teacherIds);
    for (const u of users || []) teacherNames[u.id] = u.name || u.email || u.id;
  }

  const normalizeSt = (raw) => {
    const v = String(raw || '').trim().toLowerCase();
    if (v === 'present' || v === 'absent' || v === 'late') return v;
    return 'absent';
  };

  const rows = attChunks
    .map((a) => {
      const sess = sessionById.get(a.session_id);
      if (!sess) return null;
      const sid = String(a.student_id || '').trim();
      if (visibleStudentSet && !visibleStudentSet.has(sid)) return null;
      const st = normalizeSt(a.status);
      const phones = studentPhones[sid] || {};
      return {
        lesson_type: 'group',
        session_id: a.session_id,
        lesson_date: sess.lesson_date,
        start_time: String(sess.start_time || '').slice(0, 8),
        subject: sess.subject || '',
        class_id: sess.class_id,
        class_name: classNames[sess.class_id] || sess.class_id,
        teacher_id: sess.teacher_id,
        teacher_name: teacherNames[sess.teacher_id] || sess.teacher_id,
        student_id: sid,
        student_name: studentNames[sid] || sid,
        student_phone: phones.phone || null,
        parent_phone: phones.parent_phone || null,
        status: st,
        marked_at: a.marked_at || null,
        marked_by: a.marked_by || null
      };
    })
    .filter(Boolean);

  let out = rows;
  if (statusFilter === 'absent') out = out.filter((r) => r.status === 'absent');
  else if (statusFilter === 'present') out = out.filter((r) => r.status === 'present');
  else if (statusFilter === 'late') out = out.filter((r) => r.status === 'late');

  if (lessonType === 'private') {
    out = [];
  }

  let present = 0;
  let absent = 0;
  let late = 0;
  for (const r of out) {
    if (r.status === 'present') present += 1;
    else if (r.status === 'late') late += 1;
    else absent += 1;
  }

  out.sort((a, b) => {
    const d = String(a.lesson_date).localeCompare(String(b.lesson_date));
    if (d !== 0) return d;
    const t = String(a.start_time).localeCompare(String(b.start_time));
    if (t !== 0) return t;
    return String(a.class_name).localeCompare(String(b.class_name), 'tr');
  });

  const summary = {
    present,
    absent,
    late,
    records: out.length,
    session_count: sessionList.length
  };

  const stats = wantStats ? computeStats(out) : undefined;

  return {
    data: {
      rows: out,
      rows_private: [],
      summary,
      stats,
      meta: {
        lesson_type_filter: lessonType,
        absent_today: absentToday,
        note_private:
          lessonType === 'all' || lessonType === 'private'
            ? 'Özel canlı ders yoklaması bu raporda yer almaz (yalnızca grup dersi).'
            : undefined
      }
    }
  };
}
