import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { resolveStudentRecordId } from '../../lib/coachResolve';
import {
  getPendingEtutSession,
  pendingEtutSessionForStudent,
  hasEtutReturnReportFlag,
} from '../../lib/etutSession';
import { EtutSessionReportModal } from './EtutSessionReportModal';
import { userRoleTags } from '../../config/rolePermissions';

/**
 * Etüt odasından dönünce öğrenciye doğrudan rapor formu açılır.
 * Küçük “Etütü bitirdim — rapor ver” bildirimi yok.
 */
export function EtutSessionReturnGate() {
  const { effectiveUser } = useAuth();
  const { students } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const tags = userRoleTags(effectiveUser);
  const isStudent = tags.includes('student');

  const studentId = React.useMemo(() => {
    if (!isStudent) return '';
    return (
      effectiveUser?.studentId?.trim() ||
      resolveStudentRecordId(
        effectiveUser?.role,
        effectiveUser?.studentId,
        effectiveUser?.email,
        students,
        { roles: tags }
      )?.trim() ||
      ''
    );
  }, [isStudent, effectiveUser?.role, effectiveUser?.studentId, effectiveUser?.email, students, tags]);

  const [pending, setPending] = useState(() =>
    studentId ? pendingEtutSessionForStudent(studentId) : null
  );
  const [showReport, setShowReport] = useState(false);
  const [wasHidden, setWasHidden] = useState(false);
  const logoutHandled = useRef(false);

  const syncPending = useCallback(() => {
    if (!studentId) {
      setPending(null);
      return;
    }
    setPending(pendingEtutSessionForStudent(studentId));
  }, [studentId]);

  const openReportNow = useCallback(() => {
    if (!studentId) return;
    const p = getPendingEtutSession();
    if (!p || p.studentId !== studentId) return;
    if (!hasEtutReturnReportFlag() && searchParams.get('etut_report') !== '1') return;
    setPending(p);
    setShowReport(true);
  }, [studentId, searchParams]);

  useEffect(() => {
    syncPending();
  }, [syncPending]);

  /** BBB logoutURL → doğrudan rapor */
  useEffect(() => {
    if (!studentId || logoutHandled.current) return;
    if (searchParams.get('etut_report') !== '1') return;
    const p = getPendingEtutSession();
    if (!p || p.studentId !== studentId) return;
    logoutHandled.current = true;
    setPending(p);
    setShowReport(true);
    const next = new URLSearchParams(searchParams);
    next.delete('etut_report');
    setSearchParams(next, { replace: true });
  }, [studentId, searchParams, setSearchParams]);

  useEffect(() => {
    if (!studentId) return;
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (nav?.type === 'back_forward') openReportNow();
  }, [studentId, openReportNow]);

  useEffect(() => {
    if (!studentId) return;

    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        setWasHidden(true);
        return;
      }
      if (wasHidden) {
        openReportNow();
        setWasHidden(false);
      }
      syncPending();
    };

    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) openReportNow();
      syncPending();
    };

    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [studentId, wasHidden, openReportNow, syncPending]);

  if (!isStudent || !studentId || !pending || !showReport) return null;

  return (
    <EtutSessionReportModal
      session={pending}
      onClose={() => {
        setShowReport(false);
        syncPending();
      }}
      onSaved={() => {
        setShowReport(false);
        setPending(null);
      }}
    />
  );
}
