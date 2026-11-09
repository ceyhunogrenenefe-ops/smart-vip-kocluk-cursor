import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { isUuid } from '../utils/uuid';
import {
  buildMembershipIndex,
  fetchEduPrograms,
  fetchProgramClasses,
  sortProgramClasses,
  type EduProgram,
  type ProgramClass
} from '../lib/eduPrograms';

/** Program/sınıf ekranlarında kullanılan kurum: yönetici aktif kurumu, diğerleri kendi kurumu. */
export function useProgramInstitutionId(): string {
  const { effectiveUser } = useAuth();
  const { institution, activeInstitutionId } = useApp();
  const role = String(effectiveUser?.role || '');
  const own = String(
    (effectiveUser as { institution_id?: string; institutionId?: string } | null)?.institution_id ||
      effectiveUser?.institutionId ||
      ''
  );
  const raw =
    role === 'super_admin' || role === 'admin'
      ? String(activeInstitutionId || institution?.id || own || '')
      : String(own || activeInstitutionId || institution?.id || '');
  const trimmed = raw.trim();
  return isUuid(trimmed) ? trimmed : '';
}

/**
 * Programlar + şube/gruplar + öğrenci → grup üyelik indeksi.
 * `enabled=false` iken istek atılmaz (öğrenci/öğretmen ekranları).
 */
export function useProgramGroups(enabled = true) {
  const instId = useProgramInstitutionId();
  const { effectiveUser } = useAuth();
  const roleStr = String(effectiveUser?.role || '');
  const roleTags = ((effectiveUser as { roles?: string[] } | null)?.roles || []).map(String);
  /** Yeni şube/grup açma ve üyelik değiştirme: yalnız yönetici */
  const canManage = ['admin', 'super_admin'].some((r) => roleStr === r || roleTags.includes(r));
  const [programs, setPrograms] = useState<EduProgram[]>([]);
  const [classes, setClasses] = useState<ProgramClass[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);

  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const [p, c] = await Promise.all([
        fetchEduPrograms(instId || null),
        fetchProgramClasses(instId || null)
      ]);
      setPrograms(p.programs);
      setSetupRequired(p.setupRequired);
      setClasses(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [enabled, instId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const programsById = useMemo(() => new Map(programs.map((p) => [p.id, p])), [programs]);
  const sortedClasses = useMemo(() => sortProgramClasses(classes, programsById), [classes, programsById]);
  const membershipIndex = useMemo(() => buildMembershipIndex(sortedClasses), [sortedClasses]);

  return {
    institutionId: instId,
    canManage,
    programs,
    programsById,
    classes: sortedClasses,
    membershipIndex,
    loading,
    error,
    setupRequired,
    reload
  };
}

export type ProgramGroupsState = ReturnType<typeof useProgramGroups>;
