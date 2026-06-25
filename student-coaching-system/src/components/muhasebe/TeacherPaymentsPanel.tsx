import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../lib/session';
import GroupLessonPaymentSummary, {
  type GroupLessonSummarySession
} from '../liveLessons/GroupLessonPaymentSummary';
import { GroupLessonSessionEditModal } from './GroupLessonSessionEditModal';

type TeacherOption = { id: string; name: string };
type ClassOption = { id: string; name: string };

function monthStartIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type Props = {
  onTeacherTotalChange?: (totalTry: number) => void;
};

export function TeacherPaymentsPanel({ onTeacherTotalChange }: Props) {
  const [teacherCandidates, setTeacherCandidates] = useState<TeacherOption[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [summaryFrom, setSummaryFrom] = useState(monthStartIso);
  const [summaryTo, setSummaryTo] = useState(todayIso);
  const [summaryTeacherId, setSummaryTeacherId] = useState('');
  const [summaryClassId, setSummaryClassId] = useState('');
  const [summaryRefreshKey, setSummaryRefreshKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingSession, setEditingSession] = useState<GroupLessonSummarySession | null>(null);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        const [usersRes, classesRes] = await Promise.all([
          apiFetch('/api/users'),
          apiFetch('/api/class-live-lessons?scope=classes')
        ]);
        const uj = await usersRes.json().catch(() => ({}));
        const cj = await classesRes.json().catch(() => ({}));
        if (!cancel && usersRes.ok) {
          const rows = Array.isArray(uj.data) ? uj.data : [];
          setTeacherCandidates(
            rows
              .filter((r: { role?: string; roles?: string[] }) => {
                const roleRaw = String(r.role || '').toLowerCase();
                const roleList = Array.isArray(r.roles) ? r.roles.map((x) => String(x || '').toLowerCase()) : [];
                return roleRaw === 'teacher' || roleList.includes('teacher');
              })
              .map((r: { id: string; name?: string; email?: string }) => ({
                id: String(r.id),
                name: String(r.name || r.email || r.id)
              }))
          );
        }
        if (!cancel && classesRes.ok) {
          const loaded = Array.isArray(cj.data) ? cj.data : [];
          setClasses(loaded.map((c: { id: string; name?: string }) => ({ id: String(c.id), name: String(c.name || c.id) })));
        }
      } catch (e) {
        if (!cancel) setError(e instanceof Error ? e.message : 'Veriler yüklenemedi');
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const reportTeacherTotal = useCallback(
    async (from: string, to: string) => {
      try {
        const qs = new URLSearchParams({ scope: 'summary', include_sessions: '0' });
        if (from) qs.set('from', from);
        if (to) qs.set('to', to);
        const res = await apiFetch(`/api/class-live-lessons?${qs.toString()}`);
        const j = await res.json().catch(() => ({}));
        if (!res.ok) return;
        const totals = Array.isArray(j.teacher_totals) ? j.teacher_totals : [];
        const sum = totals.reduce((acc: number, row: { total_amount_tl?: number }) => acc + Number(row.total_amount_tl || 0), 0);
        onTeacherTotalChange?.(Math.round(sum * 100) / 100);
      } catch {
        /* overview yedek */
      }
    },
    [onTeacherTotalChange]
  );

  useEffect(() => {
    void reportTeacherTotal(summaryFrom, summaryTo);
  }, [summaryFrom, summaryTo, summaryRefreshKey, reportTeacherTotal]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Öğretmen ödemeleri (grup dersi)</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">
            Tamamlanan grup dersleri 40 dakikalık birim üzerinden hesaplanır. Oturum detayından düzenleme ve silme
            yapabilirsiniz.
          </p>
        </div>
        <Link
          to="/class-live-lessons"
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-800 whitespace-nowrap"
        >
          Canlı grup dersleri →
        </Link>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-100 bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>
      ) : null}
      {notice ? (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50 text-emerald-800 px-3 py-2 text-sm">{notice}</div>
      ) : null}

      <GroupLessonPaymentSummary
        teacherCandidates={teacherCandidates}
        classes={classes}
        summaryFrom={summaryFrom}
        summaryTo={summaryTo}
        summaryTeacherId={summaryTeacherId}
        summaryClassId={summaryClassId}
        onSummaryFromChange={setSummaryFrom}
        onSummaryToChange={setSummaryTo}
        onSummaryTeacherIdChange={setSummaryTeacherId}
        onSummaryClassIdChange={setSummaryClassId}
        onEditSession={setEditingSession}
        onError={setError}
        onNotice={setNotice}
        summaryRefreshKey={summaryRefreshKey}
      />

      <GroupLessonSessionEditModal
        session={editingSession}
        teacherOptions={teacherCandidates}
        onClose={() => setEditingSession(null)}
        onSaved={() => {
          setNotice('Oturum güncellendi.');
          setSummaryRefreshKey((k) => k + 1);
        }}
        onError={setError}
      />
    </div>
  );
}

export default TeacherPaymentsPanel;
