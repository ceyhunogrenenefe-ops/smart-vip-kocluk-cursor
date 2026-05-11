import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { userRoleTags } from '../config/rolePermissions';
import { WeeklyPlannerCalendar } from '../components/weeklyPlanner/WeeklyPlannerCalendar';
import { AcademicCenterQuickLinks } from '../components/academic/AcademicCenterQuickLinks';
import { Users, AlertCircle } from 'lucide-react';
import { resolveStudentRecordId } from '../lib/coachResolve';

export default function WeeklyPlannerPage() {
  const { students } = useApp();
  const { effectiveUser } = useAuth();
  const tags = userRoleTags(effectiveUser);
  const [selectedId, setSelectedId] = useState('');

  const isStudentUi = tags.includes('student');
  const jwtStudentId = useMemo(
    () =>
      resolveStudentRecordId(effectiveUser?.role, effectiveUser?.studentId, effectiveUser?.email, students)?.trim() ||
      effectiveUser?.studentId?.trim() ||
      '',
    [effectiveUser?.role, effectiveUser?.studentId, effectiveUser?.email, students]
  );

  /** Öğrenci: her zaman oturum ID’si; koç/admin: seçilen liste öğesi */
  const activeStudentId = isStudentUi ? jwtStudentId : selectedId;

  const studentStudyLogUi = Boolean(
    isStudentUi &&
      jwtStudentId &&
      activeStudentId &&
      activeStudentId === jwtStudentId
  );

  useEffect(() => {
    if (isStudentUi) return;
    if (!selectedId && students.length > 0) {
      setSelectedId(students[0].id);
    }
  }, [isStudentUi, selectedId, students]);

  useEffect(() => {
    if (!isStudentUi || !jwtStudentId) return;
    if (selectedId !== jwtStudentId) setSelectedId(jwtStudentId);
  }, [isStudentUi, jwtStudentId, selectedId]);

  const selected = useMemo(() => students.find((s) => s.id === activeStudentId), [students, activeStudentId]);

  const canManageGoals = tags.some((t) => ['coach', 'admin', 'super_admin'].includes(t));
  const canEditPlan = tags.some((t) => ['student', 'admin', 'super_admin'].includes(t));

  if (!canManageGoals && !canEditPlan) {
    return (
      <div className="p-8 text-center text-slate-600">
        Bu sayfaya erişim yetkiniz yok.
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Öğrenci haftalık planı</h2>
          <p className="text-sm text-slate-500 mt-1">
            Koç: hedefleri tanımlayın; öğrenci takvimde yerleştirir. Yönetici her iki tarafı da düzenleyebilir.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-slate-400" />
          {isStudentUi ? (
            <div className="px-3 py-2 border border-slate-200 rounded-lg text-sm min-w-[200px] bg-slate-50 dark:bg-slate-800/80 text-slate-800 dark:text-slate-100 font-medium">
              {selected?.name || effectiveUser?.name || 'Öğrenci'}
            </div>
          ) : (
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm min-w-[200px] bg-white dark:bg-slate-900"
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

      <AcademicCenterQuickLinks />

      {!activeStudentId ? (
        <div className="flex items-center gap-2 text-amber-800 bg-amber-50 border border-amber-100 rounded-lg p-4 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {isStudentUi
            ? 'Öğrenci profiliniz yükleniyor veya oturumda öğrenci kimliği yok. Sayfayı yenileyin veya tekrar giriş yapın.'
            : 'Planı görmek için bir öğrenci seçin.'}
        </div>
      ) : (
        <WeeklyPlannerCalendar
          studentId={activeStudentId}
          studentName={selected?.name ?? effectiveUser?.name}
          canEditPlan={canEditPlan}
          canManageGoals={canManageGoals}
          studentStudyLogUi={studentStudyLogUi}
        />
      )}
    </div>
  );
}
