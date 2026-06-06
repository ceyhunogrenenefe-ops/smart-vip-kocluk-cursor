import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { userRoleTags } from '../config/rolePermissions';
import { WeeklyPlannerCalendar } from '../components/weeklyPlanner/WeeklyPlannerCalendar';
import { AcademicCenterQuickLinks } from '../components/academic/AcademicCenterQuickLinks';
import { Users, AlertCircle } from 'lucide-react';
import { resolveStudentRecordId } from '../lib/coachResolve';
import { cn } from '../lib/utils';

export default function WeeklyPlannerPage() {
  const { students } = useApp();
  const { effectiveUser, linkedStudent, linkedStudentError, linkedStudentLoading, refreshLinkedStudent } = useAuth();
  const tags = userRoleTags(effectiveUser);
  const [selectedId, setSelectedId] = useState('');

  const isStudentUi = tags.includes('student');
  const isCoachUi = tags.includes('coach') && !tags.includes('student');
  const resolvedStudentId = useMemo(
    () =>
      linkedStudent?.id?.trim() ||
      effectiveUser?.studentId?.trim() ||
      resolveStudentRecordId(effectiveUser?.role, effectiveUser?.studentId, effectiveUser?.email, students, {
        roles: tags
      })?.trim() ||
      '',
    [linkedStudent?.id, effectiveUser?.role, effectiveUser?.studentId, effectiveUser?.email, students, tags]
  );

  /** Öğrenci: API / JWT ile çözülen kart id; koç/admin: seçilen liste öğesi */
  const activeStudentId = isStudentUi ? resolvedStudentId : selectedId;

  /** Öğrenci / koç: blok tıklayınca çalışma kaydı modalı (soru, sayfa, süre) */
  const studyLogOnClick = Boolean(activeStudentId && (isStudentUi || isCoachUi));
  /** Öğrenciye özel takvim görünümü */
  const studentStudyLogUi = Boolean(isStudentUi && activeStudentId);

  useEffect(() => {
    if (isStudentUi) return;
    if (!selectedId && students.length > 0) {
      setSelectedId(students[0].id);
    }
  }, [isStudentUi, selectedId, students]);

  useEffect(() => {
    if (!isStudentUi || !resolvedStudentId) return;
    if (selectedId !== resolvedStudentId) setSelectedId(resolvedStudentId);
  }, [isStudentUi, resolvedStudentId, selectedId]);

  const selected = useMemo(() => students.find((s) => s.id === activeStudentId), [students, activeStudentId]);

  const hasAssignedCoach = Boolean(
    linkedStudent?.coachId || selected?.coachId
  );
  /** Koçsuz öğrenci kendi hedeflerini yönetir; koçlu öğrenci de ek hedef ekleyebilir */
  const canManageGoals =
    tags.some((t) => ['coach', 'admin', 'super_admin'].includes(t)) ||
    Boolean(isStudentUi && activeStudentId);
  const selfCoachingMode = Boolean(isStudentUi && activeStudentId && !hasAssignedCoach);
  const canEditPlan = tags.some((t) => ['student', 'coach', 'admin', 'super_admin'].includes(t));

  if (!canManageGoals && !canEditPlan) {
    return (
      <div className="p-8 text-center text-slate-600">
        Bu sayfaya erişim yetkiniz yok.
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-8 max-w-[1400px] mx-auto pb-4 sm:pb-10">
      <div
        className={cn(
          'relative overflow-hidden rounded-2xl border p-4 sm:p-8 shadow-sm',
          isStudentUi
            ? 'border-indigo-200/80 bg-gradient-to-br from-indigo-50 via-white to-violet-50 dark:from-indigo-950/40 dark:via-slate-900 dark:to-violet-950/30 dark:border-indigo-900/50'
            : 'border-slate-200/90 bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950 dark:border-slate-700'
        )}
      >
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gradient-to-br from-indigo-400/15 to-violet-400/10 blur-2xl dark:from-indigo-500/10 dark:to-violet-500/5"
          aria-hidden
        />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600/90 dark:text-indigo-400/90">
              {isStudentUi ? 'Çalışma merkezin' : 'Planlama'}
            </p>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-3xl">
              {isStudentUi ? 'Haftalık çalışma planın' : 'Öğrenci haftalık planı'}
            </h2>
            <p className="mt-2 hidden text-sm leading-relaxed text-slate-600 dark:text-slate-400 sm:block">
              {isStudentUi
                ? selfCoachingMode
                  ? 'Koçun olmasa da haftalık hedeflerini buradan belirleyebilir, takvimine görev ekleyip çalışmanı kaydedebilirsin. Küçük adımlarla ilerlemeni takip et.'
                  : 'Takvimini kişiselleştirdik — koç hedeflerin ve kendi hedeflerin renkli bloklar halinde; tikledikçe ilerlemen görünsün. Haftayı kolayca değiştir, çalışmanı kaydet.'
                : 'Koç hedef tanımlar ve öğrenci gibi çalışma verisi (soru, sayfa, süre) girer; öğrenci kendi takvimini düzenler. Eski «Haftalık Takip» bu sayfada birleşti.'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <div
              className={cn(
                'flex h-11 w-11 items-center justify-center rounded-xl shadow-inner',
                isStudentUi
                  ? 'bg-white/90 text-indigo-600 ring-1 ring-indigo-100 dark:bg-slate-800 dark:text-indigo-300 dark:ring-indigo-900/60'
                  : 'bg-white text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700'
              )}
            >
              <Users className="h-5 w-5" />
            </div>
            {isStudentUi ? (
              <div className="min-w-[200px] rounded-xl border border-white/80 bg-white/90 px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-100">
                {selected?.name || effectiveUser?.name || 'Öğrenci'}
              </div>
            ) : (
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="min-w-[200px] rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium shadow-sm dark:border-slate-600 dark:bg-slate-900"
              >
                <option value="">Öğrenci seçin</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      {isStudentUi ? null : <AcademicCenterQuickLinks />}

      {selfCoachingMode && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/80 px-4 py-3 text-sm text-indigo-950 dark:border-indigo-900/50 dark:bg-indigo-950/30 dark:text-indigo-100">
          <strong>Kendi kendine takip modu:</strong> Sana atanmış bir koç yok. Haftalık hedeflerini aşağıdan
          ekleyebilir, takvime sürükleyebilir ve her blokta çözdüğün soruları kaydedebilirsin.
        </div>
      )}

      {!activeStudentId ? (
        <div className="flex flex-col gap-3 text-amber-800 bg-amber-50 border border-amber-100 rounded-lg p-4 text-sm">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              {isStudentUi ? (
                linkedStudentLoading ? (
                  <p>Öğrenci profiliniz yükleniyor…</p>
                ) : linkedStudentError ? (
                  <p>{linkedStudentError}</p>
                ) : (
                  <p>Öğrenci profiliniz hazırlanıyor…</p>
                )
              ) : (
                <p>Planı görmek için bir öğrenci seçin.</p>
              )}
            </div>
          </div>
          {isStudentUi && !linkedStudentLoading ? (
            <button
              type="button"
              onClick={() => void refreshLinkedStudent()}
              className="self-start rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
            >
              Yeniden dene
            </button>
          ) : null}
        </div>
      ) : (
        <WeeklyPlannerCalendar
          studentId={activeStudentId}
          studentName={selected?.name ?? effectiveUser?.name}
          canEditPlan={canEditPlan}
          canManageGoals={canManageGoals}
          selfCoachingMode={selfCoachingMode}
          hasAssignedCoach={hasAssignedCoach}
          studentStudyLogUi={studentStudyLogUi}
          studyLogOnClick={studyLogOnClick}
        />
      )}
    </div>
  );
}
