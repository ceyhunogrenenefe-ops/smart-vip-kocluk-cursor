import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { resolveStudentRecordId } from '../../lib/coachResolve';
import {
  getPendingEtutSession,
  pendingEtutSessionForStudent,
  hasEtutReturnReportFlag,
} from '../../lib/etutSession';
import { EtutSessionReportModal } from './EtutSessionReportModal';
import { EtutReportRedirectOverlay } from './EtutReportRedirectOverlay';
import { userRoleTags } from '../../config/rolePermissions';

const REDIRECT_MS = 1400;

/**
 * Etüt odasından dönünce öğrenciye kısa rapor formu gösterir.
 */
export function EtutSessionReturnGate() {
  const { effectiveUser } = useAuth();
  const { students } = useApp();
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
  const [showRedirect, setShowRedirect] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [wasHidden, setWasHidden] = useState(false);
  const redirectTimer = useRef<number | null>(null);

  const syncPending = useCallback(() => {
    if (!studentId) {
      setPending(null);
      return;
    }
    setPending(pendingEtutSessionForStudent(studentId));
  }, [studentId]);

  const openReportWithRedirect = useCallback(() => {
    if (!studentId || !hasEtutReturnReportFlag()) return;
    const p = getPendingEtutSession();
    if (!p || p.studentId !== studentId) return;
    setPending(p);
    setShowRedirect(true);
    setShowReport(false);
    if (redirectTimer.current) window.clearTimeout(redirectTimer.current);
    redirectTimer.current = window.setTimeout(() => {
      setShowRedirect(false);
      setShowReport(true);
      redirectTimer.current = null;
    }, REDIRECT_MS);
  }, [studentId]);

  const openReportDirect = useCallback(() => {
    if (redirectTimer.current) {
      window.clearTimeout(redirectTimer.current);
      redirectTimer.current = null;
    }
    setShowRedirect(false);
    setShowReport(true);
  }, []);

  useEffect(() => {
    syncPending();
    return () => {
      if (redirectTimer.current) window.clearTimeout(redirectTimer.current);
    };
  }, [syncPending]);

  useEffect(() => {
    if (!studentId) return;
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (nav?.type === 'back_forward') openReportWithRedirect();
  }, [studentId, openReportWithRedirect]);

  useEffect(() => {
    if (!studentId) return;

    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        setWasHidden(true);
        return;
      }
      if (wasHidden) {
        openReportWithRedirect();
        setWasHidden(false);
      }
      syncPending();
    };

    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) openReportWithRedirect();
      syncPending();
    };

    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [studentId, wasHidden, openReportWithRedirect, syncPending]);

  if (!isStudent || !studentId || !pending) return null;

  return (
    <>
      {showRedirect ? <EtutReportRedirectOverlay /> : null}

      {!showReport && !showRedirect ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-[max(4.5rem,env(safe-area-inset-bottom))] z-[240] flex justify-center px-3 sm:bottom-6">
          <button
            type="button"
            onClick={openReportDirect}
            className="pointer-events-auto inline-flex min-h-[44px] items-center gap-2 rounded-full border border-emerald-300 bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-900/20 transition hover:bg-emerald-700 active:scale-[0.98]"
          >
            Etütü bitirdim — rapor ver
          </button>
        </div>
      ) : null}

      {showReport && pending && !showRedirect ? (
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
      ) : null}
    </>
  );
}
