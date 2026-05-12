import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/session';
import { detectPlatform } from '../lib/detectMeetingPlatform';
import type { TeacherLesson, TeacherStudentLessonSummaryRow, UserRole } from '../types';
import LiveLessonCard from '../components/liveLessons/LiveLessonCard';
import { WeeklyLiveGridShell } from '../components/liveLessons/WeeklyLiveGridShell';
import { liveSubjectAccent } from '../components/liveLessons/liveSubjectAccent';
import { Radio, Plus, Loader2, Filter, Clock, Pencil, Move, GripVertical, Trash2, FileDown } from 'lucide-react';

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/** Yerel takvim günü YYYY-AA-GG (UTC toISOString sütun kaymasını önler — Pzt…Paz doğru hizalanır). */
function isoFromLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayLocalIso(): string {
  return isoFromLocalDate(new Date());
}

function monthStartLocalIso(): string {
  const d = new Date();
  return isoFromLocalDate(new Date(d.getFullYear(), d.getMonth(), 1));
}

function defaultListFromIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return isoFromLocalDate(d);
}

function defaultListToIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 180);
  return isoFromLocalDate(d);
}

function lessonTimeRange(lesson: TeacherLesson): string {
  const raw = String(lesson.start_time || '09:00:00');
  const st = raw.length >= 5 ? raw.slice(0, 5) : '09:00';
  const dm = Number(lesson.duration_minutes ?? 60);
  const [h, m] = st.split(':').map((x) => Number(x || 0));
  const startM = (Number.isFinite(h) ? h : 9) * 60 + (Number.isFinite(m) ? m : 0);
  const endM = startM + (Number.isFinite(dm) ? dm : 60);
  const eh = Math.floor(endM / 60) % 24;
  const em = endM % 60;
  return `${st}–${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
}

type StaffUser = {
  id: string;
  name: string;
  email?: string;
  role: string;
};

export default function LiveLessons() {
  const { effectiveUser } = useAuth();
  const { students } = useApp();
  const role = (effectiveUser?.role || '') as UserRole;

  const [lessons, setLessons] = useState<TeacherLesson[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Tablo yok / şema önbelleği — kurulum SQL’i gerekir */
  const [schemaHint, setSchemaHint] = useState<string | null>(null);
  const [uiTick, setUiTick] = useState(0);

  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);

  const [filterTeacherId, setFilterTeacherId] = useState('');
  const [filterStudentId, setFilterStudentId] = useState('');
  const [filterPlatform, setFilterPlatform] = useState<string>('');
  const [summaryRows, setSummaryRows] = useState<TeacherStudentLessonSummaryRow[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryFrom, setSummaryFrom] = useState(monthStartLocalIso);
  const [summaryTo, setSummaryTo] = useState(todayLocalIso);

  /** API listesi: koç / öğretmen / yönetici seçilen aralıktaki dersleri çeker */
  const [listRangeFrom, setListRangeFrom] = useState(defaultListFromIso);
  const [listRangeTo, setListRangeTo] = useState(defaultListToIso);

  /** Haftalık takvim — görüntülenen hafta (Pzt başlangıcı) */
  const [calendarWeekAnchor, setCalendarWeekAnchor] = useState(() => new Date());

  const [formOpen, setFormOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [title, setTitle] = useState('');
  const [dateStr, setDateStr] = useState(() => todayLocalIso());
  const [startTime, setStartTime] = useState('09:00');
  const [durationMin, setDurationMin] = useState(60);
  const [meetingLink, setMeetingLink] = useState('');
  const [platformDraft, setPlatformDraft] = useState(detectPlatform(''));

  const [lessonRecurrence, setLessonRecurrence] = useState(false);
  const [lessonIntervalDays, setLessonIntervalDays] = useState<7 | 15>(7);
  const [lessonRecurrenceUntil, setLessonRecurrenceUntil] = useState('');

  const [adminTeacherId, setAdminTeacherId] = useState('');

  const [editingLesson, setEditingLesson] = useState<TeacherLesson | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDateStr, setEditDateStr] = useState('');
  const [editStart, setEditStart] = useState('09:00');
  const [editDuration, setEditDuration] = useState(60);
  const [editMeetingLink, setEditMeetingLink] = useState('');

  const canManage =
    role === 'super_admin' || role === 'admin' || role === 'teacher' || role === 'coach';
  const showAdminExtras = role === 'super_admin' || role === 'admin';
  const showTeacherPicker = role === 'super_admin' || role === 'admin';
  /** Liste / PDF / öğrenci filtresi: tüm yetkili roller */
  const showScopeFilters = canManage;

  const sortedStudents = useMemo(
    () => [...students].sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    [students]
  );

  const studentsForFilter = useMemo(() => {
    if (role === 'coach' && effectiveUser?.coachId) {
      return sortedStudents.filter((s) => s.coachId === effectiveUser.coachId);
    }
    return sortedStudents;
  }, [sortedStudents, role, effectiveUser?.coachId]);

  useEffect(() => {
    const id = window.setInterval(() => setUiTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    setPlatformDraft(detectPlatform(meetingLink));
  }, [meetingLink]);

  const loadLessons = useCallback(async () => {
    if (!canManage) return;
    setLoading(true);
    setError(null);
    setSchemaHint(null);
    try {
      const qs = new URLSearchParams();
      if (filterPlatform && ['bbb', 'zoom', 'meet', 'other'].includes(filterPlatform)) {
        qs.set('platform', filterPlatform);
      }
      if (showTeacherPicker && filterTeacherId.trim()) {
        qs.set('teacher_id', filterTeacherId.trim());
      }
      if (showScopeFilters && filterStudentId.trim()) {
        qs.set('student_id', filterStudentId.trim());
      }
      let from =
        listRangeFrom.trim() && /^\d{4}-\d{2}-\d{2}$/.test(listRangeFrom.trim())
          ? listRangeFrom.trim()
          : defaultListFromIso();
      let to =
        listRangeTo.trim() && /^\d{4}-\d{2}-\d{2}$/.test(listRangeTo.trim())
          ? listRangeTo.trim()
          : defaultListToIso();
      if (from > to) {
        const swap = from;
        from = to;
        to = swap;
      }
      qs.set('from', from);
      qs.set('to', to);
      const url = `/api/teacher-lessons${qs.toString() ? `?${qs.toString()}` : ''}`;
      const res = await apiFetch(url);
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errParts = [j.error, j.details, j.hint].filter(Boolean);
        setError(errParts.length ? errParts.map(String).join(' — ') : 'Liste yüklenemedi');
        if (j.code === 'supabase_permission_denied') {
          setSchemaHint(
            'Vercel’de sunucu ortamına SUPABASE_SERVICE_ROLE_KEY ekleyin (Supabase → Project Settings → API → service_role; istemciye asla koymayın). Yalnızca anon anahtar ile /api RLS’e takılır.'
          );
        }
        setLessons([]);
        return;
      }
      setLessons(Array.isArray(j.data) ? j.data : []);
      if (j.hint === 'teacher_lessons_sql_missing') {
        setSchemaHint(
          'Supabase veritabanında `teacher_lessons` tablosu yok (veya API şemayı henüz görmedi). SQL Editor’da `student-coaching-system/sql/2026-05-08-teacher-lessons.sql` içeriğini çalıştırın; dosyanın sonundaki şema bildirimi yeterli olmazsa birkaç dakika bekleyin veya projeyi yeniden deploy edin.'
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hata');
      setLessons([]);
    } finally {
      setLoading(false);
    }
  }, [
    canManage,
    filterPlatform,
    filterTeacherId,
    filterStudentId,
    showScopeFilters,
    showTeacherPicker,
    listRangeFrom,
    listRangeTo
  ]);

  const loadSummary = useCallback(async () => {
    if (!showAdminExtras) return;
    setSummaryLoading(true);
    try {
      const qs = new URLSearchParams({ op: 'summary' });
      if (filterTeacherId.trim()) qs.set('teacher_id', filterTeacherId.trim());
      if (filterStudentId.trim()) qs.set('student_id', filterStudentId.trim());
      if (summaryFrom.trim()) qs.set('from', summaryFrom.trim());
      if (summaryTo.trim()) qs.set('to', summaryTo.trim());
      const res = await apiFetch(`/api/teacher-lessons?${qs.toString()}`);
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSummaryRows([]);
        return;
      }
      setSummaryRows(Array.isArray(j.data) ? (j.data as TeacherStudentLessonSummaryRow[]) : []);
    } catch {
      setSummaryRows([]);
    } finally {
      setSummaryLoading(false);
    }
  }, [showAdminExtras, filterTeacherId, filterStudentId, summaryFrom, summaryTo]);

  useEffect(() => {
    void loadLessons();
  }, [loadLessons]);

  useEffect(() => {
    if (!showAdminExtras) {
      setSummaryRows([]);
      return;
    }
    void loadSummary();
  }, [showAdminExtras, loadSummary]);

  const mergedStaff = useMemo(() => {
    const m = new Map<string, StaffUser>();
    staffUsers.forEach((u) => m.set(u.id, u));
    if (effectiveUser?.id && !m.has(effectiveUser.id)) {
      m.set(effectiveUser.id, {
        id: effectiveUser.id,
        name: effectiveUser.name,
        email: effectiveUser.email,
        role: effectiveUser.role
      });
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }, [staffUsers, effectiveUser]);

  useEffect(() => {
    if (!showTeacherPicker) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/api/users');
        const j = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;
        const rows = Array.isArray(j.data) ? j.data : [];
        const staff = rows.filter((u: StaffUser) =>
          ['teacher', 'coach', 'admin'].includes(String(u.role))
        );
        setStaffUsers(staff);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showTeacherPicker]);

  useEffect(() => {
    if (effectiveUser?.id && showTeacherPicker && !adminTeacherId) {
      setAdminTeacherId(effectiveUser.id);
    }
  }, [effectiveUser?.id, showTeacherPicker, adminTeacherId]);

  const studentName = useCallback(
    (sid: string) => students.find((s) => s.id === sid)?.name || sid,
    [students]
  );

  const lessonListGroups = useMemo(() => {
    const singles: TeacherLesson[] = [];
    const bySeries = new Map<string, TeacherLesson[]>();
    for (const l of lessons) {
      if (!l.series_id) singles.push(l);
      else {
        const arr = bySeries.get(l.series_id) || [];
        arr.push(l);
        bySeries.set(l.series_id, arr);
      }
    }
    for (const arr of bySeries.values()) {
      arr.sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.start_time.localeCompare(b.start_time));
    }
    const groups = [...bySeries.entries()].map(([seriesId, items]) => {
      let intervalLabel = 'Tekrarlayan';
      if (items.length >= 2) {
        const t0 = new Date(items[0].date + 'T12:00:00');
        const t1 = new Date(items[1].date + 'T12:00:00');
        const gap = (t1.getTime() - t0.getTime()) / 86400000;
        intervalLabel = Math.round(gap) >= 14 ? '15 günde bir' : 'Haftalık';
      }
      return { seriesId, items, first: items[0], intervalLabel };
    });
    groups.sort((a, b) => String(a.first.date).localeCompare(String(b.first.date)));
    singles.sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.start_time.localeCompare(b.start_time));
    return { singles, groups };
  }, [lessons]);

  const weeklyLessonBuckets = useMemo(() => {
    const weekStart = startOfWeek(calendarWeekAnchor);
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const key = (d: Date) => isoFromLocalDate(d);
    const bucket: Record<string, TeacherLesson[]> = {};
    for (const d of days) bucket[key(d)] = [];
    for (const l of lessons) {
      if (l.status === 'cancelled') continue;
      const k = l.date;
      if (bucket[k]) bucket[k].push(l);
    }
    return days.map((d) => ({
      label: d.toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' }),
      key: key(d),
      items: (bucket[key(d)] || []).slice().sort((a, b) => a.start_time.localeCompare(b.start_time))
    }));
  }, [lessons, calendarWeekAnchor]);

  const liveCalendarWeekRangeLabel = useMemo(() => {
    const ws = startOfWeek(calendarWeekAnchor);
    const we = addDays(ws, 6);
    const fmt = (d: Date) =>
      d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `${fmt(ws)} – ${fmt(we)}`;
  }, [calendarWeekAnchor]);

  const deleteLessonSeries = async (seriesId: string) => {
    if (!window.confirm('Bu tekrarlayan ders serisindeki tüm planlı oturumlar silinsin mi?')) return;
    setError(null);
    try {
      const res = await apiFetch('/api/teacher-lessons?op=delete-series', {
        method: 'POST',
        body: JSON.stringify({ series_id: seriesId })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(String(j.error || 'Silinemedi'));
        return;
      }
      await loadLessons();
      if (showAdminExtras) void loadSummary();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId || !title.trim() || !meetingLink.trim()) return;
    if (lessonRecurrence) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(lessonRecurrenceUntil.trim())) {
        setError('Tekrar için son tarih (YYYY-AA-GG) girin.');
        return;
      }
    }
    setCreateBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        student_id: studentId,
        title: title.trim(),
        date: dateStr,
        start_time: startTime.length === 5 ? `${startTime}:00` : startTime,
        duration_minutes: durationMin,
        meeting_link: meetingLink.trim(),
        platform: platformDraft
      };
      if (showTeacherPicker && adminTeacherId.trim()) {
        body.teacher_id = adminTeacherId.trim();
      }
      if (lessonRecurrence) {
        body.interval_days = lessonIntervalDays;
        body.recurrence_until = lessonRecurrenceUntil.trim().slice(0, 10);
      }
      const op = lessonRecurrence ? 'create-series' : '';
      const url = op
        ? `/api/teacher-lessons?op=${encodeURIComponent(op)}`
        : '/api/teacher-lessons';
      const res = await apiFetch(url, { method: 'POST', body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (j.code === 'lesson_quota_exceeded') {
          setError(
            'Paket birimi yetersiz (ders süresine göre gerekli birim kotayı aşıyor). Öğrenciler sayfasından paket üst limitini artırın veya daha kısa süreli ders planlayın.'
          );
        } else {
          const errParts = [j.error, j.details, j.hint].filter(Boolean);
          setError(errParts.length ? errParts.map(String).join(' — ') : 'Kayıt oluşturulamadı');
        }
        if (j.code === 'supabase_permission_denied') {
          setSchemaHint(
            'Vercel ortamına SUPABASE_SERVICE_ROLE_KEY (service_role) ekleyip yeniden deploy edin.'
          );
        }
        if (j.hint === 'teacher_lessons_sql_missing' || j.code === 'teacher_lessons_table_missing') {
          setSchemaHint(String(j.error || ''));
        }
        return;
      }
      setFormOpen(false);
      setTitle('');
      setMeetingLink('');
      setLessonRecurrence(false);
      setLessonRecurrenceUntil('');
      await loadLessons();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hata');
    } finally {
      setCreateBusy(false);
    }
  };

  const patchStatus = async (id: string, status: 'cancelled' | 'completed') => {
    try {
      const res = await apiFetch('/api/teacher-lessons', {
        method: 'PATCH',
        body: JSON.stringify({ id, status })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(String(j.error || 'Güncellenemedi'));
        return;
      }
      await loadLessons();
      if (showAdminExtras) void loadSummary();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hata');
    }
  };

  const openEdit = (lesson: TeacherLesson) => {
    setEditingLesson(lesson);
    setEditTitle(lesson.title);
    setEditDateStr(lesson.date);
    const st = lesson.start_time || '09:00:00';
    setEditStart(st.length >= 5 ? st.slice(0, 5) : '09:00');
    setEditDuration(lesson.duration_minutes ?? 60);
    setEditMeetingLink(lesson.meeting_link);
    setError(null);
  };

  const saveEdit = async () => {
    if (!editingLesson || !editTitle.trim() || !editMeetingLink.trim()) return;
    setEditBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        id: editingLesson.id,
        title: editTitle.trim(),
        meeting_link: editMeetingLink.trim(),
        platform: detectPlatform(editMeetingLink.trim())
      };
      if (editingLesson.status === 'scheduled') {
        body.date = editDateStr;
        body.start_time = editStart.length === 5 ? `${editStart}:00` : editStart;
        body.duration_minutes = editDuration;
      }
      const res = await apiFetch('/api/teacher-lessons', {
        method: 'PATCH',
        body: JSON.stringify(body)
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(String(j.error || 'Kaydedilemedi'));
        return;
      }
      setEditingLesson(null);
      await loadLessons();
      if (showAdminExtras) void loadSummary();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEditBusy(false);
    }
  };

  const deleteLesson = async (id: string) => {
    if (!window.confirm('Bu ders kaydını kalıcı olarak silmek istediğinize emin misiniz?')) return;
    setError(null);
    try {
      const res = await apiFetch(`/api/teacher-lessons?id=${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(String(j.error || 'Silinemedi'));
        return;
      }
      setEditingLesson((cur) => (cur?.id === id ? null : cur));
      await loadLessons();
      if (showAdminExtras) void loadSummary();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (!canManage) {
    return (
      <div className="p-6 text-center text-slate-600">
        Bu sayfaya erişim yetkiniz yok.
      </div>
    );
  }

  return (
    <div className="space-y-6 p-2 md:p-0">
      <span className="hidden" aria-hidden>
        {uiTick}
      </span>
      <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <Radio className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Canlı özel ders entegrasyonu</h1>
              <p className="text-indigo-100 text-sm mt-0.5">
                Zoom, Google Meet ve BigBlueButton bağlantılarıyla özel ders planlayın
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setFormOpen((v) => !v)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white text-indigo-700 font-semibold hover:bg-indigo-50"
          >
            <Plus className="w-5 h-5" />
            Yeni canlı özel ders
          </button>
        </div>
      </div>

      {schemaHint && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 text-amber-950 px-4 py-3 text-sm leading-relaxed">
          <strong className="font-semibold">Veritabanı kurulumu:</strong> {schemaHint}
        </div>
      )}

      {showScopeFilters && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap gap-4 items-end">
          <div className="flex items-center gap-2 text-slate-600">
            <Filter className="w-4 h-4" />
            <span className="text-sm font-medium">Liste ve takvim</span>
          </div>
          {showTeacherPicker ? (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-500">Öğretmen / koç kullanıcı</span>
              <select
                value={filterTeacherId}
                onChange={(e) => setFilterTeacherId(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 min-w-[200px]"
              >
                <option value="">Tümü</option>
                {mergedStaff.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role}) — {u.email || u.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500">Öğrenci</span>
            <select
              value={filterStudentId}
              onChange={(e) => setFilterStudentId(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 min-w-[200px]"
            >
              <option value="">Tümü</option>
              {studentsForFilter.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500">Liste başlangıç</span>
            <input
              type="date"
              value={listRangeFrom}
              onChange={(e) => setListRangeFrom(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500">Liste bitiş</span>
            <input
              type="date"
              value={listRangeTo}
              onChange={(e) => setListRangeTo(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500">Platform</span>
            <select
              value={filterPlatform}
              onChange={(e) => setFilterPlatform(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2"
            >
              <option value="">Tümü</option>
              <option value="zoom">Zoom</option>
              <option value="meet">Google Meet</option>
              <option value="bbb">BigBlueButton</option>
              <option value="other">Diğer</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              const ws = startOfWeek(calendarWeekAnchor);
              const we = addDays(ws, 6);
              setListRangeFrom(isoFromLocalDate(ws));
              setListRangeTo(isoFromLocalDate(we));
            }}
            className="px-3 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50"
          >
            Görünen haftayı aralığa al
          </button>
          <button
            type="button"
            onClick={() => {
              void loadLessons();
              if (showAdminExtras) void loadSummary();
            }}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"
          >
            Uygula
          </button>
          <button
            type="button"
            onClick={() => {
              const staffMap = new Map(mergedStaff.map((u) => [u.id, u.name]));
              const rows = [...lessons]
                .filter((l) => l.status !== 'cancelled')
                .sort(
                  (a, b) =>
                    String(a.date).localeCompare(String(b.date)) || a.start_time.localeCompare(b.start_time)
                );
              const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
              doc.setFontSize(14);
              doc.text('Canlı özel ders programı', 14, 14);
              doc.setFontSize(10);
              doc.text(`Tarih aralığı: ${listRangeFrom} – ${listRangeTo}`, 14, 22);
              doc.setFontSize(8);
              let y = 30;
              const line = (parts: string[]) => {
                const t = parts.join('  |  ');
                const wrapped = doc.splitTextToSize(t, 270);
                for (const w of wrapped) {
                  if (y > 190) {
                    doc.addPage();
                    y = 14;
                  }
                  doc.text(w, 14, y);
                  y += 4;
                }
                y += 1;
              };
              line(['Tarih', 'Saat', 'Öğrenci', 'Öğretmen', 'Ders', 'Durum', 'Bağlantı']);
              doc.setFont('helvetica', 'bold');
              line(['—', '—', '—', '—', '—', '—', '—']);
              doc.setFont('helvetica', 'normal');
              for (const l of rows) {
                line([
                  l.date,
                  lessonTimeRange(l),
                  studentName(l.student_id),
                  staffMap.get(l.teacher_id) || l.teacher_id.slice(0, 8),
                  l.title || '',
                  l.status,
                  (l.meeting_link || '').slice(0, 80)
                ]);
              }
              if (rows.length === 0) {
                line(['Bu aralıkta ders yok.']);
              }
              doc.save(`canli-ozel-dersler-${listRangeFrom}_${listRangeTo}.pdf`);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
          >
            <FileDown className="w-4 h-4" />
            PDF indir
          </button>
        </div>
      )}

      {showAdminExtras && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-slate-100 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between bg-slate-50">
            <div className="flex items-start gap-2">
              <Clock className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-sm font-semibold text-slate-800">Ders saati özeti (tamamlanan)</h2>
                <p className="text-xs text-slate-500">
                  Üstteki öğretmen ve öğrenci filtreleriyle; aşağıdaki özet tarih aralığında kayıtlı{' '}
                  <strong>tamamlanan</strong> derslerin toplam süresi. Faturalama ve kontrol için kullanın.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-slate-500">Özet başlangıç</span>
                <input
                  type="date"
                  value={summaryFrom}
                  onChange={(e) => setSummaryFrom(e.target.value)}
                  className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-slate-500">Özet bitiş</span>
                <input
                  type="date"
                  value={summaryTo}
                  onChange={(e) => setSummaryTo(e.target.value)}
                  className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white"
                />
              </label>
              <button
                type="button"
                onClick={() => void loadSummary()}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700"
              >
                Özeti yenile
              </button>
            </div>
            {summaryLoading && <Loader2 className="w-4 h-4 animate-spin text-slate-400 sm:ml-auto" />}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2 font-medium">Öğretmen</th>
                  <th className="px-4 py-2 font-medium">Öğrenci</th>
                  <th className="px-4 py-2 font-medium text-right">Tamamlanan ders</th>
                  <th className="px-4 py-2 font-medium text-right">Toplam (saat)</th>
                  <th className="px-4 py-2 font-medium text-right text-slate-400">Dakika</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summaryRows.length === 0 && !summaryLoading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                      Bu filtrelere uygun tamamlanan ders kaydı yok veya henüz özet yüklenmedi.
                    </td>
                  </tr>
                ) : (
                  summaryRows.map((row) => (
                    <tr key={`${row.teacher_id}-${row.student_id}`} className="hover:bg-slate-50/80">
                      <td className="px-4 py-2.5 text-slate-900">{row.teacher_name}</td>
                      <td className="px-4 py-2.5 text-slate-900">{row.student_name}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{row.completed_lesson_count}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-indigo-700 tabular-nums">
                        {row.total_hours.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-500 tabular-nums text-xs">
                        {row.total_minutes}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {formOpen && (
        <form
          onSubmit={handleCreate}
          className="bg-white rounded-xl border border-slate-200 p-6 space-y-4 shadow-sm"
        >
          <h2 className="text-lg font-semibold text-slate-800">Yeni canlı özel ders</h2>
          {showTeacherPicker && (
            <label className="block text-sm">
              <span className="text-slate-600">Öğretmen (platform kullanıcısı)</span>
              <select
                required
                value={adminTeacherId}
                onChange={(e) => setAdminTeacherId(e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2"
              >
                <option value="">Seçin</option>
                {mergedStaff.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} — {u.role}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block text-sm">
            <span className="text-slate-600">Öğrenci</span>
            <select
              required
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2"
            >
              <option value="">Seçin</option>
              {sortedStudents.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Ders adı</span>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2"
              placeholder="Örn. Matematik tekrar"
            />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <label className="block text-sm">
              <span className="text-slate-600">Tarih</span>
              <input
                type="date"
                required
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Başlangıç saati</span>
              <input
                type="time"
                required
                value={startTime.length > 5 ? startTime.slice(0, 5) : startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Süre (dk)</span>
              <input
                type="number"
                min={15}
                step={5}
                value={durationMin}
                onChange={(e) => setDurationMin(Number(e.target.value))}
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2"
              />
            </label>
          </div>
          <label className="block text-sm">
            <span className="text-slate-600">Toplantı bağlantısı (zorunlu)</span>
            <input
              required
              value={meetingLink}
              onChange={(e) => setMeetingLink(e.target.value)}
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2"
              placeholder="https://zoom.us/j/... veya meet.google.com/..."
            />
          </label>
          <p className="text-sm text-slate-600">
            Algılanan platform:{' '}
            <strong className="text-indigo-700">{platformDraft}</strong>
          </p>
          <div className="rounded-lg border border-violet-100 bg-violet-50/50 p-4 space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
              <input
                type="checkbox"
                checked={lessonRecurrence}
                onChange={(e) => setLessonRecurrence(e.target.checked)}
                className="rounded border-slate-300"
              />
              Tekrarlayan ders (aynı bağlantı, haftalık veya 15 günde bir)
            </label>
            {lessonRecurrence ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="text-slate-600">Sıklık</span>
                  <select
                    className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2"
                    value={lessonIntervalDays}
                    onChange={(e) => setLessonIntervalDays(Number(e.target.value) as 7 | 15)}
                  >
                    <option value={7}>Her hafta (7 gün)</option>
                    <option value={15}>15 günde bir</option>
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="text-slate-600">Son tekrar tarihi (dahil)</span>
                  <input
                    type="date"
                    className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2"
                    value={lessonRecurrenceUntil}
                    onChange={(e) => setLessonRecurrenceUntil(e.target.value)}
                  />
                </label>
              </div>
            ) : null}
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={createBusy}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-60"
            >
              {createBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {lessonRecurrence ? 'Tekrarlayan seriyi oluştur' : 'Kaydet'}
            </button>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700"
            >
              Vazgeç
            </button>
          </div>
        </form>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 text-red-800 px-4 py-3 text-sm border border-red-100">{error}</div>
      )}

      <WeeklyLiveGridShell
        title="Haftalık canlı özel ders takvimi"
        subtitle="Sütunlar Pazartesi–Pazar (yerel tarih). WhatsApp hatırlatması: Meta şablonları lesson_reminder + lesson_reminder_parent; cron her 5 dk, varsayılan dersden en fazla 45 dk önce (LESSON_REMINDER_MAX_LEAD_MINUTES)."
        weekRangeLabel={liveCalendarWeekRangeLabel}
        loading={loading}
        onPrevWeek={() => setCalendarWeekAnchor((d) => addDays(d, -7))}
        onNextWeek={() => setCalendarWeekAnchor((d) => addDays(d, 7))}
        onThisWeek={() => setCalendarWeekAnchor(new Date())}
        legend={
          <>
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-3 py-1.5 text-[11px] font-semibold text-emerald-50 backdrop-blur-sm">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/60" />
              Planlı özel ders
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur-sm">
              <Move className="h-3.5 w-3.5 text-sky-300" aria-hidden />
              Alttaki listeden düzenle
            </span>
          </>
        }
        hint="Kartlardan Katıl, Düzenle veya Sil; zaman ve bağlantı düzenlemesi için «Düzenle» ile formu açın."
      >
        <div className="overflow-x-auto p-2 sm:p-3">
          <table className="w-full min-w-[900px] border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-white">
                <th className="w-14 min-w-[3.5rem] bg-slate-100 px-2 py-3 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Saat
                </th>
                {weeklyLessonBuckets.map((slot) => {
                  const isToday = slot.key === todayLocalIso();
                  const [yy, mm, dd] = slot.key.split('-').map(Number);
                  const headDate = new Date(yy, (mm || 1) - 1, dd || 1, 12, 0, 0, 0);
                  const dow = headDate.toLocaleDateString('tr-TR', { weekday: 'short' });
                  const dmy = headDate.toLocaleDateString('tr-TR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                  });
                  return (
                    <th
                      key={slot.key}
                      className={`px-2 py-3 text-left align-bottom ${
                        isToday
                          ? 'border-x border-t border-amber-300/90 bg-gradient-to-b from-amber-100 to-amber-50/90 shadow-[inset_0_2px_0_0_rgba(251,191,36,0.65)]'
                          : 'border-t border-slate-100 bg-slate-50/90'
                      }`}
                    >
                      <div className={`text-[11px] font-bold capitalize ${isToday ? 'text-amber-950' : 'text-slate-700'}`}>
                        {dow}
                      </div>
                      <div
                        className={`mt-0.5 text-[10px] font-semibold tabular-nums ${isToday ? 'text-amber-900/85' : 'text-slate-500'}`}
                      >
                        {dmy}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="bg-white">
              {Array.from({ length: 15 }, (_, i) => 10 + i).map((hour) => {
                const label = `${String(hour).padStart(2, '0')}:00`;
                return (
                  <tr key={hour} className="border-t border-slate-100/90 transition-colors hover:bg-slate-50/50">
                    <td className="bg-slate-50 px-2 py-2 text-right font-mono text-[11px] font-semibold tabular-nums text-slate-600">
                      {label}
                    </td>
                    {weeklyLessonBuckets.map((slot) => {
                      const hourItems = slot.items.filter(
                        (x) => Number(String(x.start_time || '00:00').slice(0, 2)) === hour
                      );
                      const colToday = slot.key === todayLocalIso();
                      return (
                        <td
                          key={`${slot.key}-${hour}`}
                          className={`align-top p-1.5 min-h-[52px] ${colToday ? 'bg-amber-50/55' : ''}`}
                        >
                          <div className="flex flex-col gap-1.5">
                            {hourItems.map((lesson) => {
                              const accent = liveSubjectAccent(lesson.title);
                              const canJoin = lesson.status === 'scheduled' && Boolean(lesson.meeting_link?.trim());
                              return (
                                <div
                                  key={lesson.id}
                                  className={`rounded-xl border border-y border-r border-slate-200/80 px-2 py-2 shadow-md ${accent.leftBar} ${accent.bg} ${accent.glow}`}
                                >
                                  <div className="flex gap-1.5">
                                    <GripVertical
                                      className="mt-0.5 h-4 w-4 shrink-0 text-slate-400"
                                      aria-hidden
                                    />
                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <p className={`text-[12px] font-bold leading-snug ${accent.title}`}>
                                          {lesson.title}
                                        </p>
                                        {lesson.status === 'scheduled' ? (
                                          <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-800 ring-1 ring-emerald-400/40">
                                            Planlı
                                          </span>
                                        ) : null}
                                      </div>
                                      <p className="mt-0.5 text-[11px] font-medium text-slate-700">
                                        {studentName(lesson.student_id)}
                                      </p>
                                      <p className="text-[10px] tabular-nums text-slate-500">{lessonTimeRange(lesson)}</p>
                                    </div>
                                  </div>
                                  <div className="mt-2 flex flex-wrap gap-1">
                                    {canJoin ? (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          window.open(lesson.meeting_link, '_blank', 'noopener,noreferrer')
                                        }
                                        className="rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-2 py-1 text-[10px] font-semibold text-white shadow-sm hover:brightness-110"
                                      >
                                        Katıl
                                      </button>
                                    ) : null}
                                    <button
                                      type="button"
                                      onClick={() => openEdit(lesson)}
                                      className="inline-flex items-center gap-1 rounded-lg border border-indigo-300 bg-white px-2 py-1 text-[10px] font-semibold text-indigo-700 shadow-sm hover:bg-indigo-50"
                                    >
                                      <Pencil className="h-3 w-3" />
                                      Düzenle
                                    </button>
                                    {lesson.status === 'scheduled' ? (
                                      <button
                                        type="button"
                                        onClick={() => void deleteLesson(lesson.id)}
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
                );
              })}
            </tbody>
          </table>
        </div>
      </WeeklyLiveGridShell>

      {editingLesson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div
            role="dialog"
            aria-modal
            className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <Pencil className="w-5 h-5 text-indigo-600" />
                Dersi düzenle
              </h2>
              <button
                type="button"
                onClick={() => setEditingLesson(null)}
                className="text-sm text-slate-500 hover:text-slate-800"
              >
                Kapat
              </button>
            </div>
            {editingLesson.status !== 'scheduled' ? (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Bu ders tamamlanmış veya iptal edilmiş. Tarih ve süre değiştirilemez; başlık ve toplantı bağlantısını
                güncelleyebilirsiniz.
              </p>
            ) : (
              <p className="text-sm text-slate-600">
                Planlanmış ders: tarih, saat, süre ve bağlantıyı değiştirebilirsiniz.
              </p>
            )}
            <label className="block text-sm">
              <span className="text-slate-600">Ders adı</span>
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2"
              />
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <label className="block text-sm">
                <span className="text-slate-600">Tarih</span>
                <input
                  type="date"
                  disabled={editingLesson.status !== 'scheduled'}
                  value={editDateStr}
                  onChange={(e) => setEditDateStr(e.target.value)}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 disabled:bg-slate-100"
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">Başlangıç</span>
                <input
                  type="time"
                  disabled={editingLesson.status !== 'scheduled'}
                  value={editStart.length > 5 ? editStart.slice(0, 5) : editStart}
                  onChange={(e) => setEditStart(e.target.value)}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 disabled:bg-slate-100"
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">Süre (dk)</span>
                <input
                  type="number"
                  min={15}
                  step={5}
                  disabled={editingLesson.status !== 'scheduled'}
                  value={editDuration}
                  onChange={(e) => setEditDuration(Number(e.target.value))}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 disabled:bg-slate-100"
                />
              </label>
            </div>
            <label className="block text-sm">
              <span className="text-slate-600">Toplantı bağlantısı</span>
              <input
                value={editMeetingLink}
                onChange={(e) => setEditMeetingLink(e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2"
              />
            </label>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                disabled={editBusy}
                onClick={() => void saveEdit()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-60"
              >
                {editBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Kaydet
              </button>
              <button
                type="button"
                onClick={() => setEditingLesson(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700"
              >
                Vazgeç
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          Ders listesi
          {loading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
        </h2>
        <p className="text-xs text-slate-500">
          Tekrarlayan seriler tek satırda toplanır; ayrıntı için açın. Takvim yukarıda haftalıktır.
        </p>
        {lessons.length === 0 && !loading && (
          <p className="text-slate-500 text-sm">Henüz planlanmış canlı özel ders yok.</p>
        )}
        <div className="space-y-3">
          {lessonListGroups.groups.map((g) => (
            <details
              key={g.seriesId}
              className="border border-violet-200 rounded-xl bg-violet-50/40 overflow-hidden"
            >
              <summary className="cursor-pointer px-4 py-3 flex flex-wrap items-center justify-between gap-2 list-none [&::-webkit-details-marker]:hidden text-sm">
                <span>
                  <span className="font-semibold text-violet-800">↻ {g.intervalLabel}</span>
                  <span className="text-slate-800"> · {studentName(g.first.student_id)} — {g.first.title}</span>
                  <span className="text-slate-500"> ({g.items.length} ders)</span>
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    void deleteLessonSeries(g.seriesId);
                  }}
                  className="text-xs text-red-600 hover:underline"
                >
                  Seriyi sil
                </button>
              </summary>
              <div className="px-3 pb-3 space-y-2 border-t border-violet-100">
                {g.items.map((lesson) => (
                  <LiveLessonCard
                    key={lesson.id}
                    lesson={lesson}
                    studentName={studentName(lesson.student_id)}
                    onCopy={() => {
                      void navigator.clipboard.writeText(lesson.meeting_link);
                    }}
                    onJoin={() => window.open(lesson.meeting_link, '_blank', 'noopener,noreferrer')}
                    onMarkComplete={
                      lesson.status === 'scheduled'
                        ? () => void patchStatus(lesson.id, 'completed')
                        : undefined
                    }
                    extraActions={
                      <div className="flex flex-col items-end gap-1.5">
                        <div className="flex flex-wrap gap-2 justify-end">
                          <button
                            type="button"
                            onClick={() => openEdit(lesson)}
                            className="text-xs font-medium text-indigo-600 hover:underline"
                          >
                            Düzenle
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteLesson(lesson.id)}
                            className="text-xs font-medium text-red-600 hover:underline"
                          >
                            Sil
                          </button>
                        </div>
                        {lesson.status === 'scheduled' ? (
                          <button
                            type="button"
                            onClick={() => void patchStatus(lesson.id, 'cancelled')}
                            className="text-xs text-slate-500 hover:underline"
                          >
                            İptal et
                          </button>
                        ) : null}
                      </div>
                    }
                  />
                ))}
              </div>
            </details>
          ))}
          {lessonListGroups.singles.map((lesson) => (
            <LiveLessonCard
              key={lesson.id}
              lesson={lesson}
              studentName={studentName(lesson.student_id)}
              onCopy={() => {
                void navigator.clipboard.writeText(lesson.meeting_link);
              }}
              onJoin={() => window.open(lesson.meeting_link, '_blank', 'noopener,noreferrer')}
              onMarkComplete={
                lesson.status === 'scheduled'
                  ? () => void patchStatus(lesson.id, 'completed')
                  : undefined
              }
              extraActions={
                <div className="flex flex-col items-end gap-1.5">
                  <div className="flex flex-wrap gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => openEdit(lesson)}
                      className="text-xs font-medium text-indigo-600 hover:underline"
                    >
                      Düzenle
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteLesson(lesson.id)}
                      className="text-xs font-medium text-red-600 hover:underline"
                    >
                      Sil
                    </button>
                  </div>
                  {lesson.status === 'scheduled' ? (
                    <button
                      type="button"
                      onClick={() => void patchStatus(lesson.id, 'cancelled')}
                      className="text-xs text-slate-500 hover:underline"
                    >
                      İptal et
                    </button>
                  ) : null}
                </div>
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}
