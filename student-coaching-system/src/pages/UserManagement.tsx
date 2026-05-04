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
  UserCheck,
  Briefcase
} from 'lucide-react';
import { UserRole, ClassLevel, Coach, Student } from '../types';
import { db, QuotaSnapshot } from '../lib/database';
import { isSupabaseReady } from '../lib/supabase';
import { getAuthToken } from '../lib/session';
import { userRowToSystemUser, type UserRow } from '../lib/userRowToSystemUser';

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

// Paket bilgileri
const PACKAGES = {
  trial: { name: 'Deneme', color: 'bg-purple-100 text-purple-700', days: 7 },
  starter: { name: 'Başlangıç', color: 'bg-blue-100 text-blue-700', days: 30 },
  professional: { name: 'Profesyonel', color: 'bg-green-100 text-green-700', days: 365 },
  enterprise: { name: 'Kurumsal', color: 'bg-amber-100 text-amber-700', days: 365 }
};

// Rol bilgileri
const ROLES: { value: UserRole; label: string; color: string }[] = [
  { value: 'super_admin', label: 'Süper Admin', color: 'bg-amber-100 text-amber-800' },
  { value: 'admin', label: 'Yönetici', color: 'bg-red-100 text-red-700' },
  { value: 'coach', label: 'Koç', color: 'bg-blue-100 text-blue-700' },
  { value: 'teacher', label: 'Öğretmen', color: 'bg-violet-100 text-violet-800' },
  { value: 'student', label: 'Öğrenci', color: 'bg-green-100 text-green-700' }
];

export default function UserManagement() {
  const navigate = useNavigate();
  const { user: currentUser, effectiveUser, impersonate, canImpersonate } = useAuth();
  const {
    addStudent,
    addCoach,
    students,
    coaches,
    institution,
    institutions,
    activeInstitutionId,
    deleteStudent,
    deleteCoach
  } = useApp();

  useEffect(() => {
    const r = effectiveUser?.role || currentUser?.role;
    if (!r || !['super_admin', 'admin', 'teacher'].includes(r)) {
      navigate('/');
    }
  }, [currentUser, effectiveUser, navigate]);

  const { getAllUsers, createUser, updateUser, deleteUser, getUserById } = useAuth();

  // State
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<UserRole | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'expired' | 'inactive'>('all');
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [selectedUser, setSelectedUser] = useState<SystemUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [quota, setQuota] = useState<QuotaSnapshot | null>(null);

  const selectableRoles = useMemo(() => {
    const r = effectiveUser?.role;
    if (!r) return ROLES.filter((x) => x.value !== 'super_admin');
    if (r === 'teacher') return ROLES.filter((x) => x.value === 'student');
    if (r === 'admin')
      return ROLES.filter((x) => ['coach', 'teacher', 'student'].includes(x.value));
    if (r === 'super_admin') return ROLES.filter((x) => x.value !== 'super_admin');
    return ROLES.filter((x) => x.value !== 'super_admin');
  }, [effectiveUser]);

  const refreshUsers = useCallback(async () => {
    if (getAuthToken() && isSupabaseReady) {
      try {
        const rows = await db.getUsers();
        const fromApi = rows.map((row) => userRowToSystemUser(row, { coaches, students }));
        const stubs = coachProfilesWithoutLoginUser(coaches, rows as UserRow[]);
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
  }, [getAllUsers, coaches, students]);

  useEffect(() => {
    void refreshUsers();
  }, [refreshUsers]);

  useEffect(() => {
    if (
      !showModal ||
      modalMode !== 'edit' ||
      !selectedUser ||
      selectedUser.role !== 'admin' ||
      effectiveUser?.role !== 'super_admin' ||
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
    effectiveUser?.role
  ]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!getAuthToken() || !isSupabaseReady || !effectiveUser) return;
      const inst =
        effectiveUser.role === 'super_admin'
          ? activeInstitutionId || institution?.id || undefined
          : effectiveUser.institutionId || activeInstitutionId || institution?.id || undefined;
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
  }, [effectiveUser, activeInstitutionId, institution?.id]);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    role: 'student' as UserRole,
    assignCoachId: '',
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
    // Arama
    if (searchTerm && !user.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !user.email.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }

    // Rol filtresi
    if (filterRole !== 'all' && user.role !== filterRole) {
      return false;
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

  // Gün sayısını hesapla
  const getDaysLeft = (endDate?: string) => {
    if (!endDate) return null;
    const end = new Date(endDate);
    const now = new Date();
    const diff = end.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  // Abonelik durumunu al
  const getSubscriptionStatus = (user: SystemUser) => {
    if (user.isActive === false) {
      return { status: 'Pasif', color: 'text-gray-500', bg: 'bg-gray-100' };
    }

    const daysLeft = getDaysLeft(user.endDate);
    if (daysLeft === null) {
      return { status: 'Süresiz', color: 'text-blue-500', bg: 'bg-blue-100' };
    }
    if (daysLeft <= 0) {
      return { status: 'Süresi Dolmuş', color: 'text-red-500', bg: 'bg-red-100' };
    }
    if (daysLeft <= 7) {
      return { status: `${daysLeft} gün kaldı`, color: 'text-amber-500', bg: 'bg-amber-100' };
    }
    return { status: `${daysLeft} gün kaldı`, color: 'text-green-500', bg: 'bg-green-100' };
  };

  // Modal aç
  const openModal = (mode: 'add' | 'edit', user?: SystemUser) => {
    setModalMode(mode);
    setSelectedUser(user || null);
    setMessage(null);

    if (mode === 'edit' && user) {
      const fullUser = getUserById(user.id);
      setFormData({
        name: fullUser?.name || user.name,
        email: fullUser?.email || user.email,
        phone: fullUser?.phone || user.phone || '',
        password: '',
        role: user.role,
        assignCoachId: '',
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
        name: '',
        email: '',
        phone: '',
        password: '',
        role: 'student',
        assignCoachId: '',
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
            coachRow?.institutionId ||
            activeInstitutionId ||
            institution?.id ||
            effectiveUser?.institutionId ||
            null;
          try {
            await db.createUser({
              email: formData.email.toLowerCase().trim(),
              name: formData.name.trim(),
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

        const patch: Record<string, unknown> = {
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          role: formData.role,
          package: formData.package,
          startDate: new Date(formData.startDate).toISOString(),
          endDate: formData.endDate ? new Date(formData.endDate).toISOString() : undefined,
          isActive: formData.isActive
        };
        if (formData.password.trim().length >= 6) patch.password = formData.password;

        const result = await updateUser(selectedUser.id, patch);
        let quotaNote = '';
        if (
          result.success &&
          effectiveUser?.role === 'super_admin' &&
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
        setMessage({
          type: result.success ? 'success' : 'error',
          text: result.message + quotaNote
        });
        if (result.success) {
          await refreshUsers();
          setShowModal(false);
        }
      } else {
        if (
          formData.role === 'student' &&
          effectiveUser?.role === 'teacher' &&
          !String(formData.assignCoachId || '').trim()
        ) {
          setMessage({ type: 'error', text: 'Öğrenci oluşturmak için bir koç seçmelisiniz.' });
          setLoading(false);
          return;
        }

        const instFallback = activeInstitutionId || institution?.id;
        let resolvedInstitution =
          effectiveUser?.role === 'teacher'
            ? effectiveUser.institutionId
            : instFallback || effectiveUser?.institutionId;
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

        if (getAuthToken() && isSupabaseReady) {
          try {
            const row = await db.createUser(
              {
                email: formData.email.toLowerCase().trim(),
                name: formData.name.trim(),
                phone: formData.phone?.trim() || null,
                role: formData.role as UserRow['role'],
                password_hash: pwdPlain,
                institution_id: (resolvedInstitution ?? null) as string | null,
                is_active: formData.isActive !== false,
                package: formData.package,
                start_date: new Date(formData.startDate).toISOString(),
                end_date: formData.endDate ? new Date(formData.endDate).toISOString() : null,
                created_by: null
              },
              effectiveUser?.role === 'super_admin' && formData.role === 'admin'
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

            const instId = resolvedInstitution || instFallback || effectiveUser?.institutionId;
            const newUserId = row.id;
            try {
              if (formData.role === 'student') {
                await addStudent({
                  id: newUserId,
                  name: formData.name,
                  email: formData.email,
                  password: formData.password || undefined,
                  phone: formData.phone || '',
                  parentPhone: formData.phone || '',
                  classLevel: 9 as ClassLevel,
                  coachId: formData.assignCoachId || undefined,
                  institutionId: instId || undefined,
                  createdAt: new Date().toISOString()
                });
              } else if (formData.role === 'coach') {
                await addCoach({
                  id: newUserId,
                  name: formData.name,
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
              else if (formData.role === 'coach') navigate('/coaches');
              else if (formData.role === 'teacher') navigate('/dashboard');
            }, 1500);
          } catch (err) {
            setMessage({
              type: 'error',
              text: err instanceof Error ? err.message : 'Kullanıcı oluşturulamadı.'
            });
          }
        } else {
          const createPayload: Record<string, unknown> = {
            name: formData.name,
            email: formData.email,
            phone: formData.phone,
            password: formData.password,
            role: formData.role,
            package: formData.package,
            startDate: new Date(formData.startDate).toISOString(),
            endDate: formData.endDate ? new Date(formData.endDate).toISOString() : undefined,
            isActive: formData.isActive,
            institutionId: resolvedInstitution || undefined,
            institution_id: resolvedInstitution || undefined
          };

          if (effectiveUser?.role === 'super_admin' && formData.role === 'admin') {
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

            const instId = resolvedInstitution || instFallback || effectiveUser?.institutionId;
            const newUserId = result.userId || `user-${Date.now()}`;
            try {
              if (formData.role === 'student') {
                await addStudent({
                  id: newUserId,
                  name: formData.name,
                  email: formData.email,
                  password: formData.password || undefined,
                  phone: formData.phone || '',
                  parentPhone: formData.phone || '',
                  classLevel: 9 as ClassLevel,
                  coachId: formData.assignCoachId || undefined,
                  institutionId: instId || undefined,
                  createdAt: new Date().toISOString()
                });
              } else if (formData.role === 'coach') {
                await addCoach({
                  id: newUserId,
                  name: formData.name,
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
              if (formData.role === 'student') {
                navigate('/students');
              } else if (formData.role === 'coach') {
                navigate('/coaches');
              } else if (formData.role === 'teacher') {
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
    const result = await deleteUser(userId);
    if (result.success && target?.email) {
      const em = target.email.toLowerCase();
      const st = students.find(s => s.email.toLowerCase() === em);
      const ch = coaches.find(c => c.email.toLowerCase() === em);
      if (st) await deleteStudent(st.id);
      if (ch) await deleteCoach(ch.id);
    }
    setMessage({ type: result.success ? 'success' : 'error', text: result.message });
    void refreshUsers();
  };

  const handleLoginAs = (target: SystemUser) => {
    const result = impersonate(target);
    setMessage({ type: result.success ? 'success' : 'error', text: result.message });
    if (!result.success) return;
    if (target.role === 'admin' || target.role === 'super_admin') navigate('/dashboard');
    else if (target.role === 'teacher') navigate('/dashboard');
    else if (target.role === 'coach') navigate('/coach-dashboard');
    else navigate('/student-dashboard');
  };

  // İstatistikler
  const stats = {
    total: users.length,
    admins: users.filter(u => u.role === 'admin').length,
    coaches: users.filter(u => u.role === 'coach').length,
    teachers: users.filter(u => u.role === 'teacher').length,
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

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Kullanıcı</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Rol</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Paket</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Başlangıç</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Bitiş</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Durum</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-600">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredUsers.map(user => {
                const subStatus = getSubscriptionStatus(user);
                const daysLeft = getDaysLeft(user.endDate);

                return (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div>
                        <div className="font-medium text-gray-800">{user.name}</div>
                        <div className="text-sm text-gray-500">{user.email}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${ROLES.find(r => r.value === user.role)?.color || 'bg-gray-100 text-gray-700'}`}>
                        {ROLES.find(r => r.value === user.role)?.label || user.role}
                        {user.id.startsWith(COACH_PROFILE_ONLY_PREFIX) ? (
                          <span className="ml-1 font-normal text-amber-700">· giriş yok</span>
                        ) : null}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${PACKAGES[(user.package || 'trial') as keyof typeof PACKAGES].color}`}>
                        {PACKAGES[(user.package || 'trial') as keyof typeof PACKAGES].name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {user.startDate ? new Date(user.startDate).toLocaleDateString('tr-TR') : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {user.endDate ? new Date(user.endDate).toLocaleDateString('tr-TR') : 'Süresiz'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${subStatus.bg} ${subStatus.color}`}>
                        {subStatus.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openModal('edit', user)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Düzenle"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        {effectiveUser?.role && (effectiveUser.role === 'super_admin' || effectiveUser.role === 'admin') && canImpersonate(user) && (
                          <button
                            onClick={() => handleLoginAs(user)}
                            className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="Login As"
                          >
                            <UserCheck className="w-4 h-4" />
                          </button>
                        )}
                        {!user.id.startsWith('demo-seed-') && effectiveUser?.role !== 'teacher' && (
                          <button
                            onClick={() => handleDelete(user.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Sil"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
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
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <UserCog className="w-4 h-4 inline mr-1" />
                  Ad Soyad *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="Adınız Soyadınız"
                />
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

              {modalMode === 'edit' &&
                formData.role === 'admin' &&
                effectiveUser?.role === 'super_admin' && (
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
                effectiveUser?.role === 'super_admin' && (
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

              {modalMode === 'add' && formData.role === 'student' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Briefcase className="w-4 h-4 inline mr-1" />
                    Öğretmen/Koç {effectiveUser?.role === 'teacher' ? '*' : ''}
                  </label>
                  <select
                    value={formData.assignCoachId}
                    onChange={(e) => setFormData({ ...formData, assignCoachId: e.target.value })}
                    required={effectiveUser?.role === 'teacher'}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    <option value="">Koç seçin</option>
                    {coaches.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Öğretmen hesapları için koç seçimi zorunludur (kurum içi kota).
                  </p>
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
