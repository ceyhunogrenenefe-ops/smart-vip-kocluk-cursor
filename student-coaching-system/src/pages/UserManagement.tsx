// Türkçe: Kullanıcı Yönetimi Sayfası - Super Admin Paneli
import React, { useState, useEffect, useCallback, useMemo, startTransition } from 'react';
import { useAuth, SystemUser } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Users,
  UserPlus,
  Search,
  Edit,
  Trash2,
  X,
  Check,
  AlertCircle,
  Shield,
  Calendar,
  Clock,
  UserCog,
  Mail,
  Phone,
  Lock,
  Eye,
  EyeOff,
  CheckCircle,
  RefreshCw,
  Loader2,
  Briefcase,
  Download,
  ChevronDown,
  LogIn
} from 'lucide-react';
import { UserRole, ClassLevel, Coach, Student, CLASS_LEVELS, formatClassLevelLabel } from '../types';
import { userHasAnyRole, userRoleTags } from '../config/rolePermissions';
import { db, PendingRegistrationRow, QuotaSnapshot } from '../lib/database';
import { QuotaManagementPanel } from '../components/quota/QuotaManagementPanel';
import { PageCollapsibleSection } from '../components/ui/PageCollapsibleSection';
import {
  AppModal,
  AppModalBody,
  AppModalFooter,
  AppModalForm,
  AppModalHeader
} from '../components/ui/AppModal';
import { getAuthToken, apiFetch } from '../lib/session';
import {
  userRowToSystemUser,
  findStudentForPlatformUser,
  type StudentPlatformLink,
  type UserRow
} from '../lib/userRowToSystemUser';
import { studentRowToStudent } from '../lib/mapStudentRow';
import {
  CopyableLoginCredentialsModal,
  type LoginCredentialsData
} from '../components/auth/CopyableLoginCredentials';
import { studentRowToStudent, coachRowToCoach } from '../lib/mapStudentRow';
import {
  downloadUserImportTemplateXlsx,
  parseUserImportGridWithMapping,
  mappingArrayToColMap,
  readUserImportFileAsGrid,
  USER_IMPORT_TEMPLATE_HEADERS,
  type UserImportColumnKey
} from '../lib/userBulkImport';
import { UserImportMappingModal } from '../components/users/UserImportMappingModal';
import {
  COACH_PROFILE_ONLY_PREFIX,
  computeSystemUserStats,
  computeStudentsByClassLevel,
  computeStudentsByInstitutionAndClass,
  computeStudentsByBranch,
  classLevelsMatch,
  branchMatches,
  STANDARD_BRANCH_LETTERS,
  normalizeStudentBranchKey,
  getDaysLeftFromEndDate,
  indexStudentsByPlatformLink,
  isUserActiveAccount,
  isUserExpiredAccount,
  normalizeClassLevelFilterKey,
  resolveStudentForUser,
  sortClassLevelKeys
} from '../lib/userStats';
import TeacherQuestionProfileFields from '../components/questionHelp/TeacherQuestionProfileFields';
import { saveTeacherQuestionProfile, fetchTeacherQuestionProfile } from '../lib/questionHelp/questionHelpApi';
import {
  currentAcademicYearTerm,
  mergeAcademicYearTermOptions,
  normalizeAcademicYearLabel
} from '../lib/academicYearTerms';
import { compareByFirstName, sortByFirstName } from '../lib/personNameSort';

function studentBranchSelectValue(school: string | undefined | null): string {
  const key = normalizeStudentBranchKey(school);
  if ((STANDARD_BRANCH_LETTERS as readonly string[]).includes(key)) return key;
  return '';
}

function formHasTeacherRole(role: UserRole, alsoTeacher: boolean): boolean {
  return role === 'teacher' || alsoTeacher;
}

function notifyUsersDataChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('scs:users-changed'));
  }
}

function isAdminActor(user: SystemUser | null | undefined): boolean {
  return userHasAnyRole(user, ['admin', 'super_admin']);
}

function buildStaffRoleAssignment(
  formData: { role: UserRole; alsoCoach: boolean; alsoTeacher: boolean },
  canAssign: boolean
): { roles: UserRole[]; primary: UserRole } | null {
  if (!canAssign || formData.role === 'student') return null;
  if (formData.role === 'admin') {
    const roles: UserRole[] = ['admin'];
    if (formData.alsoCoach) roles.push('coach');
    if (formData.alsoTeacher) roles.push('teacher');
    return { roles, primary: 'admin' };
  }
  if (formData.role === 'teacher') {
    const roles: UserRole[] = ['teacher'];
    if (formData.alsoCoach) roles.push('coach');
    return { roles, primary: 'teacher' };
  }
  if (formData.role === 'coach') {
    const roles: UserRole[] = ['coach'];
    if (formData.alsoTeacher) roles.push('teacher');
    return { roles, primary: 'coach' };
  }
  return null;
}

function userHasTeacherQuestionRole(user: SystemUser): boolean {
  const rt = userRoleTags(user as SystemUser);
  return formHasTeacherRole(user.role, rt.includes('teacher'));
}

const toClassLevel = (raw: string): ClassLevel => {
  const v = String(raw || '').trim();
  if (!v) return 9;
  if (v === 'LGS' || v === 'YOS' || v === 'TYT-Maarif' || v.startsWith('YKS-')) return v as ClassLevel;
  const n = Number(v);
  if (!Number.isNaN(n)) return n as ClassLevel;
  return 9;
};

function quotaBlockMessage(
  quota: QuotaSnapshot | null,
  role: UserRole,
  actorRole: UserRole | undefined
): string | null {
  if (!quota || quota.quota_exempt) return null;
  const limits = quota.admin_limits;
  if (!limits) return null;
  if (role === 'student' && quota.counts.students >= limits.max_students) {
    return `Öğrenci kotası doldu (${quota.counts.students}/${limits.max_students}). Önce kotayı artırın veya mevcut kayıtları temizleyin.`;
  }
  if (role === 'coach' && quota.counts.coaches >= limits.max_coaches) {
    return `Koç kotası doldu (${quota.counts.coaches}/${limits.max_coaches}). Önce kotayı artırın.`;
  }
  return null;
}

const coachProfilesWithoutLoginUser = (coachList: Coach[], userRows: UserRow[]): SystemUser[] => {
  const emailsWithUser = new Set(
    userRows.map((r) => String(r.email || '').toLowerCase().trim()).filter(Boolean)
  );
  const end = new Date();
  end.setFullYear(end.getFullYear() + 1);
  const endIso = end.toISOString();
  return coachList
    .filter((c) => {
      const em = String(c.email || '').toLowerCase().trim();
      return Boolean(em) && !emailsWithUser.has(em);
    })
    .map((c) => ({
      id: `${COACH_PROFILE_ONLY_PREFIX}${c.id}`,
      name: c.name,
      email: c.email,
      phone: c.phone,
      role: 'coach' as const,
      institutionId: c.institutionId,
      coachId: c.id,
      package: 'trial' as const,
      isActive: true,
      startDate: c.createdAt || new Date().toISOString(),
      endDate: endIso,
      createdAt: c.createdAt
    }));
};

// Paket bilgileri (Kurumsal turuncu, Deneme mor — referans tablo)
const PACKAGES = {
  trial: { name: 'Deneme', color: 'bg-purple-100 text-purple-800 border border-purple-200/80', days: 14 },
  starter: { name: 'Başlangıç', color: 'bg-blue-100 text-blue-800 border border-blue-200/80', days: 30 },
  professional: { name: 'Profesyonel', color: 'bg-emerald-100 text-emerald-800 border border-emerald-200/80', days: 365 },
  enterprise: { name: 'Kurumsal', color: 'bg-orange-100 text-orange-900 border border-orange-200/80', days: 365 }
};

// Rol bilgileri (Öğrenci yeşil, Öğretmen mor, Koç mavi)
const ROLES: { value: UserRole; label: string; color: string }[] = [
  { value: 'super_admin', label: 'Süper Admin', color: 'bg-amber-100 text-amber-800 border border-amber-200/80' },
  { value: 'admin', label: 'Yönetici', color: 'bg-red-100 text-red-800 border border-red-200/80' },
  { value: 'coach', label: 'Koç', color: 'bg-blue-100 text-blue-800 border border-blue-200/80' },
  { value: 'teacher', label: 'Öğretmen', color: 'bg-violet-100 text-violet-900 border border-violet-200/80' },
  { value: 'student', label: 'Öğrenci', color: 'bg-green-100 text-green-900 border border-green-200/80' }
];

const ROLE_BADGE_ORDER: UserRole[] = ['super_admin', 'admin', 'teacher', 'coach', 'student'];

/** İlk boyamada tablo kaydırması için parti boyutu */
const USERS_RENDER_BATCH = 100;

function roleLabelFromRoles(role: UserRole, extraRoles?: UserRole[] | null): string {
  const tags = extraRoles?.length ? extraRoles : [role];
  return tags.map((t) => ROLES.find((r) => r.value === t)?.label || t).join(' · ');
}

function roleBadgeForUser(user: SystemUser): { label: string; className: string } {
  const tags = userRoleTags(user as { role: UserRole; roles?: UserRole[] });
  const sorted = [...tags].sort(
    (a, b) => ROLE_BADGE_ORDER.indexOf(a) - ROLE_BADGE_ORDER.indexOf(b)
  );
  const labels = sorted.map((t) => ROLES.find((r) => r.value === t)?.label || t);
  const label =
    labels.join(' · ') +
    (user.id.startsWith(COACH_PROFILE_ONLY_PREFIX) ? ' · giriş yok' : '');
  const primary =
    sorted.find((t) => ['teacher', 'coach', 'student', 'admin'].includes(t)) || sorted[0] || user.role;
  const cls =
    ROLES.find((r) => r.value === primary)?.color || 'bg-gray-100 text-gray-800 border border-gray-200';
  return { label, className: cls };
}

export default function UserManagement() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    user: currentUser,
    isLoading: authLoading,
    impersonate,
    canImpersonate,
    getAllUsers,
    createUser,
    updateUser,
    deleteUser,
    getUserById
  } = useAuth();
  const {
    addStudent,
    updateStudent,
    addCoach,
    updateCoach,
    students,
    coaches,
    institution,
    institutions,
    activeInstitutionId,
    deleteStudent,
    deleteCoach
  } = useApp();

  // Erişim: ProtectedRoute (/user-management) — burada yeniden navigate yok (auth yüklenirken yanlış / yönlendirmesini engeller)

  // State
  const [users, setUsers] = useState<SystemUser[]>([]);
  /** Çoklu rol (ör. öğretmen+koç) eşlemesi için ham API kullanıcı satırları */
  const [rawUserRows, setRawUserRows] = useState<UserRow[]>([]);
  /** Sayfa özel öğrenci/koç listesi — users ile aynı anda yüklenir (gecikmeli context beklemez). */
  const [pageStudents, setPageStudents] = useState<Student[]>([]);
  const [pageCoaches, setPageCoaches] = useState<Coach[]>([]);
  const [listLoading, setListLoading] = useState(true);
  /** Öğrenci/koç profilleri arka planda yüklenirken sınıf–veli sütunları için */
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [renderLimit, setRenderLimit] = useState(USERS_RENDER_BATCH);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<UserRole | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'expired' | 'inactive'>('all');
  const [filterInstitutionId, setFilterInstitutionId] = useState<string>('all');
  const [filterClassLevel, setFilterClassLevel] = useState<string>('all');
  const [filterBranch, setFilterBranch] = useState<string>('all');
  const [filterAcademicYear, setFilterAcademicYear] = useState<string>('all');
  const [filterCoachId, setFilterCoachId] = useState<string>('all');
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [selectedUser, setSelectedUser] = useState<SystemUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [quota, setQuota] = useState<QuotaSnapshot | null>(null);
  const [quotaRefreshKey, setQuotaRefreshKey] = useState(0);
  const [quotaPickerInstitutionId, setQuotaPickerInstitutionId] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState<{
    created: number;
    updated: number;
    skipped: number;
    failed: number;
    errors: { rowNumber: number; message: string }[];
  } | null>(null);
  const [importMappingOpen, setImportMappingOpen] = useState(false);
  const [importGrid, setImportGrid] = useState<unknown[][]>([]);
  const [importFileName, setImportFileName] = useState('');
  /** Satır içi koç ataması PATCH sırasında */
  const [coachAssignBusy, setCoachAssignBusy] = useState<string | null>(null);
  const [classAssignBusy, setClassAssignBusy] = useState<string | null>(null);
  const [branchAssignBusy, setBranchAssignBusy] = useState<string | null>(null);
  const [termAssignBusy, setTermAssignBusy] = useState<string | null>(null);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(() => new Set());
  const [bulkBranch, setBulkBranch] = useState('');
  const [bulkCoachId, setBulkCoachId] = useState('');
  const [bulkAcademicYear, setBulkAcademicYear] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [loginAsBusyId, setLoginAsBusyId] = useState<string | null>(null);
  const [loginCredentialsModal, setLoginCredentialsModal] = useState<LoginCredentialsData | null>(null);
  const [pendingRegistrations, setPendingRegistrations] = useState<PendingRegistrationRow[]>([]);
  const [pendingBusyId, setPendingBusyId] = useState<string | null>(null);

  const openCreatedLoginCredentials = useCallback(
    (opts: {
      title: string;
      email: string;
      password: string;
      role: UserRole;
      roles?: UserRole[] | null;
      institutionId?: string | null;
    }) => {
      const institutionName = opts.institutionId
        ? institutions.find((i) => i.id === opts.institutionId)?.name
        : institution?.name;
      setLoginCredentialsModal({
        title: opts.title,
        subtitle: 'Giriş bilgileri panoya otomatik kopyalandı. Tekrar kopyalamak için alttaki düğmeyi kullanın.',
        email: opts.email.toLowerCase().trim(),
        password: opts.password,
        roleLabel: roleLabelFromRoles(opts.role, opts.roles),
        institutionName: institutionName || undefined
      });
    },
    [institutions, institution?.name]
  );

  const handleLoginAsUser = async (row: SystemUser) => {
    if (
      row.email.toLowerCase().trim() === currentUser?.email?.toLowerCase().trim()
    ) {
      setMessage({ type: 'error', text: 'Zaten bu hesapla oturum açmış durumdasınız.' });
      return;
    }
    if (!canImpersonate(row)) {
      setMessage({ type: 'error', text: 'Bu hesaba geçiş yetkiniz yok.' });
      return;
    }
    setLoginAsBusyId(row.id);
    setMessage(null);
    try {
      const r = await impersonate(row);
      if (!r.success) {
        setMessage({ type: 'error', text: r.message });
        return;
      }
      setMessage({ type: 'success', text: r.message });
      const role = row.role;
      if (role === 'coach') navigate('/coach-dashboard');
      else if (role === 'student') navigate('/weekly-planner');
      else if (role === 'teacher') navigate('/teacher-panel');
      else if (role === 'admin') navigate('/dashboard');
      else navigate('/dashboard');
    } finally {
      setLoginAsBusyId(null);
    }
  };

  const selectableRoles = useMemo(() => {
    const r = currentUser?.role;
    if (!r) return ROLES.filter((x) => x.value !== 'super_admin');
    if (r === 'teacher') return ROLES.filter((x) => x.value === 'student');
    if (r === 'admin')
      return ROLES.filter((x) => ['coach', 'teacher', 'student'].includes(x.value));
    if (r === 'super_admin') return ROLES.filter((x) => x.value !== 'super_admin');
    return ROLES.filter((x) => x.value !== 'super_admin');
  }, [currentUser]);

  const linkedStudents = useMemo(() => {
    if (!pageStudents.length) return students;
    const byId = new Map<string, Student>();
    for (const s of pageStudents) byId.set(s.id, s);
    for (const s of students) {
      const prev = byId.get(s.id);
      byId.set(s.id, prev ? { ...prev, ...s } : s);
    }
    return [...byId.values()];
  }, [pageStudents, students]);

  const linkedCoaches = useMemo(() => {
    if (!pageCoaches.length) return coaches;
    const byId = new Map<string, Coach>();
    for (const c of pageCoaches) byId.set(c.id, c);
    for (const c of coaches) {
      const prev = byId.get(c.id);
      byId.set(c.id, prev ? { ...prev, ...c } : c);
    }
    return [...byId.values()];
  }, [pageCoaches, coaches]);

  const studentLinkIndex = useMemo(
    () => indexStudentsByPlatformLink(linkedStudents),
    [linkedStudents]
  );

  const classLevelFilterOptions = useMemo(() => {
    const known = new Set(CLASS_LEVELS.map((l) => String(l.value)));
    const extras = new Set<string>();
    for (const s of linkedStudents) {
      const key = normalizeClassLevelFilterKey(s.classLevel);
      if (key && !known.has(key)) extras.add(key);
    }
    return sortClassLevelKeys([...extras]).map((key) => ({
      value: key,
      label: formatClassLevelLabel(key)
    }));
  }, [linkedStudents]);

  const statsStudentsScope = useMemo(() => {
    if (currentUser?.role === 'super_admin' && filterInstitutionId !== 'all') {
      return linkedStudents.filter((s) => s.institutionId === filterInstitutionId);
    }
    if (currentUser?.role === 'admin') {
      const inst = activeInstitutionId || institution?.id || currentUser?.institutionId;
      if (inst) return linkedStudents.filter((s) => !s.institutionId || s.institutionId === inst);
    }
    return linkedStudents;
  }, [
    linkedStudents,
    currentUser?.role,
    currentUser?.institutionId,
    filterInstitutionId,
    activeInstitutionId,
    institution?.id
  ]);

  const classLevelStats = useMemo(
    () => computeStudentsByClassLevel(statsStudentsScope),
    [statsStudentsScope]
  );

  const branchStats = useMemo(
    () => computeStudentsByBranch(statsStudentsScope),
    [statsStudentsScope]
  );

  const institutionClassStats = useMemo(() => {
    if (currentUser?.role !== 'super_admin') return [];
    let scope = linkedStudents;
    if (filterInstitutionId !== 'all') {
      scope = linkedStudents.filter((s) => s.institutionId === filterInstitutionId);
    }
    return computeStudentsByInstitutionAndClass(scope, institutions);
  }, [linkedStudents, institutions, currentUser?.role, filterInstitutionId]);

  useEffect(() => {
    if (currentUser?.role !== 'super_admin' || !activeInstitutionId) return;
    setFilterInstitutionId((prev) => (prev === 'all' ? activeInstitutionId : prev));
  }, [currentUser?.role, activeInstitutionId]);

  const coachesForFilter = useMemo(() => {
    let list = [...linkedCoaches].sort((a, b) => compareByFirstName(a.name, b.name));
    if (currentUser?.role === 'super_admin' && filterInstitutionId !== 'all') {
      list = list.filter((c) => !c.institutionId || c.institutionId === filterInstitutionId);
    }
    return list;
  }, [linkedCoaches, filterInstitutionId, currentUser?.role]);

  useEffect(() => {
    if (filterCoachId === 'all') return;
    if (!coachesForFilter.some((c) => c.id === filterCoachId)) {
      setFilterCoachId('all');
    }
  }, [coachesForFilter, filterCoachId]);

  const refreshUsers = useCallback(async (opts?: { broadcast?: boolean }) => {
    if (authLoading) return;
    if (getAuthToken()) {
      setListLoading(true);
      setDetailsLoading(true);
      try {
        const scope =
          currentUser?.role === 'super_admin'
            ? undefined
            : activeInstitutionId || institution?.id || undefined;
        const isAdminish =
          currentUser?.role === 'super_admin' || currentUser?.role === 'admin';

        const rows = await db.getUsers();
        setRawUserRows(rows as UserRow[]);
        const initialFromApi = rows.map((row) =>
          userRowToSystemUser(row, { coaches: [], students: [] })
        );
        setUsers(initialFromApi);
        setListLoading(false);

        const [stRows, coRows, pendingRows] = await Promise.all([
          db.getStudents(scope),
          db.getCoaches(scope),
          isAdminish
            ? db.getPendingRegistrations().catch(() => [] as PendingRegistrationRow[])
            : Promise.resolve([] as PendingRegistrationRow[])
        ]);

        const joinStudents = stRows.map(studentRowToStudent);
        const joinCoaches = coRows.map(coachRowToCoach);
        setPageStudents(joinStudents);
        setPageCoaches(joinCoaches);
        if (isAdminish) setPendingRegistrations(pendingRows);

        const fromApi = rows.map((row) =>
          userRowToSystemUser(row, { coaches: joinCoaches, students: joinStudents })
        );
        const stubs = coachProfilesWithoutLoginUser(joinCoaches, rows as UserRow[]);
        const seen = new Set(fromApi.map((u) => u.email.toLowerCase().trim()));
        startTransition(() => {
          setUsers([...fromApi, ...stubs.filter((s) => !seen.has(s.email.toLowerCase().trim()))]);
        });
        if (opts?.broadcast) notifyUsersDataChanged();
        return;
      } catch (e) {
        console.error('[UserManagement] /api/users yüklenemedi:', e);
        setMessage((prev) =>
          prev?.type === 'success'
            ? prev
            : {
                type: 'error',
                text:
                  'Kullanıcı listesi sunucudan alınamadı (JWT veya ağ). Sayfayı yenileyin; oturum süresi dolmuş olabilir. ' +
                  (e instanceof Error ? e.message : '')
              }
        );
      } finally {
        setListLoading(false);
        setDetailsLoading(false);
      }
    } else {
      setUsers(getAllUsers());
      setRawUserRows([]);
      setPageStudents([]);
      setPageCoaches([]);
      setListLoading(false);
      setDetailsLoading(false);
    }
  }, [
    getAllUsers,
    currentUser?.role,
    activeInstitutionId,
    institution?.id,
    authLoading
  ]);

  useEffect(() => {
    if (authLoading) return;
    void refreshUsers();
  }, [refreshUsers, authLoading]);

  const handleApprovePending = async (row: PendingRegistrationRow) => {
    setPendingBusyId(row.id);
    setMessage(null);
    try {
      await db.approvePendingRegistration(row.id);
      setMessage({ type: 'success', text: 'Kayıt onaylandı ve hesap aktif edildi.' });
      await refreshUsers({ broadcast: true });
    } catch (e) {
      setMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Kayıt onaylanamadı.'
      });
    } finally {
      setPendingBusyId(null);
    }
  };

  const handleRejectPending = async (row: PendingRegistrationRow) => {
    const reason = window.prompt('Red nedeni (opsiyonel):', '') || '';
    setPendingBusyId(row.id);
    setMessage(null);
    try {
      await db.rejectPendingRegistration(row.id, reason);
      setMessage({ type: 'success', text: 'Kayıt talebi reddedildi.' });
      await refreshUsers({ broadcast: true });
    } catch (e) {
      setMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Kayıt reddedilemedi.'
      });
    } finally {
      setPendingBusyId(null);
    }
  };

  useEffect(() => {
    if (!showModal || modalMode !== 'edit' || !selectedUser?.id) return;
    if (selectedUser.id.startsWith(COACH_PROFILE_ONLY_PREFIX)) return;
    if (!userHasTeacherQuestionRole(selectedUser)) return;
    let cancelled = false;
    void fetchTeacherQuestionProfile(selectedUser.id)
      .then((p) => {
        if (!cancelled) {
          setFormData((prev) => ({
            ...prev,
            questionBranches: p.branches,
            questionGrades: p.grades
          }));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [showModal, modalMode, selectedUser?.id, selectedUser?.role]);

  useEffect(() => {
    if (
      !showModal ||
      modalMode !== 'edit' ||
      !selectedUser ||
      !userRoleTags(selectedUser).includes('admin') ||
      currentUser?.role !== 'super_admin' ||
      !getAuthToken()
    ) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const d = await db.getAdminQuotaByAdmin(selectedUser.id);
        if (cancelled || !d.admin_limits) return;
        setFormData(prev => ({
          ...prev,
          bootstrap_max_students: String(d.admin_limits?.max_students ?? 50),
          bootstrap_max_coaches: String(d.admin_limits?.max_coaches ?? 10),
          bootstrap_package_label: d.admin_limits?.package_label?.trim() || 'professional'
        }));
      } catch {
        /* satır yoksa form varsayılanları kalır */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    showModal,
    modalMode,
    selectedUser?.id,
    selectedUser?.role,
    currentUser?.role
  ]);

  useEffect(() => {
    if (currentUser?.role === 'super_admin' && activeInstitutionId) {
      setQuotaPickerInstitutionId(activeInstitutionId);
    }
  }, [currentUser?.role, activeInstitutionId]);

  const quotaInstitutionId =
    currentUser?.role === 'super_admin'
      ? quotaPickerInstitutionId ||
        activeInstitutionId ||
        institution?.id ||
        institutions[0]?.id ||
        undefined
      : currentUser?.institutionId || activeInstitutionId || institution?.id || undefined;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!getAuthToken() || !currentUser) return;
      const inst = quotaInstitutionId;
      if (!inst) {
        if (!cancelled) setQuota(null);
        return;
      }
      try {
        const snap = await db.getQuotaSnapshot(inst);
        if (!cancelled) setQuota(snap);
      } catch {
        if (!cancelled) setQuota(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUser, quotaInstitutionId, quotaRefreshKey]);

  const quotaCoaches = useMemo(() => {
    if (!quotaInstitutionId) return linkedCoaches;
    return linkedCoaches.filter(
      (c) => !c.institutionId || String(c.institutionId) === String(quotaInstitutionId)
    );
  }, [linkedCoaches, quotaInstitutionId]);

  const quotaStudents = useMemo(() => {
    if (!quotaInstitutionId) return linkedStudents;
    return linkedStudents.filter(
      (s) => !s.institutionId || String(s.institutionId) === String(quotaInstitutionId)
    );
  }, [linkedStudents, quotaInstitutionId]);

  const quotaInstitutionName = useMemo(() => {
    if (!quotaInstitutionId) return undefined;
    return (
      institutions.find((i) => i.id === quotaInstitutionId)?.name ||
      (institution?.id === quotaInstitutionId ? institution.name : undefined)
    );
  }, [quotaInstitutionId, institutions, institution?.id, institution?.name]);

  const institutionAdmins = useMemo(() => {
    const inst = quotaInstitutionId;
    if (!inst) return [];
    const seen = new Set<string>();
    const pick: { id: string; name: string; email: string }[] = [];
    const push = (id: string, name: string, email: string) => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      pick.push({ id, name: name || email, email });
    };
    for (const row of rawUserRows) {
      const tags = userRoleTags(row as { role: UserRole; roles?: UserRole[] });
      if (!tags.includes('admin')) continue;
      if (row.institution_id && String(row.institution_id) !== String(inst)) continue;
      push(row.id, row.name || row.email, row.email);
    }
    for (const u of users) {
      const tags = userRoleTags(u as SystemUser);
      if (!tags.includes('admin')) continue;
      if (u.institutionId && String(u.institutionId) !== String(inst)) continue;
      push(u.id, u.name, u.email);
    }
    if (quota?.admin_user_id) {
      const hit = pick.find((p) => p.id === quota.admin_user_id);
      if (!hit) {
        const fromUsers = users.find((u) => u.id === quota.admin_user_id);
        if (fromUsers) push(fromUsers.id, fromUsers.name, fromUsers.email);
      }
    }
    return pick;
  }, [users, rawUserRows, quotaInstitutionId, quota?.admin_user_id]);

  const refreshQuotaSnapshot = useCallback(() => {
    setQuotaRefreshKey((k) => k + 1);
  }, []);

  // Form state
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    birthDate: '',
    classLevel: '9',
    branch: '',
    parentName: '',
    parentPhone: '',
    password: '',
    role: 'student' as UserRole,
    /** Personel için: öğretmen + koç birlikte */
    alsoCoach: false,
    alsoTeacher: false,
    assignCoachId: '',
    studentInstitutionId: '' as string,
    bootstrap_max_students: '50',
    bootstrap_max_coaches: '10',
    bootstrap_package_label: 'professional',
    package: 'trial' as 'trial' | 'starter' | 'professional' | 'enterprise',
    academicYearLabel: currentAcademicYearTerm(),
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    isActive: true,
    whatsappAutomationEnabled: true,
    questionBranches: [] as string[],
    questionGrades: [] as string[]
  });

  const [showPassword, setShowPassword] = useState(false);

  // Filtrelenmiş kullanıcılar
  const trIncludes = (haystack: string, needle: string) =>
    haystack.toLocaleLowerCase('tr-TR').includes(needle.toLocaleLowerCase('tr-TR'));

  const academicYearOptions = useMemo(
    () =>
      mergeAcademicYearTermOptions(
        users.map((u) => normalizeAcademicYearLabel(u.academicYearLabel)).filter(Boolean)
      ),
    [users]
  );

  const academicYearStats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const u of users) {
      const key = normalizeAcademicYearLabel(u.academicYearLabel) || '__unset__';
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return academicYearOptions
      .map((term) => ({ key: term, label: term, count: counts.get(term) || 0 }))
      .concat(
        (counts.get('__unset__') || 0) > 0
          ? [{ key: '__unset__', label: 'Dönem atanmamış', count: counts.get('__unset__') || 0 }]
          : []
      );
  }, [users, academicYearOptions]);

  const filteredUsers = useMemo(() => {
    const q = searchTerm.trim();
    const qDigits = q.replace(/\D/g, '');
    return sortByFirstName(
      users.filter((user) => {
      const phoneMatch = (user.phone || '').replace(/\s/g, '').toLowerCase();
      const tags = userRoleTags(user as { role: UserRole; roles?: UserRole[] });
      const studentMatchForFilter = tags.includes('student')
        ? resolveStudentForUser(
            { id: user.id, email: user.email, studentId: user.studentId },
            studentLinkIndex
          ) ??
          findStudentForPlatformUser(
            {
              platformUserId: user.id,
              email: user.email,
              studentId: user.studentId
            },
            linkedStudents
          )
        : undefined;
      if (
        searchTerm &&
        !trIncludes(user.name, q) &&
        !trIncludes(user.email, q) &&
        !(
          user.phone &&
          (phoneMatch.includes(q.replace(/\s/g, '')) ||
            (qDigits.length >= 4 && phoneMatch.includes(qDigits)))
        )
      ) {
        return false;
      }

      if (filterInstitutionId !== 'all' && currentUser?.role === 'super_admin') {
        const userInst = String(studentMatchForFilter?.institutionId || user.institutionId || '').trim();
        if (userInst !== filterInstitutionId) return false;
      }

      if (filterRole !== 'all') {
        if (!tags.includes(filterRole)) return false;
      }

      if (filterStatus !== 'all') {
        if (filterStatus === 'active' && !isUserActiveAccount(user)) return false;
        if (filterStatus === 'expired' && !isUserExpiredAccount(user)) return false;
        if (filterStatus === 'inactive' && user.isActive !== false) return false;
      }

      if (filterClassLevel !== 'all') {
        if (!tags.includes('student')) return false;
        if (!classLevelsMatch(studentMatchForFilter?.classLevel, filterClassLevel)) return false;
      }

      if (filterBranch !== 'all') {
        if (!tags.includes('student')) return false;
        if (filterBranch === '__unknown__') {
          if (normalizeStudentBranchKey(studentMatchForFilter?.school)) return false;
        } else if (!branchMatches(studentMatchForFilter?.school, filterBranch)) {
          return false;
        }
      }

      if (filterCoachId !== 'all') {
        const coachRow = coachesForFilter.find((c) => c.id === filterCoachId);
        const studentCoach = studentMatchForFilter?.coachId ? String(studentMatchForFilter.coachId) : '';
        const userCoachId = user.coachId ? String(user.coachId) : '';
        const coachEmail = coachRow?.email?.toLowerCase().trim();
        const userEmail = user.email?.toLowerCase().trim();
        const matchesCoach =
          studentCoach === filterCoachId ||
          userCoachId === filterCoachId ||
          Boolean(coachEmail && userEmail && userEmail === coachEmail);
        if (!matchesCoach) return false;
      }

      if (filterAcademicYear !== 'all') {
        const label = normalizeAcademicYearLabel(user.academicYearLabel);
        if (filterAcademicYear === '__unset__') {
          if (label) return false;
        } else if (label !== filterAcademicYear) {
          return false;
        }
      }

      return true;
    }),
      (u) => u.name
    );
  }, [
    users,
    searchTerm,
    filterInstitutionId,
    currentUser?.role,
    filterRole,
    filterStatus,
    filterClassLevel,
    filterBranch,
    filterAcademicYear,
    filterCoachId,
    studentLinkIndex,
    linkedStudents,
    coachesForFilter
  ]);

  useEffect(() => {
    setRenderLimit(USERS_RENDER_BATCH);
  }, [
    searchTerm,
    filterRole,
    filterStatus,
    filterInstitutionId,
    filterClassLevel,
    filterBranch,
    filterAcademicYear,
    filterCoachId
  ]);

  const visibleUsers = useMemo(
    () => filteredUsers.slice(0, renderLimit),
    [filteredUsers, renderLimit]
  );

  const hasMoreUsers = filteredUsers.length > visibleUsers.length;

  const selectableStudents = useMemo(
    () => filteredUsers.filter((u) => userRoleTags(u as SystemUser).includes('student')),
    [filteredUsers]
  );

  const allFilteredStudentsSelected =
    selectableStudents.length > 0 &&
    selectableStudents.every((u) => selectedStudentIds.has(u.id));

  const clearStudentSelection = useCallback(() => {
    setSelectedStudentIds(new Set());
  }, []);

  const toggleStudentSelection = useCallback((userId: string) => {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);

  const selectAllFilteredStudents = useCallback(() => {
    setSelectedStudentIds(new Set(selectableStudents.map((u) => u.id)));
  }, [selectableStudents]);

  useEffect(() => {
    clearStudentSelection();
  }, [
    searchTerm,
    filterRole,
    filterStatus,
    filterInstitutionId,
    filterClassLevel,
    filterBranch,
    filterAcademicYear,
    filterCoachId,
    clearStudentSelection
  ]);

  const coachesForStudentForm = useMemo(() => {
    const inst = String(formData.studentInstitutionId || '').trim();
    if (!inst) return coaches;
    return coaches.filter((c) => !c.institutionId || c.institutionId === inst);
  }, [coaches, formData.studentInstitutionId]);

  const getDaysLeft = getDaysLeftFromEndDate;

  // Abonelik durumu (Süresiz açık mavi, N gün kaldı açık yeşil rozet)
  const getSubscriptionStatus = (user: SystemUser) => {
    if (user.isActive === false) {
      return {
        status: 'Pasif',
        className: 'bg-slate-100 text-slate-600 border border-slate-200'
      };
    }

    const daysLeft = getDaysLeft(user.endDate);
    if (daysLeft === null) {
      return {
        status: 'Süresiz',
        className: 'bg-sky-100 text-sky-900 border border-sky-200/90'
      };
    }
    if (daysLeft <= 0) {
      return {
        status: 'Süresi dolmuş',
        className: 'bg-red-100 text-red-800 border border-red-200/80'
      };
    }
    return {
      status: `${daysLeft} gün kaldı`,
      className: 'bg-emerald-100 text-emerald-900 border border-emerald-200/90'
    };
  };

  const coachesForStudentRow = useCallback(
    (studentInstitutionId: string | undefined) => {
      if (!studentInstitutionId) return linkedCoaches;
      return linkedCoaches.filter((c) => !c.institutionId || c.institutionId === studentInstitutionId);
    },
    [linkedCoaches]
  );

  const mergePageStudent = useCallback((mapped: Student) => {
    setPageStudents((prev) => {
      const ix = prev.findIndex((s) => s.id === mapped.id);
      if (ix === -1) return [...prev, mapped];
      const copy = [...prev];
      copy[ix] = { ...copy[ix], ...mapped };
      return copy;
    });
  }, []);

  const mergePageCoach = useCallback((mapped: Coach) => {
    setPageCoaches((prev) => {
      const ix = prev.findIndex((c) => c.id === mapped.id);
      if (ix === -1) return [...prev, mapped];
      const copy = [...prev];
      copy[ix] = { ...copy[ix], ...mapped };
      return copy;
    });
  }, []);

  /** Düzenleme modalı için veli/doğum tarihi dahil tam öğrenci profili. */
  const resolveStudentProfileForUser = useCallback(
    async (user: Pick<SystemUser, 'id' | 'email' | 'studentId'>): Promise<Student | null> => {
      const opts = {
        platformUserId: user.id,
        email: user.email,
        studentId: user.studentId || user.id
      };
      let profile = findStudentForPlatformUser(opts, linkedStudents) as Student | undefined;
      if (profile) return profile;
      if (!getAuthToken()) return null;
      try {
        const row = await db.getStudentForPlatformUser(user.id, user.email);
        if (!row) return null;
        profile = studentRowToStudent(row);
        mergePageStudent(profile);
        return profile;
      } catch {
        return null;
      }
    },
    [linkedStudents, mergePageStudent]
  );

  /** Bellekteki listede yoksa API’den tam liste ile eşle (kurum filtresi / gecikmiş state). */
  const resolveStudentLinkForUser = useCallback(
    async (user: Pick<SystemUser, 'id' | 'email' | 'studentId'>): Promise<StudentPlatformLink | null> => {
      const profile = await resolveStudentProfileForUser(user);
      return profile;
    },
    [resolveStudentProfileForUser]
  );

  const handleInlineCoachChange = async (user: SystemUser, coachId: string) => {
    const tags = userRoleTags(user as SystemUser);
    if (!tags.includes('student')) return;
    const st = await resolveStudentLinkForUser(user);
    if (!st) return;
    setCoachAssignBusy(user.id);
    setMessage(null);
    try {
      await updateStudent(st.id, { coachId: coachId.trim() || undefined });
      await refreshUsers({ broadcast: true });
    } catch (e) {
      setMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Koç atanamadı.'
      });
    } finally {
      setCoachAssignBusy(null);
    }
  };

  const handleInlineClassLevelChange = async (user: SystemUser, classLevelRaw: string) => {
    const tags = userRoleTags(user as SystemUser);
    if (!tags.includes('student')) return;
    const st = await resolveStudentLinkForUser(user);
    if (!st) return;
    const next = toClassLevel(classLevelRaw);
    if (st.classLevel === next) return;
    setClassAssignBusy(user.id);
    setMessage(null);
    try {
      await updateStudent(st.id, { classLevel: next });
      await refreshUsers({ broadcast: true });
    } catch (e) {
      setMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Sınıf güncellenemedi.'
      });
    } finally {
      setClassAssignBusy(null);
    }
  };

  const handleInlineBranchChange = async (user: SystemUser, branchLetter: string) => {
    const tags = userRoleTags(user as SystemUser);
    if (!tags.includes('student')) return;
    const st = await resolveStudentLinkForUser(user);
    if (!st) return;
    const next = branchLetter.trim().toLocaleUpperCase('tr-TR');
    if (normalizeStudentBranchKey(st.school) === next) return;
    setBranchAssignBusy(user.id);
    setMessage(null);
    try {
      await updateStudent(st.id, { school: next || undefined });
      await refreshUsers({ broadcast: true });
    } catch (e) {
      setMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Şube güncellenemedi.'
      });
    } finally {
      setBranchAssignBusy(null);
    }
  };

  const handleInlineAcademicYearChange = async (user: SystemUser, termRaw: string) => {
    const tags = userRoleTags(user as SystemUser);
    if (!tags.includes('student')) return;
    const next = normalizeAcademicYearLabel(termRaw);
    if (normalizeAcademicYearLabel(user.academicYearLabel) === next) return;
    setTermAssignBusy(user.id);
    setMessage(null);
    try {
      if (getAuthToken()) {
        await db.updateUser(user.id, {
          academic_year_label: next || null
        } as Partial<UserRow>);
      } else {
        await updateUser(user.id, { academic_year_label: next || null });
      }
      await refreshUsers({ broadcast: true });
    } catch (e) {
      setMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Dönem güncellenemedi.'
      });
    } finally {
      setTermAssignBusy(null);
    }
  };

  const applyBulkStudentEdit = async (field: 'branch' | 'coach' | 'term') => {
    const ids = [...selectedStudentIds];
    if (!ids.length) return;
    if (field === 'branch' && !bulkBranch.trim()) {
      setMessage({ type: 'error', text: 'Toplu şube için bir şube seçin.' });
      return;
    }
    if (field === 'coach' && !bulkCoachId.trim()) {
      setMessage({ type: 'error', text: 'Toplu koç ataması için bir koç seçin.' });
      return;
    }
    if (field === 'term' && !bulkAcademicYear.trim()) {
      setMessage({ type: 'error', text: 'Toplu dönem için bir dönem seçin.' });
      return;
    }

    setBulkBusy(true);
    setMessage(null);
    let ok = 0;
    let fail = 0;
    const errors: string[] = [];

    for (const userId of ids) {
      const user = users.find((u) => u.id === userId);
      if (!user || !userRoleTags(user as SystemUser).includes('student')) continue;
      try {
        if (field === 'branch') {
          const st = await resolveStudentLinkForUser(user);
          if (!st) throw new Error('Öğrenci kartı yok');
          await updateStudent(st.id, {
            school: bulkBranch.trim().toLocaleUpperCase('tr-TR') || undefined
          });
        } else if (field === 'coach') {
          const st = await resolveStudentLinkForUser(user);
          if (!st) throw new Error('Öğrenci kartı yok');
          await updateStudent(st.id, { coachId: bulkCoachId.trim() || undefined });
        } else if (field === 'term') {
          const label = normalizeAcademicYearLabel(bulkAcademicYear) || null;
          if (getAuthToken()) {
            await db.updateUser(user.id, { academic_year_label: label } as Partial<UserRow>);
          } else {
            await updateUser(user.id, { academic_year_label: label });
          }
        }
        ok += 1;
      } catch (e) {
        fail += 1;
        if (errors.length < 4) {
          errors.push(
            `${user.name}: ${e instanceof Error ? e.message : 'güncellenemedi'}`
          );
        }
      }
    }

    try {
      await refreshUsers({ broadcast: true });
      const errTail = errors.length ? ` ${errors.join(' · ')}` : '';
      setMessage({
        type: ok > 0 ? 'success' : 'error',
        text:
          fail > 0
            ? `${ok} öğrenci güncellendi, ${fail} hata.${errTail}`
            : `${ok} öğrenci güncellendi.`
      });
      if (fail === 0) clearStudentSelection();
    } finally {
      setBulkBusy(false);
    }
  };

  // Modal aç
  const openModal = (mode: 'add' | 'edit', user?: SystemUser) => {
    setModalMode(mode);
    setSelectedUser(user || null);
    setMessage(null);

    if (mode === 'edit' && user) {
      const rt = userRoleTags(user as SystemUser);
      const studentMatch =
        rt.includes('student') || user.role === 'student'
          ? findStudentForPlatformUser(
              {
                platformUserId: user.id,
                email: user.email,
                studentId: user.studentId
              },
              linkedStudents
            )
          : undefined;
      const instDraft =
        studentMatch?.institutionId ||
        user.institutionId ||
        institution?.id ||
        activeInstitutionId ||
        currentUser?.institutionId ||
        '';
      setFormData({
        firstName: user.name.split(' ').slice(0, -1).join(' ') || user.name,
        lastName: user.name.split(' ').slice(-1).join(' '),
        email: user.email,
        phone: user.phone || '',
        birthDate: studentMatch?.birthDate || '',
        classLevel: studentMatch?.classLevel != null ? String(studentMatch.classLevel) : '9',
        branch: studentMatch?.school || '',
        parentName: studentMatch?.parentName || '',
        parentPhone: studentMatch?.parentPhone || '',
        password: '',
        role: user.role,
        alsoCoach: rt.includes('coach'),
        alsoTeacher: rt.includes('teacher'),
        assignCoachId: studentMatch?.coachId ? String(studentMatch.coachId) : '',
        studentInstitutionId: instDraft ? String(instDraft) : '',
        bootstrap_max_students: '50',
        bootstrap_max_coaches: '10',
        bootstrap_package_label: 'professional',
        package: user.package || 'trial',
        academicYearLabel: normalizeAcademicYearLabel(user.academicYearLabel) || '',
        startDate: user.startDate?.split('T')[0] || new Date().toISOString().split('T')[0],
        endDate: user.endDate?.split('T')[0] || '',
        isActive: user.isActive !== false,
        whatsappAutomationEnabled: studentMatch?.whatsappAutomationEnabled !== false,
        questionBranches: [],
        questionGrades: []
      });
      if (userHasTeacherQuestionRole(user) && getAuthToken()) {
        void fetchTeacherQuestionProfile(user.id)
          .then((p) => {
            setFormData((prev) => ({
              ...prev,
              questionBranches: p.branches,
              questionGrades: p.grades
            }));
          })
          .catch(() => {});
      }
      if (rt.includes('student') || user.role === 'student') {
        const profileIncomplete =
          !studentMatch?.birthDate &&
          !studentMatch?.parentName?.trim() &&
          !studentMatch?.parentPhone?.trim();
        if (!studentMatch || profileIncomplete) {
          void resolveStudentProfileForUser(user)
            .then((profile) => {
              if (!profile) return;
              setFormData((prev) => ({
                ...prev,
                birthDate: profile.birthDate || '',
                classLevel:
                  profile.classLevel != null ? String(profile.classLevel) : prev.classLevel,
                branch: profile.school || prev.branch,
                parentName: profile.parentName || '',
                parentPhone: profile.parentPhone || '',
                assignCoachId: profile.coachId ? String(profile.coachId) : prev.assignCoachId,
                studentInstitutionId: profile.institutionId
                  ? String(profile.institutionId)
                  : prev.studentInstitutionId,
                whatsappAutomationEnabled: profile.whatsappAutomationEnabled !== false
              }));
            })
            .catch(() => {});
        }
      }
    } else {
      // Yeni kullanıcı için
      const days = PACKAGES[formData.package].days;
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + days);

      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        birthDate: '',
        classLevel: '9',
        branch: '',
        parentName: '',
        parentPhone: '',
        password: '',
        role: 'student',
        alsoCoach: false,
        alsoTeacher: false,
        assignCoachId: '',
        studentInstitutionId:
          institution?.id ||
          activeInstitutionId ||
          currentUser?.institutionId ||
          '',
        bootstrap_max_students: '50',
        bootstrap_max_coaches: '10',
        bootstrap_package_label: 'professional',
        package: 'trial',
        academicYearLabel: currentAcademicYearTerm(),
        startDate: new Date().toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        isActive: true,
        whatsappAutomationEnabled: true,
        questionBranches: [],
        questionGrades: []
      });
    }

    setShowModal(true);
  };

  /** Veli imzası sonrası: `/user-management?veli_hesap=1&...` ile gelen öğrenci/veli bilgilerini yeni kullanıcı formuna doldurur. */
  useEffect(() => {
    if (authLoading) return;
    if (searchParams.get('veli_hesap') !== '1') return;

    const email = (searchParams.get('email') || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      setMessage({ type: 'error', text: 'Veli bağlantısında e-posta eksik veya geçersiz.' });
      navigate('/user-management', { replace: true });
      return;
    }

    const kurumFromQuery = (searchParams.get('kurum_id') || '').trim();
    const myInst = String(activeInstitutionId || currentUser?.institutionId || institution?.id || '').trim();
    if (currentUser?.role !== 'super_admin' && kurumFromQuery && myInst && kurumFromQuery !== myInst) {
      setMessage({
        type: 'error',
        text: 'Bu kayıt başka bir kuruma ait. O kurumda oturum açıp kullanıcı oluşturun.'
      });
      navigate('/user-management', { replace: true });
      return;
    }

    const studentInst =
      currentUser?.role === 'super_admin'
        ? (kurumFromQuery || myInst || '')
        : (myInst || kurumFromQuery || '');

    const sinifRaw = (searchParams.get('sinif') || '9').trim() || '9';
    const days = PACKAGES.trial.days;
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);
    const sozlesmeNo = (searchParams.get('sozlesme') || '').trim();
    const tcFromQuery = (searchParams.get('tc') || '').replace(/\D/g, '').slice(0, 11);
    const programNote = (searchParams.get('program') || '').trim();
    const adresNote = (searchParams.get('adres') || '').trim();

    setModalMode('add');
    setSelectedUser(null);
    setMessage(null);
    setFormData({
      firstName: (searchParams.get('ad') || '').trim(),
      lastName: (searchParams.get('soyad') || '').trim(),
      email,
      phone: (searchParams.get('tel') || '').trim(),
      birthDate: (searchParams.get('dogum') || '').trim().slice(0, 10),
      classLevel: String(toClassLevel(sinifRaw)),
      branch: [searchParams.get('okul') || '', programNote].map((x) => String(x || '').trim()).filter(Boolean).join(' · ') || (searchParams.get('okul') || '').trim(),
      parentName: (searchParams.get('veli_adsoyad') || '').trim(),
      parentPhone: (searchParams.get('veli_tel') || '').trim(),
      password: '',
      role: 'student',
      alsoCoach: false,
      alsoTeacher: false,
      assignCoachId: '',
      studentInstitutionId: studentInst,
      bootstrap_max_students: '50',
      bootstrap_max_coaches: '10',
      bootstrap_package_label: 'professional',
      package: 'trial',
      academicYearLabel: currentAcademicYearTerm(),
      startDate: new Date().toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      isActive: true,
      questionBranches: [],
      questionGrades: []
    });
    setShowPassword(false);
    setShowModal(true);
    setMessage({
      type: 'success',
      text: sozlesmeNo
        ? `Veli imzası (${sozlesmeNo}): bilgiler yüklendi.${adresNote ? ` Adres: ${adresNote.slice(0, 80)}${adresNote.length > 80 ? '…' : ''}.` : ''}${tcFromQuery ? ` TC: ${tcFromQuery}.` : ''} Şifre (en az 6 karakter) girip kaydedin.`
        : `Veli imzası bilgileri yüklendi.${adresNote ? ` Adres kayıtta mevcut.` : ''} Şifre (en az 6 karakter) girip kaydedin.`
    });
    navigate('/user-management', { replace: true });
  }, [
    authLoading,
    searchParams,
    navigate,
    activeInstitutionId,
    institution?.id,
    currentUser?.role,
    currentUser?.institutionId
  ]);

  /** Öğretmenler sayfasından: `/user-management?ogretmen_ekle=1` ile yeni öğretmen formunu açar. */
  useEffect(() => {
    if (authLoading) return;
    if (searchParams.get('ogretmen_ekle') !== '1') return;

    if (!(isAdminActor(currentUser))) {
      setMessage({ type: 'error', text: 'Öğretmen ekleme yetkisi yalnızca yönetici rollerinde açıktır.' });
      navigate('/user-management', { replace: true });
      return;
    }

    const days = PACKAGES.trial.days;
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);

    setModalMode('add');
    setSelectedUser(null);
    setMessage(null);
    setFormData({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      birthDate: '',
      classLevel: '9',
      branch: '',
      parentName: '',
      parentPhone: '',
      password: '',
      role: 'teacher',
      alsoCoach: false,
      alsoTeacher: false,
      assignCoachId: '',
      studentInstitutionId:
        institution?.id ||
        activeInstitutionId ||
        currentUser?.institutionId ||
        '',
      bootstrap_max_students: '50',
      bootstrap_max_coaches: '10',
      bootstrap_package_label: 'professional',
      package: 'trial',
      academicYearLabel: currentAcademicYearTerm(),
      startDate: new Date().toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      isActive: true,
      whatsappAutomationEnabled: true,
      questionBranches: [],
      questionGrades: []
    });
    setShowPassword(false);
    setShowModal(true);
    navigate('/user-management', { replace: true });
  }, [
    authLoading,
    searchParams,
    navigate,
    activeInstitutionId,
    institution?.id,
    currentUser?.role,
    currentUser?.institutionId
  ]);

  /** Öğretmenler / kullanıcı listesinden: `/user-management?kullanici_duzenle=<id>` */
  useEffect(() => {
    if (authLoading || listLoading) return;
    const editId = (searchParams.get('kullanici_duzenle') || '').trim();
    if (!editId) return;
    if (!(isAdminActor(currentUser))) {
      navigate('/user-management', { replace: true });
      return;
    }
    const user = users.find((u) => u.id === editId);
    if (!user) return;
    openModal('edit', user);
    navigate('/user-management', { replace: true });
  }, [authLoading, listLoading, searchParams, users, currentUser?.role, navigate]);

  /** Koçlar sayfasından: giriş hesabı yoksa `/user-management?koc_giris=<coachId>` */
  useEffect(() => {
    if (authLoading || listLoading) return;
    const coachId = (searchParams.get('koc_giris') || '').trim();
    if (!coachId) return;
    if (!(isAdminActor(currentUser))) {
      navigate('/user-management', { replace: true });
      return;
    }
    const syntheticId = `${COACH_PROFILE_ONLY_PREFIX}${coachId}`;
    let user = users.find((u) => u.id === syntheticId);
    if (!user) {
      const coachRow = coaches.find((c) => c.id === coachId);
      const byEmail = coachRow?.email
        ? users.find(
            (u) => u.email.toLowerCase().trim() === coachRow.email.toLowerCase().trim()
          )
        : undefined;
      if (byEmail) user = byEmail;
      else if (coachRow) {
        const end = new Date();
        end.setFullYear(end.getFullYear() + 1);
        user = {
          id: syntheticId,
          name: coachRow.name,
          email: coachRow.email,
          phone: coachRow.phone,
          role: 'coach',
          institutionId: coachRow.institutionId,
          coachId: coachRow.id,
          package: 'trial',
          isActive: true,
          startDate: coachRow.createdAt || new Date().toISOString(),
          endDate: end.toISOString(),
          createdAt: coachRow.createdAt
        };
      }
    }
    if (user) openModal('edit', user);
    navigate('/user-management', { replace: true });
  }, [authLoading, listLoading, searchParams, users, coaches, currentUser?.role, navigate]);

  // Paket değiştiğinde bitiş tarihini güncelle
  const handlePackageChange = (pkg: typeof formData.package) => {
    const days = PACKAGES[pkg].days;
    const startDate = new Date(formData.startDate);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + days);

    setFormData(prev => ({
      ...prev,
      package: pkg,
      endDate: endDate.toISOString().split('T')[0]
    }));
  };

  // Form gönder
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const needsTeacherQuestionProfile =
      (isAdminActor(currentUser)) &&
      formHasTeacherRole(formData.role, formData.alsoTeacher);

    if (needsTeacherQuestionProfile) {
      if (!formData.questionBranches.length) {
        setMessage({ type: 'error', text: 'Öğretmen için en az bir branş (ders) seçin.' });
        setLoading(false);
        return;
      }
      if (!formData.questionGrades.length) {
        setMessage({ type: 'error', text: 'Öğretmen için en az bir sınıf veya sınav grubu seçin.' });
        setLoading(false);
        return;
      }
    }

    try {
      const fullName = `${formData.firstName} ${formData.lastName}`.trim();
      if (modalMode === 'edit' && selectedUser) {
        /** Koç DB'de var, `users` yok — ilk kayıtta giriş hesabı oluştur */
        if (selectedUser.id.startsWith(COACH_PROFILE_ONLY_PREFIX) && getAuthToken()) {
          const pwd = formData.password.trim();
          if (pwd.length < 6) {
            setMessage({ type: 'error', text: 'Giriş hesabı için en az 6 karakter şifre girin.' });
            setLoading(false);
            return;
          }
          const cid = selectedUser.id.slice(COACH_PROFILE_ONLY_PREFIX.length);
          const coachRow = coaches.find((c) => c.id === cid);
          const instId =
            (currentUser?.role === 'super_admin' && String(formData.studentInstitutionId || '').trim()) ||
            coachRow?.institutionId ||
            activeInstitutionId ||
            institution?.id ||
            currentUser?.institutionId ||
            null;
          try {
            await db.createUser({
              email: formData.email.toLowerCase().trim(),
              name: fullName,
              phone: formData.phone?.trim() || null,
              role: 'coach',
              password_hash: pwd,
              institution_id: instId,
              is_active: formData.isActive,
              package: formData.package,
              academic_year_label: normalizeAcademicYearLabel(formData.academicYearLabel) || null,
              start_date: new Date(formData.startDate).toISOString(),
              end_date: formData.endDate ? new Date(formData.endDate).toISOString() : null,
              created_by: null
            });
            setMessage({ type: 'success', text: 'Koç için giriş hesabı oluşturuldu.' });
            await refreshUsers({ broadcast: true });
            setShowModal(false);
            openCreatedLoginCredentials({
              title: 'Koç giriş hesabı oluşturuldu',
              email: formData.email,
              password: pwd,
              role: 'coach',
              institutionId: instId
            });
          } catch (err) {
            setMessage({
              type: 'error',
              text: err instanceof Error ? err.message : 'Hesap oluşturulamadı.'
            });
          }
          setLoading(false);
          return;
        }

        const staffRoles =
          buildStaffRoleAssignment(
            formData,
            isAdminActor(currentUser)
          );

        const patch: Record<string, unknown> = {
          name: fullName,
          email: formData.email,
          phone: formData.phone,
          role: staffRoles ? staffRoles.primary : formData.role,
          package: formData.package,
          academic_year_label: normalizeAcademicYearLabel(formData.academicYearLabel) || null,
          start_date: new Date(formData.startDate).toISOString(),
          end_date: formData.endDate ? new Date(formData.endDate).toISOString() : undefined,
          is_active: formData.isActive
        };
        if (staffRoles) {
          patch.roles = staffRoles.roles;
        }
        if (currentUser?.role === 'super_admin') {
          const v = String(formData.studentInstitutionId || '').trim();
          patch.institution_id = v.length ? v : null;
        }
        if (formData.password.trim().length >= 6) patch.password_hash = formData.password.trim();
        let result: { success: boolean; message: string } = { success: false, message: 'Güncellenemedi.' };
        if (getAuthToken()) {
          try {
            await db.updateUser(selectedUser.id, patch as Partial<UserRow>);
            result = { success: true, message: 'Güncellendi.' };
          } catch (e) {
            result = { success: false, message: e instanceof Error ? e.message : 'Güncellenemedi.' };
          }
        } else {
          result = await updateUser(selectedUser.id, patch);
        }
        let quotaNote = '';
        if (
          result.success &&
          currentUser?.role === 'super_admin' &&
          selectedUser &&
          userRoleTags(selectedUser).includes('admin')
        ) {
          try {
            await db.patchAdminQuota(selectedUser.id, {
              max_students: Number(formData.bootstrap_max_students),
              max_coaches: Number(formData.bootstrap_max_coaches),
              package_label: formData.bootstrap_package_label || 'professional'
            });
          } catch (qe) {
            quotaNote =
              ' Kurum kota satırı yazılamadı: ' +
              (qe instanceof Error ? qe.message : 'bilinmeyen hata');
          }
        }
        let studentCardNote = '';
        if (result.success) {
          const tags = userRoleTags(selectedUser as SystemUser);
          const syncStudentCard =
            formData.role === 'student' || tags.includes('student');
          if (syncStudentCard) {
            const linkEmail = formData.email.toLowerCase().trim();
            const studentPayload = {
              id: selectedUser.id,
              name: fullName,
              email: linkEmail,
              phone: formData.phone || '',
              birthDate: formData.birthDate || undefined,
              classLevel: toClassLevel(formData.classLevel),
              school: formData.branch.trim() || undefined,
              parentName: formData.parentName.trim() || undefined,
              parentPhone: formData.parentPhone.trim() || undefined,
              coachId: formData.assignCoachId.trim() || undefined,
              institutionId:
                formData.studentInstitutionId.trim() ||
                selectedUser.institutionId ||
                undefined,
              whatsappAutomationEnabled: formData.whatsappAutomationEnabled,
              createdAt: new Date().toISOString()
            };
            let st =
              findStudentForPlatformUser(
                {
                  platformUserId: selectedUser.id,
                  email: linkEmail,
                  studentId: selectedUser.studentId || selectedUser.id
                },
                linkedStudents
              ) ?? null;
            if (!st) {
              st = await resolveStudentLinkForUser({
                id: selectedUser.id,
                email: linkEmail,
                studentId: selectedUser.studentId
              });
            }
            try {
              if (st) {
                await updateStudent(st.id, studentPayload);
                mergePageStudent({ ...st, ...studentPayload, id: st.id });
              } else {
                const created = await addStudent(studentPayload);
                mergePageStudent(created.student);
                studentCardNote =
                  ' Öğrenci kartı oluşturuldu ve kullanıcıya bağlandı.';
              }
            } catch (se) {
              studentCardNote =
                ' Öğrenci kartı alanları kaydedilemedi: ' +
                (se instanceof Error ? se.message : 'bilinmeyen hata');
            }
          }
          const editTags = userRoleTags(selectedUser as SystemUser);
          const editIsTeacher =
            (selectedUser && userHasTeacherQuestionRole(selectedUser)) ||
            formHasTeacherRole(formData.role, formData.alsoTeacher);
          if (
            editIsTeacher &&
            needsTeacherQuestionProfile &&
            getAuthToken() &&
            !selectedUser.id.startsWith(COACH_PROFILE_ONLY_PREFIX)
          ) {
            try {
              const instV =
                selectedUser.institutionId ||
                String(formData.studentInstitutionId || '').trim() ||
                currentUser?.institutionId ||
                null;
              await saveTeacherQuestionProfile({
                userId: selectedUser.id,
                branches: formData.questionBranches,
                grades: formData.questionGrades,
                institutionId: instV
              });
              const synced = await fetchTeacherQuestionProfile(selectedUser.id);
              setFormData((prev) => ({
                ...prev,
                questionBranches: synced.branches,
                questionGrades: synced.grades
              }));
            } catch (te) {
              studentCardNote +=
                ' Soru Sor branş/sınıf kaydı yazılamadı: ' +
                (te instanceof Error ? te.message : 'bilinmeyen hata');
            }
          }
          if (currentUser?.role === 'super_admin') {
            const instV = String(formData.studentInstitutionId || '').trim() || undefined;
            const emLower = formData.email.toLowerCase().trim();
            const ch = coaches.find((c) => c.email.toLowerCase().trim() === emLower);
            if (ch && (tags.includes('coach') || (staffRoles?.roles || []).includes('coach'))) {
              try {
                await updateCoach(ch.id, { institutionId: instV });
              } catch (ce) {
                studentCardNote +=
                  (studentCardNote ? ' ' : '') +
                  'Koç kurumu güncellenemedi: ' +
                  (ce instanceof Error ? ce.message : 'bilinmeyen hata');
              }
            }
          }
        }
        setMessage({
          type:
            !result.success
              ? 'error'
              : studentCardNote.includes('kaydedilemedi') ||
                  studentCardNote.includes('güncellenemedi')
                ? 'error'
                : 'success',
          text: result.message + quotaNote + (result.success ? studentCardNote : '')
        });
        if (result.success) {
          if (staffRoles?.roles.includes('coach')) {
            const emLower = formData.email.toLowerCase().trim();
            const hasCoach = coaches.some((c) => c.email.toLowerCase().trim() === emLower);
            if (!hasCoach) {
              try {
                await addCoach({
                  id: selectedUser.id,
                  name: fullName,
                  email: formData.email,
                  phone: formData.phone || '',
                  subjects: [],
                  studentIds: [],
                  institutionId:
                    (currentUser?.role === 'super_admin' &&
                      String(formData.studentInstitutionId || '').trim()) ||
                    selectedUser.institutionId ||
                    activeInstitutionId ||
                    institution?.id ||
                    undefined,
                  createdAt: new Date().toISOString()
                });
              } catch (e) {
                console.error('Koç profili eklenemedi:', e);
              }
            }
          }
          await refreshUsers({ broadcast: true });
          setShowModal(false);
        }
      } else {
        if (
          formData.role === 'student' &&
          currentUser?.role === 'teacher' &&
          !String(formData.assignCoachId || '').trim()
        ) {
          setMessage({ type: 'error', text: 'Öğrenci oluşturmak için bir koç seçmelisiniz.' });
          setLoading(false);
          return;
        }

        const instFallback = activeInstitutionId || institution?.id;
        let resolvedInstitution =
          currentUser?.role === 'teacher'
            ? currentUser.institutionId
            : instFallback || currentUser?.institutionId;
        /** Yerelde sahte/uyumsuz kurum id’si göndermeyi önle (Postgres FK 23503) */
        if (
          resolvedInstitution &&
          institutions.length > 0 &&
          !institutions.some((i) => i.id === resolvedInstitution)
        ) {
          resolvedInstitution = undefined;
        }

        const pwdPlain = formData.password.trim();
        if (pwdPlain.length < 6) {
          setMessage({ type: 'error', text: 'Şifre en az 6 karakter olmalıdır.' });
          setLoading(false);
          return;
        }

        const label =
          formData.role === 'student'
            ? 'Öğrenci'
            : formData.role === 'coach'
              ? 'Koç'
              : formData.role === 'teacher'
                ? 'Öğretmen'
                : 'Admin';

        const staffRolesNew = buildStaffRoleAssignment(
          formData,
          isAdminActor(currentUser)
        );

        const superAdminChosenInst =
          currentUser?.role === 'super_admin' ? String(formData.studentInstitutionId || '').trim() : '';

        const resolvedStudentInstitution =
          formData.role === 'student' &&
          (currentUser?.role === 'super_admin' || currentUser?.role === 'admin') &&
          String(formData.studentInstitutionId || '').trim()
            ? String(formData.studentInstitutionId).trim()
            : (resolvedInstitution ?? null);

        const institutionForStudentProfile =
          (resolvedStudentInstitution ?? null) ||
          resolvedInstitution ||
          instFallback ||
          currentUser?.institutionId ||
          null;

        const institutionIdForNewUser =
          formData.role === 'student'
            ? institutionForStudentProfile
            : superAdminChosenInst || (resolvedInstitution ?? null);

        const quotaBlocked = quotaBlockMessage(quota, formData.role, currentUser?.role);
        if (quotaBlocked) {
          setMessage({ type: 'error', text: quotaBlocked });
          setLoading(false);
          return;
        }

        if (getAuthToken()) {
          try {
            const row = await db.createUser(
              {
                email: formData.email.toLowerCase().trim(),
                name: fullName,
                phone: formData.phone?.trim() || null,
                role: (staffRolesNew?.primary || formData.role) as UserRow['role'],
                roles: staffRolesNew?.roles ?? undefined,
                password_hash: pwdPlain,
                institution_id: institutionIdForNewUser as string | null,
                is_active: formData.isActive !== false,
                package: formData.package,
                academic_year_label: normalizeAcademicYearLabel(formData.academicYearLabel) || null,
                start_date: new Date(formData.startDate).toISOString(),
                end_date: formData.endDate ? new Date(formData.endDate).toISOString() : null,
                created_by: null
              },
              currentUser?.role === 'super_admin' && formData.role === 'admin'
                ? {
                    bootstrap: {
                      bootstrap_max_students: Number(formData.bootstrap_max_students) || 50,
                      bootstrap_max_coaches: Number(formData.bootstrap_max_coaches) || 10,
                      bootstrap_package_label: formData.bootstrap_package_label || 'professional'
                    }
                  }
                : undefined
            );

            const instId =
              institutionIdForNewUser || resolvedInstitution || instFallback || currentUser?.institutionId;
            const createdEmail = formData.email.toLowerCase().trim();
            const createdRole = (staffRolesNew?.primary || formData.role) as UserRole;
            const newUserId = row.id;
            const newIsTeacher =
              formData.role === 'teacher' || (staffRolesNew?.roles || []).includes('teacher');
            if (newIsTeacher && needsTeacherQuestionProfile && newUserId) {
              try {
                await saveTeacherQuestionProfile({
                  userId: newUserId,
                  branches: formData.questionBranches,
                  grades: formData.questionGrades,
                  institutionId: institutionIdForNewUser || instId || null
                });
              } catch (te) {
                console.error('Öğretmen branş profili:', te);
              }
            }
            try {
              if (formData.role === 'student') {
                const studentPayload = {
                  id: newUserId,
                  name: fullName,
                  email: formData.email,
                  password: pwdPlain,
                  phone: formData.phone || '',
                  birthDate: formData.birthDate || undefined,
                  parentName: formData.parentName.trim() || undefined,
                  parentPhone: formData.parentPhone.trim() || '',
                  classLevel: toClassLevel(formData.classLevel),
                  school: formData.branch.trim() || undefined,
                  coachId: formData.assignCoachId || undefined,
                  institutionId: institutionForStudentProfile || undefined,
                  whatsappAutomationEnabled: formData.whatsappAutomationEnabled,
                  createdAt: new Date().toISOString()
                };
                const existingSt = findStudentForPlatformUser(
                  { platformUserId: newUserId, email: createdEmail },
                  linkedStudents
                );
                if (existingSt) {
                  await updateStudent(existingSt.id, studentPayload);
                  mergePageStudent({ ...existingSt, ...studentPayload, id: existingSt.id });
                } else {
                  const created = await addStudent(studentPayload);
                  mergePageStudent(created.student);
                }
              } else if (formData.role === 'coach' || (staffRolesNew?.roles || []).includes('coach')) {
                const coachPayload = {
                  id: newUserId,
                  name: fullName,
                  email: formData.email,
                  phone: formData.phone || '',
                  password: pwdPlain,
                  subjects: [],
                  studentIds: [],
                  institutionId: instId || undefined,
                  maxStudents: 5,
                  createdAt: new Date().toISOString()
                };
                const existingCoach = coaches.find(
                  (c) => (c.email || '').toLowerCase().trim() === createdEmail
                );
                if (existingCoach) {
                  await updateCoach(existingCoach.id, {
                    name: coachPayload.name,
                    email: coachPayload.email,
                    phone: coachPayload.phone,
                    institutionId: coachPayload.institutionId
                  });
                  mergePageCoach({ ...existingCoach, ...coachPayload, id: existingCoach.id });
                } else {
                  await addCoach(coachPayload);
                  mergePageCoach(coachPayload);
                }
              }
            } catch (syncErr) {
              console.error('Öğrenci/koç listesi senkron hatası:', syncErr);
              const detail =
                syncErr instanceof Error ? syncErr.message : 'Bilinmeyen hata';
              setMessage({
                type: 'error',
                text: `Kullanıcı oluşturuldu ancak öğrenci/koç listesine eklenirken sorun oluştu: ${detail}. Öğrenci/Koç sayfasından tekrar deneyin.`
              });
              setLoading(false);
              return;
            }

            await refreshUsers({ broadcast: true });
            setMessage({ type: 'success', text: `${label} başarıyla oluşturuldu!` });
            setShowModal(false);
            openCreatedLoginCredentials({
              title: `${label} oluşturuldu`,
              email: createdEmail,
              password: pwdPlain,
              role: createdRole,
              roles: staffRolesNew?.roles ?? null,
              institutionId: instId ?? null
            });
          } catch (err) {
            setMessage({
              type: 'error',
              text: err instanceof Error ? err.message : 'Kullanıcı oluşturulamadı.'
            });
          }
        } else {
          setMessage({
            type: 'error',
            text:
              'Kullanıcı Supabase `users` tablosuna yazılamıyor: sunucu API oturumu (JWT) yok. Çıkış yapıp tekrar giriş yapın. (Tarayıcıda VITE_SUPABASE_URL olmasa bile kayıt sunucu üzerinden yapılır.)'
          });
          setLoading(false);
          return;
        }
      }
    } catch {
      setMessage({ type: 'error', text: 'Bir hata oluştu' });
    }

    setLoading(false);
  };

  // Kullanıcı sil
  const handleDelete = async (userId: string) => {
    if (userId.startsWith(COACH_PROFILE_ONLY_PREFIX)) {
      if (!confirm('Bu kayıt yalnızca koç profili (giriş hesabı yok). Koçu silmek istiyor musunuz?')) return;
      const coachId = userId.slice(COACH_PROFILE_ONLY_PREFIX.length);
      try {
        await deleteCoach(coachId);
        setMessage({ type: 'success', text: 'Koç profili silindi.' });
        void refreshUsers();
      } catch (e) {
        setMessage({
          type: 'error',
          text: e instanceof Error ? e.message : 'Koç silinemedi.'
        });
      }
      return;
    }

    if (!confirm('Bu kullanıcıyı silmek istediğinizden emin misiniz?')) return;

    const target = users.find((u) => u.id === userId) || getUserById(userId);

    if (getAuthToken()) {
      const em = (target?.email || '').toLowerCase().trim();
      const tags = target ? userRoleTags(target as SystemUser) : [];
      try {
        if (tags.includes('student') && target) {
          const st = await resolveStudentLinkForUser(target);
          if (st?.id) await deleteStudent(st.id);
        }
        if (tags.includes('coach')) {
          const cid = target.coachId || coaches.find((c) => c.email.toLowerCase().trim() === em)?.id;
          if (cid) await deleteCoach(cid);
        }
        await db.deleteUser(userId);
        setMessage({ type: 'success', text: 'Kullanıcı silindi.' });
      } catch (e) {
        setMessage({
          type: 'error',
          text: e instanceof Error ? e.message : 'Silme sırasında hata oluştu.'
        });
      }
      void refreshUsers();
      return;
    }

    const result = await deleteUser(userId);
    if (result.success && target?.email) {
      const st = findStudentForPlatformUser(
        {
          platformUserId: target.id,
          email: target.email,
          studentId: target.studentId
        },
        linkedStudents
      );
      const ch = linkedCoaches.find((c) => c.email.toLowerCase() === target.email.toLowerCase());
      if (st) await deleteStudent(st.id);
      if (ch) await deleteCoach(ch.id);
    }
    setMessage({ type: result.success ? 'success' : 'error', text: result.message });
    void refreshUsers();
  };

  const stats = useMemo(() => computeSystemUserStats(users), [users]);

  const canBulkImport =
    isAdminActor(currentUser);

  const handleBulkUserImport = async (file: File | null) => {
    if (!file) return;
    if (!canBulkImport) {
      setMessage({ type: 'error', text: 'Excel ile içe aktarma yalnızca admin ve süper admin için açıktır.' });
      return;
    }
    try {
      let grid: unknown[][];
      try {
        grid = await readUserImportFileAsGrid(file);
      } catch {
        setMessage({ type: 'error', text: 'Dosya okunamadı. .xlsx veya .csv kullanın.' });
        return;
      }
      if (!grid.length) {
        setMessage({ type: 'error', text: 'Dosya boş.' });
        return;
      }
      setImportGrid(grid);
      setImportFileName(file.name);
      setImportMappingOpen(true);
      setImportResult(null);
    } catch {
      setMessage({ type: 'error', text: 'Dosya işlenemedi.' });
    }
  };

  const runBulkImportWithMapping = async (
    headerRowIndex: number,
    mappings: (UserImportColumnKey | '')[]
  ) => {
    if (!canBulkImport) return;
    setImportBusy(true);
    setImportResult(null);
    try {
      const colMap = mappingArrayToColMap(mappings);
      const { rows: parsed, headerError, invalidComboRows } = parseUserImportGridWithMapping(
        importGrid,
        headerRowIndex,
        colMap
      );
      if (headerError) {
        setMessage({ type: 'error', text: headerError });
        return;
      }
      if (invalidComboRows.length) {
        const tail = invalidComboRows
          .slice(0, 5)
          .map((x) => `Satır ${x.rowNumber}: ${x.message}`)
          .join(' ');
        setMessage({
          type: 'error',
          text: `Geçersiz rol birleşimi: ${tail}${invalidComboRows.length > 5 ? ' …' : ''}`
        });
        return;
      }
      if (parsed.length === 0) {
        setMessage({ type: 'error', text: 'İçe aktarılacak geçerli satır bulunamadı.' });
        return;
      }

      const instFallback = activeInstitutionId || institution?.id;
      let resolvedInstitutionBase =
        currentUser?.role === 'super_admin'
          ? instFallback || currentUser?.institutionId
          : currentUser?.institutionId || instFallback;
      if (
        resolvedInstitutionBase &&
        institutions.length > 0 &&
        !institutions.some((i) => i.id === resolvedInstitutionBase)
      ) {
        resolvedInstitutionBase = undefined;
      }

      const disallowed = parsed.flatMap((pr) =>
        pr.roles.filter((r) => r !== 'student' && r !== 'teacher' && r !== 'coach')
      );
      if (disallowed.length) {
        setMessage({ type: 'error', text: 'Yalnızca öğrenci, öğretmen ve koç rolleri desteklenir.' });
        return;
      }

      const res = await apiFetch('/api/users-bulk-import', {
        method: 'POST',
        body: JSON.stringify({
          institution_id: resolvedInstitutionBase ?? null,
          rows: parsed.map((pr) => ({
            rowNumber: pr.rowNumber,
            firstName: pr.firstName,
            lastName: pr.lastName,
            fullName: pr.fullName,
            email: pr.email,
            phone: pr.phone,
            birthDate: pr.birthDate,
            classLevel: pr.classLevel,
            branch: pr.branch,
            roles: pr.roles,
            password: pr.password,
            parentName: pr.parentName,
            parentPhone: pr.parentPhone
          }))
        })
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({
          type: 'error',
          text: String(payload?.error || payload?.hint || 'Toplu içe aktarma başarısız.')
        });
        return;
      }

      setImportMappingOpen(false);
      setImportResult({
        created: Number(payload.created) || 0,
        updated: Number(payload.updated) || 0,
        skipped: Number(payload.skipped) || 0,
        failed: Number(payload.failed) || 0,
        errors: Array.isArray(payload.errors) ? payload.errors : []
      });

      await refreshUsers({ broadcast: true });
      const ok = (Number(payload.created) || 0) + (Number(payload.updated) || 0);
      const errTail =
        Array.isArray(payload.errors) && payload.errors.length > 0
          ? ' ' +
            payload.errors
              .slice(0, 8)
              .map((x: { rowNumber: number; message: string }) => `Satır ${x.rowNumber}: ${x.message}`)
              .join(' ') +
            (payload.errors.length > 8 ? ` (+${payload.errors.length - 8} satır daha)` : '')
          : '';
      setMessage({
        type: ok > 0 ? 'success' : 'error',
        text: `İçe aktarma bitti. Yeni: ${payload.created || 0}, Güncellenen: ${payload.updated || 0}, Atlanan: ${payload.skipped || 0}, Hatalı: ${payload.failed || 0}.${errTail}`
      });
    } finally {
      setImportBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
            <Users className="w-8 h-8 text-red-500" />
            Kullanıcı Yönetimi
          </h1>
          <p className="text-gray-500 mt-1">Sistem kullanıcılarını ve aboneliklerini yönetin</p>
        </div>
        <button
          onClick={() => openModal('add')}
          className="px-4 py-2 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors flex items-center gap-2"
        >
          <UserPlus className="w-5 h-5" />
          Yeni Kullanıcı
        </button>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">Eğitim dönemi</h3>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFilterAcademicYear('all')}
            className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
              filterAcademicYear === 'all'
                ? 'border-red-300 bg-red-50 text-red-800'
                : 'border-gray-100 bg-white hover:border-slate-200 text-slate-700'
            }`}
          >
            Tüm dönemler
          </button>
          {academicYearStats.map((row) => (
            <button
              key={row.key}
              type="button"
              onClick={() =>
                setFilterAcademicYear((prev) => (prev === row.key ? 'all' : row.key))
              }
              className={`rounded-lg border px-3 py-2 text-center min-w-[6.5rem] transition-colors ${
                filterAcademicYear === row.key
                  ? 'border-red-300 bg-red-50'
                  : 'border-gray-100 bg-white hover:border-slate-200'
              }`}
            >
              <div className="text-lg font-bold text-slate-800">{row.count}</div>
              <div className="text-xs text-slate-500">{row.label}</div>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Dönem kutusuna tıklayarak listeyi süzebilirsiniz. Tablodan satır içi dönem değiştirebilir veya
          toplu düzenleme kullanabilirsiniz.
        </p>
      </div>

      {isAdminActor(currentUser) ? (
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-800 mb-3">Şube</h3>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setFilterBranch('all')}
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                filterBranch === 'all'
                  ? 'border-red-300 bg-red-50 text-red-800'
                  : 'border-gray-100 bg-white hover:border-slate-200 text-slate-700'
              }`}
            >
              Tüm şubeler
            </button>
            {STANDARD_BRANCH_LETTERS.map((letter) => {
              const count = branchStats.find((r) => r.key === letter)?.count ?? 0;
              return (
                <button
                  key={letter}
                  type="button"
                  onClick={() => setFilterBranch((prev) => (prev === letter ? 'all' : letter))}
                  className={`rounded-lg border px-3 py-2 text-center min-w-[3.25rem] transition-colors ${
                    filterBranch === letter
                      ? 'border-red-300 bg-red-50'
                      : 'border-gray-100 bg-white hover:border-slate-200'
                  }`}
                >
                  <div className="text-lg font-bold text-slate-800">{count}</div>
                  <div className="text-xs text-slate-500">Şube {letter}</div>
                </button>
              );
            })}
            {branchStats
              .filter((r) => r.key === '__unknown__')
              .map((row) => (
                <button
                  key={row.key}
                  type="button"
                  onClick={() => setFilterBranch((prev) => (prev === row.key ? 'all' : row.key))}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                    filterBranch === row.key
                      ? 'border-red-300 bg-red-50'
                      : 'border-gray-100 bg-white hover:border-slate-200'
                  }`}
                >
                  <div className="text-lg font-bold text-slate-800">{row.count}</div>
                  <div className="text-xs text-slate-500">{row.label}</div>
                </button>
              ))}
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Şube kutusuna tıklayarak listeyi süzebilirsiniz. Sınıf filtresinden bağımsızdır. Tablodan satır
            içi şube değiştirebilirsiniz.
          </p>
        </div>
      ) : null}

      {selectedStudentIds.size > 0 ? (
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold text-violet-950">
              {selectedStudentIds.size} öğrenci seçildi
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={selectAllFilteredStudents}
                disabled={bulkBusy || allFilteredStudentsSelected}
                className="rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-sm font-medium text-violet-800 hover:bg-violet-100 disabled:opacity-50"
              >
                Filtrelenen tümünü seç ({selectableStudents.length})
              </button>
              <button
                type="button"
                onClick={clearStudentSelection}
                disabled={bulkBusy}
                className="rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-violet-100 disabled:opacity-50"
              >
                Seçimi temizle
              </button>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex-1 min-w-[8rem] text-xs font-medium text-violet-900">
                Şube
                <select
                  value={bulkBranch}
                  onChange={(e) => setBulkBranch(e.target.value)}
                  disabled={bulkBusy}
                  className="mt-1 w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Seçin</option>
                  {STANDARD_BRANCH_LETTERS.map((letter) => (
                    <option key={letter} value={letter}>
                      Şube {letter}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => void applyBulkStudentEdit('branch')}
                disabled={bulkBusy || !bulkBranch}
                className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
              >
                Uygula
              </button>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex-1 min-w-[8rem] text-xs font-medium text-violet-900">
                Koç
                <select
                  value={bulkCoachId}
                  onChange={(e) => setBulkCoachId(e.target.value)}
                  disabled={bulkBusy}
                  className="mt-1 w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Seçin</option>
                  {coachesForFilter.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => void applyBulkStudentEdit('coach')}
                disabled={bulkBusy || !bulkCoachId}
                className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
              >
                Uygula
              </button>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex-1 min-w-[8rem] text-xs font-medium text-violet-900">
                Dönem
                <select
                  value={bulkAcademicYear}
                  onChange={(e) => setBulkAcademicYear(e.target.value)}
                  disabled={bulkBusy}
                  className="mt-1 w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Seçin</option>
                  {academicYearOptions.map((term) => (
                    <option key={term} value={term}>
                      {term}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => void applyBulkStudentEdit('term')}
                disabled={bulkBusy || !bulkAcademicYear}
                className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
              >
                Uygula
              </button>
            </div>
          </div>
          {bulkBusy ? (
            <p className="mt-2 text-xs text-violet-800 inline-flex items-center gap-1">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Toplu güncelleme yapılıyor…
            </p>
          ) : null}
        </div>
      ) : null}

      {canBulkImport ? (
      <PageCollapsibleSection
        title="Excel / CSV ile toplu kullanıcı ekle"
        description="Dosya yükleme ve örnek şablon"
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => downloadUserImportTemplateXlsx()}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              <Download className="h-4 w-4" />
              Örnek Excel indir
            </button>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="file"
                accept=".xlsx,.xls,.csv,.txt"
                disabled={importBusy}
                onChange={(e) => void handleBulkUserImport(e.target.files?.[0] || null)}
                className="text-sm"
              />
              {importBusy ? (
                <span className="inline-flex items-center gap-1 text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Yükleniyor…
                </span>
              ) : null}
            </label>
          </div>
          <p className="text-xs text-slate-500">
            Excel yükledikten sonra sütun eşleştirme ekranı açılır — her sütunu Ad, Soyad, Mail, Şifre, Veli
            adı vb. alanlara seçerek eşleyebilirsiniz. Örnek şablon sütunları:{' '}
            {USER_IMPORT_TEMPLATE_HEADERS.join(' · ')}. Rol sütunu yoksa kayıt öğrenci olarak eklenir.
          </p>
          {importResult ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <div className="font-medium">Son içe aktarma özeti</div>
              <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <span>Yeni: {importResult.created}</span>
                <span>Güncellenen: {importResult.updated}</span>
                <span>Atlanan: {importResult.skipped}</span>
                <span>Hatalı: {importResult.failed}</span>
              </div>
              {importResult.errors.length > 0 ? (
                <ul className="mt-2 max-h-40 list-disc space-y-1 overflow-y-auto pl-5 text-xs text-red-700">
                  {importResult.errors.slice(0, 20).map((err, i) => (
                    <li key={`${err.rowNumber}-${i}`}>
                      Satır {err.rowNumber}: {err.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      </PageCollapsibleSection>
      ) : null}

      <PageCollapsibleSection
        title="Özet istatistikler"
        description={`${stats.totalListed} kayıt · ${stats.students} öğrenci · ${stats.coaches} koç`}
        contentClassName="p-4"
      >
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-100">
          <div className="text-2xl font-bold text-slate-800">{stats.totalListed}</div>
          <div className="text-sm text-gray-500">Liste kaydı</div>
          <p className="text-xs text-slate-400 mt-1">
            Giriş: {stats.loginAccounts}
            {stats.profileOnlyCoaches > 0 ? ` · Profil koç: ${stats.profileOnlyCoaches}` : ''}
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100">
          <div className="text-2xl font-bold text-red-600">{stats.admins}</div>
          <div className="text-sm text-gray-500">Yönetici</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100">
          <div className="text-2xl font-bold text-blue-600">{stats.coaches}</div>
          <div className="text-sm text-gray-500">Koç hesabı</div>
          <p className="text-xs text-slate-400 mt-1">Profil: {coaches.length}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100">
          <div className="text-2xl font-bold text-violet-600">{stats.teachers}</div>
          <div className="text-sm text-gray-500">Öğretmen</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100">
          <div className="text-2xl font-bold text-green-600">{stats.students}</div>
          <div className="text-sm text-gray-500">Öğrenci hesabı</div>
          <p className="text-xs text-slate-400 mt-1">Profil: {linkedStudents.length}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100">
          <div className="text-2xl font-bold text-green-600">{stats.active}</div>
          <div className="text-sm text-gray-500">Aktif</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100">
          <div className="text-2xl font-bold text-red-600">{stats.expired}</div>
          <div className="text-sm text-gray-500">Süresi Dolmuş</div>
        </div>
        </div>

        {(isAdminActor(currentUser)) &&
        classLevelStats.length > 0 ? (
          <div className="mt-6 border-t border-gray-100 pt-4">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">
              {currentUser?.role === 'super_admin' && filterInstitutionId !== 'all'
                ? 'Seçili kurum — sınıfa göre öğrenci'
                : currentUser?.role === 'admin'
                  ? 'Kurumunuz — sınıfa göre öğrenci'
                  : 'Sınıfa göre öğrenci dağılımı'}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {classLevelStats.map((row) => (
                <button
                  key={row.key}
                  type="button"
                  onClick={() =>
                    setFilterClassLevel(row.key === '__unknown__' ? 'all' : row.key)
                  }
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                    filterClassLevel === row.key
                      ? 'border-red-300 bg-red-50'
                      : 'border-gray-100 bg-white hover:border-slate-200'
                  }`}
                >
                  <div className="text-lg font-bold text-slate-800">{row.count}</div>
                  <div className="text-xs text-slate-500">{row.label}</div>
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Kutuya tıklayarak sınıf süzgecini uygulayabilirsiniz. Toplam:{' '}
              {statsStudentsScope.length} öğrenci profili.
            </p>
          </div>
        ) : null}

        {currentUser?.role === 'super_admin' && institutionClassStats.length > 0 ? (
          <div className="mt-6 border-t border-gray-100 pt-4">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">
              Kurumlara göre sınıf dağılımı
            </h3>
            <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
              {institutionClassStats.map((inst) => (
                <div
                  key={inst.institutionId}
                  className="rounded-lg border border-gray-100 bg-white p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <span className="font-medium text-slate-800">{inst.institutionName}</span>
                    <span className="text-xs text-slate-500">{inst.total} öğrenci</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {inst.byClass.map((row) => (
                      <button
                        key={`${inst.institutionId}-${row.key}`}
                        type="button"
                        onClick={() => {
                          if (inst.institutionId !== '__none__') {
                            setFilterInstitutionId(inst.institutionId);
                          }
                          if (row.key !== '__unknown__') setFilterClassLevel(row.key);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100"
                      >
                        <span className="font-semibold">{row.count}</span>
                        <span>{row.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </PageCollapsibleSection>

      {(currentUser?.role === 'super_admin' || currentUser?.role === 'admin') && (
        <PageCollapsibleSection
          title="Onay bekleyen kayıtlar"
          description={
            pendingRegistrations.length
              ? `${pendingRegistrations.length} kayıt onayınızı bekliyor`
              : 'Bekleyen kayıt yok'
          }
          defaultOpen={pendingRegistrations.length > 0}
          badge={
            pendingRegistrations.length > 0 ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                {pendingRegistrations.length}
              </span>
            ) : null
          }
          contentClassName="p-0"
        >
          {pendingRegistrations.length === 0 ? (
            <div className="px-4 py-6 text-sm text-slate-500">Bekleyen kayıt bulunmuyor.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] table-fixed">
                <thead className="bg-gray-50/90 border-b border-gray-100">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-[14%]">Ad Soyad</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-[16%]">E-posta</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-[10%]">Telefon</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-[8%]">TC</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-[8%]">Rol</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-[8%]">Sınıf/Şube</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-[12%]">Veli</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-[10%]">Doğum</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 w-[14%]">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pendingRegistrations.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/80">
                      <td className="px-3 py-2 text-sm text-slate-800">{r.first_name} {r.last_name}</td>
                      <td className="px-3 py-2 text-sm text-slate-700">{r.email}</td>
                      <td className="px-3 py-2 text-sm text-slate-700">{r.phone_e164}</td>
                      <td className="px-3 py-2 text-sm text-slate-700">{r.tc_identity_no}</td>
                      <td className="px-3 py-2 text-sm text-slate-700">{roleLabelFromRoles(r.requested_role as UserRole)}</td>
                      <td className="px-3 py-2 text-sm text-slate-700">
                        {[r.class_level, r.branch].filter(Boolean).join(' / ') || '—'}
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700">
                        {r.parent_name || '—'}
                        {r.parent_phone_e164 ? ` · ${r.parent_phone_e164}` : ''}
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700">{r.birth_date || '—'}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => void handleApprovePending(r)}
                            disabled={pendingBusyId === r.id}
                            className="px-2.5 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-60"
                          >
                            {pendingBusyId === r.id ? 'İşleniyor...' : 'Onayla'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleRejectPending(r)}
                            disabled={pendingBusyId === r.id}
                            className="px-2.5 py-1.5 rounded-md bg-slate-200 text-slate-800 text-xs font-medium hover:bg-slate-300 disabled:opacity-60"
                          >
                            Reddet
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PageCollapsibleSection>
      )}

      {(currentUser?.role === 'super_admin' || currentUser?.role === 'admin') && (
        <PageCollapsibleSection
          title="Koç / öğrenci kotası"
          description={
            quota?.admin_limits
              ? `Öğrenci ${quota.counts.students}/${quota.admin_limits.max_students} · Koç ${quota.counts.coaches}/${quota.admin_limits.max_coaches}`
              : quotaInstitutionName
                ? `${quotaInstitutionName} — kurum ve koç limitleri`
                : 'Kurum seçin ve kota limitlerini düzenleyin'
          }
          badge={
            quota && !quota.quota_exempt && quota.admin_limits ? (
              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-900">
                Kota
              </span>
            ) : null
          }
          contentClassName="p-0"
        >
          <QuotaManagementPanel
            actorRole={currentUser!.role}
            actorUserId={currentUser!.id}
            institutionId={quotaInstitutionId}
            institutionName={quotaInstitutionName}
            institutions={
              currentUser?.role === 'super_admin'
                ? institutions.map((i) => ({ id: i.id, name: i.name }))
                : undefined
            }
            onInstitutionChange={
              currentUser?.role === 'super_admin' ? setQuotaPickerInstitutionId : undefined
            }
            quota={quota}
            coaches={quotaCoaches}
            students={quotaStudents}
            institutionAdmins={institutionAdmins}
            onQuotaUpdated={refreshQuotaSnapshot}
          />
        </PageCollapsibleSection>
      )}

      {quota?.admin_limits &&
        currentUser?.role !== 'super_admin' &&
        currentUser?.role !== 'admin' && (
        <div
          className={`rounded-xl border p-4 ${
            quota.quota_exempt
              ? 'border-slate-200 bg-slate-50 text-slate-800'
              : (quota.usage_pct?.students ?? 0) >= 90 || (quota.usage_pct?.coaches ?? 0) >= 90
                ? 'border-amber-300 bg-amber-50 text-amber-950'
                : 'border-emerald-200 bg-emerald-50 text-emerald-900'
          }`}
        >
          <p className="font-medium mb-2">Plan kotası özeti</p>
          <p className="text-sm">
            Öğrenci:{' '}
            <span className="font-semibold">
              {quota.counts.students}/{quota.admin_limits.max_students}
            </span>
            {quota.usage_pct?.students != null && (
              <span className="ml-2">(~%{quota.usage_pct.students})</span>
            )}
          </p>
          <p className="text-sm mt-1">
            Koç:{' '}
            <span className="font-semibold">
              {quota.counts.coaches}/{quota.admin_limits.max_coaches}
            </span>
            {quota.usage_pct?.coaches != null && (
              <span className="ml-2">(~%{quota.usage_pct.coaches})</span>
            )}
          </p>
          <p className="text-xs mt-2 opacity-90">
            Kota öğrenci/koç profil kayıtlarını sayar (Öğrenciler / Koçlar sayfaları ile aynı:{' '}
            {quotaStudents.length} öğrenci, {quotaCoaches.length} koç).
          </p>
          {(quota.usage_pct?.students ?? 0) >= 90 || (quota.usage_pct?.coaches ?? 0) >= 90 ? (
            <p className="text-sm mt-2">
              Kota limitine yaklaşılıyor; ek kapasite veya yükseltme için yöneticinize danışın.
            </p>
          ) : null}
          {!quota.quota_exempt &&
          quota.counts.students >= (quota.admin_limits?.max_students ?? Infinity) ? (
            <p className="text-sm mt-2 font-medium text-red-700">
              Öğrenci kotası dolu — yeni öğrenci eklenemez.
            </p>
          ) : null}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 border border-gray-100">
        <div className="flex flex-col gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Ad, e-posta veya telefon ile ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:flex xl:flex-row xl:flex-wrap">
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value as UserRole | 'all')}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 min-h-[44px] xl:min-w-[10rem] xl:w-auto"
              aria-label="Rol filtresi"
            >
              <option value="all">Tüm roller</option>
              {ROLES.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 min-h-[44px] xl:min-w-[10rem] xl:w-auto"
              aria-label="Durum filtresi"
            >
              <option value="all">Tüm durumlar</option>
              <option value="active">Aktif</option>
              <option value="expired">Süresi dolmuş</option>
              <option value="inactive">Pasif</option>
            </select>

            {currentUser?.role === 'super_admin' && (
              <select
                value={filterInstitutionId}
                onChange={(e) => setFilterInstitutionId(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 min-h-[44px] xl:min-w-[12rem] xl:w-auto"
                aria-label="Kurum filtresi"
              >
                <option value="all">Tüm kurumlar</option>
                {institutions.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            )}

            <select
              value={filterClassLevel}
              onChange={(e) => setFilterClassLevel(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 min-h-[44px] xl:min-w-[10rem] xl:w-auto"
              aria-label="Sınıf filtresi"
            >
              <option value="all">Tüm sınıflar</option>
              {CLASS_LEVELS.map((level) => (
                <option key={String(level.value)} value={String(level.value)}>
                  {level.label}
                </option>
              ))}
              {classLevelFilterOptions.map((opt) => (
                <option key={`extra-${opt.value}`} value={opt.value}>
                  {opt.label} (veride)
                </option>
              ))}
            </select>

            <select
              value={filterBranch}
              onChange={(e) => setFilterBranch(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 min-h-[44px] xl:min-w-[9rem] xl:w-auto"
              aria-label="Şube filtresi"
            >
              <option value="all">Tüm şubeler</option>
              {STANDARD_BRANCH_LETTERS.map((letter) => (
                <option key={letter} value={letter}>
                  Şube {letter}
                </option>
              ))}
              {branchStats
                .filter((r) => r.key === '__unknown__')
                .map((row) => (
                  <option key={row.key} value={row.key}>
                    {row.label}
                  </option>
                ))}
            </select>

            <select
              value={filterAcademicYear}
              onChange={(e) => setFilterAcademicYear(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 min-h-[44px] xl:min-w-[10rem] xl:w-auto"
              aria-label="Dönem filtresi"
            >
              <option value="all">Tüm dönemler</option>
              {academicYearOptions.map((term) => (
                <option key={term} value={term}>
                  {term}
                </option>
              ))}
              {academicYearStats
                .filter((r) => r.key === '__unset__')
                .map((row) => (
                  <option key={row.key} value={row.key}>
                    {row.label}
                  </option>
                ))}
            </select>

            <select
              value={filterCoachId}
              onChange={(e) => setFilterCoachId(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 min-h-[44px] xl:min-w-[12rem] xl:w-auto"
              aria-label="Koç filtresi"
            >
              <option value="all">Tüm koçlar</option>
              {coachesForFilter.map((coach) => (
                <option key={coach.id} value={coach.id}>
                  {coach.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {currentUser?.role === 'super_admin' && (
        <p className="text-sm text-slate-600 -mt-2">
          Otomatik WhatsApp (günlük rapor, koç mesajı, ders hatırlatma): öğrenci düzenleme formunda
          kapatabilirsiniz. Kurum genelinde kapatmak için Ayarlar → Kurumlar.
        </p>
      )}

      {/* Message */}
      {message && (
        <div className={`p-4 rounded-lg flex items-center gap-2 ${
          message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          {message.text}
        </div>
      )}

      {/* Users — mobil kartlar / masaüstü tablo */}
      {detailsLoading && !listLoading ? (
        <p className="text-xs text-slate-500 flex items-center gap-2 -mt-1">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-red-500" />
          Sınıf, koç ve veli bilgileri yükleniyor…
        </p>
      ) : null}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {/* Mobil: yatay kaydırma yok, düzenle her zaman görünür */}
        <div className="md:hidden divide-y divide-gray-100">
          {listLoading || authLoading ? (
            <div className="px-4 py-12 text-center text-sm text-slate-500">
              <span className="inline-flex items-center justify-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-red-500" />
                Kullanıcılar yükleniyor…
              </span>
            </div>
          ) : (
            visibleUsers.map((user) => {
              const tags = userRoleTags(user as SystemUser);
              const studentMatch =
                tags.includes('student')
                  ? findStudentForPlatformUser(
                      {
                        platformUserId: user.id,
                        email: user.email,
                        studentId: user.studentId
                      },
                      linkedStudents
                    )
                  : undefined;
              const roleBadge = roleBadgeForUser(user);
              const coachOptions = coachesForStudentRow(studentMatch?.institutionId);
              const coachOptIds = new Set(coachOptions.map((c) => c.id));
              const orphanCoachId =
                studentMatch?.coachId && !coachOptIds.has(String(studentMatch.coachId))
                  ? String(studentMatch.coachId)
                  : '';
              const coachName =
                coachOptions.find((c) => c.id === studentMatch?.coachId)?.name ||
                (orphanCoachId ? 'Mevcut koç' : '—');

              return (
                <article key={user.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      {tags.includes('student') ? (
                        <input
                          type="checkbox"
                          checked={selectedStudentIds.has(user.id)}
                          onChange={() => toggleStudentSelection(user.id)}
                          className="mt-1 h-4 w-4 shrink-0 rounded border-gray-300 text-red-600 focus:ring-red-500"
                          aria-label={`${user.name} seç`}
                        />
                      ) : null}
                      <div className="min-w-0 flex-1">
                      <p className="text-base font-semibold text-slate-900 break-words">{user.name}</p>
                      <p className="mt-0.5 text-sm text-gray-600 break-all">{user.email}</p>
                      {user.phone ? (
                        <p className="mt-0.5 text-sm text-gray-500">{user.phone}</p>
                      ) : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      {canImpersonate(user) && !user.id.startsWith('demo-seed-') ? (
                        <button
                          type="button"
                          onClick={() => void handleLoginAsUser(user)}
                          disabled={loginAsBusyId === user.id}
                          className="rounded-lg p-2 text-violet-600 hover:bg-violet-50 disabled:opacity-50"
                          title="Bu hesaba gir"
                        >
                          {loginAsBusyId === user.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <LogIn className="h-4 w-4" />
                          )}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => openModal('edit', user)}
                        className="rounded-lg p-2 text-blue-600 hover:bg-blue-50"
                        title="Düzenle"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      {!user.id.startsWith('demo-seed-') && currentUser?.role !== 'teacher' ? (
                        <button
                          type="button"
                          onClick={() => void handleDelete(user.id)}
                          className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                          title="Sil"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${roleBadge.className}`}
                    >
                      {roleBadge.label}
                    </span>
                  </div>

                  {studentMatch ? (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <label className="block text-xs">
                        <span className="font-medium text-slate-500">Şube</span>
                        <div className="relative mt-1">
                          <select
                            value={studentBranchSelectValue(studentMatch.school)}
                            disabled={branchAssignBusy === user.id}
                            onChange={(e) => void handleInlineBranchChange(user, e.target.value)}
                            className="w-full appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-2 pr-8 text-sm text-slate-800"
                          >
                            <option value="">—</option>
                            {STANDARD_BRANCH_LETTERS.map((letter) => (
                              <option key={letter} value={letter}>
                                Şube {letter}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        </div>
                      </label>
                      <label className="block text-xs">
                        <span className="font-medium text-slate-500">Dönem</span>
                        <div className="relative mt-1">
                          <select
                            value={normalizeAcademicYearLabel(user.academicYearLabel)}
                            disabled={termAssignBusy === user.id}
                            onChange={(e) => void handleInlineAcademicYearChange(user, e.target.value)}
                            className="w-full appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-2 pr-8 text-sm text-slate-800"
                          >
                            <option value="">—</option>
                            {academicYearOptions.map((term) => (
                              <option key={term} value={term}>
                                {term}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        </div>
                      </label>
                      <label className="block text-xs">
                        <span className="font-medium text-slate-500">Sınıf</span>
                        <div className="relative mt-1">
                          <select
                            value={
                              studentMatch.classLevel != null && studentMatch.classLevel !== ''
                                ? String(studentMatch.classLevel)
                                : ''
                            }
                            disabled={classAssignBusy === user.id}
                            onChange={(e) => void handleInlineClassLevelChange(user, e.target.value)}
                            className="w-full appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-2 pr-8 text-sm text-slate-800"
                          >
                            <option value="">—</option>
                            {CLASS_LEVELS.map((level) => (
                              <option key={String(level.value)} value={String(level.value)}>
                                {level.label}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        </div>
                      </label>
                      <label className="block text-xs">
                        <span className="font-medium text-slate-500">Koç</span>
                        <div className="relative mt-1">
                          <select
                            value={studentMatch.coachId || ''}
                            disabled={coachAssignBusy === user.id}
                            onChange={(e) => void handleInlineCoachChange(user, e.target.value)}
                            className="w-full appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-2 pr-8 text-sm text-slate-800"
                          >
                            <option value="">—</option>
                            {orphanCoachId ? <option value={orphanCoachId}>{coachName}</option> : null}
                            {coachOptions.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        </div>
                      </label>
                      {studentMatch.parentName?.trim() ? (
                        <p className="text-xs text-slate-600 sm:col-span-2">
                          <span className="font-medium text-slate-500">Veli:</span>{' '}
                          {studentMatch.parentName}
                          {studentMatch.parentPhone?.trim() ? ` · ${studentMatch.parentPhone}` : ''}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })
          )}
          {!listLoading && !authLoading && filteredUsers.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>Kullanıcı bulunamadı</p>
            </div>
          ) : null}
          {!listLoading && !authLoading && hasMoreUsers ? (
            <div className="border-t border-gray-100 px-4 py-3 text-center">
              <button
                type="button"
                onClick={() => setRenderLimit((n) => n + USERS_RENDER_BATCH)}
                className="text-sm font-medium text-red-600 hover:text-red-700"
              >
                Daha fazla göster ({visibleUsers.length} / {filteredUsers.length})
              </button>
            </div>
          ) : null}
        </div>

        <div className="hidden md:block overflow-x-auto overscroll-x-contain">
          <table className="w-full min-w-[1100px] table-fixed">
            <thead className="bg-gray-50/90 border-b border-gray-100">
              <tr>
                <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 w-[3%]">
                  <input
                    type="checkbox"
                    checked={allFilteredStudentsSelected}
                    onChange={(e) =>
                      e.target.checked ? selectAllFilteredStudents() : clearStudentSelection()
                    }
                    disabled={selectableStudents.length === 0}
                    className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                    title="Filtrelenen öğrencilerin tümünü seç"
                    aria-label="Filtrelenen öğrencilerin tümünü seç"
                  />
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 w-[8%]">Adı</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 w-[9%]">Soyadı</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 w-[14%]">E-mail adresi</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 w-[11%]">Telefon numarası</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 w-[5%]">Sınıfı</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 w-[5%]">Şubesi</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 w-[13%]">Koçu</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 w-[9%]">Rolü</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 w-[8%]">Veli adı</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 w-[10%]">Veli telefon numarası</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 w-[8%]">Dönem</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 w-[10%]">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {listLoading || authLoading ? (
                <tr>
                  <td colSpan={13} className="px-4 py-12 text-center text-sm text-slate-500">
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin text-red-500" />
                      Kullanıcılar yükleniyor…
                    </span>
                  </td>
                </tr>
              ) : (
              visibleUsers.map(user => {
                const em = user.email.toLowerCase().trim();
                const tags = userRoleTags(user as SystemUser);
                const studentMatch =
                  tags.includes('student')
                    ? findStudentForPlatformUser(
                        {
                          platformUserId: user.id,
                          email: user.email,
                          studentId: user.studentId
                        },
                        linkedStudents
                      )
                    : undefined;
                const roleBadge = roleBadgeForUser(user);
                const firstName =
                  user.name.split(' ').slice(0, -1).join(' ') || user.name;
                const lastName = user.name.split(' ').slice(-1).join(' ');
                const coachOptions = coachesForStudentRow(studentMatch?.institutionId);
                const coachOptIds = new Set(coachOptions.map((c) => c.id));
                const orphanCoachId =
                  studentMatch?.coachId &&
                  !coachOptIds.has(String(studentMatch.coachId))
                    ? String(studentMatch.coachId)
                    : '';

                return (
                  <tr key={user.id} className="hover:bg-slate-50/80">
                    <td className="px-2 py-3 text-center align-middle">
                      {tags.includes('student') ? (
                        <input
                          type="checkbox"
                          checked={selectedStudentIds.has(user.id)}
                          onChange={() => toggleStudentSelection(user.id)}
                          className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                          aria-label={`${user.name} seç`}
                        />
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-sm font-semibold text-slate-900 uppercase tracking-tight truncate" title={firstName}>
                      {firstName}
                    </td>
                    <td className="px-3 py-3 text-sm text-slate-800 uppercase truncate" title={lastName}>
                      {lastName}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-600 truncate" title={user.email}>
                      {user.email}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-600 whitespace-nowrap">{user.phone || '—'}</td>
                    <td className="px-3 py-3 align-middle">
                      {studentMatch ? (
                        <div className="relative min-w-[7.5rem] max-w-[11rem]">
                          <select
                            value={
                              studentMatch.classLevel != null && studentMatch.classLevel !== ''
                                ? String(studentMatch.classLevel)
                                : ''
                            }
                            disabled={classAssignBusy === user.id}
                            onChange={(e) => void handleInlineClassLevelChange(user, e.target.value)}
                            className="w-full appearance-none rounded-lg border border-slate-200 bg-white py-1.5 pl-2 pr-8 text-xs font-medium text-slate-800 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-60"
                          >
                            <option value="">—</option>
                            {studentMatch.classLevel != null &&
                            studentMatch.classLevel !== '' &&
                            !CLASS_LEVELS.some((l) => String(l.value) === String(studentMatch.classLevel)) ? (
                              <option value={String(studentMatch.classLevel)}>
                                {formatClassLevelLabel(studentMatch.classLevel)} (mevcut)
                              </option>
                            ) : null}
                            {CLASS_LEVELS.map((level) => (
                              <option key={String(level.value)} value={String(level.value)}>
                                {level.label}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 align-middle">
                      {studentMatch ? (
                        <div className="relative min-w-[4.5rem] max-w-[7rem]">
                          <select
                            value={studentBranchSelectValue(studentMatch.school)}
                            disabled={branchAssignBusy === user.id}
                            onChange={(e) => void handleInlineBranchChange(user, e.target.value)}
                            className="w-full appearance-none rounded-lg border border-slate-200 bg-white py-1.5 pl-2 pr-8 text-xs font-medium text-slate-800 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-60"
                          >
                            <option value="">—</option>
                            {STANDARD_BRANCH_LETTERS.map((letter) => (
                              <option key={letter} value={letter}>
                                {letter}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 align-middle">
                      {studentMatch ? (
                        <div className="relative min-w-[10rem] max-w-[14rem]">
                          <select
                            value={studentMatch.coachId || ''}
                            disabled={coachAssignBusy === user.id}
                            onChange={(e) => void handleInlineCoachChange(user, e.target.value)}
                            className="w-full appearance-none rounded-lg border border-slate-200 bg-white py-1.5 pl-2 pr-8 text-xs font-medium text-slate-800 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-60"
                          >
                            <option value="">—</option>
                            {orphanCoachId ? (
                              <option value={orphanCoachId}>
                                Mevcut koç (liste dışı · {orphanCoachId.slice(0, 8)}…)
                              </option>
                            ) : null}
                            {coachOptions.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex max-w-full items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${roleBadge.className}`}
                      >
                        <span className="truncate">{roleBadge.label}</span>
                      </span>
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-600 truncate" title={studentMatch?.parentName || ''}>
                      {studentMatch?.parentName?.trim() ? studentMatch.parentName : '—'}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-600 whitespace-nowrap">
                      {studentMatch?.parentPhone?.trim() ? studentMatch.parentPhone : '—'}
                    </td>
                    <td className="px-3 py-3 align-middle">
                      {tags.includes('student') ? (
                        <div className="relative min-w-[7rem] max-w-[10rem]">
                          <select
                            value={normalizeAcademicYearLabel(user.academicYearLabel)}
                            disabled={termAssignBusy === user.id}
                            onChange={(e) => void handleInlineAcademicYearChange(user, e.target.value)}
                            className="w-full appearance-none rounded-lg border border-slate-200 bg-white py-1.5 pl-2 pr-8 text-xs font-medium text-slate-800 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-60"
                          >
                            <option value="">—</option>
                            {academicYearOptions.map((term) => (
                              <option key={term} value={term}>
                                {term}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {canImpersonate(user) && !user.id.startsWith('demo-seed-') ? (
                          <button
                            type="button"
                            onClick={() => void handleLoginAsUser(user)}
                            disabled={loginAsBusyId === user.id}
                            className="rounded-lg p-2 text-violet-600 transition-colors hover:bg-violet-50 disabled:opacity-50"
                            title="Bu hesaba gir (görüntüle)"
                          >
                            {loginAsBusyId === user.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <LogIn className="h-4 w-4" />
                            )}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => openModal('edit', user)}
                          className="rounded-lg p-2 text-blue-600 transition-colors hover:bg-blue-50"
                          title="Profil / düzenle"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        {!user.id.startsWith('demo-seed-') && currentUser?.role !== 'teacher' ? (
                          <button
                            type="button"
                            onClick={() => void handleDelete(user.id)}
                            className="rounded-lg p-2 text-blue-600 transition-colors hover:bg-blue-50"
                            title="Sil"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
              )}
            </tbody>
          </table>
        </div>

        {!listLoading && !authLoading && filteredUsers.length === 0 ? (
          <div className="hidden md:block p-8 text-center text-gray-500">
            <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>Kullanıcı bulunamadı</p>
          </div>
        ) : null}

        {!listLoading && !authLoading && hasMoreUsers ? (
          <div className="border-t border-gray-100 px-4 py-3 text-center">
            <button
              type="button"
              onClick={() => setRenderLimit((n) => n + USERS_RENDER_BATCH)}
              className="text-sm font-medium text-red-600 hover:text-red-700"
            >
              Daha fazla göster ({visibleUsers.length} / {filteredUsers.length})
            </button>
          </div>
        ) : null}
      </div>

      <AppModal open={showModal} onClose={() => setShowModal(false)} panelClassName="max-w-lg">
            <AppModalHeader>
              <h2 className="text-xl font-bold text-slate-800">
                {modalMode === 'add'
                  ? 'Yeni Kullanıcı Ekle'
                  : selectedUser?.id.startsWith(COACH_PROFILE_ONLY_PREFIX)
                    ? 'Koç — giriş hesabı oluştur'
                    : 'Kullanıcı Düzenle'}
              </h2>
              <button type="button" onClick={() => setShowModal(false)} className="icon-tap-btn hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </AppModalHeader>

            <AppModalForm onSubmit={handleSubmit}>
            <AppModalBody className="space-y-4">
              {modalMode === 'edit' && selectedUser?.id.startsWith(COACH_PROFILE_ONLY_PREFIX) ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Bu koç <code className="rounded bg-white/80 px-1">coaches</code> tablosunda;{' '}
                  <code className="rounded bg-white/80 px-1">users</code> kaydı yok. Giriş için{' '}
                  <strong>şifre</strong> (en az 6 karakter) girip kaydedin — hesap oluşturulur.
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <UserCog className="w-4 h-4 inline mr-1" />
                    Adı *
                  </label>
                  <input
                    type="text"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    required
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder="Ad"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Soyadı *</label>
                  <input
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    required
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder="Soyad"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Mail className="w-4 h-4 inline mr-1" />
                  E-posta *
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="ornek@email.com"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Phone className="w-4 h-4 inline mr-1" />
                  Telefon
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="0500 000 00 00"
                />
              </div>

              {formData.role === 'student' && (
                <>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Doğum tarihi</label>
                      <input
                        type="date"
                        autoComplete="off"
                        value={formData.birthDate}
                        onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Sınıfı</label>
                      <select
                        value={formData.classLevel}
                        onChange={(e) => setFormData({ ...formData, classLevel: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
                      >
                        {formData.classLevel &&
                        !CLASS_LEVELS.some((l) => String(l.value) === formData.classLevel) ? (
                          <option value={formData.classLevel}>
                            {formatClassLevelLabel(formData.classLevel)} (mevcut)
                          </option>
                        ) : null}
                        {CLASS_LEVELS.map((level) => (
                          <option key={String(level.value)} value={String(level.value)}>
                            {level.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Şubesi</label>
                      <select
                        value={formData.branch}
                        onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                      >
                        <option value="">Seçin…</option>
                        {STANDARD_BRANCH_LETTERS.map((letter) => (
                          <option key={letter} value={letter}>
                            Şube {letter}
                          </option>
                        ))}
                        {formData.branch &&
                        !(STANDARD_BRANCH_LETTERS as readonly string[]).includes(formData.branch) ? (
                          <option value={formData.branch}>{formData.branch} (mevcut)</option>
                        ) : null}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Veli adı</label>
                      <input
                        type="text"
                        autoComplete="off"
                        value={formData.parentName}
                        onChange={(e) => setFormData({ ...formData, parentName: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                        placeholder="Veli adı"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Veli telefon numarası</label>
                      <input
                        type="tel"
                        autoComplete="off"
                        value={formData.parentPhone}
                        onChange={(e) => setFormData({ ...formData, parentPhone: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                        placeholder="05xx xxx xx xx"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Lock className="w-4 h-4 inline mr-1" />
                  Şifre {modalMode === 'edit' && '(boş bırakılırsa değişmez)'}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-4 py-2 pr-10 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder={modalMode === 'add' ? 'En az 6 karakter' : 'Değiştirmek için girin'}
                    required={modalMode === 'add'}
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Role */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Shield className="w-4 h-4 inline mr-1" />
                  Rol *
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  {(modalMode === 'edit'
                    ? ROLES.filter((r) => r.value !== 'super_admin')
                    : selectableRoles
                  ).map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </div>

              {currentUser?.role === 'super_admin' &&
                (modalMode === 'add' || modalMode === 'edit') &&
                formData.role !== 'student' && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50/90 p-4 space-y-2">
                    <label className="block text-sm font-medium text-gray-700">Kullanıcının kurumu</label>
                    <select
                      value={formData.studentInstitutionId}
                      onChange={(e) =>
                        setFormData({ ...formData, studentInstitutionId: e.target.value })
                      }
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                    >
                      <option value="">— Kurumsuz</option>
                      {institutions.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500">
                      Bu seçim kullanıcı kaydındaki kurum alanını günceller. Koç rolünde eşleşen koç kartının kurumu da
                      buna göre ayarlanır.
                    </p>
                  </div>
                )}

              {(isAdminActor(currentUser)) &&
                (formData.role === 'teacher' || formData.role === 'coach' || formData.role === 'admin') && (
                  <div className="rounded-lg border border-violet-100 bg-violet-50/80 p-3 space-y-2">
                    <p className="text-xs text-violet-900 font-medium">
                      Ek roller (aynı kişide birden fazla yetki)
                    </p>
                    {formData.role === 'admin' && (
                      <>
                        <label className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.alsoCoach}
                            onChange={(e) => setFormData({ ...formData, alsoCoach: e.target.checked })}
                            className="rounded border-gray-300"
                          />
                          Koç rolü de ver
                        </label>
                        <label className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.alsoTeacher}
                            onChange={(e) => setFormData({ ...formData, alsoTeacher: e.target.checked })}
                            className="rounded border-gray-300"
                          />
                          Öğretmen rolü de ver
                        </label>
                      </>
                    )}
                    {formData.role === 'teacher' && (
                      <label className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.alsoCoach}
                          onChange={(e) => setFormData({ ...formData, alsoCoach: e.target.checked })}
                          className="rounded border-gray-300"
                        />
                        Koç rolü de ver
                      </label>
                    )}
                    {formData.role === 'coach' && (
                      <label className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.alsoTeacher}
                          onChange={(e) => setFormData({ ...formData, alsoTeacher: e.target.checked })}
                          className="rounded border-gray-300"
                        />
                        Öğretmen rolü de ver
                      </label>
                    )}
                  </div>
                )}

              {(isAdminActor(currentUser)) &&
                formHasTeacherRole(formData.role, formData.alsoTeacher) && (
                  <div className="space-y-2">
                    <p className="text-xs text-violet-800">
                      Bu atama öğretmenin Soru Havuzu ekranıyla paylaşılır. Öğretmen kendi
                      güncellemesini yaptığında burada da görünür.
                    </p>
                    <TeacherQuestionProfileFields
                      value={{
                        branches: formData.questionBranches,
                        grades: formData.questionGrades
                      }}
                      onChange={(next) =>
                        setFormData((prev) => ({
                          ...prev,
                          questionBranches: next.branches,
                          questionGrades: next.grades
                        }))
                      }
                    />
                  </div>
                )}

              {modalMode === 'edit' &&
                userRoleTags(
                  (selectedUser || { role: formData.role }) as SystemUser
                ).includes('admin') &&
                currentUser?.role === 'super_admin' && (
                  <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <p className="text-sm font-medium text-amber-900">
                      Bu yöneticinin kurum kotası (öğrenci / koç)
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <div>
                        <label className="text-xs text-gray-600">Max öğrenci</label>
                        <input
                          type="number"
                          min={0}
                          value={formData.bootstrap_max_students}
                          onChange={e =>
                            setFormData({ ...formData, bootstrap_max_students: e.target.value })
                          }
                          className="w-full px-3 py-2 border rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-600">Max koç</label>
                        <input
                          type="number"
                          min={0}
                          value={formData.bootstrap_max_coaches}
                          onChange={e =>
                            setFormData({ ...formData, bootstrap_max_coaches: e.target.value })
                          }
                          className="w-full px-3 py-2 border rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-600">Paket etiketi</label>
                        <input
                          type="text"
                          value={formData.bootstrap_package_label}
                          onChange={e =>
                            setFormData({
                              ...formData,
                              bootstrap_package_label: e.target.value
                            })
                          }
                          className="w-full px-3 py-2 border rounded-lg"
                          placeholder="professional"
                        />
                      </div>
                    </div>
                  </div>
                )}

              {modalMode === 'add' &&
                formData.role === 'admin' &&
                currentUser?.role === 'super_admin' && (
                  <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <p className="text-sm font-medium text-amber-900">
                      Yeni yönetici için kurum kota başlangıcı
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <div>
                        <label className="text-xs text-gray-600">Max öğrenci</label>
                        <input
                          type="number"
                          min={0}
                          value={formData.bootstrap_max_students}
                          onChange={(e) =>
                            setFormData({ ...formData, bootstrap_max_students: e.target.value })
                          }
                          className="w-full px-3 py-2 border rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-600">Max koç</label>
                        <input
                          type="number"
                          min={0}
                          value={formData.bootstrap_max_coaches}
                          onChange={(e) =>
                            setFormData({ ...formData, bootstrap_max_coaches: e.target.value })
                          }
                          className="w-full px-3 py-2 border rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-600">Paket etiketi</label>
                        <input
                          type="text"
                          value={formData.bootstrap_package_label}
                          onChange={(e) =>
                            setFormData({ ...formData, bootstrap_package_label: e.target.value })
                          }
                          className="w-full px-3 py-2 border rounded-lg"
                          placeholder="professional"
                        />
                      </div>
                    </div>
                  </div>
                )}

              {(modalMode === 'add' || modalMode === 'edit') && formData.role === 'student' && (
                <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50/90 p-4">
                  {currentUser?.role === 'super_admin' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Kurum</label>
                      <select
                        value={formData.studentInstitutionId}
                        onChange={(e) => setFormData({ ...formData, studentInstitutionId: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                      >
                        <option value="">Kurum seçin</option>
                        {institutions.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {(currentUser?.role === 'admin' || currentUser?.role === 'teacher') &&
                    !(currentUser?.role === 'super_admin') && (
                      <p className="text-xs text-gray-600">
                        Kurum:{' '}
                        <span className="font-medium">
                          {(formData.studentInstitutionId &&
                            institutions.find((i) => i.id === formData.studentInstitutionId)?.name) ||
                            institution?.name ||
                            '—'}
                        </span>
                      </p>
                    )}
                  <label className="flex items-start gap-2 text-sm text-gray-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.whatsappAutomationEnabled}
                      onChange={(e) =>
                        setFormData({ ...formData, whatsappAutomationEnabled: e.target.checked })
                      }
                      className="mt-0.5 rounded border-gray-300"
                    />
                    <span>
                      Otomatik WhatsApp mesajları (günlük rapor, koç otomasyonu, ders hatırlatma)
                      <span className="block text-xs text-gray-500 mt-0.5">
                        Kapalıysa cron ile giden otomatik mesajlar bu öğrenciye gitmez.
                      </span>
                    </span>
                  </label>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <Briefcase className="w-4 h-4 inline mr-1" />
                      Atanan koç {currentUser?.role === 'teacher' && modalMode === 'add' ? '*' : ''}
                    </label>
                    <select
                      value={formData.assignCoachId}
                      onChange={(e) => setFormData({ ...formData, assignCoachId: e.target.value })}
                      required={currentUser?.role === 'teacher' && modalMode === 'add'}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                    >
                      <option value="">Koç seçin</option>
                      {coachesForStudentForm.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      Süper admin kurum seçince koç listesi o kuruma göre süzülür. Öğretmen ile yeni öğrenci
                      eklerken koç seçimi zorunludur (kurum içi kota).
                    </p>
                  </div>
                </div>
              )}

              {/* Academic year */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Eğitim dönemi</label>
                <select
                  value={formData.academicYearLabel}
                  onChange={(e) => setFormData({ ...formData, academicYearLabel: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="">— Seçilmedi —</option>
                  {mergeAcademicYearTermOptions(
                    formData.academicYearLabel ? [formData.academicYearLabel] : []
                  ).map((term) => (
                    <option key={term} value={term}>
                      {term}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Örnek: 2025-2026, 2025-2026 Yaz Dönemi, 2026-2027. Liste üstünden döneme göre süzebilirsiniz.
                </p>
              </div>

              {/* Package */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Paket Seçimi *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(PACKAGES).map(([key, pkg]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handlePackageChange(key as typeof formData.package)}
                      className={`p-3 rounded-lg border-2 text-left transition-all ${
                        formData.package === key
                          ? 'border-red-500 bg-red-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="font-medium text-sm">{pkg.name}</div>
                      <div className="text-xs text-gray-500">{pkg.days} gün</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Calendar className="w-4 h-4 inline mr-1" />
                    Başlangıç
                  </label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => {
                      setFormData({ ...formData, startDate: e.target.value });
                      // Bitiş tarihini de güncelle
                      const start = new Date(e.target.value);
                      const end = new Date(start);
                      end.setDate(end.getDate() + PACKAGES[formData.package].days);
                      setFormData(prev => ({
                        ...prev,
                        startDate: e.target.value,
                        endDate: end.toISOString().split('T')[0]
                      }));
                    }}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Clock className="w-4 h-4 inline mr-1" />
                    Bitiş
                  </label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              </div>

              {/* Active Status */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, isActive: !formData.isActive })}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    formData.isActive ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    formData.isActive ? 'translate-x-6' : 'translate-x-0.5'
                  }`} />
                </button>
                <span className="text-sm text-gray-700">
                  {formData.isActive ? 'Aktif' : 'Pasif'}
                </span>
              </div>
            </AppModalBody>

              {/* Actions */}
              <AppModalFooter>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="min-h-[44px] flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="min-h-[44px] flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Kaydediliyor...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      {modalMode === 'add' ? 'Ekle' : 'Kaydet'}
                    </>
                  )}
                </button>
              </div>
              </AppModalFooter>
            </AppModalForm>
      </AppModal>
      <CopyableLoginCredentialsModal
        open={loginCredentialsModal != null}
        onClose={() => setLoginCredentialsModal(null)}
        data={loginCredentialsModal}
        autoCopyAll
      />

      <UserImportMappingModal
        open={importMappingOpen}
        grid={importGrid}
        fileName={importFileName}
        busy={importBusy}
        onClose={() => {
          if (!importBusy) setImportMappingOpen(false);
        }}
        onConfirm={(headerRowIndex, mappings) =>
          void runBulkImportWithMapping(headerRowIndex, mappings)
        }
      />
    </div>
  );
}
