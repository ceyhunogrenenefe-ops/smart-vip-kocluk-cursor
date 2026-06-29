/**
 * Gelişmiş grup dersi yoklama raporu (filtreler + özet istatistikler).
 * Özel ders (teacher_lessons) yoklama tablosu olmadığı için lesson_type=private i boş döner.
 */

function institutionIdMatches(stored, requested) {
  const a = String(stored ?? '').trim();
  const b = String(requested ?? '').trim();
  if (!a || !b) return false;
  return a === b || a.toLowerCase() === b.toLowerCase();
}

export async function getInstitutionStudentIds(supabaseAdmin, institutionId) {
  const instId = String(institutionId || '').trim();
  const set = new Set();
  if (!instId) return set;

  const { data: direct, error } = await supabaseAdmin
    .from('students')
    .select('id, institution_id, email, platform_user_id, user_id')
    .eq('institution_id', instId);
  if (error) throw error;
  for (const s of direct || []) set.add(String(s.id));

  if (!set.size) {
    const { data: all, error: allErr } = await supabaseAdmin
      .from('students')
      .select('id, institution_id, email, platform_user_id, user_id');
    if (allErr) throw allErr;
    for (const s of all || []) {
      if (institutionIdMatches(s.institution_id, instId)) set.add(String(s.id));
    }
  }

  const { data: instUsers, error: uErr } = await supabaseAdmin
    .from('users')
    .select('id, email')
    .eq('institution_id', instId);
  if (!uErr && instUsers?.length) {
    const userIds = instUsers.map((u) => String(u.id)).filter(Boolean);
    const emails = [
      ...new Set(instUsers.map((u) => String(u.email || '').toLowerCase().trim()).filter(Boolean))
    ];
    for (let i = 0; i < userIds.length; i += 200) {
      const chunk = userIds.slice(i, i + 200);
      const { data: linked, error: lErr } = await supabaseAdmin
        .from('students')
        .select('id')
        .or(`platform_user_id.in.(${chunk.join(',')}),user_id.in.(${chunk.join(',')}),id.in.(${chunk.join(',')})`);
      if (lErr) break;
      for (const s of linked || []) set.add(String(s.id));
    }
    for (let i = 0; i < emails.length; i += 200) {
      const chunk = emails.slice(i, i + 200);
      const { data: byEmail, error: eErr } = await supabaseAdmin
        .from('students')
        .select('id')
        .in('email', chunk);
      if (eErr) break;
      for (const s of byEmail || []) set.add(String(s.id));
    }
  }

  return set;
}

export async function resolveInstitutionClassIds(supabaseAdmin, institutionId, studentIdsSet) {
  const instId = String(institutionId || '').trim();
  const classIds = new Set();
  if (!instId) return [];

  const { data: clsRows, error: clsErr } = await supabaseAdmin
    .from('classes')
    .select('id, institution_id')
    .eq('institution_id', instId);
  if (clsErr) throw clsErr;
  for (const c of clsRows || []) classIds.add(String(c.id));

  if (!classIds.size) {
    const { data: allCls, error: allClsErr } = await supabaseAdmin.from('classes').select('id, institution_id');
    if (allClsErr) throw allClsErr;
    for (const c of allCls || []) {
      if (institutionIdMatches(c.institution_id, instId)) classIds.add(String(c.id));
    }
  }

  const { data: sessInstRows, error: sessInstErr } = await supabaseAdmin
    .from('class_sessions')
    .select('class_id')
    .eq('institution_id', instId);
  if (sessInstErr) throw sessInstErr;
  for (const s of sessInstRows || []) {
    if (s.class_id) classIds.add(String(s.class_id));
  }

  if (studentIdsSet?.size) {
    const sidList = [...studentIdsSet];
    for (let i = 0; i < sidList.length; i += 200) {
      const chunk = sidList.slice(i, i + 200);
      const { data: cs, error: csErr } = await supabaseAdmin
        .from('class_students')
        .select('class_id, student_id')
        .in('student_id', chunk);
      if (csErr) throw csErr;
      for (const r of cs || []) {
        if (r.class_id) classIds.add(String(r.class_id));
      }
    }
  }

  /** Kurumsuz (institution_id null) ama kurum admini tarafından oluşturulmuş sınıflar */
  const { data: orphanRows, error: orphanErr } = await supabaseAdmin
    .from('classes')
    .select('id, created_by, institution_id')
    .is('institution_id', null);
  if (!orphanErr && orphanRows?.length) {
    const creatorIds = [...new Set(orphanRows.map((r) => r.created_by).filter(Boolean))];
    if (creatorIds.length) {
      const { data: creators } = await supabaseAdmin
        .from('users')
        .select('id, institution_id')
        .in('id', creatorIds);
      const creatorsInInst = new Set(
        (creators || [])
          .filter((u) => institutionIdMatches(u.institution_id, instId))
          .map((u) => String(u.id))
      );
      for (const c of orphanRows) {
        if (creatorsInInst.has(String(c.created_by || ''))) classIds.add(String(c.id));
      }
    }
  }

  return [...classIds];
}

/** Kurum admini planlayıcı / Canlı Grup: resolve + doğrudan institution_id eşleşmesi birleşik */
export async function loadInstitutionClassIdSet(supabaseAdmin, institutionId, studentIdsSet) {
  const instId = String(institutionId || '').trim();
  const classIds = new Set(await resolveInstitutionClassIds(supabaseAdmin, instId, studentIdsSet));
  if (!instId) return classIds;
  const { data: direct, error } = await supabaseAdmin.from('classes').select('id').eq('institution_id', instId);
  if (error) throw error;
  for (const c of direct || []) {
    if (c?.id) classIds.add(String(c.id));
  }
  return classIds;
}

export async function getVisibleStudentIdSet(
  supabaseAdmin,
  normalizeRole,
  actor,
  institutionId,
  scopedInstitutionId = ''
) {
  const role = normalizeRole(actor.role);
  const instScope = String(scopedInstitutionId || '').trim();
  if (role === 'super_admin') {
    if (instScope) return getInstitutionStudentIds(supabaseAdmin, instScope);
    return null;
  }
  const set = new Set();
  if (role === 'admin' && institutionId) {
    return getInstitutionStudentIds(supabaseAdmin, institutionId);
  }
  if (role === 'coach' && actor.coach_id) {
    const { data: studs } = await supabaseAdmin
      .from('students')
      .select('id')
      .eq('coach_id', String(actor.coach_id).trim());
    for (const s of studs || []) set.add(String(s.id));
    if (instScope) {
      const instSet = await getInstitutionStudentIds(supabaseAdmin, instScope);
      return new Set([...set].filter((id) => instSet.has(id)));
    }
    return set;
  }
  if (role === 'teacher') {
    const { data: ct } = await supabaseAdmin.from('class_teachers').select('class_id').eq('teacher_id', actor.sub);
    const cids = (ct || []).map((r) => r.class_id).filter(Boolean);
    if (!cids.length) return set;
    const { data: cs } = await supabaseAdmin.from('class_students').select('student_id').in('class_id', cids);
    for (const r of cs || []) set.add(String(r.student_id));
    if (instScope) {
      const instSet = await getInstitutionStudentIds(supabaseAdmin, instScope);
      return new Set([...set].filter((id) => instSet.has(id)));
    }
    return set;
  }
  return set;
}

function qstr(q, key) {
  const raw = q[key];
  return String(Array.isArray(raw) ? raw[0] : raw || '').trim();
}

function emptyReportPayload({ lessonType, wantStats, effectiveInst, note }) {
  return {
    data: {
      rows: [],
      rows_private: [],
      summary: { present: 0, absent: 0, late: 0, records: 0, session_count: 0 },
      stats: wantStats ? computeStats([]) : undefined,
      meta: {
        lesson_type_filter: lessonType,
        institution_id: effectiveInst || undefined,
        note
      }
    }
  };
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
  const effectiveInst =
    scopedInst ||
    (seesAllInstitutionClasses(role) && institutionId ? String(institutionId).trim() : '');

  let institutionStudentIds = null;
  let institutionClassIds = null;
  if (effectiveInst) {
    institutionStudentIds = await getInstitutionStudentIds(supabaseAdmin, effectiveInst);
    if (!institutionStudentIds.size) {
      return emptyReportPayload({
        lessonType,
        wantStats,
        effectiveInst,
        note: 'Seçilen kuruma bağlı öğrenci bulunamadı.'
      });
    }
    institutionClassIds = await resolveInstitutionClassIds(
      supabaseAdmin,
      effectiveInst,
      institutionStudentIds
    );
  }

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
      return emptyReportPayload({
        lessonType,
        wantStats,
        effectiveInst,
        note: 'Bu kullanıcı için erişilebilir sınıf yok.'
      });
    }
    let scopedClassIds = allowedClassIds.map(String);
    if (effectiveInst && institutionClassIds?.length) {
      const allowedSet = new Set(scopedClassIds);
      const intersect = institutionClassIds.filter((id) => allowedSet.has(id));
      if (intersect.length) scopedClassIds = intersect;
    }
    sessQ = sessQ.in('class_id', scopedClassIds);
  } else if (effectiveInst && institutionClassIds?.length) {
    sessQ = sessQ.in('class_id', institutionClassIds);
  }

  const { data: sessions, error: sErr } = await sessQ;
  if (sErr) return { error: { status: 500, body: { error: sErr.message } } };
  let sessionList = sessions || [];

  const visibleStudentSet = await getVisibleStudentIdSet(
    supabaseAdmin,
    normalizeRole,
    actor,
    institutionId,
    scopedInst || effectiveInst
  );

  if (effectiveInst && !institutionClassIds?.length && sessionList.length) {
    const allowedSessionIds = new Set();
    const sessionIds = sessionList.map((s) => s.id);
    const instStudentList = [...institutionStudentIds];
    for (let i = 0; i < sessionIds.length; i += 80) {
      const slice = sessionIds.slice(i, i + 80);
      for (let j = 0; j < instStudentList.length; j += 200) {
        const studSlice = instStudentList.slice(j, j + 200);
        const { data: attHits, error: attHitErr } = await supabaseAdmin
          .from('class_session_attendance')
          .select('session_id')
          .in('session_id', slice)
          .in('student_id', studSlice);
        if (attHitErr) return { error: { status: 500, body: { error: attHitErr.message } } };
        for (const row of attHits || []) allowedSessionIds.add(row.session_id);
      }
    }
    sessionList = sessionList.filter((s) => allowedSessionIds.has(s.id));
  }

  if (!sessionList.length) {
    return emptyReportPayload({
      lessonType,
      wantStats,
      effectiveInst,
      note: effectiveInst ? 'Seçilen kurum ve tarih aralığında yoklama oturumu bulunamadı.' : undefined
    });
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
      .select('id,name,phone,parent_phone,institution_id')
      .in('id', studentIds);
    for (const s of studs || []) {
      if (effectiveInst && !institutionIdMatches(s.institution_id, effectiveInst)) continue;
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
      if (effectiveInst && institutionStudentIds && !institutionStudentIds.has(sid)) return null;
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
        institution_id: effectiveInst || undefined,
        institution_student_count: effectiveInst ? institutionStudentIds?.size || 0 : undefined,
        note_private:
          lessonType === 'all' || lessonType === 'private'
            ? 'Özel canlı ders yoklaması bu raporda yer almaz (yalnızca grup dersi).'
            : undefined
      }
    }
  };
}
