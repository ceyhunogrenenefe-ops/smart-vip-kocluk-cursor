// Türkçe: Kullanıcı Yönetimi Sayfası - Super Admin Paneli
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth, SystemUser } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';
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
import { UserRole, ClassLevel, Coach, Student } from '../types';
import { userRoleTags } from '../config/rolePermissions';
import { db, QuotaSnapshot } from '../lib/database';
import { isSupabaseReady } from '../lib/supabase';
import { getAuthToken } from '../lib/session';
import {
  userRowToSystemUser,
  findStudentForPlatformUser,
  type StudentPlatformLink,
  type UserRow
} from '../lib/userRowToSystemUser';
import { studentRowToStudent, coachRowToCoach } from '../lib/mapStudentRow';
import {
  downloadUserImportTemplateXlsx,
  importedRolesKindConflict,
  normalizeImportedFullNameKey,
  normalizeRolesFromApiUser,
  parseUserImportGrid,
  readUserImportFileAsGrid,
  USER_IMPORT_TEMPLATE_HEADERS
} from '../lib/userBulkImport';

const toClassLevel = (raw: string): ClassLevel => {
  const v = String(raw || '').trim();
  if (!v) return 9;
  if (v === 'LGS' || v === 'YOS' || v.startsWith('YKS-')) return v as ClassLevel;
  const n = Number(v);
  if (!Number.isNaN(n)) return n as ClassLevel;
  return 9;
};

/** `users` satırı yok; yalnızca `coaches` tablosunda olan profiller (liste + düzenlemede hesap açma) */
const COACH_PROFILE_ONLY_PREFIX = '__coach_profile__:';

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
  const {
    user: currentUser,
    loginAsEmail,
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

  useEffect(() => {
    const r = currentUser?.role;
    if (!r || !['super_admin', 'admin', 'teacher'].includes(r)) {
      navigate('/');
    }
  }, [currentUser, navigate]);

  // State
  const [users, setUsers] = useState<SystemUser[]>([]);
  /** Çoklu rol (ör. öğretmen+koç) eşlemesi için ham API kullanıcı satırları */
  const [rawUserRows, setRawUserRows] = useState<UserRow[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<UserRole | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'expired' | 'inactive'>('all');
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [selectedUser, setSelectedUser] = useState<SystemUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [quota, setQuota] = useState<QuotaSnapshot | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  /** Satır içi koç ataması PATCH sırasında */
  const [coachAssignBusy, setCoachAssignBusy] = useState<string | null>(null);
  const [loginAsBusyId, setLoginAsBusyId] = useState<string | null>(null);

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
      const r = await loginAsEmail(row.email, row.role);
      if (!r.success) {
        setMessage({ type: 'error', text: r.message });
        return;
      }
      setMessage({ type: 'success', text: r.message });
      const role = row.role;
      if (role === 'coach') navigate('/coach-dashboard');
      else if (role === 'student') navigate('/student-dashboard');
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

  const refreshUsers = useCallback(async () => {
    if (getAuthToken() && isSupabaseReady) {
      try {
        const rows = await db.getUsers();
        setRawUserRows(rows as UserRow[]);
        const scope =
          currentUser?.role === 'super_admin'
            ? undefined
            : activeInstitutionId || institution?.id || undefined;
        let joinStudents = students;
        let joinCoaches = coaches;
        try {
          const [stRows, coRows] = await Promise.all([db.getStudents(scope), db.getCoaches(scope)]);
          joinStudents = stRows.map(studentRowToStudent);
          joinCoaches = coRows.map(coachRowToCoach);
        } catch {
          /* AppContext listesiyle devam */
        }
        const fromApi = rows.map((row) =>
          userRowToSystemUser(row, { coaches: joinCoaches, students: joinStudents })
        );
        const stubs = coachProfilesWithoutLoginUser(joinCoaches, rows as UserRow[]);
        const seen = new Set(fromApi.map((u) => u.email.toLowerCase().trim()));
        setUsers([...fromApi, ...stubs.filter((s) => !seen.has(s.email.toLowerCase().trim()))]);
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
      }
    }
    setUsers(getAllUsers());
    setRawUserRows([]);
  }, [getAllUsers, coaches, students, currentUser?.role, activeInstitutionId, institution?.id]);

  useEffect(() => {
    void refreshUsers();
  }, [refreshUsers]);

  useEffect(() => {
    if (
      !showModal ||
      modalMode !== 'edit' ||
      !selectedUser ||
      selectedUser.role !== 'admin' ||
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
    let cancelled = false;
    (async () => {
      if (!getAuthToken() || !isSupabaseReady || !currentUser) return;
      const inst =
        currentUser.role === 'super_admin'
          ? activeInstitutionId || institution?.id || undefined
          : currentUser.institutionId || activeInstitutionId || institution?.id || undefined;
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
  }, [currentUser, activeInstitutionId, institution?.id]);

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
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    isActive: true
  });

  const [showPassword, setShowPassword] = useState(false);

  // Filtrelenmiş kullanıcılar
  const filteredUsers = users.filter(user => {
    const q = searchTerm.toLowerCase().trim();
    const phoneMatch = (user.phone || '').replace(/\s/g, '').toLowerCase();
    const qDigits = q.replace(/\D/g, '');
    if (
      searchTerm &&
      !user.name.toLowerCase().includes(q) &&
      !user.email.toLowerCase().includes(q) &&
      !(user.phone && (phoneMatch.includes(q.replace(/\s/g, '')) || (qDigits.length >= 4 && phoneMatch.includes(qDigits))))
    ) {
      return false;
    }

    // Rol filtresi (çoklu rol: örneğin öğretmen+koç kullanıcıda `roles` dizisi)
    if (filterRole !== 'all') {
      const tags = user.roles?.length ? user.roles : [user.role];
      if (!tags.includes(filterRole)) return false;
    }

    // Durum filtresi
    if (filterStatus !== 'all') {
      if (filterStatus === 'active') {
        if (user.isActive === false) return false;
        const daysLeft = getDaysLeft(user.endDate);
        // Bitiş tarihi yok (süresiz) → aktif say
        if (user.endDate && daysLeft != null && daysLeft <= 0) return false;
      } else if (filterStatus === 'expired') {
        const daysLeft = getDaysLeft(user.endDate);
        if (daysLeft !== null && daysLeft <= 0) return false;
        if (user.isActive === false) return false;
      } else if (filterStatus === 'inactive') {
        if (user.isActive !== false) return false;
      }
    }

    return true;
  });

  const coachesForStudentForm = useMemo(() => {
    const inst = String(formData.studentInstitutionId || '').trim();
    if (!inst) return coaches;
    return coaches.filter((c) => !c.institutionId || c.institutionId === inst);
  }, [coaches, formData.studentInstitutionId]);

  // Gün sayısını hesapla
  const getDaysLeft = (endDate?: string) => {
    if (!endDate) return null;
    const end = new Date(endDate);
    const now = new Date();
    const diff = end.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

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
      if (!studentInstitutionId) return coaches;
      return coaches.filter((c) => !c.institutionId || c.institutionId === studentInstitutionId);
    },
    [coaches]
  );

  /** Bellekteki listede yoksa API’den tam liste ile eşle (kurum filtresi / gecikmiş state). */
  const resolveStudentLinkForUser = useCallback(
    async (user: Pick<SystemUser, 'id' | 'email' | 'studentId'>): Promise<StudentPlatformLink | null> => {
      const opts = {
        platformUserId: user.id,
        email: user.email,
        studentId: user.studentId
      };
      let link = findStudentForPlatformUser(opts, students);
      if (link) return link;
      if (!getAuthToken() || !isSupabaseReady) return null;
      try {
        const rows = await db.getStudents(undefined);
        link = findStudentForPlatformUser(
          opts,
          rows.map((r) => ({
            id: r.id,
            email: r.email,
            platformUserId: r.platform_user_id ?? undefined
          }))
        );
        return link ?? null;
      } catch {
        return null;
      }
    },
    [students]
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
      await refreshUsers();
    } catch (e) {
      setMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Koç atanamadı.'
      });
    } finally {
      setCoachAssignBusy(null);
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
              students
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
        startDate: user.startDate?.split('T')[0] || new Date().toISOString().split('T')[0],
        endDate: user.endDate?.split('T')[0] || '',
        isActive: user.isActive !== false
      });
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
        startDate: new Date().toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        isActive: true
      });
    }

    setShowModal(true);
  };

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
              start_date: new Date(formData.startDate).toISOString(),
              end_date: formData.endDate ? new Date(formData.endDate).toISOString() : null,
              created_by: null
            });
            setMessage({ type: 'success', text: 'Koç için giriş hesabı oluşturuldu.' });
            await refreshUsers();
            setShowModal(false);
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
          formData.role !== 'student' &&
          formData.role !== 'admin' &&
          (currentUser?.role === 'admin' || currentUser?.role === 'super_admin')
            ? (() => {
                if (formData.role === 'teacher') {
                  const r: UserRole[] = ['teacher'];
                  if (formData.alsoCoach) r.push('coach');
                  return { roles: r, primary: 'teacher' as UserRole };
                }
                if (formData.role === 'coach') {
                  const r: UserRole[] = ['coach'];
                  if (formData.alsoTeacher) r.push('teacher');
                  return { roles: r, primary: 'coach' as UserRole };
                }
                return null;
              })()
            : null;

        const patch: Record<string, unknown> = {
          name: fullName,
          email: formData.email,
          phone: formData.phone,
          role: staffRoles ? staffRoles.primary : formData.role,
          package: formData.package,
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
        if (formData.password.trim().length >= 6) patch.password = formData.password;
        let result: { success: boolean; message: string } = { success: false, message: 'Güncellenemedi.' };
        if (getAuthToken() && isSupabaseReady) {
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
          selectedUser.role === 'admin'
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
          if (tags.includes('student')) {
            const st = await resolveStudentLinkForUser(selectedUser);
            if (st) {
              try {
                await updateStudent(st.id, {
                  birthDate: formData.birthDate || undefined,
                  classLevel: toClassLevel(formData.classLevel),
                  school: formData.branch.trim() || undefined,
                  parentName: formData.parentName.trim() || undefined,
                  parentPhone: formData.parentPhone.trim() || undefined,
                  coachId: formData.assignCoachId.trim() || undefined,
                  institutionId: formData.studentInstitutionId.trim() || undefined
                });
              } catch (se) {
                studentCardNote =
                  ' Öğrenci kartı alanları kaydedilemedi: ' +
                  (se instanceof Error ? se.message : 'bilinmeyen hata');
              }
            } else {
              studentCardNote =
                ' Öğrenci kartı güncellenemedi: kullanıcıyla eşleşen öğrenci kaydı bulunamadı (e-posta veya platform bağlantısı).';
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
              : studentCardNote.startsWith(' Öğrenci kartı alanları kaydedilemedi')
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
          await refreshUsers();
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

        const staffRolesNew =
          formData.role !== 'student' &&
          formData.role !== 'admin' &&
          (currentUser?.role === 'admin' || currentUser?.role === 'super_admin')
            ? (() => {
                if (formData.role === 'teacher') {
                  const r: UserRole[] = ['teacher'];
                  if (formData.alsoCoach) r.push('coach');
                  return { roles: r, primary: 'teacher' as UserRow['role'] };
                }
                if (formData.role === 'coach') {
                  const r: UserRole[] = ['coach'];
                  if (formData.alsoTeacher) r.push('teacher');
                  return { roles: r, primary: 'coach' as UserRow['role'] };
                }
                return null;
              })()
            : null;

        const superAdminChosenInst =
          currentUser?.role === 'super_admin' ? String(formData.studentInstitutionId || '').trim() : '';

        const resolvedStudentInstitution =
          formData.role === 'student' &&
          (currentUser?.role === 'super_admin' || currentUser?.role === 'admin') &&
          String(formData.studentInstitutionId || '').trim()
            ? String(formData.studentInstitutionId).trim()
            : (resolvedInstitution ?? null);

        const institutionIdForNewUser =
          formData.role === 'student'
            ? (resolvedStudentInstitution ?? null)
            : superAdminChosenInst || (resolvedInstitution ?? null);

        const studentInstForAdd =
          (resolvedStudentInstitution ?? null) ||
          resolvedInstitution ||
          instFallback ||
          currentUser?.institutionId;

        if (getAuthToken() && isSupabaseReady) {
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

            setMessage({ type: 'success', text: `${label} başarıyla oluşturuldu!` });
            await refreshUsers();

            const instId =
              institutionIdForNewUser || resolvedInstitution || instFallback || currentUser?.institutionId;
            const newUserId = row.id;
            try {
              if (formData.role === 'student') {
                await addStudent({
                  id: newUserId,
                  name: fullName,
                  email: formData.email,
                  password: formData.password || undefined,
                  phone: formData.phone || '',
                  birthDate: formData.birthDate || undefined,
                  parentName: formData.parentName.trim() || undefined,
                  parentPhone: formData.parentPhone.trim() || '',
                  classLevel: toClassLevel(formData.classLevel),
                  school: formData.branch.trim() || undefined,
                  coachId: formData.assignCoachId || undefined,
                  institutionId: studentInstForAdd || undefined,
                  createdAt: new Date().toISOString()
                });
              } else if (formData.role === 'coach' || (staffRolesNew?.roles || []).includes('coach')) {
                await addCoach({
                  id: newUserId,
                  name: fullName,
                  email: formData.email,
                  phone: formData.phone || '',
                  subjects: [],
                  studentIds: [],
                  institutionId: instId || undefined,
                  createdAt: new Date().toISOString()
                });
              }
            } catch (syncErr) {
              console.error('Öğrenci/koç listesi senkron hatası:', syncErr);
              setMessage({
                type: 'error',
                text: 'Kullanıcı oluşturuldu ancak öğrenci/koç listesine eklenirken sorun oluştu. Öğrenci/Koç sayfasından tekrar deneyin.'
              });
            }

            setTimeout(() => {
              setShowModal(false);
              if (formData.role === 'student') navigate('/students');
              else if (
                formData.role === 'coach' &&
                !(staffRolesNew?.roles || []).includes('teacher')
              ) {
                navigate('/coaches');
              } else {
                navigate('/dashboard');
              }
            }, 1500);
          } catch (err) {
            setMessage({
              type: 'error',
              text: err instanceof Error ? err.message : 'Kullanıcı oluşturulamadı.'
            });
          }
        } else {
          const createPayload: Record<string, unknown> = {
            name: fullName,
            email: formData.email,
            phone: formData.phone,
            password: formData.password,
            role: formData.role,
            package: formData.package,
            startDate: new Date(formData.startDate).toISOString(),
            endDate: formData.endDate ? new Date(formData.endDate).toISOString() : undefined,
            isActive: formData.isActive,
            institutionId: institutionIdForNewUser || resolvedInstitution || undefined,
            institution_id: institutionIdForNewUser || resolvedInstitution || undefined
          };

          if (currentUser?.role === 'super_admin' && formData.role === 'admin') {
            createPayload.bootstrap_max_students =
              Number(formData.bootstrap_max_students) || undefined;
            createPayload.bootstrap_max_coaches = Number(formData.bootstrap_max_coaches) || undefined;
            createPayload.bootstrap_package_label =
              formData.bootstrap_package_label || 'professional';
          }

          const result = await createUser(createPayload);

          if (result.success) {
            setMessage({ type: 'success', text: `${label} başarıyla oluşturuldu!` });
            await refreshUsers();

            const instId =
              institutionIdForNewUser || resolvedInstitution || instFallback || currentUser?.institutionId;
            const newUserId = result.userId || `user-${Date.now()}`;
            try {
              if (formData.role === 'student') {
                await addStudent({
                  id: newUserId,
                  name: fullName,
                  email: formData.email,
                  password: formData.password || undefined,
                  phone: formData.phone || '',
                  birthDate: formData.birthDate || undefined,
                  parentName: formData.parentName.trim() || undefined,
                  parentPhone: formData.parentPhone.trim() || '',
                  classLevel: toClassLevel(formData.classLevel),
                  school: formData.branch.trim() || undefined,
                  coachId: formData.assignCoachId || undefined,
                  institutionId: studentInstForAdd || instId || undefined,
                  createdAt: new Date().toISOString()
                });
              } else if (formData.role === 'coach' || (staffRolesNew?.roles || []).includes('coach')) {
                await addCoach({
                  id: newUserId,
                  name: fullName,
                  email: formData.email,
                  phone: formData.phone || '',
                  subjects: [],
                  studentIds: [],
                  institutionId: instId || undefined,
                  createdAt: new Date().toISOString()
                });
              }
            } catch (syncErr) {
              console.error('Öğrenci/koç listesi senkron hatası:', syncErr);
              setMessage({
                type: 'error',
                text: 'Kullanıcı oluşturuldu ancak öğrenci/koç listesine eklenirken sorun oluştu. Öğrenci/Koç sayfasından tekrar deneyin.'
              });
            }

            setTimeout(() => {
              setShowModal(false);
              if (formData.role === 'student') navigate('/students');
              else if (
                formData.role === 'coach' &&
                !(staffRolesNew?.roles || []).includes('teacher')
              ) {
                navigate('/coaches');
              } else {
                navigate('/dashboard');
              }
            }, 1500);
          } else {
            setMessage({ type: 'error', text: result.message });
          }
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

    if (getAuthToken() && isSupabaseReady) {
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
        students
      );
      const ch = coaches.find((c) => c.email.toLowerCase() === target.email.toLowerCase());
      if (st) await deleteStudent(st.id);
      if (ch) await deleteCoach(ch.id);
    }
    setMessage({ type: result.success ? 'success' : 'error', text: result.message });
    void refreshUsers();
  };

  // İstatistikler
  const stats = {
    total: users.length,
    admins: users.filter(u => u.role === 'admin').length,
    coaches: users.filter(u => u.role === 'coach').length,
    teachers: users.filter(u => u.role === 'teacher' || (u.roles || []).includes('teacher')).length,
    students: users.filter(u => u.role === 'student').length,
    active: users.filter(u => {
      const daysLeft = getDaysLeft(u.endDate);
      return u.isActive !== false && daysLeft !== null && daysLeft > 0;
    }).length,
    expired: users.filter(u => {
      const daysLeft = getDaysLeft(u.endDate);
      return daysLeft !== null && daysLeft <= 0;
    }).length
  };

  const importAllowedRoles = useMemo((): UserRole[] => {
    const r = currentUser?.role;
    if (r === 'teacher') return ['student'];
    if (r === 'admin' || r === 'super_admin') return ['student', 'teacher', 'coach'];
    return [];
  }, [currentUser?.role]);

  const handleBulkUserImport = async (file: File | null) => {
    if (!file) return;
    if (!(currentUser?.role === 'admin' || currentUser?.role === 'super_admin' || currentUser?.role === 'teacher')) {
      setMessage({ type: 'error', text: 'Dosya ile içe aktarma yalnızca yönetici veya öğretmen için açıktır.' });
      return;
    }
    setImportBusy(true);
    const rowErrors: string[] = [];
    try {
      let grid: unknown[][];
      try {
        grid = await readUserImportFileAsGrid(file);
      } catch {
        setMessage({ type: 'error', text: 'Dosya okunamadı. .xlsx veya .csv kullanın.' });
        return;
      }
      const { rows: parsed, headerError, invalidComboRows } = parseUserImportGrid(grid);
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
        currentUser?.role === 'teacher'
          ? currentUser.institutionId
          : instFallback || currentUser?.institutionId;
      if (
        resolvedInstitutionBase &&
        institutions.length > 0 &&
        !institutions.some((i) => i.id === resolvedInstitutionBase)
      ) {
        resolvedInstitutionBase = undefined;
      }

      let updated = 0;
      let created = 0;
      let fail = 0;

      const matchesInstitution = (
        rowInst: string | null | undefined,
        scope: string | null
      ): boolean =>
        !scope ||
        rowInst === scope ||
        rowInst === null ||
        rowInst === undefined;

      for (const pr of parsed) {
        const disallowed = pr.roles.filter((r) => !importAllowedRoles.includes(r));
        if (disallowed.length) {
          fail += 1;
          rowErrors.push(`Satır ${pr.rowNumber}: Bu roller için yetkiniz yok: ${disallowed.join(', ')}.`);
          continue;
        }
        const pwd = pr.password.trim();
        const pwd2 = (pr.passwordConfirm || '').trim();
        if (pwd.length < 6) {
          fail += 1;
          rowErrors.push(`Satır ${pr.rowNumber}: Şifre en az 6 karakter olmalıdır.`);
          continue;
        }
        if (pwd2 && pwd !== pwd2) {
          fail += 1;
          rowErrors.push(`Satır ${pr.rowNumber}: Şifre ile şifre tekrarı eşleşmiyor.`);
          continue;
        }

        const instId = (resolvedInstitutionBase ?? null) as string | null;
        const emailLower = pr.email.toLowerCase().trim();
        const nameKey = normalizeImportedFullNameKey(pr.fullName.trim());

        let nameMatchStudent: Student | undefined;
        let nameMatchCoach: Coach | undefined;

        const syncProfileCreate = async (newUserId: string) => {
          if (pr.roles.includes('student')) {
            await addStudent({
              id: newUserId,
              name: pr.fullName.trim(),
              email: pr.email.trim(),
              password: pwd,
              phone: pr.phone.trim() || '',
              birthDate: pr.birthDate || undefined,
              parentName: pr.parentName.trim() || undefined,
              parentPhone: pr.parentPhone.trim() || '',
              classLevel: toClassLevel(pr.classLevel),
              school: pr.branch.trim() || undefined,
              institutionId: instId || undefined,
              createdAt: new Date().toISOString()
            });
          }
          if (pr.roles.includes('coach')) {
            await addCoach({
              id: newUserId,
              name: pr.fullName.trim(),
              email: pr.email.trim(),
              phone: pr.phone.trim() || '',
              subjects: [],
              studentIds: [],
              institutionId: instId || undefined,
              createdAt: new Date().toISOString()
            });
          }
        };

        const upsertProfilesForExistingUser = async (existing: {
          id: string;
          email?: string | null;
        }) => {
          if (pr.roles.includes('student')) {
            const stMail = String(existing.email || '').toLowerCase().trim();
            const st =
              findStudentForPlatformUser(
                {
                  platformUserId: existing.id,
                  email: existing.email || undefined,
                  studentId: undefined
                },
                students
              ) || nameMatchStudent;
            if (st) {
              await updateStudent(st.id, {
                name: pr.fullName.trim(),
                email: pr.email.trim(),
                password: pwd,
                phone: pr.phone.trim() || '',
                birthDate: pr.birthDate || undefined,
                parentName: pr.parentName.trim() || undefined,
                parentPhone: pr.parentPhone.trim() || '',
                classLevel: toClassLevel(pr.classLevel),
                school: pr.branch.trim() || undefined,
                institutionId: instId || undefined
              });
            } else {
              await addStudent({
                id: existing.id,
                name: pr.fullName.trim(),
                email: pr.email.trim(),
                password: pwd,
                phone: pr.phone.trim() || '',
                birthDate: pr.birthDate || undefined,
                parentName: pr.parentName.trim() || undefined,
                parentPhone: pr.parentPhone.trim() || '',
                classLevel: toClassLevel(pr.classLevel),
                school: pr.branch.trim() || undefined,
                institutionId: instId || undefined,
                createdAt: new Date().toISOString()
              });
            }
          }
          if (pr.roles.includes('coach')) {
            const chEm = String(existing.email || '').toLowerCase().trim();
            const ch =
              coaches.find((c) => c.email.toLowerCase().trim() === chEm) ||
              nameMatchCoach ||
              coaches.find((c) => String(c.id) === String(existing.id));
            if (ch) {
              await updateCoach(ch.id, {
                name: pr.fullName.trim(),
                email: pr.email.trim(),
                phone: pr.phone.trim() || ''
              });
            } else {
              await addCoach({
                id: existing.id,
                name: pr.fullName.trim(),
                email: pr.email.trim(),
                phone: pr.phone.trim() || '',
                subjects: [],
                studentIds: [],
                institutionId: instId || undefined,
                createdAt: new Date().toISOString()
              });
            }
          }
        };

        try {
          if (getAuthToken() && isSupabaseReady) {
            let existing: UserRow | null = null;
            try {
              existing = await db.getUserByEmail(emailLower);
            } catch {
              existing = null;
            }

            if (!existing && pr.roles.includes('student')) {
              const cand = students.filter(
                (st) =>
                  normalizeImportedFullNameKey(st.name) === nameKey &&
                  matchesInstitution(st.institutionId, instId)
              );
              if (cand.length > 1) {
                fail += 1;
                rowErrors.push(
                  `Satır ${pr.rowNumber}: Aynı ada soyada kurumda birden fazla öğrenci var; tekilleştirmek için e-postayı dosyada doğru kullanın.`
                );
                continue;
              }
              nameMatchStudent = cand[0];
              if (nameMatchStudent) {
                try {
                  existing = await db.getUserByEmail(
                    String(nameMatchStudent.email || '').toLowerCase().trim()
                  );
                } catch {
                  existing = null;
                }
              }
            }

            if (!existing && pr.roles.includes('coach')) {
              const cand = coaches.filter(
                (c) =>
                  normalizeImportedFullNameKey(c.name) === nameKey &&
                  matchesInstitution(c.institutionId, instId)
              );
              if (cand.length > 1) {
                fail += 1;
                rowErrors.push(
                  `Satır ${pr.rowNumber}: Aynı ada soyada birden fazla koç var; e-posta ile eşleştirin.`
                );
                continue;
              }
              nameMatchCoach = cand[0];
              if (nameMatchCoach) {
                try {
                  existing = await db.getUserByEmail(String(nameMatchCoach.email || '').toLowerCase().trim());
                } catch {
                  existing = null;
                }
              }
            }

            if (!existing && pr.roles.includes('teacher')) {
              const cand = rawUserRows
                .filter((rw) => normalizeRolesFromApiUser(rw).includes('teacher'))
                .map((rw) => userRowToSystemUser(rw, { coaches, students }))
                .filter(
                  (u) =>
                    !u.id.startsWith(COACH_PROFILE_ONLY_PREFIX) &&
                    normalizeImportedFullNameKey(u.name) === nameKey &&
                    matchesInstitution(u.institutionId, instId)
                );
              if (cand.length > 1) {
                fail += 1;
                rowErrors.push(
                  `Satır ${pr.rowNumber}: Aynı ada soyada birden fazla öğretmen var; e-posta ile eşleştirin.`
                );
                continue;
              }
              const tRow = cand[0];
              if (tRow) {
                try {
                  existing = await db.getUserByEmail(String(tRow.email || '').toLowerCase().trim());
                } catch {
                  existing = null;
                }
              }
            }

            if (existing) {
              const existingRoles = normalizeRolesFromApiUser(existing);
              if (importedRolesKindConflict(existingRoles, pr.roles)) {
                fail += 1;
                rowErrors.push(
                  `Satır ${pr.rowNumber}: Mevcut kullanıcı rolleri (${existingRoles.join(
                    ', '
                  )}) ile dosyadaki roller (${pr.roles.join(', ')}) uyumsuz (öğrenci ile personeli karıştırmayın).`
                );
                continue;
              }
              const primaryRole = pr.roles[0] as UserRow['role'];
              await db.updateUser(existing.id, {
                name: pr.fullName.trim(),
                email: emailLower,
                phone: pr.phone.trim() || null,
                password_hash: pwd,
                roles: pr.roles,
                role: primaryRole
              } as Partial<UserRow>);
              await upsertProfilesForExistingUser({ id: existing.id, email: emailLower });
              updated += 1;
              continue;
            }

            const row = await db.createUser({
              email: emailLower,
              name: pr.fullName.trim(),
              phone: pr.phone.trim() || null,
              role: pr.roles[0] as UserRow['role'],
              roles: pr.roles,
              password_hash: pwd,
              institution_id: instId,
              is_active: true,
              package: 'trial',
              start_date: new Date().toISOString(),
              end_date: null,
              created_by: null
            });
            try {
              if (pr.roles.includes('student') || pr.roles.includes('coach')) {
                await syncProfileCreate(row.id);
              }
            } catch (syncErr) {
              fail += 1;
              rowErrors.push(
                `Satır ${pr.rowNumber}: Kullanıcı oluşturuldu ancak profil senkronu başarısız: ${
                  syncErr instanceof Error ? syncErr.message : 'bilinmeyen'
                }`
              );
              continue;
            }
            created += 1;
          } else {
            let existingLocal =
              getAllUsers().find((u) => u.email.toLowerCase().trim() === emailLower) || null;

            if (!existingLocal && pr.roles.includes('student')) {
              const cand = students.filter(
                (st) =>
                  normalizeImportedFullNameKey(st.name) === nameKey &&
                  matchesInstitution(st.institutionId, instId)
              );
              if (cand.length > 1) {
                fail += 1;
                rowErrors.push(
                  `Satır ${pr.rowNumber}: Aynı ada soyada birden fazla öğrenci var; e-posta kullanın.`
                );
                continue;
              }
              nameMatchStudent = cand[0];
              if (nameMatchStudent)
                existingLocal =
                  getAllUsers().find(
                    (u) =>
                      u.email.toLowerCase().trim() ===
                      String(nameMatchStudent!.email || '').toLowerCase().trim()
                  ) || null;
            }

            if (!existingLocal && pr.roles.includes('coach')) {
              const cand = coaches.filter(
                (c) =>
                  normalizeImportedFullNameKey(c.name) === nameKey &&
                  matchesInstitution(c.institutionId, instId)
              );
              if (cand.length > 1) {
                fail += 1;
                rowErrors.push(
                  `Satır ${pr.rowNumber}: Aynı ada soyada birden fazla koç var; e-posta kullanın.`
                );
                continue;
              }
              nameMatchCoach = cand[0];
              if (nameMatchCoach)
                existingLocal =
                  getAllUsers().find(
                    (u) =>
                      u.email.toLowerCase().trim() ===
                      String(nameMatchCoach!.email || '').toLowerCase().trim()
                  ) || null;
            }

            if (!existingLocal && pr.roles.includes('teacher')) {
              const cand = rawUserRows.length
                ? rawUserRows
                    .filter((rw) => normalizeRolesFromApiUser(rw).includes('teacher'))
                    .map((rw) => userRowToSystemUser(rw, { coaches, students }))
                    .filter(
                      (u) =>
                        !u.id.startsWith(COACH_PROFILE_ONLY_PREFIX) &&
                        normalizeImportedFullNameKey(u.name) === nameKey &&
                        matchesInstitution(u.institutionId, instId)
                    )
                : users.filter(
                    (u) =>
                      !u.id.startsWith(COACH_PROFILE_ONLY_PREFIX) &&
                      (u.role === 'teacher' || (u.roles || []).includes('teacher')) &&
                      normalizeImportedFullNameKey(u.name) === nameKey &&
                      matchesInstitution(u.institutionId, instId)
                  );
              if (cand.length > 1) {
                fail += 1;
                rowErrors.push(
                  `Satır ${pr.rowNumber}: Aynı ada soyada birden fazla öğretmen var; e-posta kullanın.`
                );
                continue;
              }
              const tRw = cand[0];
              if (tRw) existingLocal = getAllUsers().find((u) => u.id === tRw.id) || null;
            }

            if (existingLocal) {
              const existingLocalRoles =
                existingLocal.roles?.length ? existingLocal.roles : [existingLocal.role];
              if (importedRolesKindConflict(existingLocalRoles, pr.roles)) {
                fail += 1;
                rowErrors.push(
                  `Satır ${pr.rowNumber}: Yerel kayıt rolleri (${existingLocalRoles.join(
                    ', '
                  )}) ile dosya (${pr.roles.join(', ')}) uyumsuz.`
                );
                continue;
              }
              const ur = await updateUser(existingLocal.id, {
                name: pr.fullName.trim(),
                email: pr.email.trim(),
                phone: pr.phone.trim(),
                password: pwd,
                role: pr.roles[0],
                roles: pr.roles
              });
              if (!ur.success) {
                fail += 1;
                rowErrors.push(`Satır ${pr.rowNumber}: ${ur.message}`);
                continue;
              }
              await upsertProfilesForExistingUser({
                id: existingLocal.id,
                email: emailLower
              });
              updated += 1;
              continue;
            }

            const result = await createUser({
              name: pr.fullName.trim(),
              email: pr.email.trim(),
              phone: pr.phone.trim(),
              password: pwd,
              role: pr.roles[0],
              roles: pr.roles,
              package: 'trial',
              startDate: new Date().toISOString(),
              isActive: true,
              institutionId: instId || undefined,
              institution_id: instId || undefined
            });
            if (!result.success) {
              fail += 1;
              rowErrors.push(`Satır ${pr.rowNumber}: ${result.message}`);
              continue;
            }
            const newUserId = result.userId || '';
            if (!newUserId) {
              fail += 1;
              rowErrors.push(`Satır ${pr.rowNumber}: Kullanıcı kimliği alınamadı.`);
              continue;
            }
            try {
              if (pr.roles.includes('student') || pr.roles.includes('coach')) {
                await syncProfileCreate(newUserId);
              }
            } catch (syncErr) {
              fail += 1;
              rowErrors.push(
                `Satır ${pr.rowNumber}: Kullanıcı oluşturuldu ancak profil senkronu başarısız: ${
                  syncErr instanceof Error ? syncErr.message : 'bilinmeyen'
                }`
              );
              continue;
            }
            created += 1;
          }
        } catch (e) {
          fail += 1;
          rowErrors.push(
            `Satır ${pr.rowNumber}: ${e instanceof Error ? e.message : 'Kayıt oluşturulamadı.'}`
          );
        }
      }

      await refreshUsers();
      const errTail =
        rowErrors.length > 0
          ? ' ' +
            rowErrors.slice(0, 8).join(' ') +
            (rowErrors.length > 8 ? ` (+${rowErrors.length - 8} satır daha)` : '')
          : '';
      const ok = updated + created;
      setMessage({
        type: ok > 0 ? 'success' : 'error',
        text: `İçe aktarma bitti. Güncellenen: ${updated}, Yeni: ${created}, Hatalı: ${fail}.${errTail}`
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
      <div className="bg-white rounded-xl border border-gray-100 p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium text-slate-700">Excel / CSV ile kullanıcı ekle</label>
          <button
            type="button"
            onClick={() => downloadUserImportTemplateXlsx()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            <Download className="h-4 w-4" />
            Örnek Excel indir
          </button>
          <input
            type="file"
            accept=".xlsx,.xls,.csv,.txt"
            disabled={importBusy}
            onChange={(e) => void handleBulkUserImport(e.target.files?.[0] || null)}
            className="text-sm"
          />
        </div>
        <p className="text-xs text-slate-500">
          Önerilen başlık sırası: {USER_IMPORT_TEMPLATE_HEADERS.join(' · ')}. Başlıklar Türkçe veya İngilizce
          eşlenir; veli telefonu ile öğrenci telefonu farklı sütunlarda olmalıdır. GSM numaraları Excelde sayı olsa bile
          okunur (gerekirse başa 0 eklenir). Sınıf ve şube iki sütunda olabileceği gibi tek hücrede{' '}
          <span className="font-mono">11-A</span>, <span className="font-mono">11 / B</span> veya{' '}
          <span className="font-mono">12C</span> biçiminde de olabilir. Aynı e-posta ile tekrar yüklerseniz veya
          kurumda yalnızca bir kişiyle eşleşen aynı ad-soyad bulunursa kayıt güncellenir (yeni satır açılmaz). Rol
          için: öğrenci, öğretmen
          {currentUser?.role === 'admin' || currentUser?.role === 'super_admin' ? ', koç' : ''}; birden fazla rol için
          virgül, noktalı virgül veya <span className="font-mono">ve</span> ile ayırın (örn. öğretmen, koç). Şifre tekrarı
          doluysa birinciyle aynı olmalıdır.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-100">
          <div className="text-2xl font-bold text-slate-800">{stats.total}</div>
          <div className="text-sm text-gray-500">Toplam Kullanıcı</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100">
          <div className="text-2xl font-bold text-red-600">{stats.admins}</div>
          <div className="text-sm text-gray-500">Yönetici</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100">
          <div className="text-2xl font-bold text-blue-600">{stats.coaches}</div>
          <div className="text-sm text-gray-500">Koç</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100">
          <div className="text-2xl font-bold text-violet-600">{stats.teachers}</div>
          <div className="text-sm text-gray-500">Öğretmen</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100">
          <div className="text-2xl font-bold text-green-600">{stats.students}</div>
          <div className="text-sm text-gray-500">Öğrenci</div>
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

      {quota?.admin_limits && (
        <div
          className={`rounded-xl border p-4 ${
            (quota.usage_pct?.students ?? 0) >= 90 || (quota.usage_pct?.coaches ?? 0) >= 90
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
          {(quota.usage_pct?.students ?? 0) >= 90 || (quota.usage_pct?.coaches ?? 0) >= 90 ? (
            <p className="text-sm mt-2">
              Kota limitine yaklaşılıyor; ek kapasite veya yükseltme için yöneticinize danışın.
            </p>
          ) : null}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 border border-gray-100">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Ad veya e-posta ile ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          {/* Role Filter */}
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value as UserRole | 'all')}
            className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            <option value="all">Tüm Roller</option>
            {ROLES.map(role => (
              <option key={role.value} value={role.value}>{role.label}</option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
            className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            <option value="all">Tüm Durumlar</option>
            <option value="active">Aktif</option>
            <option value="expired">Süresi Dolmuş</option>
            <option value="inactive">Pasif</option>
          </select>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`p-4 rounded-lg flex items-center gap-2 ${
          message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          {message.text}
        </div>
      )}

      {/* Users Table — referans sütun düzeni */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] table-fixed">
            <thead className="bg-gray-50/90 border-b border-gray-100">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 w-[9%]">Adı</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 w-[9%]">Soyadı</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 w-[14%]">E-mail adresi</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 w-[11%]">Telefon numarası</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 w-[5%]">Sınıfı</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 w-[5%]">Şubesi</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 w-[13%]">Koçu</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 w-[9%]">Rolü</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 w-[8%]">Veli adı</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 w-[10%]">Veli telefon numarası</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 w-[8%]">Paket</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 w-[10%]">
                  Durum / Kaç gün kaldı
                </th>
                <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 w-[10%]">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredUsers.map(user => {
                const subStatus = getSubscriptionStatus(user);
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
                        students
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
                    <td className="px-3 py-3 text-sm text-gray-600 tabular-nums">
                      {studentMatch ? String(studentMatch.classLevel ?? '—') : '—'}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-600 uppercase">
                      {studentMatch?.school?.trim() ? studentMatch.school : '—'}
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
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${PACKAGES[(user.package || 'trial') as keyof typeof PACKAGES].color}`}
                      >
                        {PACKAGES[(user.package || 'trial') as keyof typeof PACKAGES].name}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${subStatus.className}`}
                      >
                        {subStatus.status}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {(currentUser?.role === 'super_admin' || currentUser?.role === 'admin') &&
                        canImpersonate(user) &&
                        !user.id.startsWith('demo-seed-') ? (
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
              })}
            </tbody>
          </table>
        </div>

        {filteredUsers.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>Kullanıcı bulunamadı</p>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-800">
                {modalMode === 'add'
                  ? 'Yeni Kullanıcı Ekle'
                  : selectedUser?.id.startsWith(COACH_PROFILE_ONLY_PREFIX)
                    ? 'Koç — giriş hesabı oluştur'
                    : 'Kullanıcı Düzenle'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
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
                        value={formData.birthDate}
                        onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Sınıfı</label>
                      <input
                        type="text"
                        value={formData.classLevel}
                        onChange={(e) => setFormData({ ...formData, classLevel: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                        placeholder="9, 10, 11..."
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Şubesi</label>
                      <input
                        type="text"
                        value={formData.branch}
                        onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                        placeholder="A"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Veli adı</label>
                      <input
                        type="text"
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

              {(currentUser?.role === 'admin' || currentUser?.role === 'super_admin') &&
                (formData.role === 'teacher' || formData.role === 'coach') && (
                  <div className="rounded-lg border border-violet-100 bg-violet-50/80 p-3 space-y-2">
                    <p className="text-xs text-violet-900 font-medium">
                      Ek roller (aynı kişide öğretmen ve koç birlikte)
                    </p>
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

              {modalMode === 'edit' &&
                formData.role === 'admin' &&
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

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
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
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
