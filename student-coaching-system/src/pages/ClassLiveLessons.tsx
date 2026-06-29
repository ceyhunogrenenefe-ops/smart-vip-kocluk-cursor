import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/session';
import { resolveStudentRecordId } from '../lib/coachResolve';
import StudentLiveLessonsPanel from '../components/liveLessons/StudentLiveLessonsPanel';
import { WeeklyLiveGridShell } from '../components/liveLessons/WeeklyLiveGridShell';
import { ClassLiveStudentMobileCalendar } from '../components/liveLessons/ClassLiveStudentMobileCalendar';
import { liveSubjectAccent } from '../components/liveLessons/liveSubjectAccent';
import { useStudentMobileShell } from '../hooks/useStudentMobileShell';
import { useMobileAppShell } from '../hooks/useMobileAppShell';
import type { Student } from '../types';
import { GripVertical, KeyRound, Loader2, Pencil, PlayCircle, Trash2, FileDown, Bell } from 'lucide-react';
import BbbAutoLinkFieldHint from '../components/liveLessons/BbbAutoLinkFieldHint';
import { isBbbJoinUrl, hasClassSessionRecordingAccess, isBbbPlaybackUrl, needsBbbJoinFlow, displayMeetingLinkForRow, meetingLinkForSave } from '../lib/liveLessonUtils';
import { openBbbJoin, openBbbRecording } from '../lib/bbbJoin';
import ClassLiveClassManager from '../components/liveLessons/ClassLiveClassManager';
import { copyGuestJoinShareText } from '../lib/bbbGuestJoin';
import { useRecordingUnavailableAlert, recordingUnavailableText } from '../hooks/useRecordingUnavailableAlert';
import { SolutionLessonStudentActions } from '../components/solutionAppointments/SolutionLessonStudentActions';
import { isSolutionLessonSubject } from '../lib/solutionAppointments/utils';

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

type SlotRow = {
  id: string;
  class_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  subject: string;
  teacher_id: string;
  /** API: users tablosundan (öğrenci /api/users kullanmadan gösterim için) */
  teacher_name?: string;
  meeting_link: string;
  join_link?: string;
  homework?: string | null;
};
type TeacherOption = { id: string; name: string };
type SessionRow = {
  id: string;
  class_id: string;
  lesson_date: string;
  start_time: string;
  end_time: string;
  subject: string;
  teacher_id: string;
  teacher_name?: string;
  meeting_link: string;
  join_link?: string;
  recording_link?: string | null;
  bbb_meeting_id?: string | null;
  status: string;
  homework?: string | null;
  reminder_sent?: boolean;
  schedule_batch_id?: string | null;
};

function normalizeSessionTime(t: string): string {
  return String(t || '').slice(0, 8);
}

function sessionBatchSignature(session: SessionRow): string {
  return [
    String(session.class_id || ''),
    String(session.subject || '').trim(),
    String(session.teacher_id || ''),
    normalizeSessionTime(session.start_time),
    normalizeSessionTime(session.end_time)
  ].join('|');
}

/** Toplu planlanmış oturum eşleri (schedule_batch_id veya aynı şablon imzası). */
function inferSessionBatchPeers(session: SessionRow, pool: SessionRow[]): SessionRow[] {
  const scheduled = pool.filter((s) => s.status === 'scheduled');
  if (session.schedule_batch_id) {
    const peers = scheduled.filter((s) => s.schedule_batch_id === session.schedule_batch_id);
    if (peers.length > 1) return peers;
  }
  const sig = sessionBatchSignature(session);
  const peers = scheduled.filter((s) => sessionBatchSignature(s) === sig);
  return peers.length > 1 ? peers : [session];
}

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

export default function ClassLiveLessons() {
  const { effectiveUser } = useAuth();
  const { students, institution, activeInstitutionId } = useApp();
  const [searchParams] = useSearchParams();
  const safeStudents = Array.isArray(students) ? students : [];
  const role = String(effectiveUser?.role || '');
  const actorUserId = String(effectiveUser?.id || '');
  const canManageClasses = role === 'admin' || role === 'super_admin' || role === 'coach';
  const canOpenSchedulePlanner = role === 'admin' || role === 'super_admin';
  const canManageSlots = canManageClasses || role === 'teacher';
  const canViewPaymentSummary = role === 'admin' || role === 'super_admin';
  const isStudentView = role.toLowerCase() === 'student';
  const studentMobileShell = useStudentMobileShell();
  const mobileAppShell = useMobileAppShell();
  const [isCompactMobile, setIsCompactMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const sync = () => setIsCompactMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const showMobileCalendar =
    (isStudentView && (studentMobileShell || isCompactMobile)) ||
    (!isStudentView && mobileAppShell);

  const resolvedStudentId = useMemo(() => {
    const sid =
      resolveStudentRecordId('student', effectiveUser?.studentId, effectiveUser?.email, safeStudents)?.trim() ||
      effectiveUser?.studentId?.trim() ||
      '';
    return isStudentView ? sid : '';
  }, [isStudentView, effectiveUser?.studentId, effectiveUser?.email, safeStudents]);

  const studentAppointmentDefaults = useMemo(() => {
    if (!resolvedStudentId) return { name: effectiveUser?.name || '', class_level: '' };
    const st = safeStudents.find((x) => x.id === resolvedStudentId);
    return {
      name: st?.name || effectiveUser?.name || '',
      class_level: st?.class_level || st?.school || ''
    };
  }, [resolvedStudentId, safeStudents, effectiveUser?.name]);

  /** Öğrenci: grup takvimi | birebir canlı dersler */
  type StudentScheduleTab = 'group' | 'private';
  const [studentScheduleTab, setStudentScheduleTab] = useState<StudentScheduleTab>('group');

  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [selectedClassId, setSelectedClassId] = useState(() => {
    const cid = String(typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('class_id') || '' : '').trim();
    return cid;
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { showRecordingUnavailable, recordingAlertModal } = useRecordingUnavailableAlert();
  const [loading, setLoading] = useState(false);
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [teacherOptions, setTeacherOptions] = useState<TeacherOption[]>([]);

  const [slotDay, setSlotDay] = useState(1);
  const [slotHour, setSlotHour] = useState(10);
  const [slotMinute, setSlotMinute] = useState(0);
  const [slotSubject, setSlotSubject] = useState('');
  const [slotTeacherId, setSlotTeacherId] = useState('');
  const [slotMeetingLink, setSlotMeetingLink] = useState('');

  const [calendarWeekMondayIso, setCalendarWeekMondayIso] = useState(() => {
    const week = String(typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('week') || '' : '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(week)) return mondayIsoContaining(week);
    return mondayIsoContaining();
  });
  const [weekSessions, setWeekSessions] = useState<SessionRow[]>([]);
  const [batchSessionsPool, setBatchSessionsPool] = useState<SessionRow[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const classCalendarPdfRef = useRef<HTMLDivElement>(null);
  const [classPdfSnapBusy, setClassPdfSnapBusy] = useState(false);

  const canMarkAttendance = canManageSlots && !isStudentView && Boolean(selectedClassId);
  const canSendLessonReminder = canMarkAttendance;

  const hintLessonReminderError = (note: string) => {
    const n = String(note || '').toLowerCase();
    if (n.includes('template_not_found')) return 'Grup dersi hatırlatma şablonu (class_lesson_reminder) tanımlı değil.';
    if (n.includes('template_inactive')) return 'Hatırlatma şablonu pasif — Mesaj şablonlarından açın.';
    if (n.includes('meta_whatsapp_not_ready')) return 'Meta WhatsApp yapılandırması eksik.';
    if (n.includes('meta_template_name_required')) return 'Şablonda Meta adı (meta_template_name) boş.';
    if (n.includes('invalid_phone') || n.includes('no_valid_phone')) return 'Öğrenci/veli telefonu geçersiz veya eksik.';
    if (n.includes('132001') || (n.includes('template') && n.includes('not exist')))
      return 'Meta’da class_lesson_reminder şablonu onaylı değil veya senkron değil.';
    return String(note || 'Gönderim başarısız');
  };

  const sendSessionLessonReminder = async (s: SessionRow) => {
    if (reminderBusyId || s.reminder_sent) return;
    const ok = window.confirm(
      `${s.subject} (${String(s.start_time).slice(0, 5)}) için sınıftaki öğrenci ve velilere WhatsApp hatırlatması gönderilsin mi?\n\nOtomatik cron ile aynı şablon kullanılır.`
    );
    if (!ok) return;
    setReminderBusyId(s.id);
    setError(null);
    try {
      const res = await apiFetch('/api/class-live-lessons?op=send-lesson-reminder', {
        method: 'POST',
        body: JSON.stringify({ session_id: s.id })
      });
      const j = await res.json().catch(() => ({}));
      if (j.skipped === 'already_sent') {
        setWeekSessions((prev) => prev.map((row) => (row.id === s.id ? { ...row, reminder_sent: true } : row)));
        return;
      }
      if (!res.ok) {
        setError(hintLessonReminderError(String(j.error || 'send_failed')));
        return;
      }
      const sent = Number(j.sent_count) || 0;
      const failed = Number(j.failed_count) || 0;
      if (j.reminder_sent) {
        setWeekSessions((prev) => prev.map((row) => (row.id === s.id ? { ...row, reminder_sent: true } : row)));
      }
      if (failed > 0 && sent === 0) {
        const details = Array.isArray(j.details) ? j.details : [];
        const firstErr = details.find((d: { error?: string }) => d?.error);
        setError(`Hatırlatma gönderilemedi: ${hintLessonReminderError(String(firstErr?.error || ''))}`);
      } else if (failed > 0) {
        setError(`Hatırlatma kısmen gönderildi (${sent} başarılı, ${failed} hatalı). WhatsApp Merkezi loglarına bakın.`);
      }
      void loadWeekSessions();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hatırlatma gönderilemedi');
    } finally {
      setReminderBusyId(null);
    }
  };

  const copySessionGuestLink = useCallback(async (s: SessionRow) => {
    try {
      await copyGuestJoinShareText('class', s.id);
      setNotice('Davet metni panoya kopyalandı (WhatsApp için kısa link + ders bilgisi).');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const joinClassSession = useCallback(async (s: { id: string; join_link?: string; meeting_link?: string; lesson_date?: string }) => {
    const url = String(s.join_link || s.meeting_link || '').trim();
    if (!url) {
      setError('Toplantı bağlantısı yok.');
      return;
    }
    try {
      if (needsBbbJoinFlow(url)) {
        const kind = s.lesson_date ? 'session' : 'slot';
        await openBbbJoin('class-live-lessons', s.id, { kind });
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const watchClassSessionRecording = useCallback(
    async (s: {
      id: string;
      join_link?: string;
      meeting_link?: string;
      recording_link?: string | null;
    }) => {
      const cached = String(s.recording_link || '').trim();
      const sessionLink = String(s.join_link || s.meeting_link || '').trim();
      try {
        if (cached && (isBbbPlaybackUrl(cached) || !isBbbJoinUrl(cached))) {
          window.open(cached, '_blank', 'noopener,noreferrer');
          return;
        }
        if (needsBbbJoinFlow(sessionLink)) {
          await openBbbRecording('class-live-lessons', s.id);
          return;
        }
        if (sessionLink) window.open(sessionLink, '_blank', 'noopener,noreferrer');
        else showRecordingUnavailable('Kayıt bağlantısı yok.');
      } catch (e) {
        showRecordingUnavailable(recordingUnavailableText(e));
      }
    },
    [showRecordingUnavailable]
  );

  const [attendanceSession, setAttendanceSession] = useState<SessionRow | null>(null);
  const [attendanceDraft, setAttendanceDraft] = useState<
    { student_id: string; status: 'present' | 'absent' | 'late' }[]
  >([]);
  const [attendanceModalLoading, setAttendanceModalLoading] = useState(false);
  const [attendanceSaving, setAttendanceSaving] = useState(false);

  const [editingSession, setEditingSession] = useState<SessionRow | null>(null);
  const [editingSlotRow, setEditingSlotRow] = useState<SlotRow | null>(null);
  const [sessionEditScope, setSessionEditScope] = useState<'single' | 'batch'>('single');
  const [sessionEditBusy, setSessionEditBusy] = useState(false);
  const [slotEditBusy, setSlotEditBusy] = useState(false);
  const [reminderBusyId, setReminderBusyId] = useState<string | null>(null);
  const [esSubject, setEsSubject] = useState('');
  const [esDate, setEsDate] = useState('');
  const [esStart, setEsStart] = useState('');
  const [esEnd, setEsEnd] = useState('');
  const [esLink, setEsLink] = useState('');
  const [esHomework, setEsHomework] = useState('');
  const [esTeacherId, setEsTeacherId] = useState('');
  const [slDay, setSlDay] = useState(1);
  const [slSubject, setSlSubject] = useState('');
  const [slStart, setSlStart] = useState('');
  const [slEnd, setSlEnd] = useState('');
  const [slLink, setSlLink] = useState('');
  const [slHomework, setSlHomework] = useState('');
  const [slTeacherId, setSlTeacherId] = useState('');

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

  const classTeacherOptions = useMemo(() => {
    const ids = new Set(selectedClass?.teacher_ids || []);
    let list = teacherCandidates.filter((t) => ids.has(t.id));
    const ensure = (tid: string | undefined) => {
      const t = String(tid || '').trim();
      if (!t || list.some((x) => x.id === t)) return;
      const found = teacherCandidates.find((x) => x.id === t);
      list = [{ id: t, name: found?.name || `${t.slice(0, 8)}…` }, ...list];
    };
    ensure(editingSession?.teacher_id);
    ensure(editingSlotRow?.teacher_id);
    return list;
  }, [teacherCandidates, selectedClass?.teacher_ids, editingSession?.teacher_id, editingSlotRow?.teacher_id]);

  const classSlots = useMemo(() => slots.filter((s) => s.class_id === selectedClassId), [slots, selectedClassId]);

  const calendarHours = useMemo(() => {
    const hours = new Set<number>();
    for (let h = 8; h <= 22; h++) hours.add(h);
    for (const s of classSlots) {
      const h = Number(String(s.start_time || '').slice(0, 2));
      if (Number.isFinite(h)) hours.add(h);
    }
    for (const s of weekSessions) {
      if (s.class_id !== selectedClassId) continue;
      const h = Number(String(s.start_time || '').slice(0, 2));
      if (Number.isFinite(h)) hours.add(h);
    }
    return [...hours].sort((a, b) => a - b);
  }, [classSlots, weekSessions, selectedClassId]);

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
      await apiFetch('/api/class-live-lessons?op=ensure-sessions-range', {
        method: 'POST',
        body: JSON.stringify({
          class_id: selectedClassId,
          date_from: from,
          date_to: to,
          institution_id: activeInstitutionId || institution?.id || undefined
        })
      }).catch(() => null);
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
  }, [selectedClassId, weekColumnDates, activeInstitutionId, institution?.id]);

  const loadBatchSessionsPool = useCallback(async () => {
    if (!selectedClassId) {
      setBatchSessionsPool([]);
      return;
    }
    try {
      const qs = new URLSearchParams({ scope: 'sessions', class_id: selectedClassId });
      const res = await apiFetch(`/api/class-live-lessons?${qs.toString()}`);
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBatchSessionsPool([]);
        return;
      }
      const rows = (Array.isArray(j.data) ? j.data : []) as SessionRow[];
      setBatchSessionsPool(rows.filter((s) => s.status === 'scheduled'));
    } catch {
      setBatchSessionsPool([]);
    }
  }, [selectedClassId]);

  useEffect(() => {
    void loadBatchSessionsPool();
  }, [loadBatchSessionsPool]);

  const sessionEditPeerCount = useMemo(() => {
    if (!editingSession) return 0;
    const pool = batchSessionsPool.length ? batchSessionsPool : weekSessions;
    return inferSessionBatchPeers(editingSession, pool).length;
  }, [editingSession, batchSessionsPool, weekSessions]);

  useEffect(() => {
    void loadWeekSessions();
  }, [loadWeekSessions]);

  useEffect(() => {
    const cid = searchParams.get('class_id')?.trim();
    const week = searchParams.get('week')?.trim();
    if (cid) setSelectedClassId(cid);
    if (week && /^\d{4}-\d{2}-\d{2}$/.test(week)) {
      setCalendarWeekMondayIso(mondayIsoContaining(week));
    }
  }, [searchParams]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const instId =
        role === 'super_admin'
          ? String(activeInstitutionId || institution?.id || '').trim()
          : '';
      const classQs = new URLSearchParams({ scope: 'classes' });
      const slotQs = new URLSearchParams({ scope: 'slots' });
      if (instId) {
        classQs.set('institution_id', instId);
        slotQs.set('institution_id', instId);
      }
      const [cRes, sRes] = await Promise.all([
        apiFetch(`/api/class-live-lessons?${classQs.toString()}`),
        apiFetch(`/api/class-live-lessons?${slotQs.toString()}`)
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
        if (!filteredClasses.length) return cur || '';
        if (cur && filteredClasses.some((c) => c.id === cur)) return cur;
        if (cur) return cur;
        return filteredClasses[0].id;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yükleme hatası');
    } finally {
      setLoading(false);
    }
  }, [role, activeInstitutionId, institution?.id, isStudentView, resolvedStudentId]);

  const loadClassSlots = useCallback(async (classId: string) => {
    const cid = String(classId || '').trim();
    if (!cid) return;
    try {
      const qs = new URLSearchParams({ scope: 'slots', class_id: cid });
      const res = await apiFetch(`/api/class-live-lessons?${qs.toString()}`);
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return;
      const rows = Array.isArray(j.data) ? (j.data as SlotRow[]) : [];
      setSlots((prev) => [...prev.filter((s) => s.class_id !== cid), ...rows]);
    } catch {
      /* sessiz */
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (selectedClassId) void loadClassSlots(selectedClassId);
  }, [selectedClassId, loadClassSlots]);

  useEffect(() => {
    if (isStudentView) {
      setTeacherOptions([]);
      return;
    }
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
  }, [isStudentView]);

  const handleCreateClass = async (payload: {
    name: string;
    class_level: string;
    branch?: string;
    teacher_ids: string[];
    student_ids: string[];
  }): Promise<boolean> => {
    const instId = String(
      role === 'super_admin'
        ? activeInstitutionId || institution?.id || effectiveUser?.institution_id || ''
        : effectiveUser?.institution_id || activeInstitutionId || institution?.id || ''
    ).trim();
    const res = await apiFetch('/api/class-live-lessons?op=create-class', {
      method: 'POST',
      body: JSON.stringify({
        name: payload.name.trim(),
        class_level: payload.class_level,
        branch: payload.branch?.trim() || undefined,
        teacher_ids: payload.teacher_ids,
        student_ids: payload.student_ids,
        ...(instId ? { institution_id: instId } : {})
      })
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(String(j.error || 'Sınıf oluşturulamadı'));
      return false;
    }
    setError(null);
    await loadAll();
    return true;
  };

  const handleUpdateClass = async (
    classId: string,
    payload: {
      name: string;
      class_level: string;
      branch: string | null;
      teacher_ids: string[];
      student_ids: string[];
    }
  ): Promise<boolean> => {
    const res = await apiFetch('/api/class-live-lessons?op=update-class-members', {
      method: 'POST',
      body: JSON.stringify({
        class_id: classId,
        name: payload.name.trim(),
        class_level: payload.class_level,
        branch: payload.branch,
        teacher_ids: payload.teacher_ids,
        student_ids: payload.student_ids
      })
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(String(j.error || 'Sınıf güncellenemedi'));
      return false;
    }
    setError(null);
    await loadAll();
    return true;
  };

  const handleDeleteClass = async (classId: string, className: string): Promise<boolean> => {
    if (!window.confirm(`«${className}» sınıfını silmek istediğinize emin misiniz?`)) return false;
    const res = await apiFetch(`/api/class-live-lessons?class_id=${encodeURIComponent(classId)}`, {
      method: 'DELETE'
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(String(j.error || 'Sınıf silinemedi'));
      return false;
    }
    if (selectedClassId === classId) setSelectedClassId('');
    setError(null);
    await loadAll();
    return true;
  };

  const effectiveSlotTeacherId = role === 'teacher' ? actorUserId : slotTeacherId || selectedClass?.teacher_ids?.[0] || '';

  const createSlot = async () => {
    if (!selectedClassId || !slotSubject.trim() || scheduleBusy) return;
    const teacherId = effectiveSlotTeacherId;
    if (!teacherId) {
      alert('Öğretmen seçin.');
      return;
    }
    setScheduleBusy(true);
    try {
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
          meeting_link: slotMeetingLink.trim() || undefined
        })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errText = [j.error, j.code === 'bbb_create_failed' ? 'BBB sunucusu yanıt vermedi.' : '', j.code === 'subject_meeting_link_required' ? 'BBB API tanımlı değil veya link zorunlu.' : '', j.code === 'teacher_time_conflict' ? 'Aynı gün/saatte başka ders veya şablon var.' : ''].filter(Boolean).join(' ');
        setError(errText || 'Ders şablonu eklenemedi');
        return;
      }
      setSlotSubject('');
      setSlotMeetingLink('');
      await loadAll();
      await loadWeekSessions();
    } finally {
      setScheduleBusy(false);
    }
  };

  const bulkScheduleSessions = async () => {
    if (!selectedClassId || !slotSubject.trim() || scheduleBusy) return;
    const teacherId = effectiveSlotTeacherId;
    if (!teacherId) {
      alert('Öğretmen seçin.');
      return;
    }
    setScheduleBusy(true);
    try {
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
          meeting_link: slotMeetingLink.trim() || undefined
        })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        const dateHint = j.lesson_date ? ` Tarih: ${j.lesson_date}.` : '';
        const errText = [j.error, j.reason, dateHint, j.code === 'bbb_create_failed' ? 'BBB sunucusu yanıt vermedi.' : '', j.code === 'subject_meeting_link_required' ? 'BBB API (Vercel) tanımlı değil; link girin veya BBB_API_ENDPOINT + BBB_API_SECRET ekleyin.' : '', j.code === 'teacher_time_conflict' ? 'Öğretmenin aynı saatte başka oturumu veya haftalık şablonu olabilir.' : ''].filter(Boolean).map(String).join(' — ');
        setError(errText || 'Oturumlar oluşturulamadı');
        return;
      }
      const n = Array.isArray(j.data) ? j.data.length : 0;
      const skipped = Array.isArray(j.skipped) ? j.skipped : [];
      setError(null);
      setSlotSubject('');
      setSlotMeetingLink('');
      await loadAll();
      await loadWeekSessions();
      await loadBatchSessionsPool();
      const skipNote =
        skipped.length > 0
          ? ` ${skipped.length} tarih atlandı (çakışma): ${skipped.map((s: { lesson_date?: string }) => s.lesson_date).filter(Boolean).join(', ')}.`
          : '';
      alert(`${n} adet tarihli oturum kaydedildi.${skipNote} Hatırlatma ve tamamlanan ders özeti bu kayıtlara göre çalışır.`);
    } finally {
      setScheduleBusy(false);
    }
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
      const waRows = Array.isArray(j.absent_whatsapp) ? j.absent_whatsapp : [];
      const waFailed = waRows.filter(
        (x: { ok?: boolean; skipped?: string }) => x && x.ok === false && x.skipped !== 'auto_whatsapp_absent_disabled'
      );
      const hintWa = (note: string) => {
        const n = String(note || '').toLowerCase();
        if (n.includes('template_not_found') || n === 'template_not_found')
          return 'Supabase’de message_templates.type = class_absent_notice_1 satırı yok veya SQL migration çalışmadı.';
        if (n.includes('parent_phone_missing')) return 'Öğrenci kartında veli telefonu (E.164) eksik veya geçersiz.';
        if (n.includes('meta_whatsapp_not_ready')) return 'Vercel’de META_WHATSAPP_TOKEN ve META_PHONE_NUMBER_ID tanımlı değil.';
        if (n.includes('meta_template_name_required')) return 'Şablonda Meta şablon adı (meta_template_name) boş.';
        if (n.includes('template_variables_invalid'))
          return 'Meta şablonundaki değişken sayısı/sırası, paneldeki twilio_variable_bindings ile uyuşmuyor.';
        if (n.includes('(#100)') || n.includes('invalid parameter'))
          return 'Meta (#100): dil kodunu (tr / tr_TR) Business ile eşleştirin; panelde "Meta adlandırılmış gövde" açık ve Meta’daki değişken adları sırayla aynı olmalı.';
        if (n.includes('template') && (n.includes('not exist') || n.includes('does not exist') || n.includes('132001')))
          return 'Meta Business’ta class_absent_notice_1 şablonu (dil tr) onaylı mı kontrol edin.';
        return String(note || 'Bilinmeyen hata');
      };
      closeAttendanceModal();
      if (waFailed.length) {
        const parts = waFailed.map((row: { student_id?: string; note?: string }) => {
          const sid = String(row.student_id || '');
          const stu = safeStudents.find((x) => x.id === sid);
          const name = stu?.name || sid.slice(0, 8);
          return `${name}: ${hintWa(String(row.note || ''))}`;
        });
        setError(`Yoklama kaydedildi. Veli WhatsApp gönderilemedi — ${parts.join(' · ')}`);
      } else {
        setError(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yoklama hatası');
    } finally {
      setAttendanceSaving(false);
    }
  };

  const deleteSessionRow = async (session: SessionRow, scopeOverride?: 'single' | 'batch') => {
    const pool = batchSessionsPool.length ? batchSessionsPool : weekSessions;
    const peers = inferSessionBatchPeers(session, pool);
    let scope = scopeOverride || 'single';
    if (!scopeOverride && peers.length > 1) {
      const deleteAll = window.confirm(
        `Bu oturum ${peers.length} periyotluk plandan.\n\nTamam → Tüm planlı periyotları sil\nİptal → Sadece ${session.lesson_date} oturumunu sil`
      );
      scope = deleteAll ? 'batch' : 'single';
    } else if (scopeOverride === 'batch' && peers.length > 1) {
      if (!window.confirm(`${peers.length} planlı oturum silinsin mi?`)) return;
    } else if (!window.confirm(`Bu tarihli (${session.lesson_date}) oturumu silmek istediğinize emin misiniz?`)) {
      return;
    }
    const qs =
      scope === 'batch' && peers.length > 1
        ? `session_id=${encodeURIComponent(session.id)}&apply_scope=batch`
        : `session_id=${encodeURIComponent(session.id)}`;
    const res = await apiFetch(`/api/class-live-lessons?${qs}`, {
      method: 'DELETE'
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(String(j.error || 'Oturum silinemedi'));
      return;
    }
    await loadWeekSessions();
    await loadBatchSessionsPool();
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
    setSessionEditScope('single');
    setEsSubject(s.subject);
    setEsDate(s.lesson_date);
    setEsStart(String(s.start_time || '').slice(0, 5));
    setEsEnd(String(s.end_time || '').slice(0, 5));
    setEsLink(displayMeetingLinkForRow(s, 'class', window.location.origin) || s.meeting_link || '');
    setEsHomework(s.homework || '');
    setEsTeacherId(s.teacher_id);
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
          meeting_link: meetingLinkForSave(esLink, editingSession, 'class', window.location.origin),
          homework: esHomework.trim() || null,
          ...(sessionEditScope === 'batch' && sessionEditPeerCount > 1 ? { apply_scope: 'batch' } : {}),
          ...(esTeacherId.trim() && esTeacherId.trim() !== editingSession.teacher_id
            ? { teacher_id: esTeacherId.trim() }
            : {})
        })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(String(j.error || 'Oturum güncellenemedi'));
        return;
      }
      setEditingSession(null);
      await loadWeekSessions();
      await loadBatchSessionsPool();
      if (Number(j.updated_count) > 1) {
        setNotice(`${j.updated_count} planlı oturum güncellendi.`);
      }
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
    setSlTeacherId(s.teacher_id);
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
          homework: slHomework.trim() || null,
          ...(slTeacherId.trim() && slTeacherId.trim() !== editingSlotRow.teacher_id
            ? { teacher_id: slTeacherId.trim() }
            : {})
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
      <div className={`rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-4 shadow-sm ${showMobileCalendar ? 'p-3' : ''}`}>
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

      <div className={`bg-white rounded-xl border border-slate-200 p-4 ${isStudentView ? 'hidden sm:block' : ''}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
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
          {canOpenSchedulePlanner && !isStudentView ? (
            <Link
              to="/schedule-planner"
              className="shrink-0 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-800 hover:bg-indigo-100"
            >
              Ders programı planlayıcı
            </Link>
          ) : null}
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-100 bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      {notice && (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50 text-emerald-800 px-3 py-2 text-sm">
          {notice}
        </div>
      )}
      {loading && <div className="text-sm text-slate-500">Yükleniyor...</div>}

      {canViewPaymentSummary && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-indigo-900">Grup dersi ödeme özeti ve öğretmen ödemeleri</p>
            <p className="text-sm text-indigo-800/80 mt-0.5">
              Tahsilat, taksit ve öğretmen birim ücretleri artık Muhasebe panelinde birleştirildi.
            </p>
          </div>
          <Link
            to="/muhasebe?tab=ogretmen"
            className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Muhasebe → Öğretmen ödemeleri
          </Link>
        </div>
      )}

      <ClassLiveClassManager
        classes={classes}
        selectedClassId={selectedClassId}
        onSelectClass={setSelectedClassId}
        students={safeStudents}
        teacherOptions={teacherCandidates}
        canManageClasses={canManageClasses}
        isStudentView={isStudentView}
        onCreateClass={handleCreateClass}
        onUpdateClass={handleUpdateClass}
        onDeleteClass={handleDeleteClass}
      />

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

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {scheduleKind === 'template' ? (
              <div>
                <label className="block text-xs text-slate-500 mb-0.5">Gün</label>
                <select value={slotDay} onChange={(e) => setSlotDay(Number(e.target.value))} className="w-full border border-slate-200 rounded px-3 py-2 text-sm">
                  {DAY_LABELS.map((d, i) => (
                    <option key={d} value={i + 1}>{d}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="sm:col-span-2 lg:col-span-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Saat ve ders bilgilerini aşağıdan seçin; <strong>tarih</strong> yukarıdaki «İlk ders tarihi» alanından gelir.
              </div>
            )}
            <div>
              <label className="block text-xs text-slate-500 mb-0.5">Saat</label>
              <select value={slotHour} onChange={(e) => setSlotHour(Number(e.target.value))} className="w-full border border-slate-200 rounded px-3 py-2 text-sm">
                {Array.from({ length: 13 }, (_, i) => 10 + i).map((h) => (
                  <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-0.5">Dakika</label>
              <select value={slotMinute} onChange={(e) => setSlotMinute(Number(e.target.value))} className="w-full border border-slate-200 rounded px-3 py-2 text-sm">
                {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => (
                  <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-slate-500 mb-0.5">Ders adı</label>
              <input value={slotSubject} onChange={(e) => setSlotSubject(e.target.value)} placeholder="Örn. Matematik" className="w-full border border-slate-200 rounded px-3 py-2 text-sm" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-slate-500 mb-0.5">Öğretmen</label>
              <select
                value={role === 'teacher' ? actorUserId : slotTeacherId}
                onChange={(e) => setSlotTeacherId(e.target.value)}
                className="w-full border border-slate-200 rounded px-3 py-2 text-sm"
                disabled={role === 'teacher'}
              >
                <option value="">Öğretmen seçin</option>
                {(role === 'teacher' ? teacherCandidates.filter((t) => t.id === actorUserId) : teacherCandidates).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>
          <BbbAutoLinkFieldHint
            id="class-slot-meeting-link"
            value={slotMeetingLink}
            onChange={setSlotMeetingLink}
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
                disabled={scheduleBusy}
                onClick={() => void bulkScheduleSessions()}
                className="px-4 py-2 rounded bg-emerald-600 text-white text-sm disabled:opacity-60 disabled:cursor-wait"
              >
                {scheduleBusy ? 'Oluşturuluyor…' : 'Tarihli oturumları oluştur'}
              </button>
            ) : (
              <button
                type="button"
                disabled={scheduleBusy}
                onClick={() => void createSlot()}
                className="px-4 py-2 rounded bg-teal-600 text-white text-sm disabled:opacity-60 disabled:cursor-wait"
              >
                {scheduleBusy ? 'Kaydediliyor…' : 'Şablonu kaydet'}
              </button>
            )}
          </div>
        </div>
      )}

      <WeeklyLiveGridShell
        title={isStudentView ? 'Bu haftanın canlı grup dersleri' : 'Haftalık grup ders takvimi'}
        subtitle={
          showMobileCalendar
            ? 'Gün seçin · Planlı derslerde Katıl ile bağlanın'
            : 'Sütunlar Pazartesi → Pazar (yerel hafta). Tarihli oturumlar ve haftalık şablon üzerinden tek ekranda planlayın.'
        }
        weekRangeLabel={weekRangeLabel}
        loading={calendarLoading}
        onPrevWeek={() => setCalendarWeekMondayIso((prev) => addDaysIso(prev, -7))}
        onNextWeek={() => setCalendarWeekMondayIso((prev) => addDaysIso(prev, 7))}
        onThisWeek={() => setCalendarWeekMondayIso(mondayIsoContaining())}
        legend={
          showMobileCalendar ? null : (
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
          )
        }
        hint={
          showMobileCalendar
            ? undefined
            : 'Yeşil kartlar gerçek oturumdur (planlı: Katıl; «Yoklama» ile manuel devamsızlık; tamamlanınca kayıt linki varsa Kaydı izle). Kesik çizgili kartlar şablondur. «PDF görüntü + ders listesi» önce takvim görüntüsü, sonra metin listesi üretir.'
        }
      >
        {!showMobileCalendar ? (
        <>
        <div className="flex flex-wrap items-center justify-end gap-2 border-b border-slate-100 bg-slate-50/80 px-2 py-2 sm:px-3">
          <button
            type="button"
            disabled={!selectedClassId || classPdfSnapBusy}
            onClick={() => {
              void (async () => {
                const el = classCalendarPdfRef.current;
                if (!selectedClassId || !el || weekColumnDates.length !== 7) return;
                setClassPdfSnapBusy(true);
                try {
                  const dateSet = new Set(weekColumnDates);
                  const sessionLines = weekSessions
                    .filter((s) => s.class_id === selectedClassId && dateSet.has(s.lesson_date))
                    .sort(
                      (a, b) =>
                        a.lesson_date.localeCompare(b.lesson_date) ||
                        String(a.start_time).localeCompare(String(b.start_time))
                    )
                    .map((s) => {
                      const teacher = teacherCandidates.find((t) => t.id === s.teacher_id);
                      return `${s.lesson_date} ${String(s.start_time).slice(0, 5)}–${String(s.end_time).slice(0, 5)} | ${s.subject} | ${teacher?.name || s.teacher_name || s.teacher_id} | ${s.status}`;
                    });
                  const templateLines = classSlots
                    .filter((s) => s.class_id === selectedClassId)
                    .sort(
                      (a, b) =>
                        a.day_of_week - b.day_of_week ||
                        String(a.start_time).localeCompare(String(b.start_time))
                    )
                    .map((s) => {
                      const teacher = teacherCandidates.find((t) => t.id === s.teacher_id);
                      return `[Şablon] ${DAY_LABELS[s.day_of_week - 1]} ${String(s.start_time).slice(0, 5)} | ${s.subject} | ${teacher?.name || s.teacher_name || s.teacher_id}`;
                    });
                  const lessonLines: string[] = [
                    `— Bu haftanın tarihli oturumları (${sessionLines.length}) —`,
                    ...(sessionLines.length ? sessionLines : ['(Bu hafta için oturum yok)']),
                    '',
                    `— Haftalık şablon satırları (${templateLines.length}) —`,
                    ...(templateLines.length ? templateLines : ['(Şablon yok)'])
                  ];
                  await downloadCalendarPdfWithSnapshot({
                    calendarElement: el,
                    filename: `grup-canli-ders-takvim-${weekColumnDates[0]}_${weekColumnDates[6]}.pdf`,
                    titleLine: `Grup canlı ders takvimi — ${selectedClass?.name || 'Sınıf'}`,
                    subtitleLines: [
                      weekRangeLabel,
                      '1. sayfa: ekrandaki takvim görüntüsü. Sonrası: oturum ve şablon listesi (metin).'
                    ],
                    listHeading: 'Ders / oturum listesi (metin)',
                    lessonLines,
                    footerNote:
                      'Veli ve öğrenciyle paylaşabilirsiniz. Canlı derse katılım için uygulamadaki bağlantıları kullanın.',
                    branding: {
                      institutionName: institution?.name || 'Kurum',
                      logoUrl: institution?.logo?.trim() || null
                    }
                  });
                } catch (e) {
                  window.alert(e instanceof Error ? e.message : 'PDF oluşturulamadı');
                } finally {
                  setClassPdfSnapBusy(false);
                }
              })();
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-600/50 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 shadow-sm hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-50"
          >
            {classPdfSnapBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileDown className="h-3.5 w-3.5" />
            )}
            PDF görüntü + ders listesi
          </button>
        </div>
        <div ref={classCalendarPdfRef} className="overflow-x-auto p-2 sm:p-3">
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
              {calendarHours.map((hour) => (
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
                            const sessionLink = String(s.join_link || s.meeting_link || '').trim();
                            const hasSessionLink = Boolean(sessionLink);
                            const canJoin = s.status === 'scheduled' && hasSessionLink;
                            const canWatchRecording = hasClassSessionRecordingAccess(s);
                            const isSolutionLesson = isSolutionLessonSubject(s.subject);
                            const teacherLabel = teacher?.name || s.teacher_name || s.teacher_id;
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
                                      {s.status === 'scheduled' && s.reminder_sent ? (
                                        <span className="rounded-md bg-teal-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-teal-800 ring-1 ring-teal-400/40">
                                          Hatırlatma ✓
                                        </span>
                                      ) : null}
                                    </div>
                                    <p className="mt-0.5 text-[11px] font-medium text-slate-800">
                                      {teacher?.name || s.teacher_name || s.teacher_id}
                                    </p>
                                    <p className="text-[10px] tabular-nums text-slate-600">
                                      {String(s.start_time).slice(0, 5)}–{String(s.end_time).slice(0, 5)}
                                    </p>
                                    <p className="text-[10px] font-medium capitalize text-slate-400">{s.status}</p>
                                  </div>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-1 calendar-pdf-hide-ui">
                                  {canJoin && !isStudentView ? (
                                    <button
                                      type="button"
                                      title="WhatsApp için kısa davet linki ve ders bilgisi panoya kopyalanır"
                                      onClick={() => void copySessionGuestLink(s)}
                                      className="rounded-lg border border-violet-300 bg-white px-2 py-1 text-[10px] font-semibold text-violet-700 hover:bg-violet-50"
                                    >
                                      Davet linki
                                    </button>
                                  ) : null}
                                  {isStudentView && isSolutionLesson ? (
                                    <SolutionLessonStudentActions
                                      session={s}
                                      teacherName={teacherLabel}
                                      studentDefaults={studentAppointmentDefaults}
                                      onJoin={(row) => void joinClassSession(row)}
                                    />
                                  ) : canJoin ? (
                                    <button
                                      type="button"
                                      onClick={() => void joinClassSession(s)}
                                      className="rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-2 py-1 text-[10px] font-semibold text-white shadow-sm hover:brightness-110"
                                    >
                                      Katıl
                                    </button>
                                  ) : null}
                                  {canWatchRecording ? (
                                    <button
                                      type="button"
                                      title="Ders kaydı / tekrar izleme bağlantısı"
                                      onClick={() => void watchClassSessionRecording(s)}
                                      className="inline-flex items-center gap-0.5 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-2 py-1 text-[10px] font-semibold text-white shadow-sm hover:brightness-110"
                                    >
                                      <PlayCircle className="h-3 w-3 shrink-0" aria-hidden />
                                      Kaydı izle
                                    </button>
                                  ) : null}
                                  {canSendLessonReminder && s.status === 'scheduled' && !s.reminder_sent ? (
                                    <button
                                      type="button"
                                      disabled={reminderBusyId === s.id}
                                      title="Otomatik cron gitmezse — aynı WhatsApp şablonu ile manuel hatırlatma"
                                      onClick={() => void sendSessionLessonReminder(s)}
                                      className="inline-flex items-center gap-0.5 rounded-lg bg-gradient-to-r from-teal-600 to-emerald-600 px-2 py-1 text-[10px] font-semibold text-white shadow-sm hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
                                    >
                                      {reminderBusyId === s.id ? (
                                        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                                      ) : (
                                        <Bell className="h-3 w-3 shrink-0" aria-hidden />
                                      )}
                                      Hatırlat
                                    </button>
                                  ) : null}
                                  {canMarkAttendance && (s.status === 'scheduled' || s.status === 'completed') ? (
                                    <button
                                      type="button"
                                      title="Öğrenci katılımını manuel işaretle; devamsızlar için veli WhatsApp"
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
                                      onClick={() => void deleteSessionRow(s)}
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
                            const slotLink = String(s.join_link || s.meeting_link || '').trim();
                            return (
                              <div
                                key={s.id}
                                className="rounded-xl border border-dashed border-indigo-300/80 border-l-[4px] border-l-indigo-400 bg-gradient-to-br from-indigo-50/95 to-white px-2.5 py-2 shadow-sm ring-1 ring-indigo-100/80"
                              >
                                <p className={`text-[12px] font-bold ${accent.title}`}>{s.subject}</p>
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-600">Şablon</p>
                                <p className="text-[11px] text-slate-600">
                                  {teacher?.name || s.teacher_name || s.teacher_id} · {String(s.start_time).slice(0, 5)}
                                </p>
                                <div className="mt-1.5 flex flex-wrap gap-1 calendar-pdf-hide-ui">
                                  {slotLink ? (
                                    <button
                                      type="button"
                                      onClick={() => void joinClassSession(s)}
                                      className="rounded-lg bg-indigo-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-indigo-700"
                                    >
                                      Katıl
                                    </button>
                                  ) : null}
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
        </>
        ) : (
          <ClassLiveStudentMobileCalendar
            weekColumnDates={weekColumnDates}
            weekSessions={weekSessions.filter((s) => s.class_id === selectedClassId)}
            classSlots={classSlots}
            teacherCandidates={teacherCandidates}
            formatDateDots={formatDdMmYyyyDots}
            dowFromIso={dowSlotFromIso}
            todayIso={todayIso()}
            onJoinSession={(s) => void joinClassSession(s)}
            onWatchSession={(s) => void watchClassSessionRecording(s)}
            studentAppointmentDefaults={studentAppointmentDefaults}
          />
        )}
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
            {sessionEditPeerCount > 1 ? (
              <fieldset className="space-y-2 rounded-lg border border-violet-200 bg-violet-50/50 p-3">
                <legend className="px-1 text-sm font-medium text-violet-900">Düzenleme kapsamı</legend>
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name="sessionEditScope"
                    checked={sessionEditScope === 'single'}
                    onChange={() => setSessionEditScope('single')}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium text-slate-800">Yalnızca bu oturum</span>
                    <span className="block text-xs text-slate-500">
                      {formatDdMmYyyyDots(editingSession.lesson_date)} tarihli ders
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name="sessionEditScope"
                    checked={sessionEditScope === 'batch'}
                    onChange={() => setSessionEditScope('batch')}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium text-slate-800">Tüm planlı periyotlar ({sessionEditPeerCount})</span>
                    <span className="block text-xs text-slate-500">
                      Ders adı, saat, öğretmen ve bağlantı tüm planlı oturumlara uygulanır; tarih oturuma özel kalır.
                    </span>
                  </span>
                </label>
              </fieldset>
            ) : null}
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
              <span className="text-slate-600">Öğretmen</span>
              <select
                value={esTeacherId}
                onChange={(e) => setEsTeacherId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              >
                {classTeacherOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-slate-500">
                Liste, sınıfa atanmış öğretmenlerden gelir; yeni öğretmen için önce sınıf atamalarını güncelleyin.
              </span>
            </label>
            <BbbAutoLinkFieldHint
              id="class-session-edit-link"
              value={esLink}
              onChange={setEsLink}
              placeholder="Canlı ders linki veya kayıt URL’si"
            />
            <p className="text-xs text-slate-500 -mt-1">
              Kayıt otomatik gelmezse: BBB yönetiminden oynatma URL’sini kopyalayıp bu alana yapıştırın veya
              «Kaydı izle» ile 5–15 dk sonra tekrar deneyin (derste kayıt başlatılmış olmalı).
            </p>
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
              <span className="text-slate-600">Öğretmen</span>
              <select
                value={slTeacherId}
                onChange={(e) => setSlTeacherId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              >
                {classTeacherOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <BbbAutoLinkFieldHint id="class-slot-edit-link" value={slLink} onChange={setSlLink} />
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
      {recordingAlertModal}
    </div>
  );
}
