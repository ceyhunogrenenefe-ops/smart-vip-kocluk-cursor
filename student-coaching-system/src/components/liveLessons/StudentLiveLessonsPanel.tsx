import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../lib/session';
import type { StudentTeacherLessonQuota, TeacherLesson } from '../../types';
import LiveLessonCard from './LiveLessonCard';
import { Loader2, Radio, AlertTriangle, CalendarRange } from 'lucide-react';

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function defaultRangeFrom(): string {
  const x = new Date();
  x.setDate(x.getDate() - 90);
  return isoDate(x);
}

function defaultRangeTo(): string {
  const x = new Date();
  x.setDate(x.getDate() + 180);
  return isoDate(x);
}

/**
 * Öğrenci paneli: yalnızca bu öğrenciye ait canlı özel dersler (API + istemci filtresi).
 */
export default function StudentLiveLessonsPanel() {
  const { effectiveUser } = useAuth();
  const myStudentId = effectiveUser?.studentId?.trim() ?? '';
  const [rangeFrom, setRangeFrom] = useState(defaultRangeFrom);
  const [rangeTo, setRangeTo] = useState(defaultRangeTo);
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
      const qs = new URLSearchParams();
      const fromTrim = rangeFrom.trim();
      const toTrim = rangeTo.trim();
      const fromOk = /^\d{4}-\d{2}-\d{2}$/.test(fromTrim);
      const toOk = /^\d{4}-\d{2}-\d{2}$/.test(toTrim);
      if (fromOk && toOk && fromTrim > toTrim) {
        setError('Başlangıç tarihi, bitiş tarihinden sonra olamaz.');
        setLoading(false);
        return;
      }
      if (fromOk) qs.set('from', fromTrim);
      if (toOk) qs.set('to', toTrim);
      const lessonsUrl =
        qs.toString().length > 0 ? `/api/teacher-lessons?${qs.toString()}` : '/api/teacher-lessons';

      const [resLessons, resQuota] = await Promise.all([
        apiFetch(lessonsUrl),
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
  }, [effectiveUser?.studentId, rangeFrom, rangeTo]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyPreset = (kind: 'month' | 'quarter' | 'year') => {
    const now = new Date();
    const end = new Date(now);
    if (kind === 'month') {
      now.setDate(1);
      end.setMonth(end.getMonth() + 1);
      end.setDate(0);
      setRangeFrom(isoDate(now));
      setRangeTo(isoDate(end));
      return;
    }
    if (kind === 'quarter') {
      now.setMonth(now.getMonth() - 3);
      setRangeFrom(isoDate(now));
      end.setMonth(end.getMonth() + 3);
      setRangeTo(isoDate(end));
      return;
    }
    now.setMonth(0, 1);
    end.setMonth(11, 31);
    setRangeFrom(isoDate(now));
    setRangeTo(isoDate(end));
  };

  /** Sunucu filtresine ek güvence + istemci tarafında tarih aralığı doğrulaması */
  const visibleLessons = useMemo(() => {
    if (!myStudentId) return [];
    const fromOk = /^\d{4}-\d{2}-\d{2}$/.test(rangeFrom.trim());
    const toOk = /^\d{4}-\d{2}-\d{2}$/.test(rangeTo.trim());
    const f = fromOk ? rangeFrom.trim() : null;
    const t = toOk ? rangeTo.trim() : null;
    const filtered = lessons.filter((l) => {
      if (l.student_id !== myStudentId) return false;
      const d = String(l.date || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return true;
      if (f && d < f) return false;
      if (t && d > t) return false;
      return true;
    });
    const rank = (s: string) => (s === 'scheduled' ? 0 : s === 'completed' ? 2 : 1);
    return [...filtered].sort((a, b) => {
      const rs = rank(a.status) - rank(b.status);
      if (rs !== 0) return rs;
      const da = `${a.date}T${(a.start_time || '00:00:00').slice(0, 8)}`;
      const db = `${b.date}T${(b.start_time || '00:00:00').slice(0, 8)}`;
      return da.localeCompare(db);
    });
  }, [lessons, myStudentId, rangeFrom, rangeTo]);

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
          <h3 className="text-lg font-bold">📡 Canlı Özel Derslerim</h3>
          <p className="text-sky-100 text-sm">
            Yalnızca size atanmış özel canlı özel dersler. Tamamlanan oturumlarda &quot;Derse katıl&quot; pasiftir; BBB
            derslerinde kayıt için aynı bağlantı kullanılır.
          </p>
        </div>
        {loading && <Loader2 className="w-5 h-5 animate-spin text-sky-200 ml-auto" />}
      </div>

      {myStudentId && (
        <div className="mb-4 rounded-xl border border-white/25 bg-white/10 p-3 sm:p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sky-100 text-xs sm:text-sm">
            <CalendarRange className="w-4 h-4 shrink-0 text-sky-200" />
            <span className="font-medium text-white">Tarih aralığı</span>
            <span className="text-sky-100/90">Liste ve sunucu sorgusu bu aralığa göre filtrelenir.</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:items-end">
            <div className="flex flex-col gap-1 min-w-[140px]">
              <label className="text-[11px] uppercase tracking-wide text-sky-100/80">Başlangıç</label>
              <input
                type="date"
                value={rangeFrom}
                onChange={(e) => setRangeFrom(e.target.value)}
                className="rounded-lg border border-white/30 bg-white/95 text-slate-900 px-3 py-2 text-sm shadow-sm"
              />
            </div>
            <div className="flex flex-col gap-1 min-w-[140px]">
              <label className="text-[11px] uppercase tracking-wide text-sky-100/80">Bitiş</label>
              <input
                type="date"
                value={rangeTo}
                onChange={(e) => setRangeTo(e.target.value)}
                className="rounded-lg border border-white/30 bg-white/95 text-slate-900 px-3 py-2 text-sm shadow-sm"
              />
            </div>
            <div className="flex flex-wrap gap-2 pb-0.5">
              <button
                type="button"
                onClick={() => void load()}
                className="px-3 py-2 rounded-lg bg-white text-sky-800 text-sm font-semibold hover:bg-sky-50 shadow"
              >
                Yenile
              </button>
              <button
                type="button"
                onClick={() => applyPreset('month')}
                className="px-3 py-2 rounded-lg bg-white/15 border border-white/30 text-white text-sm hover:bg-white/20"
              >
                Bu ay
              </button>
              <button
                type="button"
                onClick={() => applyPreset('quarter')}
                className="px-3 py-2 rounded-lg bg-white/15 border border-white/30 text-white text-sm hover:bg-white/20"
              >
                Son 3 ay + önümüzdeki 3 ay
              </button>
              <button
                type="button"
                onClick={() => applyPreset('year')}
                className="px-3 py-2 rounded-lg bg-white/15 border border-white/30 text-white text-sm hover:bg-white/20"
              >
                Bu takvim yılı
              </button>
              <button
                type="button"
                onClick={() => {
                  setRangeFrom(defaultRangeFrom());
                  setRangeTo(defaultRangeTo());
                }}
                className="px-3 py-2 rounded-lg bg-white/15 border border-white/30 text-white text-sm hover:bg-white/20"
              >
                Geniş aralık
              </button>
            </div>
          </div>
          {!loading && visibleLessons.length > 0 && (
            <p className="text-xs text-sky-100 pt-1 border-t border-white/15">
              <span className="font-semibold text-white">{visibleLessons.length}</span> kayıt bu aralıkta
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="mb-3 rounded-lg bg-white/15 px-3 py-2 text-sm text-white">{error}</div>
      )}

      {quotas.some((q) => q.exhausted && !(q.unlimited ?? q.credits_total == null)) && (
        <div className="mb-3 flex gap-2 rounded-lg bg-red-500/30 border border-red-200/50 px-3 py-2 text-sm text-white">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>
            Bir veya daha fazla öğretmen için canlı özel ders hakkınız bitti. Yeni ders planlamak için koçunuz veya yönetiminizle
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
            <span>Bazı öğretmenler için son 1 canlı özel ders hakkınız kaldı.</span>
          </div>
        )}

      {!myStudentId && !loading && (
        <p className="text-amber-100 text-sm border border-white/20 rounded-lg px-3 py-2 bg-white/10">
          Öğrenci profiliniz oturumla eşleşmedi; liste için çıkış yapıp tekrar giriş yapın veya yöneticiye başvurun.
        </p>
      )}

      {myStudentId && visibleLessons.length === 0 && !loading && !error && (
        <p className="text-sky-100 text-sm">
          Seçilen tarih aralığında görünecek planlı veya geçmiş canlı özel ders yok; aralığı genişletmeyi veya
          «Geniş aralık»ı deneyin.
        </p>
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
