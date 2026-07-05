// Türkçe: Öğrenci Yönetimi Sayfası
import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { studentToImpersonationTarget } from '../lib/studentImpersonation';
import {
  Student,
  ClassLevel,
  CLASS_LEVELS,
  PROGRAM_OPTIONS,
  ProgramName,
  parseClassLevelFromForm,
  formatClassLevelLabel,
  inferProgramName,
  StudentTeacherLessonQuota
} from '../types';
import { resolveCoachRecordId } from '../lib/coachResolve';
import { sortByFirstName } from '../lib/personNameSort';
import { db } from '../lib/database';
import {
  AppModal,
  AppModalBody,
  AppModalFooter,
  AppModalForm,
  AppModalHeader
} from '../components/ui/AppModal';
import {
  GraduationCap,
  Search,
  Edit2,
  Trash2,
  X,
  Check,
  Users,
  ChevronDown,
  Phone,
  Mail,
  Link2,
  Eye,
  Plus,
  Loader2,
  LogIn,
  Calendar,
  Briefcase
} from 'lucide-react';

const PACKAGES = {
  trial: { name: 'Deneme', days: 14 },
  starter: { name: 'Başlangıç', days: 30 },
  professional: { name: 'Profesyonel', days: 365 },
  enterprise: { name: 'Kurumsal', days: 365 }
} as const;

type PackageKey = keyof typeof PACKAGES;

export default function Students() {
  const { user, effectiveUser, impersonate, canImpersonate } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    students,
    coaches,
    addStudent,
    updateStudent,
    deleteStudent,
    getStudentStats,
    institution,
    institutions,
    activeInstitutionId
  } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterClass, setFilterClass] = useState<ClassLevel | 'all'>('all');
  const [filterProgram, setFilterProgram] = useState<ProgramName | 'all'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [saving, setSaving] = useState(false);
  const [enterAsBusyId, setEnterAsBusyId] = useState<string | null>(null);

  const [lessonQuotas, setLessonQuotas] = useState<StudentTeacherLessonQuota[]>([]);
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [platformStaff, setPlatformStaff] = useState<{ id: string; name: string; role: string }[]>([]);
  const [quotaTeacherId, setQuotaTeacherId] = useState('');
  const [quotaCreditsInput, setQuotaCreditsInput] = useState('');
  const [quotaSaving, setQuotaSaving] = useState(false);

  const filteredStudents = useMemo(() => {
    const filtered = students.filter((student) => {
      const name = (student.name || '').toLowerCase();
      const email = (student.email || '').toLowerCase();
      const phone = student.phone || '';
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        name.includes(q) || email.includes(q) || phone.includes(searchTerm);
      const matchesClass = filterClass === 'all' || student.classLevel === filterClass;
      const studentProgram = student.programName || inferProgramName(student.classLevel);
      const matchesProgram = filterProgram === 'all' || studentProgram === filterProgram;
      return matchesSearch && matchesClass && matchesProgram;
    });
    return sortByFirstName(filtered, (s) => s.name);
  }, [students, searchTerm, filterClass, filterProgram]);

  // Yeni öğrenci formu
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    parentPhone: '',
    parentName: '',
    birthDate: '',
    school: '',
    classLevel: 9 as ClassLevel,
    programName: 'tyt' as ProgramName,
    coachId: '',
    groupName: '',
    institutionId: '',
    whatsappAutomationEnabled: true,
    package: 'trial' as PackageKey,
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    isActive: true
  });

  // Yeni kayıt sonrası gösterilecek şifre
  const canEditStudents =
    !!effectiveUser &&
    (effectiveUser.role === 'super_admin' || effectiveUser.role === 'admin' || effectiveUser.role === 'coach');

  const canAssignCoach =
    !!effectiveUser &&
    (effectiveUser.role === 'super_admin' || effectiveUser.role === 'admin');

  const canPickInstitution = effectiveUser?.role === 'super_admin';

  const canEnterStudentAccount = (student: Student) => {
    if (!user || !student.email?.trim()) return false;
    return canImpersonate(studentToImpersonationTarget(student));
  };

  const handleEnterAsStudent = async (student: Student) => {
    if (!student.email?.trim()) {
      alert('Öğrencinin e-posta adresi yok; hesaba geçilemez.');
      return;
    }
    setEnterAsBusyId(student.id);
    try {
      const r = await impersonate(studentToImpersonationTarget(student));
      if (!r.success) {
        alert(r.message || 'Öğrenci hesabına geçilemedi.');
        return;
      }
      navigate('/weekly-planner');
    } finally {
      setEnterAsBusyId(null);
    }
  };

  useEffect(() => {
    if (!selectedStudent) {
      setLessonQuotas([]);
      setPlatformStaff([]);
      setQuotaTeacherId('');
      setQuotaCreditsInput('');
      return;
    }
    let cancelled = false;
    (async () => {
      setQuotaLoading(true);
      try {
        const [users, qrows] = await Promise.all([
          db.getUsers(),
          db.getStudentTeacherLessonQuotas(selectedStudent.id)
        ]);
        if (cancelled) return;
        const inst = selectedStudent.institutionId;
        const staff = users.filter((u) => {
          if (!['teacher', 'coach', 'admin'].includes(String(u.role))) return false;
          if (effectiveUser?.role === 'super_admin') return true;
          if (!inst) return true;
          return u.institution_id === inst || u.institution_id == null;
        });
        setPlatformStaff(
          staff
            .map((u) => ({ id: u.id, name: u.name || u.email || u.id, role: String(u.role) }))
            .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
        );
        setLessonQuotas(qrows);
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setLessonQuotas([]);
          setPlatformStaff([]);
        }
      } finally {
        if (!cancelled) setQuotaLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedStudent?.id, selectedStudent?.institutionId, effectiveUser?.role]);

  useEffect(() => {
    if (!searchParams.has('add') || searchParams.get('add') !== '1' || !canEditStudents) return;
    setFormData({
      name: '',
      email: '',
      password: '',
      phone: '',
      parentPhone: '',
      parentName: '',
      birthDate: '',
      school: '',
      classLevel: 9 as ClassLevel,
      programName: 'tyt' as ProgramName,
      coachId: '',
      groupName: '',
      institutionId: '',
      whatsappAutomationEnabled: true,
      package: 'trial',
      startDate: new Date().toISOString().split('T')[0],
      endDate: '',
      isActive: true
    });
    setEditingStudent(null);
    setShowAddModal(true);
    const next = new URLSearchParams(searchParams);
    next.delete('add');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, canEditStudents]);

  /** Kullanıcı yönetiminden "profil" ile gelindiğinde öğrenci kartını aç */
  useEffect(() => {
    const focusId = (location.state as { focusStudentId?: string } | null)?.focusStudentId;
    if (!focusId) return;
    const st = students.find((s) => s.id === focusId);
    if (!st) return;
    setSelectedStudent(st);
    navigate(`${location.pathname}${location.search}`, { replace: true, state: {} });
  }, [students, location.state, location.pathname, location.search, navigate]);

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      password: '',
      phone: '',
      parentPhone: '',
      parentName: '',
      birthDate: '',
      school: '',
      classLevel: 9 as ClassLevel,
      programName: 'tyt' as ProgramName,
      coachId: '',
      groupName: '',
      institutionId: '',
      whatsappAutomationEnabled: true,
      package: 'trial',
      startDate: new Date().toISOString().split('T')[0],
      endDate: '',
      isActive: true
    });
  };

  const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) {
      if (error.message && error.message !== '[object Object]') return error.message;
      const maybeAny = error as unknown as { detail?: unknown; error?: unknown };
      if (typeof maybeAny.detail === 'string') return maybeAny.detail;
      if (typeof maybeAny.error === 'string') return maybeAny.error;
    }
    if (typeof error === 'string') return error;
    if (error && typeof error === 'object') {
      const rec = error as Record<string, unknown>;
      if (typeof rec.message === 'string') return rec.message;
      if (typeof rec.detail === 'string') return rec.detail;
      if (typeof rec.error === 'string') return rec.error;
      try {
        return JSON.stringify(error);
      } catch {
        return 'Beklenmeyen bir hata oluştu.';
      }
    }
    return 'Beklenmeyen bir hata oluştu.';
  };

  const handlePackageChange = (pkg: PackageKey) => {
    const days = PACKAGES[pkg].days;
    const end = new Date(formData.startDate || new Date().toISOString().split('T')[0]);
    end.setDate(end.getDate() + days);
    setFormData({
      ...formData,
      package: pkg,
      endDate: end.toISOString().split('T')[0]
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const normalizedEmail = formData.email.trim().toLowerCase();
      const duplicate = students.some(
        (s) => s.email.trim().toLowerCase() === normalizedEmail && (!editingStudent || s.id !== editingStudent.id)
      );
      if (duplicate) {
        alert('Bu e-posta ile kayıtlı bir öğrenci zaten var. Lütfen farklı bir e-posta girin.');
        return;
      }

      if (editingStudent) {
        setSaving(true);
        await updateStudent(editingStudent.id, {
          name: formData.name.trim(),
          email: normalizedEmail,
          phone: formData.phone.trim(),
          parentPhone: formData.parentPhone.trim(),
          parentName: formData.parentName.trim() || undefined,
          birthDate: formData.birthDate.trim() || undefined,
          school: formData.school.trim() || undefined,
          classLevel: formData.classLevel,
          coachId: canAssignCoach ? formData.coachId.trim() || undefined : editingStudent.coachId,
          institutionId: canPickInstitution ? formData.institutionId.trim() || undefined : editingStudent.institutionId,
          programId: formData.programName,
          whatsappAutomationEnabled: formData.whatsappAutomationEnabled,
          package: formData.package,
          startDate: formData.startDate,
          endDate: formData.endDate || undefined,
          isActive: formData.isActive,
          ...(formData.password.trim().length >= 6 ? { password: formData.password.trim() } : {})
        });
        setEditingStudent(null);
      } else {
        const resolvedCoach =
          effectiveUser?.role === 'coach'
            ? resolveCoachRecordId(
                effectiveUser.role,
                effectiveUser.coachId,
                effectiveUser.email,
                coaches
              )
            : formData.coachId.trim();
        if (!resolvedCoach) {
          alert(
            effectiveUser?.role === 'coach'
              ? 'Profilinize koç bağlantısı atanmamış. Yönetici ile iletişime geçin.'
              : 'Yeni öğrenciyi bir koça atamalısınız.'
          );
          return;
        }
        if (formData.password.trim().length < 6) {
          alert('Giriş şifresi en az 6 karakter olmalıdır.');
          return;
        }
        const resolvedInstitution =
          formData.institutionId.trim() ||
          activeInstitutionId ||
          institution?.id ||
          effectiveUser?.institutionId ||
          undefined;
        if (!resolvedInstitution) {
          alert('Kurum bilgisi bulunamadı. Aktif kurumu seçin veya destek ile iletişime geçin.');
          return;
        }
        setSaving(true);
        await addStudent({
          id: '',
          name: formData.name.trim(),
          email: normalizedEmail,
          password: formData.password.trim(),
          phone: formData.phone.trim(),
          parentPhone: formData.parentPhone.trim(),
          parentName: formData.parentName.trim() || undefined,
          birthDate: formData.birthDate.trim() || undefined,
          school: formData.school.trim() || undefined,
          classLevel: formData.classLevel,
          coachId: resolvedCoach || undefined,
          institutionId: resolvedInstitution,
          programId: formData.programName,
          whatsappAutomationEnabled: formData.whatsappAutomationEnabled,
          createdAt: new Date().toISOString()
        });
        alert(
          `Öğrenci eklendi.\n\nE-posta: ${normalizedEmail}\nŞifre: ${formData.password.trim()}`
        );
      }
      setShowAddModal(false);
      resetForm();
    } catch (error) {
      alert(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (student: Student) => {
    if (!canEditStudents) return;
    let pkg: PackageKey = 'trial';
    let startDate = new Date().toISOString().split('T')[0];
    let endDate = '';
    let isActive = true;
    try {
      const u = await db.getUserByEmail(student.email.trim().toLowerCase());
      if (u) {
        const rawPkg = String(u.package || 'trial') as PackageKey;
        pkg = rawPkg in PACKAGES ? rawPkg : 'trial';
        startDate = u.start_date?.split('T')[0] || startDate;
        endDate = u.end_date?.split('T')[0] || '';
        isActive = u.is_active !== false;
      }
    } catch {
      /* kullanıcı kaydı yoksa varsayılan abonelik alanları */
    }
    setFormData({
      name: student.name,
      email: student.email,
      password: student.password || '',
      phone: student.phone,
      parentPhone: student.parentPhone,
      parentName: student.parentName || '',
      birthDate: student.birthDate?.split('T')[0] || '',
      school: student.school || '',
      classLevel: student.classLevel ?? (9 as ClassLevel),
      programName: student.programName || inferProgramName(student.classLevel),
      coachId: student.coachId || '',
      groupName: student.groupName || '',
      institutionId: student.institutionId || '',
      whatsappAutomationEnabled: student.whatsappAutomationEnabled !== false,
      package: pkg,
      startDate,
      endDate,
      isActive
    });
    setEditingStudent(student);
    setShowAddModal(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Bu öğrenciyi silmek istediğinizden emin misiniz?')) {
      deleteStudent(id);
    }
  };

  const getTeacherName = (coachId?: string) => {
    if (!coachId?.trim()) return 'Atanmadı';
    const id = coachId.trim();
    const teacher = coaches.find((t) => t.id === id);
    if (teacher) return teacher.name;
    return `Koç (${id.slice(0, 8)}…)`;
  };

  const platformUserLabel = (userId: string) =>
    platformStaff.find((s) => s.id === userId)?.name || userId;

  const handleSaveLessonQuota = async () => {
    if (!selectedStudent || !quotaTeacherId.trim()) {
      alert('Öğretmen seçin.');
      return;
    }
    const raw = quotaCreditsInput.trim();
    const credits_total = raw === '' ? null : Number(raw);
    if (credits_total !== null && (Number.isNaN(credits_total) || credits_total < 0)) {
      alert('Ders kotası boş (sınırsız) veya 0 ve üzeri bir tam sayı olmalıdır.');
      return;
    }
    setQuotaSaving(true);
    try {
      const row = await db.upsertStudentTeacherLessonQuota({
        student_id: selectedStudent.id,
        teacher_id: quotaTeacherId.trim(),
        credits_total
      });
      setLessonQuotas((prev) => {
        const rest = prev.filter((p) => p.teacher_id !== row.teacher_id);
        return [...rest, row];
      });
      setQuotaTeacherId('');
      setQuotaCreditsInput('');
    } catch (e) {
      alert(getErrorMessage(e));
    } finally {
      setQuotaSaving(false);
    }
  };

  const handleDeleteLessonQuota = async (teacherId: string) => {
    if (!selectedStudent) return;
    if (!confirm('Bu öğretmen için ders kotasını kaldırmak istiyor musunuz?')) return;
    try {
      await db.deleteStudentTeacherLessonQuota(selectedStudent.id, teacherId);
      setLessonQuotas((prev) => prev.filter((p) => p.teacher_id !== teacherId));
    } catch (e) {
      alert(getErrorMessage(e));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Öğrenci Yönetimi</h2>
          <p className="text-gray-500">Toplam {students.length} öğrenci kayıtlı</p>
          <p className="text-sm text-gray-500 mt-1">
            Koç hesapları buradan şifre belirleyerek öğrenci ekleyebilir; müdür ve süper admin tüm süreci kullanıcı veya öğrenci üzerinden yönetir.
            {user?.role === 'coach' ? (
              <span className="block mt-1 text-violet-700">
                Mor giriş simgesiyle öğrencinin paneline geçebilir; üst çubuktan «Geri dön» ile koç panelinize dönersiniz.
              </span>
            ) : null}
          </p>
        </div>
        {canEditStudents && (
          <button
            type="button"
            onClick={() => {
              resetForm();
              setEditingStudent(null);
              setShowAddModal(true);
            }}
            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Öğrenci ekle
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Arama */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Öğrenci ara (isim, email, telefon)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
          </div>

          {/* Sınıf Filtresi */}
          <div className="relative">
            <select
              value={filterClass === 'all' ? 'all' : String(filterClass)}
              onChange={(e) =>
                setFilterClass(e.target.value === 'all' ? 'all' : parseClassLevelFromForm(e.target.value))
              }
              className="appearance-none px-4 py-2 pr-10 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent bg-white"
            >
              <option value="all">Tüm Sınıflar</option>
              {CLASS_LEVELS.map((level) => (
                <option key={String(level.value)} value={String(level.value)}>
                  {level.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>

          <div className="relative">
            <select
              value={filterProgram}
              onChange={(e) => setFilterProgram(e.target.value as ProgramName | 'all')}
              className="appearance-none px-4 py-2 pr-10 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent bg-white"
            >
              <option value="all">Tüm Programlar</option>
              {PROGRAM_OPTIONS.map((program) => (
                <option key={program.value} value={program.value}>
                  {program.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Öğrenci Listesi */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredStudents.map((student) => {
          const stats = getStudentStats(student.id);
          return (
            <div
              key={student.id}
              id={`student-card-${student.id}`}
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                    {student.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-800">{student.name}</h3>
                    <p className="text-sm text-gray-500">{formatClassLevelLabel(student.classLevel)}</p>
                    <p className="text-xs text-indigo-600 font-medium">{(student.programName || inferProgramName(student.classLevel)).toUpperCase()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {canEnterStudentAccount(student) ? (
                    <button
                      type="button"
                      title="Öğrenci hesabına gir"
                      disabled={enterAsBusyId === student.id}
                      onClick={() => void handleEnterAsStudent(student)}
                      className="p-1.5 text-violet-600 hover:text-violet-800 hover:bg-violet-50 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {enterAsBusyId === student.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <LogIn className="w-4 h-4" />
                      )}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setSelectedStudent(student)}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  {canEditStudents ? (
                    <>
                      <button
                        onClick={() => handleEdit(student)}
                        className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(student.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              {/* Info */}
              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Phone className="w-4 h-4" />
                  {student.phone}
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Users className="w-4 h-4" />
                  {getTeacherName(student.coachId)}
                </div>
                {student.groupName && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Link2 className="w-4 h-4" />
                    {student.groupName}
                  </div>
                )}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2 pt-4 border-t border-gray-100">
                <div className="text-center">
                  <p className="text-lg font-bold text-slate-800">{stats.totalTarget}</p>
                  <p className="text-xs text-gray-500">Koç hedefi</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-slate-800">{stats.totalSolved}</p>
                  <p className="text-xs text-gray-500">Çözülen</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-slate-800">%{stats.realizationRate}</p>
                  <p className="text-xs text-gray-500">Oran</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {filteredStudents.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <GraduationCap className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-800 mb-2">Öğrenci Bulunamadı</h3>
          <p className="text-gray-500 mb-4">
            {searchTerm || filterClass !== 'all'
              ? 'Arama kriterlerinize uygun öğrenci bulunamadı.'
              : 'Henüz öğrenci eklenmemiş.'}
          </p>
          {!searchTerm && filterClass === 'all' && canEditStudents && (
            <p className="text-sm text-gray-600">
              Henüz kayıt yoksa{' '}
              <span className="font-semibold text-slate-700">Öğrenci ekle</span> ile giriş e-postası ve şifreyi oluşturun.
            </p>
          )}
        </div>
      )}

      <AppModal
        open={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setEditingStudent(null);
          resetForm();
        }}
        panelClassName="max-w-3xl"
      >
        <AppModalHeader>
          <h3 className="text-xl font-bold text-slate-800">
            {editingStudent ? 'Öğrenci düzenle' : 'Öğrenci ekle'}
          </h3>
          <button
            type="button"
            onClick={() => {
              setShowAddModal(false);
              setEditingStudent(null);
              resetForm();
            }}
            className="icon-tap-btn hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </AppModalHeader>

        <AppModalForm onSubmit={handleSubmit}>
          <AppModalBody className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* İsim */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ad Soyad *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder="Öğrenci adı"
                  />
                </div>

                {/* E-posta */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">E-posta *</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder="ogrenci@email.com"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Öğrenci bu e-posta ve aşağıdaki şifre ile giriş yapar (giriş ekranı ile aynı).
                  </p>
                </div>

                {/* Şifre (giriş) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Giriş şifresi {editingStudent ? '(isteğe bağlı)' : '*'}
                  </label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    required={!editingStudent}
                    minLength={editingStudent ? 0 : 6}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder={editingStudent ? 'Değiştirmek için yazın (en az 6 karakter)' : 'En az 6 karakter'}
                  />
                </div>

                {/* Telefon */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Telefon *</label>
                  <input
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder="0532 123 45 67"
                  />
                </div>

                {/* Veli Telefonu */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Veli Telefonu</label>
                  <input
                    type="tel"
                    value={formData.parentPhone}
                    onChange={(e) => setFormData({ ...formData, parentPhone: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder="0533 987 65 43"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Veli Adı</label>
                  <input
                    type="text"
                    value={formData.parentName}
                    onChange={(e) => setFormData({ ...formData, parentName: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder="Veli adı soyadı"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Doğum Tarihi</label>
                  <input
                    type="date"
                    value={formData.birthDate}
                    onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Okul / Şube</label>
                  <input
                    type="text"
                    value={formData.school}
                    onChange={(e) => setFormData({ ...formData, school: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder="Okul adı veya şube"
                  />
                </div>

                {/* Sınıf */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sınıf *</label>
                  <select
                    required
                    value={String(formData.classLevel)}
                    onChange={(e) =>
                      setFormData({ ...formData, classLevel: parseClassLevelFromForm(e.target.value) })
                    }
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    {CLASS_LEVELS.map((level) => (
                      <option key={String(level.value)} value={String(level.value)}>
                        {level.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Program */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Program *</label>
                  <select
                    required
                    value={formData.programName}
                    onChange={(e) => setFormData({ ...formData, programName: e.target.value as ProgramName })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    {PROGRAM_OPTIONS.map((program) => (
                      <option key={program.value} value={program.value}>
                        {program.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Öğretmen / Koç */}
                {!canAssignCoach ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Koç</label>
                    <input
                      type="text"
                      value={
                        coaches.find(
                          c =>
                            c.id ===
                            (resolveCoachRecordId(
                              effectiveUser?.role,
                              effectiveUser?.coachId,
                              effectiveUser?.email,
                              coaches
                            ) || formData.coachId)
                        )?.name || 'Siz'
                      }
                      readOnly
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-700"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Koç {editingStudent ? '' : '*'}
                    </label>
                    <select
                      value={formData.coachId}
                      onChange={(e) => setFormData({ ...formData, coachId: e.target.value })}
                      required={!editingStudent}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                    >
                      <option value="">{editingStudent ? 'Koç seçin veya kaldırın' : 'Koç seçin'}</option>
                      {(() => {
                        const ids = new Set(coaches.map((c) => c.id));
                        const orphan =
                          formData.coachId.trim() && !ids.has(formData.coachId.trim())
                            ? formData.coachId.trim()
                            : '';
                        return orphan ? (
                          <option value={orphan}>
                            Mevcut atanmış koç (liste dışı ID · {orphan.slice(0, 8)}…)
                          </option>
                        ) : null;
                      })()}
                      {coaches.map((teacher) => (
                        <option key={teacher.id} value={teacher.id}>
                          {teacher.name}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-slate-500">
                      Seçili koç: <span className="font-medium text-slate-700">{getTeacherName(formData.coachId)}</span>
                    </p>
                  </div>
                )}

                {/* Kurum */}
                {canPickInstitution ? (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Kurum</label>
                    <select
                      value={formData.institutionId}
                      onChange={(e) => setFormData({ ...formData, institutionId: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
                    >
                      <option value="">Kurum seçin</option>
                      {institutions.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Kurum</label>
                    <input
                      type="text"
                      readOnly
                      value={
                        institutions.find((i) => i.id === (formData.institutionId || institution?.id))?.name ||
                        institution?.name ||
                        '—'
                      }
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-700"
                    />
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50/90 p-4 space-y-3">
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
                    Otomatik WhatsApp mesajları
                    <span className="block text-xs text-gray-500 mt-0.5">
                      Kapalıysa günlük rapor ve otomasyon mesajları bu öğrenciye gitmez.
                    </span>
                  </span>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Briefcase className="w-4 h-4 inline mr-1" />
                  Abonelik Paketi
                </label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {(Object.entries(PACKAGES) as [PackageKey, (typeof PACKAGES)[PackageKey]][]).map(
                    ([key, pkg]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handlePackageChange(key)}
                        className={`p-3 rounded-lg border-2 text-left transition-all ${
                          formData.package === key
                            ? 'border-red-500 bg-red-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="font-medium text-sm">{pkg.name}</div>
                        <div className="text-xs text-gray-500">{pkg.days} gün</div>
                      </button>
                    )
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Calendar className="w-4 h-4 inline mr-1" />
                    Başlangıç
                  </label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Calendar className="w-4 h-4 inline mr-1" />
                    Bitiş
                  </label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                      className="rounded border-gray-300"
                    />
                    Hesap aktif
                  </label>
                </div>
              </div>
          </AppModalBody>

          <AppModalFooter>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingStudent(null);
                    resetForm();
                  }}
                  className="min-h-[44px] px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[44px] px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  {editingStudent ? 'Güncelle' : 'Kaydet'}
                </button>
              </div>
          </AppModalFooter>
        </AppModalForm>
      </AppModal>

      <AppModal
        open={Boolean(selectedStudent)}
        onClose={() => setSelectedStudent(null)}
        panelClassName="max-w-lg"
      >
        {selectedStudent ? (
          <>
            <AppModalHeader className="!items-start">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-16 h-16 shrink-0 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white text-2xl font-bold">
                  {selectedStudent.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <h3 className="text-xl font-bold text-slate-800 truncate">{selectedStudent.name}</h3>
                  <p className="text-gray-500">{formatClassLevelLabel(selectedStudent.classLevel)}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStudent(null)}
                className="icon-tap-btn hover:bg-gray-100 transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </AppModalHeader>

            <AppModalBody className="space-y-4">
              <div className="flex items-center gap-3 text-gray-600">
                <Phone className="w-5 h-5" />
                <span>{selectedStudent.phone}</span>
              </div>
              {selectedStudent.parentName && (
                <div className="flex items-center gap-3 text-gray-600">
                  <Users className="w-5 h-5" />
                  <span>Veli: {selectedStudent.parentName}</span>
                </div>
              )}
              {selectedStudent.parentPhone && (
                <div className="flex items-center gap-3 text-gray-600">
                  <Phone className="w-5 h-5" />
                  <span>Veli tel: {selectedStudent.parentPhone}</span>
                </div>
              )}
              {selectedStudent.school && (
                <div className="flex items-center gap-3 text-gray-600">
                  <GraduationCap className="w-5 h-5" />
                  <span>Okul/şube: {selectedStudent.school}</span>
                </div>
              )}
              {selectedStudent.birthDate && (
                <div className="flex items-center gap-3 text-gray-600">
                  <Calendar className="w-5 h-5" />
                  <span>Doğum: {selectedStudent.birthDate.split('T')[0]}</span>
                </div>
              )}
              <div className="flex items-center gap-3 text-gray-600">
                <Mail className="w-5 h-5" />
                <span>{selectedStudent.email || 'Belirtilmemiş'}</span>
              </div>
              <div className="flex items-center gap-3 text-gray-600">
                <Users className="w-5 h-5" />
                <span>Koç: {getTeacherName(selectedStudent.coachId)}</span>
              </div>
              {selectedStudent.groupName && (
                <div className="flex items-center gap-3 text-gray-600">
                  <Link2 className="w-5 h-5" />
                  <span>{selectedStudent.groupName}</span>
                </div>
              )}

              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 mt-2">
                <h4 className="text-sm font-semibold text-slate-800 mb-1">Canlı özel ders paketi (öğretmen başına)</h4>
                <p className="text-xs text-slate-500 mb-3">
                  Kota <strong>ders birimi</strong> cinsindendir; yalnızca <strong>tamamlanan</strong> (Ders yapıldı) derslerin süresine
                  göre düşer (örn. 1–45 dk → 1 birim). Boş = sınırsız. Tablolar:{' '}
                  <code className="text-[11px] bg-white px-1 rounded">2026-05-09-student-teacher-lesson-quota.sql</code>, süre sütunu:{' '}
                  <code className="text-[11px] bg-white px-1 rounded">2026-05-11-teacher-lessons-duration-units.sql</code>.
                </p>
                {quotaLoading ? (
                  <p className="text-sm text-slate-500 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Yükleniyor…
                  </p>
                ) : (
                  <>
                    {lessonQuotas.length > 0 && (
                      <ul className="space-y-2 mb-4">
                        {lessonQuotas.map((q) => {
                          const unlimited = q.unlimited ?? q.credits_total == null;
                          const used = q.units_used ?? q.lessons_used ?? 0;
                          const rem = q.remaining;
                          const exhausted = q.exhausted ?? (!unlimited && rem === 0);
                          const low =
                            !unlimited &&
                            typeof rem === 'number' &&
                            rem > 0 &&
                            rem <= 1 &&
                            !exhausted;
                          return (
                            <li
                              key={q.teacher_id}
                              className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ${
                                exhausted
                                  ? 'bg-red-50 border border-red-200 text-red-900'
                                  : low
                                    ? 'bg-amber-50 border border-amber-200 text-amber-950'
                                    : 'bg-white border border-slate-100 text-slate-800'
                              }`}
                            >
                              <span className="font-medium">{platformUserLabel(q.teacher_id)}</span>
                              <span className="text-xs sm:text-sm">
                                {unlimited ? (
                                  <>Paket: sınırsız · kullanılan birim: {used}</>
                                ) : (
                                  <>
                                    Kalan birim: <strong>{rem}</strong> / {q.credits_total} · kullanılan: {used}
                                  </>
                                )}
                              </span>
                              {canEditStudents && (
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteLessonQuota(q.teacher_id)}
                                  className="ml-auto p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50"
                                  aria-label="Kotayı kaldır"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {canEditStudents && (
                      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 items-stretch sm:items-end">
                        <label className="flex flex-col gap-1 text-xs flex-1 min-w-[140px]">
                          <span className="text-slate-600">Öğretmen (platform kullanıcısı)</span>
                          <select
                            value={quotaTeacherId}
                            onChange={(e) => setQuotaTeacherId(e.target.value)}
                            className="border border-slate-200 rounded-lg px-2 py-2 text-sm bg-white"
                          >
                            <option value="">Seçin</option>
                            {platformStaff.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name} ({u.role})
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex flex-col gap-1 text-xs flex-1 min-w-[100px]">
                          <span className="text-slate-600">Paket birimi — üst limit (boş = sınırsız)</span>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            placeholder="örn. 10"
                            value={quotaCreditsInput}
                            onChange={(e) => setQuotaCreditsInput(e.target.value)}
                            className="border border-slate-200 rounded-lg px-2 py-2 text-sm bg-white"
                          />
                        </label>
                        <button
                          type="button"
                          disabled={quotaSaving || !quotaTeacherId}
                          onClick={() => void handleSaveLessonQuota()}
                          className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
                        >
                          {quotaSaving ? <Loader2 className="w-4 h-4 animate-spin inline" /> : null} Kaydet
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </AppModalBody>

            <AppModalFooter>
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
              <button
                type="button"
                onClick={() => {
                  setSelectedStudent(null);
                  handleEdit(selectedStudent);
                }}
                className="min-h-[44px] flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Düzenle
              </button>
              <button
                type="button"
                onClick={() => {
                  const digits = (selectedStudent.parentPhone || '').replace(/\D/g, '');
                  if (!digits) return;
                  window.open(`https://wa.me/${digits}`, '_blank');
                }}
                disabled={!(selectedStudent.parentPhone || '').replace(/\D/g, '')}
                className="min-h-[44px] flex-1 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                WhatsApp
              </button>
            </div>
            </AppModalFooter>
          </>
        ) : null}
      </AppModal>
    </div>
  );
}
