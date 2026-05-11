import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/session';
import { resolveStudentRecordId } from '../lib/coachResolve';
import StudentLiveLessonsPanel from '../components/liveLessons/StudentLiveLessonsPanel';
import { WeeklyLiveGridShell } from '../components/liveLessons/WeeklyLiveGridShell';
import { liveSubjectAccent } from '../components/liveLessons/liveSubjectAccent';
import { turkishFold } from '../lib/userBulkImport';
import type { Student } from '../types';
import { GripVertical, KeyRound, Pencil, Trash2 } from 'lucide-react';

type ClassRow = {
  id: string;
  name: string;
  class_level?: string | null;
  /** Öğrenci `school` alanıyla eşleşen şube (örn. A) */
  branch?: string | null;
  description?: string | null;
  teacher_ids: string[];
  student_ids: string[];
};

function compactLevelKey(s: string): string {
  return turkishFold(String(s)).replace(/[\s\-_/]/g, '');
}

/** Grup sınıfı seviye + şubesi seçiliyken yalnızca eşleşen öğrencileri göster */
function studentMatchesClassLevelAndBranch(
  s: Student,
  classLevel: string | null | undefined,
  classBranch: string | null | undefined
): boolean {
  const lv = String(classLevel || '').trim();
  if (!lv) return true;
  const stLev = String(s.classLevel ?? '').trim();
  if (!stLev) return false;
  const levelOk =
    compactLevelKey(stLev) === compactLevelKey(lv) ||
    compactLevelKey(stLev).includes(compactLevelKey(lv)) ||
    compactLevelKey(lv).includes(compactLevelKey(stLev));
  if (!levelOk) return false;
  const br = String(classBranch || '').trim();
  if (!br) return true;
  const sch = String(s.school ?? '').trim();
  if (!sch) return false;
  return compactLevelKey(sch) === compactLevelKey(br);
}
type SlotRow = {
  id: string;
  class_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  subject: string;
  teacher_id: string;
  meeting_link: string;
  homework?: string | null;
};
type TeacherOption = { id: string; name: string };
type GroupLessonSummaryRow = {
  teacher_id: string;
  class_id: string;
  teacher_name: string;
  class_name: string;
  completed_lesson_count: number;
  total_minutes: number;
  total_hours: number;
};
type SessionRow = {
  id: string;
  class_id: string;
  lesson_date: string;
  start_time: string;
  end_time: string;
  subject: string;
  teacher_id: string;
  meeting_link: string;
  status: string;
  homework?: string | null;
};

/** Canlı grup dersi sınıf oluştur: sınıf seviye / programa göre seçenekler */
const CLASS_LEVEL_OPTIONS: { value: string; label: string }[] = [
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: '5', label: '5' },
  { value: '6', label: '6' },
  { value: '7', label: '7' },
  { value: 'LGS', label: 'LGS' },
  { value: '9', label: '9' },
  { value: '10', label: '10' },
  { value: '11', label: '11' },
  { value: 'TYT', label: 'TYT' },
  { value: 'YKS EŞİTAĞIRLIK', label: 'YKS Eşit Ağırlık' },
  { value: 'YKS SAYISAL', label: 'YKS Sayısal' },
  { value: 'AP', label: 'AP' },
  { value: 'IB', label: 'IB' },
  { value: 'YÖS', label: 'YÖS' }
];
const DAY_LABELS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

function isoFromLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function parseIsoLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Pazartesi–Pazar haftasında Pazartesi (yerel tarih) */
function mondayIsoContaining(isoAnchor?: string): string {
  const base = isoAnchor ? parseIsoLocal(isoAnchor) : new Date();
  const x = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const jsDay = x.getDay();
  const diff = jsDay === 0 ? -6 : 1 - jsDay;
  x.setDate(x.getDate() + diff);
  return isoFromLocalDate(x);
}

function addDaysIso(iso: string, delta: number): string {
  const d = parseIsoLocal(iso);
  d.setDate(d.getDate() + delta);
  return isoFromLocalDate(d);
}

function formatDdMmYyyyDots(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

/** Pazartesi=1 … Pazar=7 (sunucudaki slot day_of_week ile uyumlu) */
function dowSlotFromIso(iso: string): number {
  const d = parseIsoLocal(iso);
  const day = d.getDay();
  return day === 0 ? 7 : day;
}

const todayIso = () => isoFromLocalDate(new Date());
const monthStartIso = () => isoFromLocalDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

export default function ClassLiveLessons() {
  const { effectiveUser } = useAuth();
  const { students } = useApp();
  const safeStudents = Array.isArray(students) ? students : [];
  const role = String(effectiveUser?.role || '');
  const actorUserId = String(effectiveUser?.id || '');
  const canManageClasses = role === 'admin' || role === 'super_admin' || role === 'coach';
  const canManageSlots = canManageClasses || role === 'teacher';
  const canViewPaymentSummary = role === 'super_admin';
  const isStudentView = role.toLowerCase() === 'student';

  const resolvedStudentId = useMemo(() => {
    const sid =
      resolveStudentRecordId('student', effectiveUser?.studentId, effectiveUser?.email, safeStudents)?.trim() ||
      effectiveUser?.studentId?.trim() ||
      '';
    return isStudentView ? sid : '';
  }, [isStudentView, effectiveUser?.studentId, effectiveUser?.email, safeStudents]);

  /** Öğrenci: grup takvimi | birebir canlı dersler */
  type StudentScheduleTab = 'group' | 'private';
  const [studentScheduleTab, setStudentScheduleTab] = useState<StudentScheduleTab>('group');

  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [teacherOptions, setTeacherOptions] = useState<TeacherOption[]>([]);

  const [newClassName, setNewClassName] = useState('');
  const [newClassLevel, setNewClassLevel] = useState('9');
  const [newClassTeacherIds, setNewClassTeacherIds] = useState<string[]>([]);
  const [newClassStudentIds, setNewClassStudentIds] = useState<string[]>([]);
  const [newClassBranch, setNewClassBranch] = useState('');
  /** Seçili sınıfta atanacak şube (students.school ile eşleşir); üyeler API'siyle kaydedilir */
  const [assignmentBranchDraft, setAssignmentBranchDraft] = useState('');

  const [slotDay, setSlotDay] = useState(1);
  const [slotHour, setSlotHour] = useState(10);
  const [slotMinute, setSlotMinute] = useState(0);
  const [slotSubject, setSlotSubject] = useState('');
  const [slotTeacherId, setSlotTeacherId] = useState('');
  const [slotMeetingLink, setSlotMeetingLink] = useState('');
  const [summaryFrom, setSummaryFrom] = useState(monthStartIso());
  const [summaryTo, setSummaryTo] = useState(todayIso());
  const [summaryTeacherId, setSummaryTeacherId] = useState('');
  const [summaryClassId, setSummaryClassId] = useState('');
  const [summaryRows, setSummaryRows] = useState<GroupLessonSummaryRow[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const [calendarWeekMondayIso, setCalendarWeekMondayIso] = useState(() => mondayIsoContaining());
  const [weekSessions, setWeekSessions] = useState<SessionRow[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);

  const canMarkAttendance = canManageSlots && !isStudentView && Boolean(selectedClassId);

  const [attendanceSession, setAttendanceSession] = useState<SessionRow | null>(null);
  const [attendanceDraft, setAttendanceDraft] = useState<
    { student_id: string; status: 'present' | 'absent' | 'late' }[]
  >([]);
  const [attendanceModalLoading, setAttendanceModalLoading] = useState(false);
  const [attendanceSaving, setAttendanceSaving] = useState(false);

  const [editingSession, setEditingSession] = useState<SessionRow | null>(null);
  const [editingSlotRow, setEditingSlotRow] = useState<SlotRow | null>(null);
  const [sessionEditBusy, setSessionEditBusy] = useState(false);
  const [slotEditBusy, setSlotEditBusy] = useState(false);
  const [esSubject, setEsSubject] = useState('');
  const [esDate, setEsDate] = useState('');
  const [esStart, setEsStart] = useState('');
  const [esEnd, setEsEnd] = useState('');
  const [esLink, setEsLink] = useState('');
  const [esHomework, setEsHomework] = useState('');
  const [slDay, setSlDay] = useState(1);
  const [slSubject, setSlSubject] = useState('');
  const [slStart, setSlStart] = useState('');
  const [slEnd, setSlEnd] = useState('');
  const [slLink, setSlLink] = useState('');
  const [slHomework, setSlHomework] = useState('');

  const [scheduleKind, setScheduleKind] = useState<'sessions' | 'template'>('sessions');
  const [lessonStartDate, setLessonStartDate] = useState(() => isoFromLocalDate(new Date()));
  const [repeatIntervalDays, setRepeatIntervalDays] = useState<0 | 7 | 15>(0);
  const [occurrencesCount, setOccurrencesCount] = useState(8);
  const [slotDurationMinutes, setSlotDurationMinutes] = useState(40);

  const teacherCandidates = useMemo(
    () => teacherOptions,
    [teacherOptions]
  );

  const selectedClass = useMemo(() => classes.find((c) => c.id === selectedClassId) || null, [classes, selectedClassId]);

  useEffect(() => {
    setAssignmentBranchDraft(selectedClass?.branch?.trim() ?? '');
  }, [selectedClass?.id, selectedClass?.branch]);

  const studentsForAssignments = useMemo(() => {
    if (!selectedClass) return [];
    return safeStudents.filter((s) =>
      studentMatchesClassLevelAndBranch(s, selectedClass.class_level, selectedClass.branch)
    );
  }, [safeStudents, selectedClass]);
  const classSlots = useMemo(() => slots.filter((s) => s.class_id === selectedClassId), [slots, selectedClassId]);

  const weekColumnDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysIso(calendarWeekMondayIso, i)), [calendarWeekMondayIso]);

  const weekRangeLabel = useMemo(() => {
    const a = formatDdMmYyyyDots(weekColumnDates[0]);
    const b = formatDdMmYyyyDots(weekColumnDates[6]);
    return `${a} – ${b}`;
  }, [weekColumnDates]);

  const loadWeekSessions = useCallback(async () => {
    if (!selectedClassId) {
      setWeekSessions([]);
      return;
    }
    setCalendarLoading(true);
    try {
      const from = weekColumnDates[0];
      const to = weekColumnDates[6];
      const qs = new URLSearchParams({
        scope: 'sessions',
        class_id: selectedClassId,
        from,
        to
      });
      const res = await apiFetch(`/api/class-live-lessons?${qs.toString()}`);
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setWeekSessions([]);
        return;
      }
      setWeekSessions(Array.isArray(j.data) ? (j.data as SessionRow[]) : []);
    } catch {
      setWeekSessions([]);
    } finally {
      setCalendarLoading(false);
    }
  }, [selectedClassId, weekColumnDates]);

  useEffect(() => {
    void loadWeekSessions();
  }, [loadWeekSessions]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cRes, sRes] = await Promise.all([
        apiFetch('/api/class-live-lessons?scope=classes'),
        apiFetch('/api/class-live-lessons?scope=slots')
      ]);
      const [cJson, sJson] = await Promise.all([cRes.json().catch(() => ({})), sRes.json().catch(() => ({}))]);
      if (!cRes.ok) throw new Error(String(cJson.error || 'Sınıf listesi alınamadı'));
      if (!sRes.ok) throw new Error(String(sJson.error || 'Ders slotları alınamadı'));
      const loadedClasses = Array.isArray(cJson.data) ? (cJson.data as ClassRow[]) : [];
      const sid = resolvedStudentId.trim();
      const filteredClasses =
        isStudentView && sid
          ? loadedClasses.filter((c) => Array.isArray(c.student_ids) && c.student_ids.includes(sid))
          : loadedClasses;
      const rawSlots = Array.isArray(sJson.data) ? (sJson.data as SlotRow[]) : [];
      const allowed = new Set(filteredClasses.map((c) => c.id));
      const filteredSlots =
        isStudentView && sid ? rawSlots.filter((s) => allowed.has(s.class_id)) : rawSlots;
      setClasses(filteredClasses);
      setSlots(filteredSlots);
      setSelectedClassId((cur) => {
        if (!filteredClasses.length) return '';
        if (cur && filteredClasses.some((c) => c.id === cur)) return cur;
        return filteredClasses[0].id;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yükleme hatası');
    } finally {
      setLoading(false);
    }
  }, [selectedClassId, isStudentView, resolvedStudentId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        const res = await apiFetch('/api/users');
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(String(j.error || 'Öğretmen listesi alınamadı'));
        const rows = Array.isArray(j.data) ? j.data : [];
        const mapped = rows
          .filter((r) => {
            const roleRaw = String(r.role || '').toLowerCase();
            const roleList = Array.isArray(r.roles) ? r.roles.map((x: unknown) => String(x || '').toLowerCase()) : [];
            return roleRaw === 'teacher' || roleList.includes('teacher');
          })
          .map((r) => ({ id: String(r.id), name: String(r.name || r.email || r.id) }));
        if (!cancel) setTeacherOptions(mapped);
      } catch (e) {
        if (!cancel) setError(e instanceof Error ? e.message : 'Öğretmenler yüklenemedi');
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const createClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName.trim()) return;
    const res = await apiFetch('/api/class-live-lessons?op=create-class', {
      method: 'POST',
      body: JSON.stringify({
        name: newClassName.trim(),
        class_level: newClassLevel,
        branch: newClassBranch.trim() || undefined,
        teacher_ids: newClassTeacherIds,
        student_ids: newClassStudentIds
      })
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(String(j.error || 'Sınıf oluşturulamadı'));
      return;
    }
    setNewClassName('');
    await loadAll();
  };

  const effectiveSlotTeacherId = role === 'teacher' ? actorUserId : slotTeacherId || selectedClass?.teacher_ids?.[0] || '';

  const createSlot = async () => {
    if (!selectedClassId || !slotSubject.trim() || !slotMeetingLink.trim()) return;
    const teacherId = effectiveSlotTeacherId;
    const start = `${String(slotHour).padStart(2, '0')}:${String(slotMinute).padStart(2, '0')}`;
    const res = await apiFetch('/api/class-live-lessons?op=create-slot', {
      method: 'POST',
      body: JSON.stringify({
        class_id: selectedClassId,
        day_of_week: slotDay,
        start_time: start,
        duration_minutes: slotDurationMinutes,
        subject: slotSubject.trim(),
        teacher_id: teacherId || undefined,
        meeting_link: slotMeetingLink.trim()
      })
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(String(j.error || 'Ders şablonu eklenemedi'));
      return;
    }
    setSlotSubject('');
    setSlotMeetingLink('');
    await loadAll();
    await loadWeekSessions();
  };

  const bulkScheduleSessions = async () => {
    if (!selectedClassId || !slotSubject.trim() || !slotMeetingLink.trim()) return;
    const teacherId = effectiveSlotTeacherId;
    if (!teacherId) {
      alert('Öğretmen seçin.');
      return;
    }
    const start = `${String(slotHour).padStart(2, '0')}:${String(slotMinute).padStart(2, '0')}`;
    const res = await apiFetch('/api/class-live-lessons?op=bulk-schedule-sessions', {
      method: 'POST',
      body: JSON.stringify({
        class_id: selectedClassId,
        lesson_date: lessonStartDate,
        repeat_interval_days: repeatIntervalDays,
        occurrences: repeatIntervalDays === 0 ? 1 : occurrencesCount,
        start_time: start,
        duration_minutes: slotDurationMinutes,
        subject: slotSubject.trim(),
        teacher_id: teacherId,
        meeting_link: slotMeetingLink.trim()
      })
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(String(j.error || j.reason || 'Oturumlar oluşturulamadı'));
      return;
    }
    const n = Array.isArray(j.data) ? j.data.length : 0;
    setError(null);
    setSlotSubject('');
    setSlotMeetingLink('');
    await loadAll();
    await loadWeekSessions();
    alert(`${n} adet tarihli oturum kaydedildi. Hatırlatma ve tamamlanan ders özeti bu kayıtlara göre çalışır.`);
  };

  const closeAttendanceModal = () => {
    setAttendanceSession(null);
    setAttendanceDraft([]);
    setAttendanceModalLoading(false);
  };

  const openAttendanceForSession = useCallback(async (s: SessionRow) => {
    setAttendanceSession(s);
    setAttendanceModalLoading(true);
    try {
      const res = await apiFetch(
        `/api/class-live-lessons?scope=attendance&session_id=${encodeURIComponent(s.id)}`
      );
      const j = await res.json().catch(() => ({}));
      const existing = Array.isArray(j.data) ? j.data : [];
      const map = new Map<string, string>(
        existing.map((row: { student_id?: string; status?: string }) => [
          String(row.student_id || '').trim(),
          String(row.status || '').trim()
        ])
      );
      const clsRow = classes.find((c) => c.id === s.class_id);
      const ids = Array.isArray(clsRow?.student_ids) ? clsRow!.student_ids.map(String).filter(Boolean) : [];
      setAttendanceDraft(
        ids.map((id) => {
          const st = map.get(id);
          let status: 'present' | 'absent' | 'late' = 'present';
          if (st === 'absent') status = 'absent';
          else if (st === 'late') status = 'late';
          return { student_id: id, status };
        })
      );
    } catch {
      setAttendanceDraft([]);
    } finally {
      setAttendanceModalLoading(false);
    }
  }, [classes]);

  const saveAttendance = async () => {
    if (!attendanceSession || attendanceDraft.length === 0) return;
    setAttendanceSaving(true);
    try {
      const res = await apiFetch('/api/class-live-lessons?op=mark-attendance', {
        method: 'POST',
        body: JSON.stringify({
          session_id: attendanceSession.id,
          attendance: attendanceDraft.map((row) => ({
            student_id: row.student_id,
            status: row.status
          }))
        })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(String(j.error || 'Yoklama kaydedilemedi'));
        return;
      }
      setError(null);
      closeAttendanceModal();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yoklama hatası');
    } finally {
      setAttendanceSaving(false);
    }
  };

  const deleteSessionRow = async (id: string) => {
    if (!confirm('Bu tarihli oturumu silmek istediğinize emin misiniz?')) return;
    const res = await apiFetch(`/api/class-live-lessons?session_id=${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(String(j.error || 'Oturum silinemedi'));
      return;
    }
    await loadWeekSessions();
  };

  const updateClassMembers = async (
    teacherIds: string[],
    studentIds: string[],
    classMeta?: Partial<{ class_level: string | null; branch: string | null }>
  ) => {
    if (!selectedClassId) return;
    const body: Record<string, unknown> = {
      class_id: selectedClassId,
      teacher_ids: teacherIds,
      student_ids: studentIds
    };
    if (classMeta) {
      if (Object.prototype.hasOwnProperty.call(classMeta, 'class_level'))
        body.class_level = classMeta.class_level;
      if (Object.prototype.hasOwnProperty.call(classMeta, 'branch')) body.branch = classMeta.branch;
    }
    const res = await apiFetch('/api/class-live-lessons?op=update-class-members', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(String(j.error || 'Atamalar kaydedilemedi'));
      return;
    }
    await loadAll();
  };

  const deleteSlot = async (id: string) => {
    const res = await apiFetch(`/api/class-live-lessons?slot_id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(String(j.error || 'Slot silinemedi'));
      return;
    }
    await loadAll();
    await loadWeekSessions();
  };

  const openEditSession = (s: SessionRow) => {
    setEditingSession(s);
    setEsSubject(s.subject);
    setEsDate(s.lesson_date);
    setEsStart(String(s.start_time || '').slice(0, 5));
    setEsEnd(String(s.end_time || '').slice(0, 5));
    setEsLink(s.meeting_link || '');
    setEsHomework(s.homework || '');
    setError(null);
  };

  const saveSessionEdit = async () => {
    if (!editingSession) return;
    setSessionEditBusy(true);
    setError(null);
    try {
      const res = await apiFetch('/api/class-live-lessons', {
        method: 'PATCH',
        body: JSON.stringify({
          id: editingSession.id,
          subject: esSubject.trim(),
          lesson_date: esDate,
          start_time: esStart.length === 5 ? `${esStart}:00` : esStart,
          end_time: esEnd.length === 5 ? `${esEnd}:00` : esEnd,
          meeting_link: esLink.trim(),
          homework: esHomework.trim() || null
        })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(String(j.error || 'Oturum güncellenemedi'));
        return;
      }
      setEditingSession(null);
      await loadWeekSessions();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hata');
    } finally {
      setSessionEditBusy(false);
    }
  };

  const openEditSlot = (s: SlotRow) => {
    setEditingSlotRow(s);
    setSlDay(s.day_of_week);
    setSlSubject(s.subject);
    setSlStart(String(s.start_time || '').slice(0, 5));
    setSlEnd(String(s.end_time || '').slice(0, 5));
    setSlLink(s.meeting_link || '');
    setSlHomework(s.homework || '');
    setError(null);
  };

  const saveSlotEdit = async () => {
    if (!editingSlotRow) return;
    setSlotEditBusy(true);
    setError(null);
    try {
      const res = await apiFetch('/api/class-live-lessons', {
        method: 'PATCH',
        body: JSON.stringify({
          kind: 'slot',
          id: editingSlotRow.id,
          day_of_week: slDay,
          subject: slSubject.trim(),
          start_time: slStart.length === 5 ? `${slStart}:00` : slStart,
          end_time: slEnd.length === 5 ? `${slEnd}:00` : slEnd,
          meeting_link: slLink.trim(),
          homework: slHomework.trim() || null
        })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(String(j.error || 'Şablon güncellenemedi'));
        return;
      }
      setEditingSlotRow(null);
      await loadAll();
      await loadWeekSessions();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hata');
    } finally {
      setSlotEditBusy(false);
    }
  };

  const loadPaymentSummary = useCallback(async () => {
    if (!canViewPaymentSummary) return;
    setSummaryLoading(true);
    try {
      const qs = new URLSearchParams({ scope: 'summary' });
      if (summaryFrom) qs.set('from', summaryFrom);
      if (summaryTo) qs.set('to', summaryTo);
      if (summaryTeacherId) qs.set('teacher_id', summaryTeacherId);
      if (summaryClassId) qs.set('class_id', summaryClassId);
      const res = await apiFetch(`/api/class-live-lessons?${qs.toString()}`);
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSummaryRows([]);
        setError(String(j.error || 'Grup ders ödeme özeti alınamadı'));
        return;
      }
      setSummaryRows(Array.isArray(j.data) ? (j.data as GroupLessonSummaryRow[]) : []);
    } catch (e) {
      setSummaryRows([]);
      setError(e instanceof Error ? e.message : 'Grup ders ödeme özeti alınamadı');
    } finally {
      setSummaryLoading(false);
    }
  }, [canViewPaymentSummary, summaryFrom, summaryTo, summaryTeacherId, summaryClassId]);

  useEffect(() => {
    if (!canViewPaymentSummary) return;
    void loadPaymentSummary();
  }, [canViewPaymentSummary, loadPaymentSummary]);

  return (
    <div className="space-y-6">
      {isStudentView && (
        <div className="flex flex-wrap gap-2 p-1.5 bg-slate-100 rounded-xl border border-slate-200/80 w-full max-w-xl">
          <button
            type="button"
            onClick={() => setStudentScheduleTab('group')}
            className={`flex-1 min-w-[140px] px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
              studentScheduleTab === 'group'
                ? 'bg-white text-indigo-700 shadow-sm border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Canlı derslerim
          </button>
          <button
            type="button"
            onClick={() => setStudentScheduleTab('private')}
            className={`flex-1 min-w-[160px] px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
              studentScheduleTab === 'private'
                ? 'bg-white text-sky-700 shadow-sm border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Canlı özel derslerim
          </button>
        </div>
      )}

      {isStudentView && studentScheduleTab === 'private' ? (
        <StudentLiveLessonsPanel />
      ) : (
        <>
      <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-4 shadow-sm">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
            <KeyRound className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-amber-950">Canlı derse giriş — hatırlatma</p>
            <p className="mt-2 text-sm leading-relaxed text-amber-950/90">
              Canlı grup veya etüt oturumuna bağlanırken{' '}
              <span className="rounded-md bg-white/80 px-1.5 py-0.5 font-mono font-semibold text-amber-950 shadow-sm">
                Name
              </span>{' '}
              alanına <strong>kendi adınızı</strong>,{' '}
              <span className="rounded-md bg-white/80 px-1.5 py-0.5 font-mono font-semibold text-amber-950 shadow-sm">
                Access Code
              </span>{' '}
              alanına{' '}
              <span className="rounded-md bg-amber-200/80 px-2 py-0.5 font-mono font-bold tracking-wide text-amber-950">
                123456
              </span>{' '}
              yazmayı unutmayın.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h1 className="text-xl font-bold text-slate-800">
          {isStudentView ? 'Canlı derslerim' : 'Canlı Grup Dersi Yönetimi'}
        </h1>
        <p className="text-sm text-slate-600">
          {isStudentView ? (
            'Atandığınız grup canlı derslerini haftalık görünümde görürsünüz. Bire bir canlı özel dersler için üstteki «Canlı özel derslerim» sekmesini açın.'
          ) : (
            <>
              Takvimde Pazartesi–Pazar için gerçek tarihler gösterilir; muhasebe için hafta aralığını seçin. Öğretmen
              hatırlatması ve tamamlanan ders sayacı tarihli oturumlardan beslenir.
            </>
          )}
        </p>
      </div>

      {error && <div className="rounded-lg border border-red-100 bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      {loading && <div className="text-sm text-slate-500">Yükleniyor...</div>}

      {canViewPaymentSummary && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <h2 className="font-semibold text-slate-800">Grup dersi ödeme özeti (tamamlanan)</h2>
          <p className="text-xs text-slate-500">
            Tarih aralığına göre öğretmenin yaptığı tamamlanan grup ders sayısı ve toplam saat.
          </p>
          <div className="grid md:grid-cols-5 gap-2">
            <input
              type="date"
              value={summaryFrom}
              onChange={(e) => setSummaryFrom(e.target.value)}
              className="border border-slate-200 rounded px-3 py-2"
            />
            <input
              type="date"
              value={summaryTo}
              onChange={(e) => setSummaryTo(e.target.value)}
              className="border border-slate-200 rounded px-3 py-2"
            />
            <select
              value={summaryTeacherId}
              onChange={(e) => setSummaryTeacherId(e.target.value)}
              className="border border-slate-200 rounded px-3 py-2"
            >
              <option value="">Tüm öğretmenler</option>
              {teacherCandidates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <select
              value={summaryClassId}
              onChange={(e) => setSummaryClassId(e.target.value)}
              className="border border-slate-200 rounded px-3 py-2"
            >
              <option value="">Tüm sınıflar</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => void loadPaymentSummary()}
              className="px-4 py-2 rounded bg-indigo-600 text-white text-sm"
            >
              {summaryLoading ? 'Yükleniyor...' : 'Özeti getir'}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Öğretmen</th>
                  <th className="px-3 py-2">Sınıf</th>
                  <th className="px-3 py-2 text-right">Tamamlanan ders</th>
                  <th className="px-3 py-2 text-right">Toplam saat</th>
                  <th className="px-3 py-2 text-right">Dakika</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summaryRows.length === 0 && !summaryLoading ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-center text-slate-500">
                      Seçilen tarih aralığında tamamlanan grup dersi bulunamadı.
                    </td>
                  </tr>
                ) : (
                  summaryRows.map((r) => (
                    <tr key={`${r.teacher_id}-${r.class_id}`}>
                      <td className="px-3 py-2">{r.teacher_name}</td>
                      <td className="px-3 py-2">{r.class_name}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.completed_lesson_count}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-indigo-700">
                        {r.total_hours.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-500">{r.total_minutes}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {canManageClasses && (
        <form onSubmit={createClass} className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <h2 className="font-semibold text-slate-800">Yeni sınıf</h2>
          <div className="grid md:grid-cols-3 gap-2">
            <input value={newClassName} onChange={(e) => setNewClassName(e.target.value)} placeholder="Örn: 9-A Haftaiçi" className="border border-slate-200 rounded px-3 py-2" />
            <select value={newClassLevel} onChange={(e) => setNewClassLevel(e.target.value)} className="border border-slate-200 rounded px-3 py-2">
              {CLASS_LEVEL_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <input
              value={newClassBranch}
              onChange={(e) => setNewClassBranch(e.target.value)}
              placeholder="Şube — öğrenci şubesine göre süzer (örn. A)"
              className="border border-slate-200 rounded px-3 py-2"
            />
          </div>
          <button className="px-4 py-2 rounded bg-indigo-600 text-white text-sm">Sınıf oluştur</button>
        </form>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h2 className="font-semibold text-slate-800 mb-2">{isStudentView ? 'Sınıflarım' : 'Sınıflar'}</h2>
        <div className="flex flex-wrap gap-2">
          {classes.map((c) => (
            <button key={c.id} onClick={() => setSelectedClassId(c.id)} className={`px-3 py-1.5 rounded border text-sm ${selectedClassId === c.id ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200'}`}>
              {c.name}
              {c.class_level ? ` (${c.class_level})` : ''}
              {c.branch ? ` — ${c.branch}` : ''}
            </button>
          ))}
        </div>
      </div>

      {selectedClass && canManageClasses && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <h2 className="font-semibold text-slate-800">Öğretmen/Öğrenci atamaları - {selectedClass.name}</h2>
          <div className="flex flex-wrap items-end gap-2 text-sm border border-slate-100 rounded-lg p-3 bg-slate-50/80">
            <div className="min-w-[120px]">
              <label className="block text-xs text-slate-500 mb-0.5">Liste şubesi (öğrenci kaydıyla eşleşir)</label>
              <input
                value={assignmentBranchDraft}
                onChange={(e) => setAssignmentBranchDraft(e.target.value)}
                placeholder="Örn. A (boş: tüm şubeler)"
                className="w-full md:w-40 border border-slate-200 rounded px-3 py-1.5"
              />
            </div>
            <button
              type="button"
              className="px-3 py-1.5 rounded bg-slate-700 text-white text-xs font-medium hover:bg-slate-800"
              onClick={() => {
                void updateClassMembers(selectedClass.teacher_ids || [], selectedClass.student_ids || [], {
                  branch: assignmentBranchDraft.trim() ? assignmentBranchDraft.trim() : null
                });
              }}
            >
              Şubeyi kaydet
            </button>
            <p className="text-xs text-slate-500 md:max-w-md">
              Sınıfla seçilen programa ve şubesi belirliyse kullanıcı/öğrenci listesinde yalnızca uyumlu öğrenciler çıkar (başında boş ise o seviye için şube filtresiz).
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-slate-600 mb-1">Öğretmenler</p>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {teacherCandidates.map((t) => (
                  <label key={t.id} className="text-xs border rounded px-2 py-1 flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={(selectedClass.teacher_ids || []).includes(t.id)}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...(selectedClass.teacher_ids || []), t.id]
                          : (selectedClass.teacher_ids || []).filter((x) => x !== t.id);
                        void updateClassMembers(next, selectedClass.student_ids || []);
                      }}
                    />
                    {t.name}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm text-slate-600 mb-1">
                Öğrenciler
                {selectedClass.class_level ? (
                  <span className="text-slate-400 font-normal">
                    {' '}
                    ({studentsForAssignments.length} uyumlu)
                  </span>
                ) : null}
              </p>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {studentsForAssignments.map((s) => (
                  <label key={s.id} className="text-xs border rounded px-2 py-1 flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={(selectedClass.student_ids || []).includes(s.id)}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...(selectedClass.student_ids || []), s.id]
                          : (selectedClass.student_ids || []).filter((x) => x !== s.id);
                        void updateClassMembers(selectedClass.teacher_ids || [], next);
                      }}
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedClass && canManageSlots && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <h2 className="font-semibold text-slate-800">Ders ekle — {selectedClass.name}</h2>

          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="scheduleKind" checked={scheduleKind === 'sessions'} onChange={() => setScheduleKind('sessions')} />
              <span>
                <span className="font-medium text-slate-800">Tarihli oturumlar</span>
                <span className="text-slate-500 block text-xs">Tek sefer / 7 gün ara / 15 gün ara (hatırlatma ve özet bu kayıtlara göre)</span>
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="scheduleKind" checked={scheduleKind === 'template'} onChange={() => setScheduleKind('template')} />
              <span>
                <span className="font-medium text-slate-800">Yalnızca haftalık şablon</span>
                <span className="text-slate-500 block text-xs">Her hafta aynı gün-saat (takvimde kesik çizgi ile gösterilir)</span>
              </span>
            </label>
          </div>

          {scheduleKind === 'sessions' && (
            <div className="grid md:grid-cols-4 gap-2">
              <div>
                <label className="block text-xs text-slate-500 mb-0.5">İlk ders tarihi</label>
                <input
                  type="date"
                  value={lessonStartDate}
                  onChange={(e) => setLessonStartDate(e.target.value)}
                  className="w-full border border-slate-200 rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-0.5">Tekrar</label>
                <select
                  value={repeatIntervalDays}
                  onChange={(e) => setRepeatIntervalDays(Number(e.target.value) as 0 | 7 | 15)}
                  className="w-full border border-slate-200 rounded px-3 py-2 text-sm"
                >
                  <option value={0}>Tek sefer (tekrarlama yok)</option>
                  <option value={7}>Haftalık (7 gün)</option>
                  <option value={15}>Her 15 gün</option>
                </select>
              </div>
              <div className={repeatIntervalDays === 0 ? 'opacity-50 pointer-events-none' : ''}>
                <label className="block text-xs text-slate-500 mb-0.5">Oturum sayısı</label>
                <input
                  type="number"
                  min={2}
                  max={52}
                  value={repeatIntervalDays === 0 ? 1 : occurrencesCount}
                  disabled={repeatIntervalDays === 0}
                  onChange={(e) => setOccurrencesCount(Math.min(52, Math.max(2, Number(e.target.value) || 2)))}
                  className="w-full border border-slate-200 rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-0.5">Süre (dk)</label>
                <select
                  value={slotDurationMinutes}
                  onChange={(e) => setSlotDurationMinutes(Number(e.target.value))}
                  className="w-full border border-slate-200 rounded px-3 py-2 text-sm"
                >
                  {[40, 50, 60, 75, 90, 120].map((n) => (
                    <option key={n} value={n}>{n} dk</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 items-end">
            {scheduleKind === 'template' ? (
              <select value={slotDay} onChange={(e) => setSlotDay(Number(e.target.value))} className="border border-slate-200 rounded px-3 py-2 flex-1 min-w-[140px]">
                {DAY_LABELS.map((d, i) => (
                  <option key={d} value={i + 1}>{d}</option>
                ))}
              </select>
            ) : (
              <div className="text-xs text-slate-600 border border-dashed border-slate-200 rounded px-3 py-2 flex-1 min-w-[160px]">
                Saat aşağıda; <strong>tarih</strong> ilk ders tarihinden gelir (gün seçimi gereksizdir).
              </div>
            )}
            <select value={slotHour} onChange={(e) => setSlotHour(Number(e.target.value))} className="border border-slate-200 rounded px-3 py-2 w-[100px]">
              {Array.from({ length: 13 }, (_, i) => 10 + i).map((h) => (
                <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
              ))}
            </select>
            <select value={slotMinute} onChange={(e) => setSlotMinute(Number(e.target.value))} className="border border-slate-200 rounded px-3 py-2 w-[100px]">
              {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => (
                <option key={m} value={m}>{String(m).padStart(2, '0')} dk</option>
              ))}
            </select>
            <input value={slotSubject} onChange={(e) => setSlotSubject(e.target.value)} placeholder="Ders adı" className="border border-slate-200 rounded px-3 py-2 flex-1 min-w-[120px]" />
            <select
              value={role === 'teacher' ? actorUserId : slotTeacherId}
              onChange={(e) => setSlotTeacherId(e.target.value)}
              className="border border-slate-200 rounded px-3 py-2 flex-1 min-w-[160px]"
              disabled={role === 'teacher'}
            >
              <option value="">Öğretmen</option>
              {(role === 'teacher' ? teacherCandidates.filter((t) => t.id === actorUserId) : teacherCandidates).map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <input
            type="url"
            value={slotMeetingLink}
            onChange={(e) => setSlotMeetingLink(e.target.value)}
            placeholder="Ders bağlantısı"
            className="w-full border border-slate-200 rounded px-3 py-2 text-sm"
          />
          {scheduleKind === 'template' && (
            <div className="max-w-xs">
              <label className="block text-xs text-slate-500 mb-0.5">Şablon süre (dk)</label>
              <select
                value={slotDurationMinutes}
                onChange={(e) => setSlotDurationMinutes(Number(e.target.value))}
                className="w-full border border-slate-200 rounded px-3 py-2 text-sm"
              >
                {[40, 50, 60, 75, 90, 120].map((n) => (
                  <option key={n} value={n}>{n} dk</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {scheduleKind === 'sessions' ? (
              <button
                type="button"
                onClick={() => void bulkScheduleSessions()}
                className="px-4 py-2 rounded bg-emerald-600 text-white text-sm"
              >
                Tarihli oturumları oluştur
              </button>
            ) : (
              <button type="button" onClick={() => void createSlot()} className="px-4 py-2 rounded bg-teal-600 text-white text-sm">
                Şablonu kaydet
              </button>
            )}
          </div>
        </div>
      )}

      <WeeklyLiveGridShell
        title={isStudentView ? 'Bu haftanın canlı grup dersleri' : 'Haftalık grup ders takvimi'}
        subtitle="Tarihli oturumlar ve haftalık şablon üzerinden tek ekranda planlayın."
        weekRangeLabel={weekRangeLabel}
        loading={calendarLoading}
        onPrevWeek={() => setCalendarWeekMondayIso((prev) => addDaysIso(prev, -7))}
        onNextWeek={() => setCalendarWeekMondayIso((prev) => addDaysIso(prev, 7))}
        onThisWeek={() => setCalendarWeekMondayIso(mondayIsoContaining())}
        legend={
          <>
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-3 py-1.5 text-[11px] font-semibold text-emerald-50 shadow-sm backdrop-blur-sm">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/60" />
              Tarihli oturum
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-indigo-300/40 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur-sm">
              <span className="h-2 w-2 rounded-full border border-dashed border-indigo-200 bg-indigo-400/40" />
              Haftalık şablon
            </span>
          </>
        }
        hint="Yeşil kartlar gerçek oturumdur (Katıl / Yoklama). Kesik çizgili kartlar yalnızca şablondur; oturum oluşunca aynı slotta şablon gizlenir."
      >
        <div className="overflow-x-auto p-2 sm:p-3">
          <table className="w-full min-w-[920px] border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-white">
                <th className="w-14 min-w-[3.5rem] bg-slate-100 px-2 py-3 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Saat
                </th>
                {DAY_LABELS.map((d, i) => {
                  const iso = weekColumnDates[i];
                  const isToday = iso === todayIso();
                  return (
                    <th
                      key={d}
                      className={`px-2 py-3 text-left align-bottom ${
                        isToday
                          ? 'border-x border-t border-amber-300/90 bg-gradient-to-b from-amber-100 to-amber-50/90 shadow-[inset_0_2px_0_0_rgba(251,191,36,0.65)]'
                          : 'border-t border-slate-100 bg-slate-50/90'
                      }`}
                    >
                      <div className={`text-[11px] font-bold ${isToday ? 'text-amber-950' : 'text-slate-700'}`}>{d}</div>
                      <div
                        className={`mt-0.5 text-[10px] font-medium tabular-nums ${isToday ? 'text-amber-800/90' : 'text-slate-500'}`}
                      >
                        {formatDdMmYyyyDots(iso)}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="bg-white">
              {Array.from({ length: 15 }, (_, i) => 10 + i).map((hour) => (
                <tr key={hour} className="border-t border-slate-100/90 transition-colors hover:bg-slate-50/40">
                  <td className="bg-slate-50 px-2 py-2 text-right font-mono text-[11px] font-semibold tabular-nums text-slate-600">
                    {String(hour).padStart(2, '0')}:00
                  </td>
                  {weekColumnDates.map((colIso) => {
                    const sessionsHere = weekSessions.filter(
                      (s) =>
                        s.class_id === selectedClassId &&
                        s.lesson_date === colIso &&
                        Number(String(s.start_time).slice(0, 2)) === hour
                    );
                    const blockedSlotTeacherHours = new Set(sessionsHere.map((s) => `${s.teacher_id}|${hour}`));
                    const templatesHere = classSlots.filter((s) => {
                      if (s.day_of_week !== dowSlotFromIso(colIso)) return false;
                      if (Number(String(s.start_time).slice(0, 2)) !== hour) return false;
                      if (blockedSlotTeacherHours.has(`${s.teacher_id}|${hour}`)) return false;
                      return true;
                    });
                    const colToday = colIso === todayIso();
                    return (
                      <td
                        key={`${colIso}-${hour}`}
                        className={`align-top p-1.5 min-h-[52px] ${colToday ? 'bg-amber-50/55' : ''}`}
                      >
                        <div className="flex flex-col gap-1.5">
                          {sessionsHere.map((s) => {
                            const teacher = teacherCandidates.find((t) => t.id === s.teacher_id);
                            const accent = liveSubjectAccent(s.subject);
                            const st =
                              s.status === 'completed'
                                ? 'opacity-90 ring-slate-300/60'
                                : s.status === 'cancelled'
                                  ? 'opacity-75 ring-red-200'
                                  : 'ring-emerald-300/50 shadow-md';
                            const canJoin = s.status === 'scheduled' && Boolean(s.meeting_link?.trim());
                            return (
                              <div
                                key={s.id}
                                className={`rounded-xl border border-y border-r border-slate-200/75 px-2 py-2 shadow-sm ${accent.leftBar} ${accent.bg} ${accent.glow} ${st}`}
                              >
                                <div className="flex gap-1.5">
                                  <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <p className={`text-[13px] font-bold leading-tight ${accent.title}`}>{s.subject}</p>
                                      {s.status === 'scheduled' ? (
                                        <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-800 ring-1 ring-emerald-400/40">
                                          Planlı
                                        </span>
                                      ) : null}
                                    </div>
                                    <p className="mt-0.5 text-[11px] font-medium text-slate-800">
                                      {teacher?.name || s.teacher_id}
                                    </p>
                                    <p className="text-[10px] tabular-nums text-slate-600">
                                      {String(s.start_time).slice(0, 5)}–{String(s.end_time).slice(0, 5)}
                                    </p>
                                    <p className="text-[10px] font-medium capitalize text-slate-400">{s.status}</p>
                                  </div>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {canJoin ? (
                                    <button
                                      type="button"
                                      onClick={() => window.open(s.meeting_link, '_blank', 'noopener,noreferrer')}
                                      className="rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-2 py-1 text-[10px] font-semibold text-white shadow-sm hover:brightness-110"
                                    >
                                      Katıl
                                    </button>
                                  ) : null}
                                  {canMarkAttendance && s.status === 'scheduled' ? (
                                    <button
                                      type="button"
                                      className="rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-2 py-1 text-[10px] font-semibold text-white shadow-sm hover:brightness-110"
                                      onClick={() => void openAttendanceForSession(s)}
                                    >
                                      Yoklama
                                    </button>
                                  ) : null}
                                  {canManageSlots ? (
                                    <button
                                      type="button"
                                      onClick={() => openEditSession(s)}
                                      className="inline-flex items-center gap-1 rounded-lg border border-indigo-300 bg-white px-2 py-1 text-[10px] font-semibold text-indigo-700 shadow-sm hover:bg-indigo-50"
                                    >
                                      <Pencil className="h-3 w-3" />
                                      Düzenle
                                    </button>
                                  ) : null}
                                  {canManageSlots ? (
                                    <button
                                      type="button"
                                      onClick={() => void deleteSessionRow(s.id)}
                                      className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2 py-1 text-[10px] font-semibold text-red-700 hover:bg-red-50"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                      Sil
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                          {templatesHere.map((s) => {
                            const teacher = teacherCandidates.find((t) => t.id === s.teacher_id);
                            const accent = liveSubjectAccent(s.subject);
                            return (
                              <div
                                key={s.id}
                                className="rounded-xl border border-dashed border-indigo-300/80 border-l-[4px] border-l-indigo-400 bg-gradient-to-br from-indigo-50/95 to-white px-2.5 py-2 shadow-sm ring-1 ring-indigo-100/80"
                              >
                                <p className={`text-[12px] font-bold ${accent.title}`}>{s.subject}</p>
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-600">Şablon</p>
                                <p className="text-[11px] text-slate-600">
                                  {teacher?.name || s.teacher_id} · {String(s.start_time).slice(0, 5)}
                                </p>
                                <div className="mt-1.5 flex flex-wrap gap-1">
                                  <button
                                    type="button"
                                    onClick={() => window.open(s.meeting_link, '_blank', 'noopener,noreferrer')}
                                    className="rounded-lg bg-indigo-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-indigo-700"
                                  >
                                    Link
                                  </button>
                                  {canManageSlots ? (
                                    <button
                                      type="button"
                                      onClick={() => openEditSlot(s)}
                                      className="inline-flex items-center gap-1 rounded-lg border border-indigo-300 bg-white px-2 py-1 text-[10px] font-semibold text-indigo-700 shadow-sm hover:bg-indigo-50"
                                    >
                                      <Pencil className="h-3 w-3" />
                                      Düzenle
                                    </button>
                                  ) : null}
                                  {canManageSlots ? (
                                    <button
                                      type="button"
                                      onClick={() => void deleteSlot(s.id)}
                                      className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2 py-1 text-[10px] font-semibold text-red-700 hover:bg-red-50"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                      Sil
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </WeeklyLiveGridShell>

      {editingSession && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl space-y-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                <Pencil className="h-5 w-5 text-indigo-600" />
                Oturumu düzenle
              </h3>
              <button
                type="button"
                className="text-sm text-slate-500 hover:text-slate-800"
                onClick={() => setEditingSession(null)}
              >
                Kapat
              </button>
            </div>
            <label className="block text-sm">
              <span className="text-slate-600">Ders</span>
              <input
                value={esSubject}
                onChange={(e) => setEsSubject(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Tarih</span>
              <input
                type="date"
                value={esDate}
                onChange={(e) => setEsDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              />
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-slate-600">Başlangıç</span>
                <input
                  type="time"
                  value={esStart}
                  onChange={(e) => setEsStart(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">Bitiş</span>
                <input
                  type="time"
                  value={esEnd}
                  onChange={(e) => setEsEnd(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                />
              </label>
            </div>
            <label className="block text-sm">
              <span className="text-slate-600">Toplantı bağlantısı</span>
              <input
                value={esLink}
                onChange={(e) => setEsLink(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Ödev (isteğe bağlı)</span>
              <textarea
                value={esHomework}
                onChange={(e) => setEsHomework(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700"
                onClick={() => setEditingSession(null)}
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={sessionEditBusy}
                onClick={() => void saveSessionEdit()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {sessionEditBusy ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingSlotRow && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl space-y-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                <Pencil className="h-5 w-5 text-indigo-600" />
                Haftalık şablonu düzenle
              </h3>
              <button
                type="button"
                className="text-sm text-slate-500 hover:text-slate-800"
                onClick={() => setEditingSlotRow(null)}
              >
                Kapat
              </button>
            </div>
            <label className="block text-sm">
              <span className="text-slate-600">Gün</span>
              <select
                value={slDay}
                onChange={(e) => setSlDay(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              >
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <option key={d} value={d}>
                    {DAY_LABELS[d - 1]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Ders</span>
              <input
                value={slSubject}
                onChange={(e) => setSlSubject(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              />
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-slate-600">Başlangıç</span>
                <input
                  type="time"
                  value={slStart}
                  onChange={(e) => setSlStart(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">Bitiş</span>
                <input
                  type="time"
                  value={slEnd}
                  onChange={(e) => setSlEnd(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                />
              </label>
            </div>
            <label className="block text-sm">
              <span className="text-slate-600">Bağlantı</span>
              <input
                value={slLink}
                onChange={(e) => setSlLink(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Ödev (isteğe bağlı)</span>
              <textarea
                value={slHomework}
                onChange={(e) => setSlHomework(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700"
                onClick={() => setEditingSlotRow(null)}
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={slotEditBusy}
                onClick={() => void saveSlotEdit()}
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
              >
                {slotEditBusy ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {attendanceSession && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeAttendanceModal();
          }}
        >
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col border border-slate-200">
            <div className="px-4 py-3 border-b border-slate-100 flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-slate-900">Yoklama</h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  {attendanceSession.subject} · {formatDdMmYyyyDots(attendanceSession.lesson_date)} ·{' '}
                  {String(attendanceSession.start_time).slice(0, 5)}
                </p>
              </div>
              <button
                type="button"
                className="text-slate-500 hover:text-slate-800 text-sm"
                onClick={closeAttendanceModal}
              >
                Kapat
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 space-y-2">
              {attendanceModalLoading ? (
                <p className="text-sm text-slate-500">Yükleniyor…</p>
              ) : attendanceDraft.length === 0 ? (
                <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  Bu sınıfa henüz öğrenci atanmamış veya liste boş. Önce sınıf üyelerinden öğrenci ekleyin.
                </p>
              ) : (
                attendanceDraft.map((row, idx) => {
                  const stu = safeStudents.find((x) => x.id === row.student_id);
                  return (
                    <div
                      key={row.student_id}
                      className="flex items-center justify-between gap-2 text-sm border border-slate-100 rounded-lg px-3 py-2"
                    >
                      <span className="text-slate-800">{stu?.name || row.student_id}</span>
                      <select
                        value={row.status}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const v =
                            raw === 'absent' ? ('absent' as const) : raw === 'late' ? ('late' as const) : ('present' as const);
                          setAttendanceDraft((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, status: v } : r))
                          );
                        }}
                        className="border border-slate-200 rounded px-2 py-1 text-xs"
                      >
                        <option value="present">Katıldı</option>
                        <option value="late">Geç katıldı</option>
                        <option value="absent">Katılmadı</option>
                      </select>
                    </div>
                  );
                })
              )}
            </div>
            <div className="px-4 py-3 border-t border-slate-100 flex justify-end gap-2 bg-slate-50/80">
              <button
                type="button"
                className="px-3 py-1.5 rounded border border-slate-200 text-sm"
                onClick={closeAttendanceModal}
              >
                İptal
              </button>
              <button
                type="button"
                disabled={attendanceModalLoading || attendanceDraft.length === 0 || attendanceSaving}
                className="px-3 py-1.5 rounded bg-amber-600 text-white text-sm disabled:opacity-50"
                onClick={() => void saveAttendance()}
              >
                {attendanceSaving ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}
