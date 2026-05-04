import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../lib/session';
import type { StudentTeacherLessonQuota, TeacherLesson } from '../../types';
import LiveLessonCard from './LiveLessonCard';
import { Loader2, Radio, AlertTriangle } from 'lucide-react';

/**
 * Öğrenci paneli: yalnızca bu öğrenciye ait canlı dersler (API + istemci filtresi).
 */
export default function StudentLiveLessonsPanel() {
  const { effectiveUser } = useAuth();
  const myStudentId = effectiveUser?.studentId?.trim() ?? '';
  const [lessons, setLessons] = useState<TeacherLesson[]>([]);
  const [quotas, setQuotas] = useState<StudentTeacherLessonQuota[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uiTick, setUiTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setUiTick((x) => x + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sid = effectiveUser?.studentId?.trim();
      const [resLessons, resQuota] = await Promise.all([
        apiFetch('/api/teacher-lessons'),
        sid
          ? apiFetch(`/api/student-teacher-lesson-quota?student_id=${encodeURIComponent(sid)}`)
          : Promise.resolve(null as Response | null)
      ]);
      const j = await resLessons.json().catch(() => ({}));
      if (!resLessons.ok) {
        setError(String(j.error || 'Dersler yüklenemedi'));
        setLessons([]);
        setQuotas([]);
        return;
      }
      setLessons(Array.isArray(j.data) ? j.data : []);

      if (resQuota) {
        const qj = await resQuota.json().catch(() => ({}));
        if (resQuota.ok && Array.isArray(qj.data)) {
          setQuotas(qj.data as StudentTeacherLessonQuota[]);
        } else {
          setQuotas([]);
        }
      } else {
        setQuotas([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hata');
      setLessons([]);
      setQuotas([]);
    } finally {
      setLoading(false);
    }
  }, [effectiveUser?.studentId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Sunucu filtresine ek güvence + yakın tarih / planlı önce */
  const visibleLessons = useMemo(() => {
    if (!myStudentId) return [];
    const filtered = lessons.filter((l) => l.student_id === myStudentId);
    const rank = (s: string) => (s === 'scheduled' ? 0 : s === 'completed' ? 2 : 1);
    return [...filtered].sort((a, b) => {
      const rs = rank(a.status) - rank(b.status);
      if (rs !== 0) return rs;
      const da = `${a.date}T${(a.start_time || '00:00:00').slice(0, 8)}`;
      const db = `${b.date}T${(b.start_time || '00:00:00').slice(0, 8)}`;
      return da.localeCompare(db);
    });
  }, [lessons, myStudentId]);

  return (
    <div className="bg-gradient-to-r from-sky-600 to-cyan-600 rounded-2xl p-6 text-white shadow-lg">
      <span className="hidden" aria-hidden>
        {uiTick}
      </span>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
          <Radio className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-lg font-bold">📡 Canlı Derslerim</h3>
          <p className="text-sky-100 text-sm">
            Yalnızca size atanmış özel canlı dersler. Tamamlanan oturumlarda &quot;Derse katıl&quot; pasiftir; BBB
            derslerinde kayıt için aynı bağlantı kullanılır.
          </p>
        </div>
        {loading && <Loader2 className="w-5 h-5 animate-spin text-sky-200 ml-auto" />}
      </div>

      {error && (
        <div className="mb-3 rounded-lg bg-white/15 px-3 py-2 text-sm text-white">{error}</div>
      )}

      {quotas.some((q) => q.exhausted && !(q.unlimited ?? q.credits_total == null)) && (
        <div className="mb-3 flex gap-2 rounded-lg bg-red-500/30 border border-red-200/50 px-3 py-2 text-sm text-white">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>
            Bir veya daha fazla öğretmen için canlı ders hakkınız bitti. Yeni ders planlamak için koçunuz veya yönetiminizle
            iletişime geçin.
          </span>
        </div>
      )}
      {quotas.some((q) => {
        const lim = !(q.unlimited ?? q.credits_total == null);
        const rem = q.remaining;
        return lim && typeof rem === 'number' && rem === 1 && !q.exhausted;
      }) &&
        !quotas.some((q) => q.exhausted && !(q.unlimited ?? q.credits_total == null)) && (
          <div className="mb-3 flex gap-2 rounded-lg bg-amber-500/25 border border-amber-200/40 px-3 py-2 text-sm text-amber-50">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-200" />
            <span>Bazı öğretmenler için son 1 canlı ders hakkınız kaldı.</span>
          </div>
        )}

      {!myStudentId && !loading && (
        <p className="text-amber-100 text-sm border border-white/20 rounded-lg px-3 py-2 bg-white/10">
          Öğrenci profiliniz oturumla eşleşmedi; liste için çıkış yapıp tekrar giriş yapın veya yöneticiye başvurun.
        </p>
      )}

      {myStudentId && visibleLessons.length === 0 && !loading && (
        <p className="text-sky-100 text-sm">Size atanmış planlı veya geçmiş canlı ders kaydı yok.</p>
      )}

      <div className="space-y-3">
        {visibleLessons.map((lesson) => (
          <div key={lesson.id} className="[&_h4]:text-slate-900 [&_p]:text-slate-600 [&_span]:text-slate-700">
            <LiveLessonCard
              lesson={lesson}
              lockCompletedLink
              onCopy={() => void navigator.clipboard.writeText(lesson.meeting_link)}
              onJoin={() => window.open(lesson.meeting_link, '_blank', 'noopener,noreferrer')}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
